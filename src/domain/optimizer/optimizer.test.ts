import { describe, expect, it } from 'vitest';

import { ACTION_CATALOG, isKnownActionType } from './catalog';
import { simulateExecution } from './dryRun';
import {
  ACTION_TYPES,
  changeJournalEntrySchema,
  DRY_RUN_MESSAGE,
  executionResultSchema,
  optimizationRecommendationSchema,
  previewStateSchema,
  recommendationIdSchema,
  scanResultSchema,
  type CleanupCandidate,
  type CleanupLocationScan,
  type ScanSnapshot,
} from './models';
import { buildPreview, buildSegments, computeSelectionTotals, defaultSelection, findOverlaps, selectAllSafe, toggleSelection, withSelection, withValidation } from './preview';
import { buildRecommendations, POWER_SAVER_GUID, PROCESS_MEMORY_THRESHOLD_BYTES, type OptimizationTarget } from './recommendations';
import { classifyProcessGroup, classifyStartupEntry, isCriticalProcessName, isSelectable, startupRequiresAdmin } from './safety';
import { createScannerSuite } from './scanner';
import { OptimizerService } from './service';
import { createSimulatedScannerSuite, SIMULATED_CONTEXT, simulatedCleanup, simulatedModuleScanners, simulatedProcesses, simulatedStartupEntries, simulatedSystem } from './simulated';
import { buildCleanupEstimate, dedupeCandidates, estimateConfidence, formatBytes, stableId, sumUniqueBytes } from './sizes';
import { modulesForSelection, validatePreview } from './validation';

const MB = 1024 * 1024;
const NOW = new Date('2026-11-28T12:00:00.000Z');
const SCAN_ID = '11111111-1111-4111-8111-111111111111';
const PREVIEW_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    system: simulatedSystem(),
    processes: simulatedProcesses(),
    startupEntries: simulatedStartupEntries(),
    cleanup: simulatedCleanup(),
    errors: [],
    skipped: [],
    modules: ['system', 'processes', 'startup', 'temp-files'],
    ...overrides,
  };
}

function file(location: CleanupCandidate['location'], relativePath: string, sizeBytes: number, physicalKey = relativePath): CleanupCandidate {
  return { id: relativePath, physicalKey, location, relativePath, sizeBytes, modifiedAt: '2026-11-01T00:00:00.000Z' };
}

function location(name: CleanupLocationScan['location'], candidates: CleanupCandidate[], extra: Partial<CleanupLocationScan> = {}): CleanupLocationScan {
  return { location: name, label: name, displayRoot: name, candidates, occupiedBytes: candidates.reduce((t, c) => t + c.sizeBytes, 0), fileCount: candidates.length, inaccessibleCount: 0, skipped: [], limitReached: false, ...extra };
}

function engine(data = snapshot()) {
  return buildRecommendations(data, SIMULATED_CONTEXT);
}

function scanResultFrom(data = snapshot()) {
  const { recommendations, targets } = engine(data);
  const result = scanResultSchema.parse({
    scanId: SCAN_ID,
    mode: 'quick',
    createdAt: NOW.toISOString(),
    durationMs: 10,
    status: 'completed',
    system: data.system,
    counts: { processes: data.processes.length, startupEntries: data.startupEntries.length, enabledStartupEntries: 0 },
    cleanupEstimate: buildCleanupEstimate(data.cleanup),
    recommendations,
    errors: [],
    skipped: [],
    findings: [],
    resources: null,
  });
  return { result, targets };
}

function preview(data = snapshot()) {
  const { result, targets } = scanResultFrom(data);
  return { preview: buildPreview(result, targets, { previewId: PREVIEW_ID, now: NOW }), targets };
}

/* ---------- Data models ---------- */

