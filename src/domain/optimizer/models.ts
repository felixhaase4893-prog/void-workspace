import { z } from 'zod';

/**
 * Data models for the PC Optimizer (phase A–C: read-only scan, preview, dry run).
 *
 * Every model is a Zod schema and the TypeScript types are inferred from it,
 * like the workspace models in ../models.ts. The schemas are also used to
 * check everything that crosses the desktop bridge and every piece of data a
 * Windows query returns.
 *
 * Phase A–C never changes the system. The action types for later phases are
 * defined here so the data model is complete, but nothing in this module can
 * carry them out.
 */

/* ---------- Basic enums ---------- */

export const OPTIMIZATION_CATEGORIES = ['cleanup', 'startup', 'process', 'power'] as const;
export const SAFETY_LEVELS = ['safe', 'caution', 'blocked'] as const;
export const RECOMMENDATION_STATUSES = ['ready', 'stale', 'blocked', 'failed', 'completed'] as const;

/** Every action a recommendation may stand for. Later phases can only implement these, nothing else. */
export const ACTION_TYPES = [
  'cleanup.delete-temp-files',
  'cleanup.delete-crash-dumps',
  'cleanup.delete-browser-cache',
  'cleanup.delete-error-reports',
  'startup.disable-entry',
  'process.end-background',
  'power.switch-plan',
] as const;

export const SCAN_MODULES = ['system', 'processes', 'startup', 'temp-files'] as const;

/** Quick scan: the usual places. Deep scan: more folders, a longer CPU sample, lower thresholds and a list of performance hogs with fixes. */
export const SCAN_MODES = ['quick', 'deep'] as const;
export const scanModeSchema = z.enum(SCAN_MODES);
export type ScanMode = z.infer<typeof scanModeSchema>;

export const optimizationCategorySchema = z.enum(OPTIMIZATION_CATEGORIES);
export const safetyLevelSchema = z.enum(SAFETY_LEVELS);
export const recommendationStatusSchema = z.enum(RECOMMENDATION_STATUSES);
export const actionTypeSchema = z.enum(ACTION_TYPES);
export const scanModuleSchema = z.enum(SCAN_MODULES);

export type OptimizationCategory = z.infer<typeof optimizationCategorySchema>;
export type SafetyLevel = z.infer<typeof safetyLevelSchema>;
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;
export type ActionType = z.infer<typeof actionTypeSchema>;
export type ScanModule = z.infer<typeof scanModuleSchema>;

const timestamp = z.iso.datetime();
const bytes = z.number().int().nonnegative();
const count = z.number().int().nonnegative();

/**
 * Places the page may ask the desktop app to open with one click. Only these
 * fixed ids exist; the desktop shell maps them to folders or Windows settings.
 * Opening a place only shows it, it never changes anything.
 */
export const openTargetIdSchema = z.string().regex(/^(folder:(user-temp|crash-dumps|error-reports|startup-user|startup-common)|settings:(startup-apps|storage|power|apps)|app:task-manager|drive:[A-Z]:)$/, 'Unknown target');
export type OpenTargetId = z.infer<typeof openTargetIdSchema>;
export const openTargetSchema = z.object({ id: openTargetIdSchema, label: z.string() });
export type OpenTarget = z.infer<typeof openTargetSchema>;

/** Recommendation ids are fixed prefixes plus a hash, never paths or commands. */
export const recommendationIdSchema = z.string().regex(/^(cleanup|startup|process|power)\.[a-z0-9-]+(?::[a-z0-9]{1,16})?$/, 'Unknown id format');
export const uuidSchema = z.uuid();

/* ---------- Raw scan data (from the scanners) ---------- */

export const driveInfoSchema = z.object({
  id: z.string().regex(/^[A-Z]:$/),
  label: z.string(),
  fileSystem: z.string(),
  totalBytes: bytes,
  freeBytes: bytes,
});
export type DriveInfo = z.infer<typeof driveInfoSchema>;

export const powerPlanSchema = z.object({
  /** Lower-case GUID of the active power plan. */
  guid: z.string(),
  name: z.string(),
});
export type PowerPlan = z.infer<typeof powerPlanSchema>;

