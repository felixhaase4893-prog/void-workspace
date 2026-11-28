import { createId } from '../../lib/id';
import { simulateExecution } from './dryRun';
import { buildFindings } from './findings';
import { buildResourceSummary } from './resources';
import {
  type ChangeJournalEntry,
  type ExecutionResult,
  type OptimizerError,
  type OptimizerResponse,
  type PreviewState,
  type ScanMode,
  type ScanResult,
  type ScanSnapshot,
  type SkippedItem,
  scanModeSchema,
  selectionInputSchema,
  uuidSchema,
} from './models';
import { buildPreview, deepFreeze, PREVIEW_TTL_MS, withConfirmation, withSelection, withValidation } from './preview';
import { buildRecommendations, type EngineContext, type OptimizationTarget } from './recommendations';
import { ALL_SCAN_MODULES, type ScannerSuite } from './scanner';
import { buildCleanupEstimate } from './sizes';
import { modulesForSelection, validatePreview, type FreshState } from './validation';

/**
 * The optimizer API (phase A–C). In the desktop app it runs in the Electron
 * main process and the page talks to it over IPC; in the browser demo and in
 * tests it runs with simulated scanners. All functions only read the system.
 *
 * The page can only pass ids it got from here (scan, preview and
 * recommendation ids). Paths, commands or action types are never accepted.
 */
export interface OptimizerApi {
  /** "quick" (default) or "deep". */
  startScan(mode?: unknown): Promise<OptimizerResponse<ScanResult>>;
  createPreview(scanId: unknown): Promise<OptimizerResponse<PreviewState>>;
  updateSelection(previewId: unknown, selectedIds: unknown): Promise<OptimizerResponse<PreviewState>>;
  validatePreview(previewId: unknown): Promise<OptimizerResponse<PreviewState>>;
  confirmPreview(previewId: unknown): Promise<OptimizerResponse<PreviewState>>;
  executeDryRun(previewId: unknown): Promise<OptimizerResponse<ExecutionResult>>;
  getHistory(): Promise<OptimizerResponse<ExecutionResult[]>>;
}

export const OPTIMIZER_API_METHODS = ['startScan', 'createPreview', 'updateSelection', 'validatePreview', 'confirmPreview', 'executeDryRun', 'getHistory'] as const;

/** A validation is only good for confirming within this time. */
export const CONFIRM_WINDOW_MS = 2 * 60 * 1000;
const MAX_SCANS = 3;
const MAX_PREVIEWS = 6;
const MAX_HISTORY = 20;

interface StoredScan {
  mode: ScanMode;
  result: ScanResult;
  snapshot: ScanSnapshot;
  targets: ReadonlyMap<string, readonly OptimizationTarget[]>;
}

export interface OptimizerServiceOptions {
  scanners: ScannerSuite;
  context: EngineContext;
  now?: () => Date;
  createId?: () => string;
  previewTtlMs?: number;
}

const ok = <T>(value: T): OptimizerResponse<T> => ({ ok: true, value });
const fail = (code: OptimizerError['code'], message: string, extra: Partial<OptimizerError> = {}): OptimizerResponse<never> => ({ ok: false, error: { code, message, ...extra } });

function mergeSkipped(items: readonly SkippedItem[]): SkippedItem[] {
  const merged = new Map<string, SkippedItem>();
  for (const item of items) {
    const key = `${item.module}|${item.reason}`;
    const existing = merged.get(key);
    if (existing) {
      existing.count += item.count;
      existing.bytes += item.bytes;
    } else merged.set(key, { ...item });
  }
  return [...merged.values()];
}

function remember<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value as K;
    map.delete(oldest);
  }
}

export class OptimizerService implements OptimizerApi {
  private readonly scanners: ScannerSuite;
  private readonly context: EngineContext;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly previewTtlMs: number;
  private readonly scans = new Map<string, StoredScan>();
  private readonly previews = new Map<string, PreviewState>();
  private readonly history: ExecutionResult[] = [];
  /** Prepared for the undo journal of a later phase. Phase A–C never writes to it. */
  readonly journal: readonly ChangeJournalEntry[] = Object.freeze([]);
  private busy = false;

  constructor(options: OptimizerServiceOptions) {
    this.scanners = options.scanners;
    this.context = options.context;
    this.now = options.now ?? (() => new Date());
    this.newId = options.createId ?? createId;
    this.previewTtlMs = options.previewTtlMs ?? PREVIEW_TTL_MS;
  }

  async startScan(modeInput?: unknown): Promise<OptimizerResponse<ScanResult>> {
    const parsedMode = scanModeSchema.optional().safeParse(modeInput ?? undefined);
    if (!parsedMode.success) return fail('invalid-input', 'Unknown scan type.');
    const mode: ScanMode = parsedMode.data ?? 'quick';
    if (this.busy) return fail('busy', 'A scan is already running.');
    this.busy = true;
    const started = this.now();
    try {
      const snapshot = await this.scanners.scan(ALL_SCAN_MODULES, mode);
      const context = { ...this.context, mode };
      const { recommendations, targets } = buildRecommendations(snapshot, context);
      const failedModules = new Set(snapshot.errors.map((error) => error.module));
      const status = failedModules.size === 0 ? 'completed' : failedModules.size >= ALL_SCAN_MODULES.length ? 'failed' : 'partial';
      const result: ScanResult = deepFreeze({
        scanId: this.newId(),
        mode,
        createdAt: started.toISOString(),
        durationMs: Math.max(0, Math.round(this.now().getTime() - started.getTime())),
        status,
        system: snapshot.system,
        counts: {
          processes: snapshot.processes.length,
          startupEntries: snapshot.startupEntries.length,
          enabledStartupEntries: snapshot.startupEntries.filter((entry) => entry.status === 'enabled').length,
        },
        cleanupEstimate: buildCleanupEstimate(snapshot.cleanup),
        recommendations,
        findings: mode === 'deep' ? buildFindings(snapshot, recommendations, context) : [],
        resources: mode === 'deep' ? buildResourceSummary(snapshot, recommendations, context) : null,
        errors: snapshot.errors,
        skipped: mergeSkipped(snapshot.skipped),
      });
      remember(this.scans, result.scanId, { mode, result, snapshot, targets }, MAX_SCANS);
      return ok(result);
    } catch {
      return fail('scan-failed', 'The scan failed.');
    } finally {
      this.busy = false;
    }
  }