describe('optimizer data models', () => {
  it('accepts only fixed recommendation id formats, never paths or commands', () => {
    expect(recommendationIdSchema.safeParse('cleanup.user-temp').success).toBe(true);
    expect(recommendationIdSchema.safeParse('startup.disable:abc123').success).toBe(true);
    expect(recommendationIdSchema.safeParse('C:\\Windows\\System32').success).toBe(false);
    expect(recommendationIdSchema.safeParse('cleanup.user-temp; del *').success).toBe(false);
    expect(recommendationIdSchema.safeParse('../../etc').success).toBe(false);
  });

  it('defines every action type in the catalog and nothing else', () => {
    expect(Object.keys(ACTION_CATALOG).sort()).toEqual([...ACTION_TYPES].sort());
    expect(isKnownActionType('cleanup.delete-temp-files')).toBe(true);
    expect(isKnownActionType('shell.run')).toBe(false);
    expect(isKnownActionType(42)).toBe(false);
  });

  it('only allows dry-run execution results with zero system changes', () => {
    const base = {
      executionId: '33333333-3333-4333-8333-333333333333',
      previewId: PREVIEW_ID,
      scanId: SCAN_ID,
      mode: 'dry-run',
      status: 'simulated',
      startedAt: NOW.toISOString(),
      finishedAt: NOW.toISOString(),
      systemChanges: 0,
      message: DRY_RUN_MESSAGE,
      actions: [],
      totals: computeSelectionTotals({ recommendations: [], segments: [] }, []),
      warnings: [],
    };
    expect(executionResultSchema.safeParse(base).success).toBe(true);
    expect(executionResultSchema.safeParse({ ...base, mode: 'execute' }).success).toBe(false);
    expect(executionResultSchema.safeParse({ ...base, systemChanges: 1 }).success).toBe(false);
    expect(executionResultSchema.safeParse({ ...base, message: 'Fertig' }).success).toBe(false);
  });

  it('prepares the change journal model for later phases', () => {
    const entry = {
      entryId: '44444444-4444-4444-8444-444444444444',
      executionId: '33333333-3333-4333-8333-333333333333',
      recommendationId: 'startup.disable:abc',
      actionType: 'startup.disable-entry',
      targetId: 'startup:hkcu-run|discord',
      targetLabel: 'Discord',
      change: { kind: 'startup-disabled', previousState: 'enabled' },
      reversible: true,
      createdAt: NOW.toISOString(),
      revertedAt: null,
    };
    expect(changeJournalEntrySchema.safeParse(entry).success).toBe(true);
    expect(changeJournalEntrySchema.safeParse({ ...entry, change: { kind: 'registry-written' } }).success).toBe(false);
  });

  it('produces recommendations and previews that pass their schemas', () => {
    const { preview: state } = preview();
    for (const recommendation of state.recommendations) expect(optimizationRecommendationSchema.safeParse(recommendation).success).toBe(true);
    expect(previewStateSchema.safeParse(state).success).toBe(true);
  });
});

/* ---------- Size calculation and deduplication ---------- */

