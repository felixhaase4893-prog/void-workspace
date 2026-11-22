'use strict';
// Discord Rich Presence for VOID, kept apart from the rest of the desktop shell.
//
// Talks to the locally running Discord desktop app over its IPC pipe
// (\\?\pipe\discord-ipc-N on Windows). No npm package, no internet, no server:
// if Discord is not running, nothing happens and VOID keeps working.
//
// Privacy: the page can only pick one of three fixed activity kinds. The text
// that reaches Discord comes exclusively from STATUS_TEXT below, so project
// names, code, notes, paths or any other content can never be sent.

const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

/** The only lines VOID ever shows in Discord. */
const STATUS_TEXT = Object.freeze({
  idle: 'Using VOID',
  project: 'Working on a project',
  'code-tester': 'testing a code',
});

/** Name of the art asset uploaded in the Discord Developer Portal (Rich Presence → Art Assets). */
const LARGE_IMAGE_KEY = 'void_logo';
const LARGE_IMAGE_TEXT = 'VOID';

const OP = Object.freeze({ HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 });
const PIPE_COUNT = 10;
const MAX_FRAME_BYTES = 64 * 1024;
const READY_TIMEOUT_MS = 5000;
/** Discord allows about 5 activity updates per 20 s; route changes are bundled. */
const UPDATE_DELAY_MS = 1000;
/** Retry while Discord is not running: 15 s, then 30 s, then every 60 s. Silent, one pipe check each. */
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
/** Discord's close codes for a wrong application id. Retrying would not help. */
const FATAL_CLOSE_CODES = new Set([4000, 4001, 4002]);

const CLIENT_ID_PATTERN = /^\d{15,25}$/;

function isValidClientId(value) {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value);
}

function isActivityKind(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATUS_TEXT, value);
}

/* ---------- Wire format: [op int32 LE][length int32 LE][JSON] ---------- */

function encodeFrame(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Collects chunks and calls onFrame(op, data) for each complete frame. Throws on garbage. */
function createFrameDecoder(onFrame) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0);
      const length = buffer.readInt32LE(4);
      if (length < 0 || length > MAX_FRAME_BYTES) throw new Error('Invalid Discord IPC frame.');
      if (buffer.length < 8 + length) return;
      const body = buffer.subarray(8, 8 + length);
      buffer = buffer.subarray(8 + length);
      let data = null;
      try {
        data = JSON.parse(body.toString('utf8'));
      } catch {
        data = null;
      }
      onFrame(op, data);
    }
  };
}

function pipePath(index) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir();
  return path.join(base, `discord-ipc-${index}`);
}

/** Opens the first Discord pipe that answers. Resolves to a socket or null (Discord not running). */
function connectToDiscord(openSocket = (target) => net.createConnection(target)) {
  return new Promise((resolve) => {
    let index = 0;
    const tryNext = () => {
      if (index >= PIPE_COUNT) {
        resolve(null);
        return;
      }
      const socket = openSocket(pipePath(index));
      index += 1;
      const onError = () => {
        socket.destroy();
        tryNext();
      };
      socket.once('error', onError);
      socket.once('connect', () => {
        socket.removeListener('error', onError);
        resolve(socket);
      });
    };
    tryNext();
  });
}

/**
 * The presence manager. Everything time- or IO-related is injectable for tests.
 *
 * Status values reported through onState:
 *   disabled        turned off in VOID's settings
 *   not-configured  no Discord application id is set in this build
 *   connecting      looking for Discord
 *   connected       presence is shown
 *   unavailable     Discord is not running (or was closed); retried quietly
 *   error           Discord rejected the connection (e.g. unknown application id); not retried
 */
