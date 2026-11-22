import type { Workspace } from '../domain/models';

import type { Result } from '../lib/result';
import type { StorageError } from './errors';

export interface LoadedWorkspace {
  workspace: Workspace;
  /** `new` when nothing was stored yet. */
  source: 'stored' | 'new';
  /** Set when stored data had an older format and was upgraded. */
  migratedFrom: number | null;
}

/**
 * The only way the app reads or writes workspace data.
 *
 * The UI depends on this interface, never on `localStorage`, so an
 * IndexedDB implementation can be added later without touching components.
 * Methods are async for that reason, even though localStorage is synchronous.
 */
export interface WorkspaceRepository {
  /** Human-readable name of where the data lives, shown in Settings. */
  readonly label: string;
  /** Whether data survives a page reload. */
  readonly persistent: boolean;
  load(): Promise<Result<LoadedWorkspace, StorageError>>;
  save(workspace: Workspace): Promise<Result<void, StorageError>>;
  /** Removes all workspace data. */
  clear(): Promise<Result<void, StorageError>>;
  /**
   * Moves unreadable data to a backup key so the user can start fresh
   * without losing it. Returns the backup key, or null if nothing was stored.
   */
  quarantine(): Promise<Result<string | null, StorageError>>;
  /** The raw stored string, for exports and recovery. */
  readRaw(): string | null;
  /** Notifies when the data is changed elsewhere (e.g. another tab). */
  subscribe(onExternalChange: () => void): () => void;
}
