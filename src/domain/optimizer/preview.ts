import type { OptimizationRecommendation, Overlap, PreviewState, ScanResult, SelectionTotals, TargetSegment, ValidationResult, ValidationStatus } from './models';
import type { OptimizationTarget } from './recommendations';
import { isSelectable } from './safety';

/**
 * PreviewBuilder: makes an immutable preview from a scan. A preview never
 * changes; a new selection, validation or confirmation produces a new object.
 */

/** A preview is only trusted for this long; afterwards it counts as stale and needs a new scan. */
export const PREVIEW_TTL_MS = 10 * 60 * 1000;

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Splits all targets into segments by the exact set of recommendations that
 * contain them. A file in two recommendations lands in one segment with both ids.
 */
export function buildSegments(recommendations: readonly OptimizationRecommendation[], targets: ReadonlyMap<string, readonly OptimizationTarget[]>): TargetSegment[] {
  const owners = new Map<string, { target: OptimizationTarget; recommendationIds: string[] }>();
  for (const recommendation of recommendations) {
    for (const target of targets.get(recommendation.id) ?? []) {
      const entry = owners.get(target.id);
      if (entry) {
        if (!entry.recommendationIds.includes(recommendation.id)) entry.recommendationIds.push(recommendation.id);
      } else owners.set(target.id, { target, recommendationIds: [recommendation.id] });
    }
  }
  const segments = new Map<string, TargetSegment>();
  for (const { target, recommendationIds } of owners.values()) {
    const ids = [...recommendationIds].sort();
    const key = `${target.kind}|${ids.join(',')}`;
    const segment = segments.get(key);
    if (segment) {
      segment.count += 1;
      segment.diskBytes += target.diskBytes;
      segment.memoryBytes += target.memoryBytes;
    } else segments.set(key, { recommendationIds: ids, kind: target.kind, count: 1, diskBytes: target.diskBytes, memoryBytes: target.memoryBytes });
  }
  return [...segments.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.recommendationIds.join().localeCompare(b.recommendationIds.join()));
}

/** Pairs of recommendations that share targets, with what they share. */
export function findOverlaps(segments: readonly TargetSegment[]): Overlap[] {
  const overlaps = new Map<string, Overlap>();
  for (const segment of segments) {
    const ids = segment.recommendationIds;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        if (!a || !b) continue;
        const key = `${a}|${b}`;
        const overlap = overlaps.get(key) ?? { recommendationIds: [a, b], sharedCount: 0, sharedDiskBytes: 0 };
        overlap.sharedCount += segment.count;
        overlap.sharedDiskBytes += segment.diskBytes;
        overlaps.set(key, overlap);
      }
    }
  }
  return [...overlaps.values()];
}

/**
 * Live totals of a selection. Every target is counted once, however many of
 * the selected recommendations contain it. Unknown or blocked ids add nothing.
 */
