// Types for electron/discordPresence.cjs, so the tests in src/ can use it under strict TypeScript.
import type { EventEmitter } from 'node:events';

export type ActivityKind = 'idle' | 'project' | 'code-tester';
export type PresenceStatus = 'disabled' | 'not-configured' | 'connecting' | 'connected' | 'unavailable' | 'error';

export interface PresenceState {
  enabled: boolean;
  showElapsed: boolean;
  status: PresenceStatus;
  message: string;
  activity: ActivityKind;
  statusText: string;
}

/** The parts of a net.Socket the presence manager uses. */
export interface PresenceSocket extends EventEmitter {
  destroyed: boolean;
  write(data: Uint8Array): boolean;
  end(): void;
  destroy(): void;
}

export interface PresenceOptions {
  clientId?: string;
  connect?: () => Promise<PresenceSocket | null>;
  onState?: (state: PresenceState) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  pid?: number;
}

export interface DiscordPresence {
  getState(): PresenceState;
  configure(settings: { enabled?: boolean; showElapsed?: boolean }): PresenceState;
  setActivity(kind: unknown): void;
  reconnect(): PresenceState;
  dispose(): void;
}

export declare const STATUS_TEXT: Readonly<Record<ActivityKind, string>>;
export declare const LARGE_IMAGE_KEY: string;
export declare const OP: Readonly<{ HANDSHAKE: 0; FRAME: 1; CLOSE: 2; PING: 3; PONG: 4 }>;
export declare const RETRY_DELAYS_MS: readonly number[];
export declare const UPDATE_DELAY_MS: number;
export declare const READY_TIMEOUT_MS: number;
export declare function encodeFrame(op: number, payload: unknown): Buffer;
export declare function createFrameDecoder(onFrame: (op: number, data: unknown) => void): (chunk: Buffer) => void;
export declare function connectToDiscord(openSocket?: (target: string) => PresenceSocket): Promise<PresenceSocket | null>;
export declare function createDiscordPresence(options?: PresenceOptions): DiscordPresence;
export declare function isValidClientId(value: unknown): boolean;
export declare function isActivityKind(value: unknown): value is ActivityKind;
