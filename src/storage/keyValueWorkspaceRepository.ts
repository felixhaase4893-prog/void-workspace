import { WORKSPACE_SCHEMA_VERSION, createEmptyWorkspace, workspaceSchema, type Workspace } from '../domain/models';
import { err, ok, type Result } from '../lib/result';
import { toReadError, toWriteError, type StorageError } from './errors';
import type { KeyValueStore } from './keyValueStore';
import { WORKSPACE_MIGRATIONS, migrate, type MigrationMap } from './migrations';
import type { LoadedWorkspace, WorkspaceRepository } from './workspaceRepository';
import { t, type MessageKey } from '../i18n/translate';

export const WORKSPACE_STORAGE_KEY = 'void:workspace';

export interface KeyValueWorkspaceRepositoryOptions {
  store: KeyValueStore;
  key?: string;
  label?: string;
  persistent?: boolean;
  migrations?: MigrationMap;
  schemaVersion?: number;
  /** Event source for cross-tab change notifications. Defaults to `window` when persistent. */
  events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  now?: () => Date;
}

export class KeyValueWorkspaceRepository implements WorkspaceRepository {
  private readonly rawLabel: string;
  readonly persistent: boolean;
  private readonly store: KeyValueStore;
  private readonly key: string;
  private readonly migrations: MigrationMap;
  private readonly schemaVersion: number;
  private readonly events: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  private readonly now: () => Date;

  /** Shown in Settings → Storage, in the active language. */
  get label(): string {
    return t(this.rawLabel as MessageKey);
  }

  constructor(options: KeyValueWorkspaceRepositoryOptions) {
    this.store = options.store;
    this.key = options.key ?? WORKSPACE_STORAGE_KEY;
    this.rawLabel = options.label ?? 'This device (local storage)';
    this.persistent = options.persistent ?? true;
    this.migrations = options.migrations ?? WORKSPACE_MIGRATIONS;
    this.schemaVersion = options.schemaVersion ?? WORKSPACE_SCHEMA_VERSION;
    this.events = options.events === undefined ? (this.persistent ? window : null) : options.events;
    this.now = options.now ?? (() => new Date());
  }

  readRaw(): string | null {
    try {
      return this.store.getItem(this.key);
    } catch {
      return null;
    }
  }

  async load(): Promise<Result<LoadedWorkspace, StorageError>> {
    let raw: string | null;
    try {
      raw = this.store.getItem(this.key);
    } catch (error) {
      return err(toReadError(error));
    }
    if (raw === null) {
      return ok({ workspace: createEmptyWorkspace(), source: 'new', migratedFrom: null });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err({ kind: 'corrupt', message: t('Stored data is not valid JSON.') });
    }

    const migrated = migrate(parsed, this.schemaVersion, this.migrations);
    if (!migrated.ok) return migrated;

    const validated = workspaceSchema.safeParse(migrated.value.data);
    if (!validated.success) {
      return err({
        kind: 'invalid',
        message: t('Stored data does not match the expected format.'),
        issues: validated.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      });
    }

    const wasMigrated = migrated.value.fromVersion !== this.schemaVersion;
    if (wasMigrated) {
      // Persist the upgraded format right away; if this fails the next save will retry.
      await this.save(validated.data);
    }
    return ok({
      workspace: validated.data,
      source: 'stored',
      migratedFrom: wasMigrated ? migrated.value.fromVersion : null,
    });
  }

  async save(workspace: Workspace): Promise<Result<void, StorageError>> {
    const validated = workspaceSchema.safeParse(workspace);
    if (!validated.success) {
      return err({
        kind: 'invalid',
        message: t('Refusing to save data that does not match the expected format.'),
        issues: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
    }
    try {
      this.store.setItem(this.key, JSON.stringify(validated.data));
      return ok(undefined);
    } catch (error) {
      return err(toWriteError(error));
    }
  }

  async clear(): Promise<Result<void, StorageError>> {
    try {
      this.store.removeItem(this.key);
      return ok(undefined);
    } catch (error) {
      return err(toWriteError(error));
    }
  }

  async quarantine(): Promise<Result<string | null, StorageError>> {
    const raw = this.readRaw();
    if (raw === null) return ok(null);
    const backupKey = `${this.key}:backup:${this.now().toISOString()}`;
    try {
      this.store.setItem(backupKey, raw);
      this.store.removeItem(this.key);
      return ok(backupKey);
    } catch (error) {
      return err(toWriteError(error));
    }
  }

  subscribe(onExternalChange: () => void): () => void {
    const events = this.events;
    if (!events) return () => {};
    const listener = (event: Event) => {
      if (event instanceof StorageEvent && event.key === this.key) onExternalChange();
    };
    events.addEventListener('storage', listener);
    return () => events.removeEventListener('storage', listener);
  }
}

/** Uses localStorage when possible and falls back to a non-persistent in-memory store. */
export function createDefaultRepository(
  getStore: () => Result<KeyValueStore, StorageError>,
  createFallbackStore: () => KeyValueStore,
): { repository: WorkspaceRepository; warning: StorageError | null } {
  const store = getStore();
  if (store.ok) {
    return { repository: new KeyValueWorkspaceRepository({ store: store.value }), warning: null };
  }
  return {
    repository: new KeyValueWorkspaceRepository({
      store: createFallbackStore(),
      label: 'Temporary memory (lost on reload)',
      persistent: false,
    }),
    warning: store.error,
  };
}
