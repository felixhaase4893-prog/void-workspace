// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OP,
  READY_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  STATUS_TEXT,
  UPDATE_DELAY_MS,
  connectToDiscord,
  createDiscordPresence,
  createFrameDecoder,
  encodeFrame,
  type PresenceSocket,
  type PresenceState,
} from '../../electron/discordPresence.cjs';
import { PRESENCE_STATUS_TEXT } from '../domain/discordPresence';

const CLIENT_ID = '1574062836974358668';

interface Frame {
  op: number;
  data: Record<string, unknown>;
}

/** Stands in for Discord's IPC pipe: records what VOID writes, lets the test answer. */
class FakeDiscordSocket extends EventEmitter implements PresenceSocket {
  destroyed = false;
  ended = false;
  frames: Frame[] = [];
  raw: Buffer[] = [];
  private readonly decode = createFrameDecoder((op, data) => this.frames.push({ op, data: data as Record<string, unknown> }));

  write(data: Uint8Array): boolean {
    const chunk = Buffer.from(data);
    this.raw.push(chunk);
    this.decode(chunk);
    return true;
  }
  end(): void {
    this.ended = true;
  }
  destroy(): void {
    this.destroyed = true;
  }
  /** Discord answers the handshake. */
  ready(): void {
    this.emit('data', encodeFrame(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }));
  }
  /** Discord desktop was closed. */
  closeFromDiscord(): void {
    this.emit('close');
  }
  activities(): Array<Record<string, unknown> | undefined> {
    return this.frames
      .filter((frame) => frame.op === OP.FRAME && frame.data.cmd === 'SET_ACTIVITY')
      .map((frame) => (frame.data.args as { activity?: Record<string, unknown> }).activity);
  }
}

function setup(options: { clientId?: string; discordRunning?: () => boolean } = {}) {
  const sockets: FakeDiscordSocket[] = [];
  const states: PresenceState[] = [];
  const connect = vi.fn(async () => {
    if (options.discordRunning && !options.discordRunning()) return null;
    const socket = new FakeDiscordSocket();
    sockets.push(socket);
    return socket;
  });
  const presence = createDiscordPresence({
    clientId: options.clientId ?? CLIENT_ID,
    connect,
    onState: (state) => states.push(state),
    now: () => 1_700_000_000_000,
    pid: 4242,
  });
  return { presence, sockets, states, connect, last: () => sockets[sockets.length - 1] };
}