export function computeSelectionTotals(
  preview: { recommendations: readonly OptimizationRecommendation[]; segments: readonly TargetSegment[] },
  selectedIds: readonly string[],
): SelectionTotals {
  const byId = new Map(preview.recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const selected = new Set(selectedIds.filter((id) => {
    const recommendation = byId.get(id);
    return recommendation !== undefined && isSelectable(recommendation);
  }));
  const totals: SelectionTotals = {
    selectedCount: selected.size,
    fileCount: 0,
    estimatedDiskBytes: 0,
    estimatedMemoryBytes: 0,
    startupEntryCount: 0,
    processCount: 0,
    powerSettingCount: 0,
    affectedItemCount: 0,
    requiresAdmin: false,
    hasCaution: false,
  };
  for (const segment of preview.segments) {
    if (!segment.recommendationIds.some((id) => selected.has(id))) continue;
    totals.estimatedDiskBytes += segment.diskBytes;
    totals.estimatedMemoryBytes += segment.memoryBytes;
    totals.affectedItemCount += segment.count;
    if (segment.kind === 'file') totals.fileCount += segment.count;
    else if (segment.kind === 'startup') totals.startupEntryCount += segment.count;
    else if (segment.kind === 'process') totals.processCount += segment.count;
    else totals.powerSettingCount += segment.count;
  }
  for (const id of selected) {
    const recommendation = byId.get(id);
    if (recommendation?.requiresAdmin) totals.requiresAdmin = true;
    if (recommendation?.safety === 'caution') totals.hasCaution = true;
  }
  return totals;
}

export interface SelectionCheck {
  /** Known, selectable ids, in the order of the recommendation list, without duplicates. */
  accepted: string[];
  unknown: string[];
  blocked: string[];
  notReady: string[];
}

export function checkSelection(recommendations: readonly OptimizationRecommendation[], requested: readonly string[]): SelectionCheck {
  const wanted = new Set(requested);
  const known = new Set(recommendations.map((recommendation) => recommendation.id));
  const result: SelectionCheck = { accepted: [], unknown: [...wanted].filter((id) => !known.has(id)), blocked: [], notReady: [] };
  for (const recommendation of recommendations) {
    if (!wanted.has(recommendation.id)) continue;
    if (recommendation.safety === 'blocked') result.blocked.push(recommendation.id);
    else if (recommendation.status !== 'ready') result.notReady.push(recommendation.id);
    else result.accepted.push(recommendation.id);
  }
  return result;
}

export function defaultSelection(recommendations: readonly OptimizationRecommendation[]): string[] {
  return recommendations.filter((recommendation) => recommendation.selectedByDefault && recommendation.safety === 'safe' && isSelectable(recommendation)).map((recommendation) => recommendation.id);
}

/** "Select all safe": keeps what is selected and adds every safe recommendation. */
export function selectAllSafe(recommendations: readonly OptimizationRecommendation[], current: readonly string[]): string[] {
  const wanted = new Set([...current, ...recommendations.filter((recommendation) => recommendation.safety === 'safe').map((recommendation) => recommendation.id)]);
  return checkSelection(recommendations, [...wanted]).accepted;
}

export function toggleSelection(recommendations: readonly OptimizationRecommendation[], current: readonly string[], id: string, selected: boolean): string[] {
  const next = new Set(current);
  if (selected) next.add(id);
  else next.delete(id);
  return checkSelection(recommendations, [...next]).accepted;
}

export interface BuildPreviewOptions {
  previewId: string;
  now: Date;
  ttlMs?: number;
}

export function buildPreview(scan: ScanResult, targets: ReadonlyMap<string, readonly OptimizationTarget[]>, options: BuildPreviewOptions): PreviewState {
  const recommendations = scan.recommendations.map((recommendation) => ({ ...recommendation, preview: { ...recommendation.preview, sampleTargets: [...recommendation.preview.sampleTargets] }, affects: { ...recommendation.affects } }));
  const segments = buildSegments(recommendations, targets);
  const selectedIds = defaultSelection(recommendations);
  const preview: PreviewState = {
    previewId: options.previewId,
    scanId: scan.scanId,
    createdAt: options.now.toISOString(),
    expiresAt: new Date(options.now.getTime() + (options.ttlMs ?? PREVIEW_TTL_MS)).toISOString(),
    revision: 0,
    recommendations,
    selectedIds,
    segments,
    overlaps: findOverlaps(segments),
    totals: computeSelectionTotals({ recommendations, segments }, selectedIds),
    validationStatus: 'unchecked',
    validation: null,
    confirmedAt: null,
  };
  return deepFreeze(preview);
}

/** A new preview with another selection. Validation and confirmation start over. */
export function withSelection(preview: PreviewState, requested: readonly string[]): { preview: PreviewState; check: SelectionCheck } {
  const check = checkSelection(preview.recommendations, requested);
  const next: PreviewState = {
    ...preview,
    revision: preview.revision + 1,
    selectedIds: check.accepted,
    totals: computeSelectionTotals(preview, check.accepted),
    validationStatus: 'unchecked',
    validation: null,
    confirmedAt: null,
  };
  return { preview: deepFreeze(next), check };
}

/** A new preview carrying a validation result; stale recommendations are marked as such. */
export function withValidation(preview: PreviewState, validation: ValidationResult): PreviewState {
  const stale = new Set(validation.staleRecommendationIds);
  const status: ValidationStatus = validation.isValid ? 'valid' : stale.size > 0 || validation.errors.some((issue) => issue.code === 'preview-expired') ? 'stale' : 'invalid';
  const next: PreviewState = {
    ...preview,
    recommendations: preview.recommendations.map((recommendation) => (stale.has(recommendation.id) && recommendation.status === 'ready' ? { ...recommendation, status: 'stale', statusReason: 'The data has changed since the scan. Please scan again.' } : recommendation)),
    validationStatus: status,
    validation,
    confirmedAt: null,
  };
  return deepFreeze(next);
}

export function withConfirmation(preview: PreviewState, now: Date): PreviewState {
  return deepFreeze({ ...preview, confirmedAt: now.toISOString() });
}
