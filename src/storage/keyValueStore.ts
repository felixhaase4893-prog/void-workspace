import { err, ok, type Result } from '../lib/result';
import type { StorageError } from './errors';
import { t } from '../i18n/translate';

/** The minimal synchronous key-value API VOID needs. `localStorage` satisfies it. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.entries.set(key, value);
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

const PROBE_KEY = 'void:probe';

/**
 * Returns `localStorage` if it is actually usable. Accessing it can throw
 * (blocked cookies, some private modes), and writes can fail immediately.
 */
export function getBrowserStore(): Result<KeyValueStore, StorageError> {
  try {
    const store = window.localStorage;
    store.setItem(PROBE_KEY, '1');
    store.removeItem(PROBE_KEY);
    return ok(store);
  } catch (error) {
    return err({
      kind: 'unavailable',
      message: t('Browser storage is not available ({reason}).', { reason: error instanceof Error ? error.message : String(error) }),
    });
  }
}