function createDiscordPresence(options = {}) {
  const {
    clientId = '',
    connect = () => connectToDiscord(),
    onState = () => {},
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    pid = process.pid,
  } = options;

  const startedAt = now();
  let enabled = false;
  let showElapsed = true;
  let activity = 'idle';
  let status = 'disabled';
  let message = '';
  /** @type {import('node:net').Socket | null} */
  let socket = null;
  let ready = false;
  let attempt = 0;
  let generation = 0; // bumps on every disconnect, so late callbacks of an old socket are ignored
  let retryTimer = null;
  let updateTimer = null;
  let readyTimer = null;
  let lastSent = null; // JSON of the last activity Discord accepted from us
  let nonce = 0;

  function setStatus(next, nextMessage = '') {
    if (next === status && nextMessage === message) return;
    status = next;
    message = nextMessage;
    onState(getState());
  }

  function getState() {
    return { enabled, showElapsed, status, message, activity, statusText: STATUS_TEXT[activity] };
  }

  function clearTimers() {
    if (retryTimer) clearTimer(retryTimer);
    if (updateTimer) clearTimer(updateTimer);
    if (readyTimer) clearTimer(readyTimer);
    retryTimer = updateTimer = readyTimer = null;
  }

  function buildActivity() {
    const result = {
      details: STATUS_TEXT[activity],
      assets: { large_image: LARGE_IMAGE_KEY, large_text: LARGE_IMAGE_TEXT },
      instance: false,
    };
    // Discord counts the elapsed time itself from this fixed start, so it is reliable.
    if (showElapsed) result.timestamps = { start: Math.floor(startedAt / 1000) };
    return result;
  }

  function send(op, payload) {
    if (!socket || socket.destroyed) return false;
    try {
      socket.write(encodeFrame(op, payload));
      return true;
    } catch {
      return false;
    }
  }

  function sendActivity(force = false) {
    if (!ready) return;
    const payload = buildActivity();
    const json = JSON.stringify(payload);
    if (!force && json === lastSent) return;
    nonce += 1;
    if (send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid, activity: payload }, nonce: `void-${nonce}` })) lastSent = json;
  }

  function scheduleUpdate() {
    if (!ready || updateTimer) return;
    updateTimer = setTimer(() => {
      updateTimer = null;
      sendActivity();
    }, UPDATE_DELAY_MS);
  }

  /** Forgets the current pipe. Graceful lets queued writes (the "clear" message) go out first. */
  function dropSocket(graceful = false) {
    generation += 1;
    ready = false;
    lastSent = null;
    if (readyTimer) clearTimer(readyTimer);
    if (updateTimer) clearTimer(updateTimer);
    readyTimer = updateTimer = null;
    const old = socket;
    socket = null;
    if (!old) return;
    old.removeAllListeners();
    old.on('error', () => {}); // a late error must not become an uncaught exception
    if (graceful && !old.destroyed) {
      try {
        old.end();
      } catch {
        old.destroy();
        return;
      }
      const timer = setTimeout(() => old.destroy(), 1000);
      if (typeof timer.unref === 'function') timer.unref();
    } else {
      old.destroy();
    }
  }

  function scheduleRetry() {
    if (!enabled || retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      void open();
    }, delay);
  }

  function lostConnection() {
    dropSocket();
    if (!enabled || status === 'error') return;
    setStatus('unavailable', 'Discord is not running. VOID will connect automatically when it starts.');
    scheduleRetry();
  }

  function handleFrame(op, data) {
    if (op === OP.PING) {
      send(OP.PONG, data);
      return;
    }
    if (op === OP.CLOSE) {
      const code = data && typeof data.code === 'number' ? data.code : 0;
      if (FATAL_CLOSE_CODES.has(code)) {
        dropSocket();
        setStatus('error', 'Discord did not accept VOID\'s application ID.');
        return;
      }
      lostConnection();
      return;
    }
    if (op !== OP.FRAME || !data) return;
    if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
      if (readyTimer) clearTimer(readyTimer);
      readyTimer = null;
      ready = true;
      attempt = 0;
      setStatus('connected');
      sendActivity(true);
    } else if (data.evt === 'ERROR' && data.cmd === 'SET_ACTIVITY') {
      // Let the next change try again instead of assuming Discord shows the old state.
      lastSent = null;
    }
  }

  async function open() {
    if (!enabled || socket) return;
    const myGeneration = generation;
    if (status !== 'unavailable') setStatus('connecting');
    let next = null;
    try {
      next = await connect();
    } catch {
      next = null;
    }
    if (myGeneration !== generation || !enabled || socket) {
      // Turned off (or reconnected) while we were looking: do not keep this connection.
      if (next) {
        next.on('error', () => {});
        next.destroy();
      }
      return;
    }
    if (!next) {
      setStatus('unavailable', 'Discord is not running. VOID will connect automatically when it starts.');
      scheduleRetry();
      return;
    }
    socket = next;
    const decode = createFrameDecoder(handleFrame);
    socket.on('data', (chunk) => {
      try {
        decode(chunk);
      } catch {
        lostConnection();
      }
    });
    socket.on('error', () => lostConnection());
    socket.on('close', () => lostConnection());
    readyTimer = setTimer(() => {
      readyTimer = null;
      if (!ready) lostConnection();
    }, READY_TIMEOUT_MS);
    send(OP.HANDSHAKE, { v: 1, client_id: clientId });
  }

  /** Clears the activity in Discord, then closes the pipe. */
  function shutdown() {
    clearTimers();
    if (ready) {
      nonce += 1;
      send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid }, nonce: `void-${nonce}` });
    }
    dropSocket(true);
    attempt = 0;
  }

  return {
    getState,

    /** Turns presence on or off and sets whether the elapsed time is shown. */
    configure(settings = {}) {
      const nextEnabled = settings.enabled === true;
      const nextShowElapsed = settings.showElapsed !== false;
      const elapsedChanged = nextShowElapsed !== showElapsed;
      showElapsed = nextShowElapsed;
      if (!nextEnabled) {
        enabled = false;
        shutdown();
        setStatus('disabled');
        return getState();
      }
      if (!isValidClientId(clientId)) {
        enabled = true;
        shutdown();
        setStatus('not-configured', 'This build of VOID has no Discord application ID.');
        return getState();
      }
      const wasEnabled = enabled;
      enabled = true;
      if (!wasEnabled || status === 'disabled') void open();
      else if (elapsedChanged) scheduleUpdate();
      onState(getState());
      return getState();
    },

    /** Picks one of the fixed status lines. Anything else is ignored. */
    setActivity(kind) {
      if (!isActivityKind(kind) || kind === activity) return;
      activity = kind;
      scheduleUpdate();
    },

    /** "Retry now" from the settings: skips the waiting time. */
    reconnect() {
      if (!enabled || !isValidClientId(clientId) || status === 'connected' || status === 'connecting') return getState();
      clearTimers();
      dropSocket();
      attempt = 0;
      setStatus('connecting');
      void open();
      return getState();
    },

    /** On quit: clear the presence and release the pipe. */
    dispose() {
      enabled = false;
      shutdown();
    },
  };
}

module.exports = {
  STATUS_TEXT,
  LARGE_IMAGE_KEY,
  OP,
  RETRY_DELAYS_MS,
  UPDATE_DELAY_MS,
  READY_TIMEOUT_MS,
  encodeFrame,
  createFrameDecoder,
  connectToDiscord,
  createDiscordPresence,
  isValidClientId,
  isActivityKind,
};