/** Lets pending promises (the connect call) settle. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Discord IPC frames', () => {
  it('encodes op and length little-endian and decodes split chunks', () => {
    const frame = encodeFrame(OP.HANDSHAKE, { v: 1, client_id: CLIENT_ID });
    expect(frame.readInt32LE(0)).toBe(0);
    expect(frame.readInt32LE(4)).toBe(frame.length - 8);
    const seen: Array<[number, unknown]> = [];
    const decode = createFrameDecoder((op, data) => seen.push([op, data]));
    const two = Buffer.concat([frame, encodeFrame(OP.PING, { n: 1 })]);
    decode(two.subarray(0, 5));
    decode(two.subarray(5, 30));
    decode(two.subarray(30));
    expect(seen).toEqual([
      [0, { v: 1, client_id: CLIENT_ID }],
      [3, { n: 1 }],
    ]);
  });

  it('rejects absurd frame sizes instead of buffering forever', () => {
    const decode = createFrameDecoder(() => {});
    const header = Buffer.alloc(8);
    header.writeInt32LE(1, 0);
    header.writeInt32LE(50 * 1024 * 1024, 4);
    expect(() => decode(header)).toThrow();
  });

  it('tries the next pipe when one fails and reports null when Discord is not running', async () => {
    vi.useRealTimers();
    const tried: string[] = [];
    const failing = (target: string) => {
      tried.push(target);
      const socket = new FakeDiscordSocket();
      setTimeout(() => socket.emit('error', new Error('ENOENT')), 0);
      return socket;
    };
    await expect(connectToDiscord(failing)).resolves.toBeNull();
    expect(tried).toHaveLength(10);
    expect(tried[0]).toMatch(/discord-ipc-0$/);

    let calls = 0;
    const thirdWorks = () => {
      calls += 1;
      const socket = new FakeDiscordSocket();
      const ok = calls === 3;
      setTimeout(() => socket.emit(ok ? 'connect' : 'error', new Error('busy')), 0);
      return socket;
    };
    await expect(connectToDiscord(thirdWorks)).resolves.toBeInstanceOf(FakeDiscordSocket);
    expect(calls).toBe(3);
  });
});

describe('Discord Rich Presence', () => {
  it('uses exactly the three fixed texts, the same as the page shows', () => {
    expect(STATUS_TEXT).toEqual({ idle: 'Using VOID', project: 'Working on a project', 'code-tester': 'testing a code' });
    expect(PRESENCE_STATUS_TEXT).toEqual(STATUS_TEXT);
  });

  it('connects when enabled and shows "Using VOID" with the elapsed time', async () => {
    const { presence, last, states } = setup();
    expect(presence.getState().status).toBe('disabled');
    presence.configure({ enabled: true, showElapsed: true });
    expect(presence.getState().status).toBe('connecting');
    await flush();
    const socket = last()!;
    expect(socket.frames[0]).toEqual({ op: OP.HANDSHAKE, data: { v: 1, client_id: CLIENT_ID } });
    socket.ready();
    expect(presence.getState().status).toBe('connected');
    expect(states.at(-1)?.status).toBe('connected');
    expect(socket.activities()).toEqual([
      { details: 'Using VOID', assets: { large_image: 'void_logo', large_text: 'VOID' }, instance: false, timestamps: { start: 1_700_000_000 } },
    ]);
  });

  it('leaves the elapsed time out when it is turned off', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true, showElapsed: false });
    await flush();
    last()!.ready();
    expect(last()!.activities()[0]).not.toHaveProperty('timestamps');
    presence.configure({ enabled: true, showElapsed: true });
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    expect(last()!.activities()[1]).toHaveProperty('timestamps');
  });

  it('switches the status with the area and skips repeats', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    const socket = last()!;
    socket.ready();
    presence.setActivity('project');
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    presence.setActivity('project');
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    presence.setActivity('code-tester');
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    expect(socket.activities().map((activity) => activity?.details)).toEqual(['Using VOID', 'Working on a project', 'testing a code']);
  });

  it('bundles quick page changes into one update', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    last()!.ready();
    presence.setActivity('project');
    presence.setActivity('code-tester');
    presence.setActivity('project');
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    expect(last()!.activities().map((activity) => activity?.details)).toEqual(['Using VOID', 'Working on a project']);
  });

  it('remembers the area while connecting and shows it once Discord is ready', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    presence.setActivity('code-tester');
    await flush();
    last()!.ready();
    expect(last()!.activities().map((activity) => activity?.details)).toEqual(['testing a code']);
  });

  it('clears the status and closes the pipe when disabled', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    const socket = last()!;
    socket.ready();
    presence.configure({ enabled: false });
    expect(presence.getState().status).toBe('disabled');
    const clear = socket.frames.at(-1)!;
    expect(clear.data.cmd).toBe('SET_ACTIVITY');
    expect(clear.data.args).toEqual({ pid: 4242 });
    expect(socket.ended).toBe(true);
    // Nothing more is sent after that, and no reconnect is planned.
    presence.setActivity('project');
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.at(-1)! * 3);
    expect(socket.activities()).toHaveLength(2);
  });

  it('ignores unknown activities, so no other text can be sent', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    last()!.ready();
    presence.setActivity('Secret project: Obby Rush');
    presence.setActivity({ details: 'C:\\Users\\me\\code.ts' });
    await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    expect(last()!.activities()).toHaveLength(1);
    expect(presence.getState().activity).toBe('idle');
  });

  it('never sends anything but the fixed texts (whole wire check)', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true, showElapsed: true });
    await flush();
    last()!.ready();
    for (const kind of ['project', 'My Project', 'code-tester', 'idle', '../notes.md']) {
      presence.setActivity(kind);
      await vi.advanceTimersByTimeAsync(UPDATE_DELAY_MS);
    }
    presence.configure({ enabled: false });
    const wire = Buffer.concat(last()!.raw).toString('utf8');
    const strings = [...wire.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
    const allowed = new Set([
      ...Object.values(STATUS_TEXT),
      'v', 'client_id', CLIENT_ID, 'cmd', 'SET_ACTIVITY', 'args', 'pid', 'activity', 'details', 'assets', 'large_image', 'void_logo',
      'large_text', 'VOID', 'instance', 'timestamps', 'start', 'nonce',
    ]);
    const unexpected = strings.filter((value) => !allowed.has(value!) && !/^void-\d+$/.test(value!));
    expect(unexpected).toEqual([]);
  });

  it('stays calm when Discord is not running and connects once it starts', async () => {
    let running = false;
    const { presence, connect, last, states } = setup({ discordRunning: () => running });
    presence.configure({ enabled: true });
    await flush();
    expect(presence.getState().status).toBe('unavailable');
    expect(presence.getState().message).toMatch(/not running/);
    // Backs off: 15 s, 30 s, then once a minute. State is reported once, not on every try.
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]!);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]!);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2]! * 2);
    expect(connect).toHaveBeenCalledTimes(5);
    expect(states.filter((state) => state.status === 'unavailable')).toHaveLength(1);
    running = true;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2]!);
    last()!.ready();
    expect(presence.getState().status).toBe('connected');
  });

  it('survives Discord being closed and reconnects later', async () => {
    let running = true;
    const { presence, last, connect } = setup({ discordRunning: () => running });
    presence.configure({ enabled: true });
    await flush();
    const first = last()!;
    first.ready();
    running = false;
    first.closeFromDiscord();
    expect(presence.getState().status).toBe('unavailable');
    expect(first.destroyed).toBe(true);
    // A late error event from the dead pipe must not crash the main process.
    expect(() => first.emit('error', new Error('EPIPE'))).not.toThrow();
    running = true;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]!);
    expect(connect).toHaveBeenCalledTimes(2);
    last()!.ready();
    expect(presence.getState().status).toBe('connected');
    expect(last()!.activities()).toHaveLength(1);
  });

  it('gives up waiting when Discord never answers the handshake', async () => {
    const { presence } = setup();
    presence.configure({ enabled: true });
    await flush();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    expect(presence.getState().status).toBe('unavailable');
  });

  it('answers pings and stops for good when Discord rejects the application id', async () => {
    const { presence, last, connect } = setup();
    presence.configure({ enabled: true });
    await flush();
    const socket = last()!;
    socket.emit('data', encodeFrame(OP.PING, { t: 1 }));
    expect(socket.frames.at(-1)).toEqual({ op: OP.PONG, data: { t: 1 } });
    socket.emit('data', encodeFrame(OP.CLOSE, { code: 4000, message: 'Invalid Client ID' }));
    expect(presence.getState().status).toBe('error');
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.at(-1)! * 3);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('treats a broken frame like a lost connection', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    const garbage = Buffer.alloc(8);
    garbage.writeInt32LE(1, 0);
    garbage.writeInt32LE(-5, 4);
    last()!.emit('data', garbage);
    expect(presence.getState().status).toBe('unavailable');
  });

  it('does not connect without an application id', async () => {
    const { presence, connect } = setup({ clientId: '' });
    presence.configure({ enabled: true });
    await flush();
    expect(presence.getState().status).toBe('not-configured');
    expect(connect).not.toHaveBeenCalled();
  });

  it('drops a connection that finishes after Rich Presence was turned off', async () => {
    let resolve: (socket: FakeDiscordSocket) => void = () => {};
    const socket = new FakeDiscordSocket();
    const presence = createDiscordPresence({ clientId: CLIENT_ID, connect: () => new Promise((r) => (resolve = r)) });
    presence.configure({ enabled: true });
    presence.configure({ enabled: false });
    resolve(socket);
    await flush();
    expect(socket.destroyed).toBe(true);
    expect(socket.frames).toHaveLength(0);
    expect(presence.getState().status).toBe('disabled');
  });

  it('"Retry now" skips the waiting time', async () => {
    let running = false;
    const { presence, connect } = setup({ discordRunning: () => running });
    presence.configure({ enabled: true });
    await flush();
    running = true;
    presence.reconnect();
    await flush();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('clears the status on quit', async () => {
    const { presence, last } = setup();
    presence.configure({ enabled: true });
    await flush();
    last()!.ready();
    presence.dispose();
    expect(last()!.frames.at(-1)?.data.args).toEqual({ pid: 4242 });
    expect(last()!.ended).toBe(true);
  });
});
