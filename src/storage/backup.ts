import { z } from 'zod';

import { WORKSPACE_SCHEMA_VERSION, workspaceSchema, type Workspace } from '../domain/models';
import { mergeDuplicateTags, removeUnknownTagIds } from '../domain/tags';
import { err, ok, type Result } from '../lib/result';
import { WORKSPACE_MIGRATIONS, migrate, type MigrationMap } from './migrations';
import { t } from '../i18n/translate';

/**
 * The backup file format. It wraps the regular workspace document (which has
 * its own `schemaVersion` and migrations) in a small, separately versioned
 * envelope, so the file can be recognised and checked before it is trusted.
 *
 * ```json
 * { "format": "void-backup", "formatVersion": 1, "exportedAt": "…", "workspace": { "schemaVersion": 2, … } }
 * ```
 */
export const BACKUP_FORMAT = 'void-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Far above anything localStorage can hold; protects the UI from huge or wrong files. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  workspace: Workspace;
}

export type BackupError =
  | { kind: 'too-large'; message: string }
  | { kind: 'not-json'; message: string }
  | { kind: 'wrong-format'; message: string }
  | { kind: 'unsupported-version'; message: string }
  | { kind: 'invalid'; message: string; issues: string[] };

export interface ParsedBackup {
  workspace: Workspace;
  /** null for plain workspace files exported by VOID 0.1. */
  exportedAt: string | null;
  /** Data format version the file was written with, before migration. */
  sourceSchemaVersion: number;
  /** Project references that pointed nowhere and were cleared. */
  clearedReferences: number;
  /** Tag references that pointed to no tag in the file and were removed. */
  clearedTagReferences: number;
  /** Tags with the same name (ignoring case) that were merged into one. */
  mergedTags: number;
}

export function createBackup(workspace: Workspace, now: Date = new Date()): BackupFile {
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), workspace };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  exportedAt: z.iso.datetime(),
  workspace: z.unknown(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** VOID 0.1 exported the bare workspace document. It is still accepted. */
function isLegacyWorkspace(value: Record<string, unknown>): boolean {
  return 'schemaVersion' in value && Array.isArray(value.projects);
}

function formatIssues(issues: z.ZodError['issues']): string[] {
  return issues.slice(0, 10).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

function findDuplicateIds(workspace: Workspace): string[] {
  const problems: string[] = [];
  for (const key of ['projects', 'tasks', 'notes', 'snippets', 'bugs', 'tags'] as const) {
    const seen = new Set<string>();
    for (const item of workspace[key]) {
      if (seen.has(item.id)) problems.push(`${key}: the id "${item.id}" is used more than once`);
      seen.add(item.id);
    }
  }
  return problems;
}

/** Clears project references that point to projects missing from the file. */
function clearDanglingReferences(workspace: Workspace): { workspace: Workspace; cleared: number } {
  const projectIds = new Set(workspace.projects.map((project) => project.id));
  let cleared = 0;
  const fix = <T extends { projectId: string | null }>(items: T[]): T[] =>
    items.map((item) => {
      if (item.projectId === null || projectIds.has(item.projectId)) return item;
      cleared += 1;
      return { ...item, projectId: null };
    });
  return {
    workspace: { ...workspace, tasks: fix(workspace.tasks), notes: fix(workspace.notes), snippets: fix(workspace.snippets), bugs: fix(workspace.bugs) },
    cleared,
  };
}

export interface ParseBackupOptions {
  migrations?: MigrationMap;
  schemaVersion?: number;
}

/**
 * Validates a backup file completely before anything is imported: JSON,
 * envelope, versions, migrations, the full workspace schema and unique ids.
 */
export function parseBackup(text: string, options: ParseBackupOptions = {}): Result<ParsedBackup, BackupError> {
  const { migrations = WORKSPACE_MIGRATIONS, schemaVersion = WORKSPACE_SCHEMA_VERSION } = options;

  if (text.length > MAX_BACKUP_BYTES) {
    return err({ kind: 'too-large', message: t('This file is larger than 10 MB and cannot be a VOID backup.') });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err({ kind: 'not-json', message: t('This file is not valid JSON. Choose a backup exported from VOID.') });
  }
  if (!isRecord(raw)) {
    return err({ kind: 'wrong-format', message: t('This file is not a VOID backup.') });
  }

  let workspaceData: unknown;
  let exportedAt: string | null = null;
  if ('format' in raw) {
    if (raw.format !== BACKUP_FORMAT) {
      return err({ kind: 'wrong-format', message: t('This file is not a VOID backup.') });
    }
    if (typeof raw.formatVersion === 'number' && raw.formatVersion > BACKUP_FORMAT_VERSION) {
      return err({
        kind: 'unsupported-version',
        message: t('This backup uses file format {version}, which needs a newer version of VOID.', { version: String(raw.formatVersion) }),
      });
    }
    const envelope = envelopeSchema.safeParse(raw);
    if (!envelope.success) {
      return err({ kind: 'invalid', message: t('The backup file is damaged.'), issues: formatIssues(envelope.error.issues) });
    }
    workspaceData = envelope.data.workspace;
    exportedAt = envelope.data.exportedAt;
  } else if (isLegacyWorkspace(raw)) {
    workspaceData = raw;
  } else {
    return err({ kind: 'wrong-format', message: t('This file is not a VOID backup.') });
  }

  const migrated = migrate(workspaceData, schemaVersion, migrations);
  if (!migrated.ok) {
    const { error } = migrated;
    return error.kind === 'unsupported-version'
      ? err({ kind: 'unsupported-version', message: t('The data in this backup cannot be read by this version of VOID. {reason}', { reason: error.message }) })
      : err({ kind: 'invalid', message: t('The backup contains no valid VOID data.'), issues: [error.message] });
  }

  const validated = workspaceSchema.safeParse(migrated.value.data);
  if (!validated.success) {
    return err({
      kind: 'invalid',
      message: t('The backup contains data VOID does not accept.'),
      issues: formatIssues(validated.error.issues),
    });
  }

  const duplicates = findDuplicateIds(validated.data);
  if (duplicates.length > 0) {
    return err({ kind: 'invalid', message: t('The backup contains duplicate entries.'), issues: duplicates.slice(0, 10) });
  }

  const projectsFixed = clearDanglingReferences(validated.data);
  // "UI" and "ui" in one file become one tag, so the file never brings duplicates in.
  const tagsMerged = mergeDuplicateTags(projectsFixed.workspace);
  const tagsFixed = removeUnknownTagIds(tagsMerged.workspace);
  return ok({
    workspace: tagsFixed.workspace,
    exportedAt,
    sourceSchemaVersion: migrated.value.fromVersion,
    clearedReferences: projectsFixed.cleared,
    clearedTagReferences: tagsFixed.removed,
    mergedTags: tagsMerged.merged,
  });
}