describe('size calculation', () => {
  it('sums each physical file once (duplicates and hard links)', () => {
    const candidates = [file('user-temp', 'a.tmp', 10 * MB, 'k1'), file('user-temp', 'b.tmp', 5 * MB, 'k2'), file('crash-dumps', 'link-to-a.tmp', 10 * MB, 'k1')];
    expect(dedupeCandidates(candidates).duplicateCount).toBe(1);
    expect(sumUniqueBytes(candidates)).toBe(15 * MB);
  });

  it('separates potentially freeable bytes from the space actually occupied', () => {
    const estimate = buildCleanupEstimate([
      location('user-temp', [file('user-temp', 'a', 100, 'k1'), file('user-temp', 'b', 50, 'k2')], { occupiedBytes: 1000, inaccessibleCount: 0, skipped: [{ module: 'temp-files', reason: 'recently-modified', count: 4, bytes: 850 }] }),
      location('crash-dumps', [file('crash-dumps', 'c', 100, 'k1')]),
    ]);
    expect(estimate).toMatchObject({ candidateCount: 2, totalBytes: 150, occupiedBytes: 1100, skippedCount: 4, duplicateCount: 1 });
  });

  it('rates the confidence lower when files could not be read or the limit was reached', () => {
    expect(estimateConfidence(100, 0, false)).toBe('high');
    expect(estimateConfidence(100, 10, false)).toBe('medium');
    expect(estimateConfidence(10, 10, false)).toBe('low');
    expect(estimateConfidence(1000, 0, true)).toBe('low');
  });

  it('formats sizes in English and never shows negative values', () => {
    expect(formatBytes(1.8 * 1024 * MB)).toBe('1.8 GB');
    expect(formatBytes(1500 * 1024 * MB)).toBe('1.5 TB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(-5)).toBe('0 B');
  });

  it('creates stable ids', () => {
    expect(stableId('c:\\users\\a\\temp\\x.tmp')).toBe(stableId('c:\\users\\a\\temp\\x.tmp'));
    expect(stableId('a')).not.toBe(stableId('b'));
  });
});

/* ---------- Safety classification ---------- */

describe('safety classification', () => {
  it('blocks Windows core and security processes and services', () => {
    expect(isCriticalProcessName('csrss.exe')).toBe(true);
    expect(isCriticalProcessName('MsMpEng')).toBe(true);
    expect(classifyProcessGroup('explorer', []).safety).toBe('blocked');
    expect(classifyProcessGroup('someservice', [{ name: 'someservice', pid: 1, cpuPercent: null, memoryBytes: 1, sessionId: 0, status: 'running' }]).safety).toBe('blocked');
    expect(classifyProcessGroup('chrome', [{ name: 'chrome', pid: 1, cpuPercent: 1, memoryBytes: 1, sessionId: 1, status: 'running' }]).safety).toBe('caution');
  });

  it('blocks security-relevant autostart entries and flags machine-wide ones as needing admin later', () => {
    const [discord, , security, realtek] = simulatedStartupEntries();
    expect(classifyStartupEntry(security!).safety).toBe('blocked');
    expect(classifyStartupEntry(discord!).safety).toBe('caution');
    expect(classifyStartupEntry(realtek!).hardware).toBe(true);
    expect(startupRequiresAdmin(realtek!)).toBe(true);
    expect(startupRequiresAdmin(discord!)).toBe(false);
  });

  it('never treats blocked or non-ready recommendations as selectable', () => {
    expect(isSelectable({ safety: 'blocked', status: 'ready' })).toBe(false);
    expect(isSelectable({ safety: 'safe', status: 'stale' })).toBe(false);
    expect(isSelectable({ safety: 'caution', status: 'ready' })).toBe(true);
  });
});

/* ---------- RecommendationEngine ---------- */

describe('RecommendationEngine', () => {
  it('turns a scan into explained recommendations with fixed action types', () => {
    const { recommendations } = engine();
    const ids = recommendations.map((recommendation) => recommendation.id);
    expect(ids).toContain('cleanup.user-temp');
    expect(ids).toContain('cleanup.crash-dumps');
    expect(ids).toContain('power.balanced-plan');
    for (const recommendation of recommendations) {
      expect(recommendation.title).not.toBe('');
      expect(recommendation.reason).not.toBe('');
      expect(isKnownActionType(recommendation.actionType)).toBe(true);
      expect(ACTION_CATALOG[recommendation.actionType].category).toBe(recommendation.category);
    }
  });

  it('only pre-selects safe recommendations and marks blocked ones as blocked', () => {
    const { recommendations } = engine();
    for (const recommendation of recommendations) {
      if (recommendation.selectedByDefault) expect(recommendation.safety).toBe('safe');
      if (recommendation.safety === 'blocked') {
        expect(recommendation.status).toBe('blocked');
        expect(recommendation.statusReason).toBeTruthy();
      }
    }
    expect(recommendations.find((recommendation) => recommendation.title.includes('SecurityHealth'))?.safety).toBe('blocked');
    expect(recommendations.find((recommendation) => recommendation.title.includes('MsMpEng'))?.safety).toBe('blocked');
  });

  it('never suggests ending the app itself, and ignores small or disabled things', () => {
    const { recommendations } = engine();
    const titles = recommendations.map((recommendation) => recommendation.title).join('|');
    expect(titles).not.toContain('VOID');
    expect(titles).not.toContain('notepad');
    expect(titles).not.toContain('OldTool');
  });

  it('groups processes of one program and adds up their memory', () => {
    const { recommendations } = engine();
    const chrome = recommendations.find((recommendation) => recommendation.title === 'End chrome');
    expect(chrome).toMatchObject({ targetCount: 3, estimatedMemoryBytes: (320 + 210 + 160) * MB, safety: 'caution', selectedByDefault: false });
    expect(chrome!.estimatedMemoryBytes).toBeGreaterThanOrEqual(PROCESS_MEMORY_THRESHOLD_BYTES);
  });

  it('suggests the power plan only while the power saver plan is active', () => {
    const balanced = snapshot({ system: { ...simulatedSystem(), powerPlan: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Ausbalanciert' } } });
    expect(engine(balanced).recommendations.some((recommendation) => recommendation.category === 'power')).toBe(false);
    expect(simulatedSystem().powerPlan?.guid).toBe(POWER_SAVER_GUID);
  });

  it('includes dump files from the temp folder in the crash dump recommendation (an overlap)', () => {
    const { targets } = engine();
    const temp = new Set((targets.get('cleanup.user-temp') ?? []).map((target) => target.id));
    const shared = (targets.get('cleanup.crash-dumps') ?? []).filter((target) => temp.has(target.id));
    expect(shared).toHaveLength(1);
    expect(shared[0]?.diskBytes).toBe(420 * MB);
  });

  it('skips a cleanup below 1 MB', () => {
    const tiny = snapshot({ cleanup: [location('user-temp', [file('user-temp', 'a.tmp', 1000)])] });
    expect(engine(tiny).recommendations.some((recommendation) => recommendation.id === 'cleanup.user-temp')).toBe(false);
  });
});

/* ---------- PreviewBuilder, selection and live totals ---------- */

describe('PreviewBuilder', () => {
  it('builds an immutable preview tied to its scan, with safe defaults', () => {
    const { preview: state } = preview();
    expect(state.previewId).toBe(PREVIEW_ID);
    expect(state.scanId).toBe(SCAN_ID);
    expect(state.validationStatus).toBe('unchecked');
    expect(state.selectedIds).toEqual(['cleanup.user-temp', 'cleanup.crash-dumps']);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.recommendations[0])).toBe(true);
    expect(() => (state.selectedIds as string[]).push('x')).toThrow();
  });

  it('detects overlaps and counts shared files once in the totals', () => {
    const { preview: state } = preview();
    expect(state.overlaps).toEqual([{ recommendationIds: ['cleanup.crash-dumps', 'cleanup.user-temp'], sharedCount: 1, sharedDiskBytes: 420 * MB }]);
    const temp = state.recommendations.find((recommendation) => recommendation.id === 'cleanup.user-temp')!;
    const dumps = state.recommendations.find((recommendation) => recommendation.id === 'cleanup.crash-dumps')!;
    expect(state.totals.estimatedDiskBytes).toBe(temp.estimatedDiskBytes + dumps.estimatedDiskBytes - 420 * MB);
    expect(state.totals.fileCount).toBe(temp.targetCount + dumps.targetCount - 1);
  });

  it('builds segments so that any selection can be summed without double counting', () => {
    const recs = [
      { id: 'cleanup.a', safety: 'safe', status: 'ready' },
      { id: 'cleanup.b', safety: 'safe', status: 'ready' },
    ] as unknown as Parameters<typeof buildSegments>[0];
    const t = (id: string, bytes: number): OptimizationTarget => ({ id, kind: 'file', label: id, diskBytes: bytes, memoryBytes: 0 });
    const segments = buildSegments(recs, new Map([['cleanup.a', [t('1', 10), t('2', 20)]], ['cleanup.b', [t('2', 20), t('3', 5)]]]));
    expect(segments).toHaveLength(3);
    expect(findOverlaps(segments)).toEqual([{ recommendationIds: ['cleanup.a', 'cleanup.b'], sharedCount: 1, sharedDiskBytes: 20 }]);
    expect(computeSelectionTotals({ recommendations: recs, segments }, ['cleanup.a', 'cleanup.b']).estimatedDiskBytes).toBe(35);
    expect(computeSelectionTotals({ recommendations: recs, segments }, ['cleanup.b']).estimatedDiskBytes).toBe(25);
  });

  it('updates the totals live when selecting, deselecting, selecting all safe and resetting', () => {
    const { preview: state } = preview();
    const discordStartup = state.recommendations.find((recommendation) => recommendation.title === 'Review startup: Discord')!;
    const chrome = state.recommendations.find((recommendation) => recommendation.title === 'End chrome')!;

    const withDiscord = toggleSelection(state.recommendations, state.selectedIds, discordStartup.id, true);
    const withChrome = toggleSelection(state.recommendations, withDiscord, chrome.id, true);
    const totals = computeSelectionTotals(state, withChrome);
    expect(totals).toMatchObject({ selectedCount: 4, startupEntryCount: 1, processCount: 3, estimatedMemoryBytes: chrome.estimatedMemoryBytes, hasCaution: true });

    const none = toggleSelection(state.recommendations, toggleSelection(state.recommendations, state.selectedIds, 'cleanup.user-temp', false), 'cleanup.crash-dumps', false);
    expect(computeSelectionTotals(state, none)).toMatchObject({ selectedCount: 0, fileCount: 0, estimatedDiskBytes: 0, affectedItemCount: 0 });

    expect(selectAllSafe(state.recommendations, [discordStartup.id])).toEqual(['cleanup.user-temp', 'cleanup.crash-dumps', discordStartup.id]);
    expect(defaultSelection(state.recommendations)).toEqual(['cleanup.user-temp', 'cleanup.crash-dumps']);
  });

  it('never accepts blocked or unknown ids into a selection', () => {
    const { preview: state } = preview();
    const blocked = state.recommendations.find((recommendation) => recommendation.safety === 'blocked')!;
    const { preview: next, check } = withSelection(state, [blocked.id, 'cleanup.unknown', 'cleanup.user-temp']);
    expect(next.selectedIds).toEqual(['cleanup.user-temp']);
    expect(check.blocked).toEqual([blocked.id]);
    expect(check.unknown).toEqual(['cleanup.unknown']);
    expect(computeSelectionTotals(state, [blocked.id]).selectedCount).toBe(0);
    expect(next.revision).toBe(state.revision + 1);
    expect(state.selectedIds).toEqual(['cleanup.user-temp', 'cleanup.crash-dumps']);
  });
});

/* ---------- Validation ---------- */

describe('validation', () => {
  function fresh(data = snapshot()) {
    return { snapshot: data, targets: engine(data).targets };
  }

  it('accepts an unchanged selection and always warns that values are estimates', () => {
    const { preview: state, targets } = preview();
    const result = validatePreview({ preview: state, now: NOW, originalTargets: targets, fresh: fresh() });
    expect(result.isValid).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain('estimates-only');
  });

  it('fails for a missing preview, an empty selection and an expired preview', () => {
    const { preview: state, targets } = preview();
    expect(validatePreview({ preview: undefined, now: NOW, originalTargets: targets, fresh: null }).errors[0]?.code).toBe('preview-not-found');
    const empty = withSelection(state, []).preview;
    expect(validatePreview({ preview: empty, now: NOW, originalTargets: targets, fresh: fresh() }).errors.map((error) => error.code)).toContain('empty-selection');
    const late = validatePreview({ preview: state, now: new Date(NOW.getTime() + 11 * 60 * 1000), originalTargets: targets, fresh: fresh() });
    expect(late.isValid).toBe(false);
    expect(late.errors[0]?.code).toBe('preview-expired');
    expect(late.staleRecommendationIds).toEqual(state.selectedIds);
  });

  it('rejects unknown and blocked ids even if they were forced into the preview', () => {
    const { preview: state, targets } = preview();
    const blocked = state.recommendations.find((recommendation) => recommendation.safety === 'blocked')!;
    const forged = { ...state, selectedIds: [...state.selectedIds, blocked.id, 'cleanup.forged'] };
    const codes = validatePreview({ preview: forged, now: NOW, originalTargets: targets, fresh: fresh() }).errors.map((error) => error.code);
    expect(codes).toContain('blocked-selected');
    expect(codes).toContain('unknown-id');
  });

  it('marks cleanup as stale when most files are gone, and requires a rescan when an autostart entry vanished', () => {
    const { preview: state, targets } = preview();
    const discord = state.recommendations.find((recommendation) => recommendation.title === 'Review startup: Discord')!;
    const selected = withSelection(state, [...state.selectedIds, discord.id]).preview;
    const changed = snapshot({
      cleanup: simulatedCleanup().map((entry) => (entry.location === 'user-temp' ? { ...entry, candidates: entry.candidates.slice(0, 3) } : entry)),
      startupEntries: simulatedStartupEntries().filter((entry) => entry.name !== 'Discord'),
    });
    const result = validatePreview({ preview: selected, now: NOW, originalTargets: targets, fresh: fresh(changed) });
    expect(result.isValid).toBe(false);
    expect(result.staleRecommendationIds).toEqual(expect.arrayContaining(['cleanup.user-temp', discord.id]));
    expect(result.requiresRescan).toBe(true);
    const marked = withValidation(selected, result);
    expect(marked.validationStatus).toBe('stale');
    expect(marked.recommendations.find((recommendation) => recommendation.id === discord.id)?.status).toBe('stale');
  });

  it('fails when the current state could not be checked', () => {
    const { preview: state, targets } = preview();
    expect(validatePreview({ preview: state, now: NOW, originalTargets: targets, fresh: null }).errors[0]?.code).toBe('verification-failed');
    const broken = fresh(snapshot({ errors: [{ module: 'temp-files', code: 'access-denied', message: 'x' }] }));
    expect(validatePreview({ preview: state, now: NOW, originalTargets: targets, fresh: broken }).isValid).toBe(false);
  });

  it('re-scans only the modules the selection needs', () => {
    const { preview: state } = preview();
    expect(modulesForSelection(state)).toEqual(['temp-files']);
  });
});

/* ---------- Dry run ---------- */

describe('dry run', () => {
  it('reports planned actions and states that nothing was changed', () => {
    const { preview: state, targets } = preview();
    const validation = validatePreview({ preview: state, now: NOW, originalTargets: targets, fresh: { snapshot: snapshot(), targets } });
    const result = simulateExecution({ preview: state, validation, executionId: '33333333-3333-4333-8333-333333333333', startedAt: NOW, finishedAt: NOW });
    expect(executionResultSchema.safeParse(result).success).toBe(true);
    expect(result.message).toBe('Simulation complete – no system changes were made.');
    expect(result.systemChanges).toBe(0);
    expect(result.mode).toBe('dry-run');
    expect(result.actions.map((action) => action.recommendationId)).toEqual(state.selectedIds);
    expect(result.actions.every((action) => action.outcome === 'simulated')).toBe(true);
    expect(result.actions[0]?.plannedChange).toMatch(/^Would \w+ \d+/);
  });
});

/* ---------- Service (the API behind IPC) ---------- */

describe('OptimizerService', () => {
  let counter = 0;
  const ids = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
  const service = (overrides = {}) => new OptimizerService({ scanners: createSimulatedScannerSuite(overrides), context: SIMULATED_CONTEXT, createId: ids, now: () => NOW });

  async function readyPreview(api: OptimizerService) {
    const scan = await api.startScan();
    if (!scan.ok) throw new Error('scan failed');
    const created = await api.createPreview(scan.value.scanId);
    if (!created.ok) throw new Error('preview failed');
    return { scan: scan.value, preview: created.value };
  }

  it('runs scan → preview → selection → validation → confirmation → dry run', async () => {
    const api = service();
    const { scan, preview: created } = await readyPreview(api);
    expect(scan.status).toBe('completed');
    expect(created.scanId).toBe(scan.scanId);

    const updated = await api.updateSelection(created.previewId, ['cleanup.user-temp']);
    expect(updated.ok && updated.value.selectedIds).toEqual(['cleanup.user-temp']);

    const validated = await api.validatePreview(created.previewId);
    expect(validated.ok && validated.value.validationStatus).toBe('valid');

    const confirmed = await api.confirmPreview(created.previewId);
    expect(confirmed.ok && confirmed.value.confirmedAt).toBe(NOW.toISOString());

    const result = await api.executeDryRun(created.previewId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe(DRY_RUN_MESSAGE);
      expect(result.value.actions).toHaveLength(1);
    }
    const history = await api.getHistory();
    expect(history.ok && history.value).toHaveLength(1);
    expect(api.journal).toEqual([]);
  });

  it('refuses to confirm without a valid validation and to run without a confirmation', async () => {
    const api = service();
    const { preview: created } = await readyPreview(api);
    expect((await api.confirmPreview(created.previewId)).ok).toBe(false);
    expect((await api.executeDryRun(created.previewId)).ok).toBe(false);
    await api.validatePreview(created.previewId);
    // Changing the selection after validating resets the validation.
    await api.updateSelection(created.previewId, ['cleanup.crash-dumps']);
    const refused = await api.confirmPreview(created.previewId);
    expect(!refused.ok && refused.error.code).toBe('invalid-state');
  });

  it('accepts only known ids: no paths, commands, blocked or malformed input', async () => {
    const api = service();
    const { preview: created } = await readyPreview(api);
    const blocked = created.recommendations.find((recommendation) => recommendation.safety === 'blocked')!;
    for (const input of [['C:\\Windows\\System32\\*'], ['cleanup.user-temp && del /q *'], [blocked.id], ['cleanup.unknown'], 'cleanup.user-temp', [42], Array.from({ length: 501 }, () => 'cleanup.user-temp')]) {
      const response = await api.updateSelection(created.previewId, input);
      expect(response.ok).toBe(false);
    }
    expect((await api.createPreview('../../etc/passwd')).ok).toBe(false);
    expect((await api.validatePreview('not-a-uuid')).ok).toBe(false);
    expect((await api.executeDryRun({ path: 'C:\\' })).ok).toBe(false);
  });

  it('marks the preview stale when the PC changed before the dry run', async () => {
    let files = simulatedCleanup();
    const api = new OptimizerService({
      scanners: createScannerSuite(simulatedModuleScanners({ tempFiles: async () => ({ locations: files }) })),
      context: SIMULATED_CONTEXT,
      createId: ids,
      now: () => NOW,
    });
    const { preview: created } = await readyPreview(api);
    await api.validatePreview(created.previewId);
    await api.confirmPreview(created.previewId);
    files = files.map((entry) => ({ ...entry, candidates: [] }));
    const result = await api.executeDryRun(created.previewId);
    expect(!result.ok && result.error.code).toBe('validation-failed');
    expect(!result.ok && result.error.validation?.staleRecommendationIds).toEqual(['cleanup.user-temp', 'cleanup.crash-dumps']);
    const after = await api.validatePreview(created.previewId);
    expect(after.ok && after.value.validationStatus).toBe('stale');
  });

  it('keeps working when a single scanner fails', async () => {
    const api = service({
      processes: async () => {
        throw new Error('boom');
      },
    });
    const scan = await api.startScan();
    expect(scan.ok && scan.value.status).toBe('partial');
    expect(scan.ok && scan.value.errors).toEqual([{ module: 'processes', code: 'unknown', message: 'boom' }]);
    expect(scan.ok && scan.value.recommendations.length).toBeGreaterThan(0);
  });

  it('never sends file paths to the page, only names and counts', async () => {
    const api = service();
    const { scan, preview: created } = await readyPreview(api);
    const text = JSON.stringify([scan, created]);
    expect(text).not.toContain('setup-cache\\\\installer.msi');
    expect(text).not.toMatch(/"relativePath"/);
    expect(text).not.toMatch(/"candidates"/);
  });

  it('refuses a second scan while one is running', async () => {
    let release: () => void = () => {};
    const api = service({ system: () => new Promise((resolve) => (release = () => resolve({ info: simulatedSystem() }))) });
    const first = api.startScan();
    const second = await api.startScan();
    expect(!second.ok && second.error.code).toBe('busy');
    release();
    expect((await first).ok).toBe(true);
  });
});

/* ---------- Deep scan ---------- */

describe('deep scan', () => {
  const deepService = () => new OptimizerService({ scanners: createSimulatedScannerSuite(), context: SIMULATED_CONTEXT, now: () => NOW });

  it('quick scans have no findings or resource summary', async () => {
    const scan = await deepService().startScan();
    expect(scan.ok && scan.value.mode).toBe('quick');
    expect(scan.ok && scan.value.findings).toEqual([]);
    expect(scan.ok && scan.value.resources).toBeNull();
  });

  it('rejects unknown scan modes', async () => {
    for (const mode of ['full', 'DEEP', 42, { mode: 'deep' }]) {
      const scan = await deepService().startScan(mode);
      expect(!scan.ok && scan.error.code).toBe('invalid-input');
    }
  });

  it('finds performance hogs, each with cause, fix steps and a valid link', async () => {
    const scan = await deepService().startScan('deep');
    if (!scan.ok) throw new Error('scan failed');
    const { findings, recommendations } = scan.value;
    const kinds = new Set(findings.map((finding) => finding.kind));
    for (const kind of ['process', 'disk', 'uptime', 'power', 'cleanup']) expect(kinds).toContain(kind);
    const ids = new Set(recommendations.map((recommendation) => recommendation.id));
    for (const finding of findings) {
      expect(finding.cause.length).toBeGreaterThan(10);
      expect(finding.fixSteps.length).toBeGreaterThan(0);
      if (finding.recommendationId) expect(ids).toContain(finding.recommendationId);
    }
    // Sorted from high to low severity.
    const order = { high: 0, medium: 1, low: 2 };
    expect(findings.map((finding) => order[finding.severity])).toEqual([...findings.map((finding) => order[finding.severity])].sort((a, b) => a - b));
    // The app itself is never named; a protected process (Defender) may be, but only links to a locked entry.
    expect(findings.some((finding) => /VOID/.test(finding.title))).toBe(false);
    const defender = findings.find((finding) => finding.title.startsWith('MsMpEng'));
    expect(recommendations.find((recommendation) => recommendation.id === defender?.recommendationId)?.safety ?? 'blocked').toBe('blocked');
  });

  it('ranks who pulls the most CPU, GPU, RAM and network, grouped per program', async () => {
    const scan = await deepService().startScan('deep');
    if (!scan.ok || !scan.value.resources) throw new Error('scan failed');
    const { cpu, gpu, memory, network, overall } = scan.value.resources;
    expect(cpu.top[0]?.name).toBe('GameClient');
    expect(gpu.measured).toBe(true);
    expect(gpu.top[0]?.name).toBe('GameClient');
    expect(memory.top[0]?.name).toBe('GameClient');
    // chrome's three processes are added up.
    const chrome = memory.top.find((user) => user.name === 'chrome');
    expect(chrome?.processCount).toBe(3);
    expect(chrome?.memoryBytes).toBe(Math.round(320 * MB) + Math.round(210 * MB) + Math.round(160 * MB));
    expect(network.receivedBytesPerSec).toBe(Math.round(4.2 * MB));
    expect(network.top[0]?.name).toBe('MsMpEng');
    expect(overall[0]).toMatchObject({ name: 'GameClient', main: 'gpu' });
    expect(overall.length).toBeLessThanOrEqual(6);
    for (const list of [cpu.top, gpu.top, memory.top, network.top]) expect(list.length).toBeLessThanOrEqual(5);
  });

  it('adds browser cache and error reports only in the deep scan, each with a place to open', async () => {
    const quick = await deepService().startScan('quick');
    const deep = await deepService().startScan('deep');
    if (!quick.ok || !deep.ok) throw new Error('scan failed');
    expect(quick.value.recommendations.some((recommendation) => recommendation.id === 'cleanup.error-reports')).toBe(false);
    const reports = deep.value.recommendations.find((recommendation) => recommendation.id === 'cleanup.error-reports');
    expect(reports?.openTarget?.id).toBe('folder:error-reports');
    expect(deep.value.recommendations.some((recommendation) => recommendation.id === 'cleanup.browser-cache')).toBe(true);
    for (const recommendation of deep.value.recommendations) expect(recommendation.preview.manualSteps.length).toBeGreaterThan(0);
  });
});