  async createPreview(scanId: unknown): Promise<OptimizerResponse<PreviewState>> {
    const id = uuidSchema.safeParse(scanId);
    if (!id.success) return fail('invalid-input', 'Invalid scan id.');
    const scan = this.scans.get(id.data);
    if (!scan) return fail('not-found', 'This scan no longer exists. Please scan again.');
    const preview = buildPreview(scan.result, scan.targets, { previewId: this.newId(), now: this.now(), ttlMs: this.previewTtlMs });
    remember(this.previews, preview.previewId, preview, MAX_PREVIEWS);
    return ok(preview);
  }

  async updateSelection(previewId: unknown, selectedIds: unknown): Promise<OptimizerResponse<PreviewState>> {
    const found = this.findPreview(previewId);
    if (!found.ok) return found;
    const ids = selectionInputSchema.safeParse(selectedIds);
    if (!ids.success) return fail('invalid-input', 'The selection contains invalid ids.');
    const { preview, check } = withSelection(found.value, ids.data);
    if (check.unknown.length > 0) return fail('invalid-input', 'The selection contains unknown actions.');
    if (check.blocked.length > 0) return fail('invalid-input', 'Blocked actions cannot be selected.');
    this.previews.set(preview.previewId, preview);
    return ok(preview);
  }

  async validatePreview(previewId: unknown): Promise<OptimizerResponse<PreviewState>> {
    const found = this.findPreview(previewId, { allowMissing: true });
    if (!found.ok) return found;
    const result = await this.runValidation(found.value);
    if (!result.preview) return fail('not-found', 'This preview does not exist (any more). Please scan again.', { validation: result.validation });
    return ok(result.preview);
  }

  async confirmPreview(previewId: unknown): Promise<OptimizerResponse<PreviewState>> {
    const found = this.findPreview(previewId);
    if (!found.ok) return found;
    const preview = found.value;
    if (preview.validationStatus !== 'valid' || !preview.validation) return fail('invalid-state', 'The preview must be validated successfully before confirming.');
    if (this.now().getTime() - new Date(preview.validation.checkedAt).getTime() > CONFIRM_WINDOW_MS) {
      return fail('invalid-state', 'The validation is too old. Please validate the preview again.');
    }
    const confirmed = withConfirmation(preview, this.now());
    this.previews.set(confirmed.previewId, confirmed);
    return ok(confirmed);
  }

  async executeDryRun(previewId: unknown): Promise<OptimizerResponse<ExecutionResult>> {
    const found = this.findPreview(previewId);
    if (!found.ok) return found;
    if (!found.value.confirmedAt) return fail('invalid-state', 'The optimization must be confirmed explicitly first.');
    const startedAt = this.now();
    // Checked again right before the run: the PC may have changed since the confirmation.
    const { preview, validation } = await this.runValidation(found.value);
    if (!preview || !validation.isValid) return fail('validation-failed', 'The preview is no longer valid.', { validation });
    const result = simulateExecution({ preview, validation, executionId: this.newId(), startedAt, finishedAt: this.now() });
    this.history.unshift(result);
    this.history.splice(MAX_HISTORY);
    return ok(result);
  }

  async getHistory(): Promise<OptimizerResponse<ExecutionResult[]>> {
    return ok([...this.history]);
  }

  private findPreview(previewId: unknown, options: { allowMissing: true }): OptimizerResponse<PreviewState | undefined>;
  private findPreview(previewId: unknown): OptimizerResponse<PreviewState>;
  private findPreview(previewId: unknown, options?: { allowMissing: true }): OptimizerResponse<PreviewState | undefined> {
    const id = uuidSchema.safeParse(previewId);
    if (!id.success) return fail('invalid-input', 'Invalid preview id.');
    const preview = this.previews.get(id.data);
    if (!preview && !options?.allowMissing) return fail('not-found', 'This preview does not exist (any more). Please scan again.');
    return ok(preview);
  }

  private async runValidation(preview: PreviewState | undefined) {
    const scan = preview ? this.scans.get(preview.scanId) : undefined;
    let fresh: FreshState | null = null;
    if (preview && scan && preview.selectedIds.length > 0) {
      try {
        const snapshot = await this.scanners.scan(modulesForSelection(preview), scan.mode);
        // The power recommendation needs the system module; the rest of the snapshot stays empty, which is fine
        // because only recommendations of the re-scanned modules are compared.
        fresh = { snapshot, targets: buildRecommendations(snapshot, { ...this.context, mode: scan.mode }).targets };
      } catch {
        fresh = null;
      }
    }
    const validation = validatePreview({
      preview: preview && scan ? preview : undefined,
      now: this.now(),
      originalTargets: scan?.targets ?? new Map(),
      fresh,
      partialScan: scan ? scan.result.status !== 'completed' : false,
    });
    if (!preview || !scan) return { preview: undefined, validation };
    const next = withValidation(preview, validation);
    this.previews.set(next.previewId, next);
    return { preview: next, validation };
  }
}
