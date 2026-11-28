import { err, ok, type Result } from '../lib/result';
import type { StorageError } from './errors';
import { t } from '../i18n/translate';

export type RawRecord = Record<string, unknown>;

/** Turns data of version N into data of version N + 1. */
export type Migration = (data: RawRecord) => RawRecord;

/** Keyed by the version a migration upgrades *from*. */
export type MigrationMap = Readonly<Record<number, Migration>>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Applies `update` to every object in `data[key]` and leaves anything else untouched for validation to report. */
function mapRecords(data: RawRecord, key: string, update: (record: RawRecord) => RawRecord): unknown {
  const list = data[key];
  return Array.isArray(list) ? list.map((item) => (isRecord(item) ? update(item) : item)) : list;
}

/**
 * Migrations for the workspace format. When the format changes:
 *   1. bump WORKSPACE_SCHEMA_VERSION in domain/models.ts,
 *   2. add `[oldVersion]: (data) => ({ ...upgraded, schemaVersion: oldVersion + 1 })` here,
 *   3. add a test with a stored payload of the old version.
 */
export const WORKSPACE_MIGRATIONS: MigrationMap = {
  // v2: projects gain technologies and links, snippets can belong to a project.
  1: (data) => ({
    ...data,
    schemaVersion: 2,
    projects: mapRecords(data, 'projects', (project) => ({ technologies: [], links: [], ...project })),
    snippets: mapRecords(data, 'snippets', (snippet) => ({ projectId: null, ...snippet })),
  }),
  // v3: user-defined tags. Existing items start without tags; nothing else changes.
  2: (data) => {
    const withoutTags = (record: RawRecord): RawRecord => ({ tagIds: [], ...record });
    return {
      ...data,
      schemaVersion: 3,
      projects: mapRecords(data, 'projects', withoutTags),
      tasks: mapRecords(data, 'tasks', withoutTags),
      notes: mapRecords(data, 'notes', withoutTags),
      snippets: mapRecords(data, 'snippets', withoutTags),
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  },
  // v4: favourites. Nothing was a favourite before; a value that is already there is kept.
  3: (data) => {
    const notFavorite = (record: RawRecord): RawRecord => ({ favorite: false, ...record });
    return {
      ...data,
      schemaVersion: 4,
      projects: mapRecords(data, 'projects', notFavorite),
      tasks: mapRecords(data, 'tasks', notFavorite),
      notes: mapRecords(data, 'notes', notFavorite),
      snippets: mapRecords(data, 'snippets', notFavorite),
    };
  },
  // v5 (VOID 4.1): optional due dates on tasks and a new bug list. Existing data is kept as it is.
  4: (data) => ({
    ...data,
    schemaVersion: 5,
    tasks: mapRecords(data, 'tasks', (task) => ({ dueDate: null, ...task })),
    bugs: Array.isArray(data.bugs) ? data.bugs : [],
  }),
};

export interface MigrationOutcome {
  data: RawRecord;
  fromVersion: number;
}

export function migrate(
  raw: unknown,
  targetVersion: number,
  migrations: MigrationMap,
): Result<MigrationOutcome, StorageError> {
  if (!isRecord(raw)) {
    return err({ kind: 'invalid', message: t('Stored data is not an object.'), issues: [] });
  }
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return err({ kind: 'invalid', message: t('Stored data has no valid schema version.'), issues: [] });
  }
  if (version > targetVersion) {
    return err({
      kind: 'unsupported-version',
      version,
      message: t('Stored data uses format version {version}, but this version of VOID only understands up to {target}. Please update VOID.', { version, target: targetVersion }),
    });
  }

  let data = raw;
  for (let current = version; current < targetVersion; current += 1) {
    const step = migrations[current];
    if (!step) {
      return err({
        kind: 'unsupported-version',
        version,
        message: `No migration from format version ${current} to ${current + 1}.`,
      });
    }
    data = step(data);
  }
  return ok({ data, fromVersion: version });
}