export const systemInfoSchema = z.object({
  cpuModel: z.string(),
  cpuCores: count,
  totalMemoryBytes: bytes,
  /** Actually used RAM right now (total minus free), as reported by Windows. */
  usedMemoryBytes: bytes,
  freeMemoryBytes: bytes,
  windowsVersion: z.string(),
  windowsBuild: z.string(),
  drives: z.array(driveInfoSchema),
  powerPlan: powerPlanSchema.nullable(),
  /** Time since the last restart. */
  uptimeSeconds: count,
  /** Deep scan only: throughput of all network adapters. */
  network: z.object({ receivedBytesPerSec: bytes, sentBytesPerSec: bytes }).nullable().optional(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const PROCESS_STATES = ['running', 'not-responding', 'unknown'] as const;

export const processInfoSchema = z.object({
  name: z.string().min(1),
  pid: count,
  /** CPU load over a short sample, or null when Windows does not report it reliably (e.g. protected processes). */
  cpuPercent: z.number().nonnegative().nullable(),
  /** Working set: RAM the process actually uses right now. */
  memoryBytes: bytes,
  sessionId: count,
  status: z.enum(PROCESS_STATES),
  /** Deep scan only: load of the busiest GPU engine (as in Task Manager). */
  gpuPercent: z.number().nonnegative().nullable().optional(),
  /** Deep scan only: read + write rate of disk and network together; Windows has no per-process network rate without admin rights. */
  ioBytesPerSec: z.number().nonnegative().nullable().optional(),
  /** Deep scan only: open (established) TCP connections. */
  connections: count.nullable().optional(),
});
export type ProcessInfo = z.infer<typeof processInfoSchema>;

export const STARTUP_SOURCES = ['hkcu-run', 'hklm-run', 'hklm-run-wow64', 'startup-folder-user', 'startup-folder-common'] as const;
export const startupSourceSchema = z.enum(STARTUP_SOURCES);
export type StartupSource = z.infer<typeof startupSourceSchema>;

export const startupEntrySchema = z.object({
  /** Stable id derived from source and name. */
  id: z.string().min(1),
  name: z.string().min(1),
  source: startupSourceSchema,
  /** Executable path, when it could be read without running anything. */
  path: z.string().nullable(),
  status: z.enum(['enabled', 'disabled', 'unknown']),
  description: z.string(),
});
export type StartupEntry = z.infer<typeof startupEntrySchema>;

export const CLEANUP_LOCATIONS = ['user-temp', 'crash-dumps', 'browser-cache', 'error-reports'] as const;
export const cleanupLocationSchema = z.enum(CLEANUP_LOCATIONS);
export type CleanupLocation = z.infer<typeof cleanupLocationSchema>;

/** One file that could be cleaned up later. The path stays in the backend; the page only sees ids and samples. */
export const cleanupCandidateSchema = z.object({
  id: z.string().min(1),
  /** Identifies the physical file (volume + file index), so hard links are counted once. */
  physicalKey: z.string().min(1),
  location: cleanupLocationSchema,
  relativePath: z.string().min(1),
  sizeBytes: bytes,
  modifiedAt: timestamp,
});
export type CleanupCandidate = z.infer<typeof cleanupCandidateSchema>;

export const SKIP_REASONS = ['symlink', 'junction-or-link', 'outside-root', 'recently-modified', 'not-a-regular-file', 'limit-reached', 'depth-limit'] as const;
export const skipReasonSchema = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const skippedItemSchema = z.object({
  module: scanModuleSchema,
  reason: skipReasonSchema,
  count: count,
  bytes: bytes,
});
export type SkippedItem = z.infer<typeof skippedItemSchema>;

export const cleanupLocationScanSchema = z.object({
  location: cleanupLocationSchema,
  label: z.string(),
  /** Shown to the user. */
  displayRoot: z.string(),
  candidates: z.array(cleanupCandidateSchema),
  /** Everything found in the folder, including files that are not candidates (too new, unreadable). */
  occupiedBytes: bytes,
  fileCount: count,
  inaccessibleCount: count,
  skipped: z.array(skippedItemSchema),
  limitReached: z.boolean(),
});
export type CleanupLocationScan = z.infer<typeof cleanupLocationScanSchema>;

export const scanErrorSchema = z.object({
  module: scanModuleSchema,
  code: z.enum(['unsupported-platform', 'command-failed', 'invalid-output', 'unsafe-root', 'access-denied', 'timeout', 'unknown']),
  message: z.string(),
});
export type ScanError = z.infer<typeof scanErrorSchema>;

/** The full result of all scanners. It stays in the backend, because it contains paths. */
export interface ScanSnapshot {
  system: SystemInfo | null;
  processes: ProcessInfo[];
  startupEntries: StartupEntry[];
  cleanup: CleanupLocationScan[];
  errors: ScanError[];
  skipped: SkippedItem[];
  /** Which modules were scanned (a partial re-scan for validation only runs some). */
  modules: ScanModule[];
}

/* ---------- Size estimate ---------- */

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export const cleanupEstimateSchema = z.object({
  candidateCount: count,
  /** Sum of all unique cleanup candidates: what could potentially be freed. Never a guarantee. */
  totalBytes: bytes,
  /** Space the scanned folders actually take up, including files that are not candidates. */
  occupiedBytes: bytes,
  inaccessibleCount: count,
  skippedCount: count,
  duplicateCount: count,
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type CleanupEstimate = z.infer<typeof cleanupEstimateSchema>;

/* ---------- Recommendations ---------- */

export const reversibilitySchema = z.enum(['yes', 'partial', 'no']);
export type Reversibility = z.infer<typeof reversibilitySchema>;

/** What the detail view explains for one recommendation. */
export const recommendationPreviewSchema = z.object({
  found: z.string(),
  why: z.string(),
  changes: z.string(),
  risks: z.string(),
  reversible: reversibilitySchema,
  reversibleNote: z.string(),
  /** A few readable names of what would be affected (file names, entry names), never more than a handful. */
  sampleTargets: z.array(z.string()).max(8),
  moreTargets: count,
  /** How to do it yourself in Windows, step by step. */
  manualSteps: z.array(z.string()),
});
export type RecommendationPreview = z.infer<typeof recommendationPreviewSchema>;

export const affectedCountsSchema = z.object({
  files: count,
  startupEntries: count,
  processes: count,
  powerSettings: count,
});
export type AffectedCounts = z.infer<typeof affectedCountsSchema>;

export const optimizationRecommendationSchema = z.object({
  id: recommendationIdSchema,
  actionType: actionTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  /** Why exactly this recommendation was made (the rule that fired). */
  reason: z.string(),
  category: optimizationCategorySchema,
  safety: safetyLevelSchema,
  /** Only ever true for safe recommendations. */
  selectedByDefault: z.boolean(),
  requiresAdmin: z.boolean(),
  estimatedDiskBytes: bytes,
  estimatedMemoryBytes: bytes,
  targetCount: count,
  affects: affectedCountsSchema,
  preview: recommendationPreviewSchema,
  status: recommendationStatusSchema,
  /** Why a recommendation is blocked or failed. */
  statusReason: z.string().nullable(),
  /** Where the affected things are, opened with one click (desktop app only). */
  openTarget: openTargetSchema.nullable(),
});
export type OptimizationRecommendation = z.infer<typeof optimizationRecommendationSchema>;

/* ---------- Performance hogs (deep scan) ---------- */

export const FINDING_KINDS = ['process', 'startup', 'disk', 'memory', 'uptime', 'power', 'cleanup'] as const;

/** A "Leistungsfresser": what slows the PC down, why, and how to fix it yourself. */
export const performanceFindingSchema = z.object({
  id: z.string().regex(/^finding.[a-z0-9-]+(?::[a-z0-9]{1,16})?$/),
  kind: z.enum(FINDING_KINDS),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1),
  /** The measured value, e.g. "1,8 GB RAM · 12 % CPU". */
  impact: z.string(),
  cause: z.string(),
  fixSteps: z.array(z.string()).min(1),
  openTarget: openTargetSchema.nullable(),
  /** The recommendation in the preview that addresses it, if any. */
  recommendationId: recommendationIdSchema.nullable(),
});
export type PerformanceFinding = z.infer<typeof performanceFindingSchema>;

/* ---------- Resource summary (deep scan): who uses the most CPU, GPU, RAM, network ---------- */

export const RESOURCE_KINDS = ['cpu', 'gpu', 'memory', 'network'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const resourceUserSchema = z.object({
  name: z.string(),
  processCount: count,
  cpuPercent: z.number().nonnegative().nullable(),
  gpuPercent: z.number().nonnegative().nullable(),
  memoryBytes: bytes,
  ioBytesPerSec: z.number().nonnegative().nullable(),
  connections: count.nullable(),
  /** Combined load score used for the overall ranking. */
  score: z.number().nonnegative(),
  /** The resource this program strains most. */
  main: z.enum(RESOURCE_KINDS),
  /** Linked recommendation, so the page can jump there with one click. */
  recommendationId: recommendationIdSchema.nullable(),
});
export type ResourceUser = z.infer<typeof resourceUserSchema>;

export const resourceSummarySchema = z.object({
  cpu: z.object({ totalPercent: z.number().nonnegative().nullable(), cores: count, top: z.array(resourceUserSchema) }),
  gpu: z.object({ measured: z.boolean(), top: z.array(resourceUserSchema) }),
  memory: z.object({ usedBytes: bytes, totalBytes: bytes, top: z.array(resourceUserSchema) }),
  network: z.object({ receivedBytesPerSec: bytes.nullable(), sentBytesPerSec: bytes.nullable(), top: z.array(resourceUserSchema) }),
  /** The programs that pull the most performance overall. */
  overall: z.array(resourceUserSchema),
});
export type ResourceSummary = z.infer<typeof resourceSummarySchema>;

/* ---------- Scan result (what the page receives) ---------- */

export const scanStatusSchema = z.enum(['completed', 'partial', 'failed']);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const scanResultSchema = z.object({
  scanId: uuidSchema,
  mode: scanModeSchema,
  createdAt: timestamp,
  durationMs: count,
  status: scanStatusSchema,
  system: systemInfoSchema.nullable(),
  counts: z.object({ processes: count, startupEntries: count, enabledStartupEntries: count }),
  cleanupEstimate: cleanupEstimateSchema,
  recommendations: z.array(optimizationRecommendationSchema),
  /** Only filled by a deep scan. */
  findings: z.array(performanceFindingSchema),
  /** Only filled by a deep scan. */
  resources: resourceSummarySchema.nullable(),
  errors: z.array(scanErrorSchema),
  skipped: z.array(skippedItemSchema),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

/* ---------- Preview ---------- */

/**
 * The affected targets, split into groups by exactly which recommendations
 * contain them. Totals of any selection are the sum of the segments that
 * touch it, so a file two recommendations share is counted once, and the page
 * can compute this live without seeing a single path.
 */
export const targetSegmentSchema = z.object({
  recommendationIds: z.array(recommendationIdSchema).min(1),
  kind: z.enum(['file', 'startup', 'process', 'power']),
  count: count,
  diskBytes: bytes,
  memoryBytes: bytes,
});
export type TargetSegment = z.infer<typeof targetSegmentSchema>;

export const overlapSchema = z.object({
  recommendationIds: z.tuple([recommendationIdSchema, recommendationIdSchema]),
  sharedCount: count,
  sharedDiskBytes: bytes,
});
export type Overlap = z.infer<typeof overlapSchema>;

export const selectionTotalsSchema = z.object({
  selectedCount: count,
  fileCount: count,
  estimatedDiskBytes: bytes,
  estimatedMemoryBytes: bytes,
  startupEntryCount: count,
  processCount: count,
  powerSettingCount: count,
  affectedItemCount: count,
  requiresAdmin: z.boolean(),
  hasCaution: z.boolean(),
});
export type SelectionTotals = z.infer<typeof selectionTotalsSchema>;

export const validationIssueSchema = z.object({
  code: z.enum([
    'preview-not-found',
    'preview-expired',
    'empty-selection',
    'unknown-id',
    'blocked-selected',
    'not-allowed',
    'stale-data',
    'rescan-required',
    'verification-failed',
    'requires-admin',
    'caution-selected',
    'partial-scan',
    'estimates-only',
  ]),
  message: z.string(),
  recommendationId: recommendationIdSchema.nullable(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationResultSchema = z.object({
  isValid: z.boolean(),
  checkedAt: timestamp,
  errors: z.array(validationIssueSchema),
  warnings: z.array(validationIssueSchema),
  staleRecommendationIds: z.array(recommendationIdSchema),
  /** True when the changes are big enough that only a new scan helps. */
  requiresRescan: z.boolean(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const validationStatusSchema = z.enum(['unchecked', 'valid', 'invalid', 'stale']);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const previewStateSchema = z.object({
  previewId: uuidSchema,
  scanId: uuidSchema,
  createdAt: timestamp,
  expiresAt: timestamp,
  /** Goes up with every change of the selection; a confirmation is only valid for one revision. */
  revision: count,
  recommendations: z.array(optimizationRecommendationSchema),
  selectedIds: z.array(recommendationIdSchema),
  segments: z.array(targetSegmentSchema),
  overlaps: z.array(overlapSchema),
  totals: selectionTotalsSchema,
  validationStatus: validationStatusSchema,
  validation: validationResultSchema.nullable(),
  confirmedAt: timestamp.nullable(),
});
export type PreviewState = z.infer<typeof previewStateSchema>;

/* ---------- Execution (phase A–C: dry run only) ---------- */

export const DRY_RUN_MESSAGE = 'Simulation complete – no system changes were made.';

export const plannedActionSchema = z.object({
  recommendationId: recommendationIdSchema,
  actionType: actionTypeSchema,
  title: z.string(),
  /** What a real run would do, in words. */
  plannedChange: z.string(),
  targetCount: count,
  estimatedDiskBytes: bytes,
  estimatedMemoryBytes: bytes,
  sampleTargets: z.array(z.string()).max(8),
  outcome: z.literal('simulated'),
  requiresAdmin: z.boolean(),
});
export type PlannedAction = z.infer<typeof plannedActionSchema>;

/**
 * The result of an execution. In phase A–C `mode` can only be "dry-run" and
 * `systemChanges` only 0; the schema rejects anything else.
 */
export const executionResultSchema = z.object({
  executionId: uuidSchema,
  previewId: uuidSchema,
  scanId: uuidSchema,
  mode: z.literal('dry-run'),
  status: z.literal('simulated'),
  startedAt: timestamp,
  finishedAt: timestamp,
  systemChanges: z.literal(0),
  message: z.literal(DRY_RUN_MESSAGE),
  actions: z.array(plannedActionSchema),
  totals: selectionTotalsSchema,
  warnings: z.array(validationIssueSchema),
});
export type ExecutionResult = z.infer<typeof executionResultSchema>;

/**
 * One recorded change, for undo in a later phase. Phase A–C never writes an
 * entry; the model only exists so the later journal has a fixed shape.
 */
export const changeJournalEntrySchema = z.object({
  entryId: uuidSchema,
  executionId: uuidSchema,
  recommendationId: recommendationIdSchema,
  actionType: actionTypeSchema,
  targetId: z.string().min(1),
  targetLabel: z.string(),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('file-removed'), sizeBytes: bytes, recoverable: z.boolean() }),
    z.object({ kind: z.literal('startup-disabled'), previousState: z.enum(['enabled', 'disabled', 'unknown']) }),
    z.object({ kind: z.literal('process-ended'), pid: count }),
    z.object({ kind: z.literal('power-plan-changed'), previousPlanGuid: z.string(), newPlanGuid: z.string() }),
  ]),
  reversible: z.boolean(),
  createdAt: timestamp,
  revertedAt: timestamp.nullable(),
});
export type ChangeJournalEntry = z.infer<typeof changeJournalEntrySchema>;

/* ---------- API ---------- */

export const optimizerErrorSchema = z.object({
  code: z.enum(['not-found', 'invalid-input', 'invalid-state', 'validation-failed', 'scan-failed', 'busy', 'unavailable', 'internal']),
  message: z.string(),
  validation: validationResultSchema.optional(),
});
export type OptimizerError = z.infer<typeof optimizerErrorSchema>;

export type OptimizerResponse<T> = { ok: true; value: T } | { ok: false; error: OptimizerError };

export const historyEntrySchema = executionResultSchema;
export type HistoryEntry = ExecutionResult;

/** Upper bound for ids in one selection; protects the backend from oversized messages. */
export const MAX_SELECTION = 500;

export const selectionInputSchema = z.array(recommendationIdSchema).max(MAX_SELECTION);
