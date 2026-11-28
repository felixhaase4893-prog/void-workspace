import type { OptimizationCategory, PreviewState, ScanModule, ScanSnapshot, ValidationIssue, ValidationResult } from './models';
import { checkSelection } from './preview';
import type { OptimizationTarget } from './recommendations';

/**
 * Checks a preview before a (dry) run:
 * - does it exist, has it not expired?
 * - are all selected ids known, allowed and not blocked?
 * - does the current state of the PC still match the scan closely enough?
 */

/** Share of a cleanup's bytes that must still be there; below it the recommendation is stale. */
export const MIN_CLEANUP_PRESENT_SHARE = 0.8;
/** Share of a program's processes that must still run. */
export const MIN_PROCESS_PRESENT_SHARE = 0.5;

export const MODULE_FOR_CATEGORY: Readonly<Record<OptimizationCategory, ScanModule>> = {
  cleanup: 'temp-files',
  startup: 'startup',
  process: 'processes',
  power: 'system',
};

/** The scan modules needed to re-check a selection; nothing else is scanned again. */
export function modulesForSelection(preview: PreviewState): ScanModule[] {
  const selected = new Set(preview.selectedIds);
  const modules = new Set<ScanModule>();
  for (const recommendation of preview.recommendations) if (selected.has(recommendation.id)) modules.add(MODULE_FOR_CATEGORY[recommendation.category]);
  return [...modules].sort();
}

export interface FreshState {
  snapshot: ScanSnapshot;
  targets: ReadonlyMap<string, readonly OptimizationTarget[]>;
}

export interface ValidationInput {
  preview: PreviewState | undefined;
  now: Date;
  /** Targets of the original scan, per recommendation id. */
  originalTargets: ReadonlyMap<string, readonly OptimizationTarget[]>;
  /** A fresh, read-only re-scan of the needed modules; null when it could not be taken. */
  fresh: FreshState | null;
  /** True when the original scan had errors. */
  partialScan?: boolean;
}

function issue(code: ValidationIssue['code'], message: string, recommendationId: string | null = null): ValidationIssue {
  return { code, message, recommendationId };
}

function presentShare(original: readonly OptimizationTarget[], fresh: readonly OptimizationTarget[] | undefined, weight: (target: OptimizationTarget) => number): number {
  if (original.length === 0) return 1;
  const freshIds = new Set((fresh ?? []).map((target) => target.id));
  const total = original.reduce((sum, target) => sum + weight(target), 0);
  const present = original.filter((target) => freshIds.has(target.id)).reduce((sum, target) => sum + weight(target), 0);
  return total === 0 ? 1 : present / total;
}

export function validatePreview(input: ValidationInput): ValidationResult {
  const checkedAt = input.now.toISOString();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const stale = new Set<string>();
  let requiresRescan = false;

  const { preview } = input;
  if (!preview) {
    return { isValid: false, checkedAt, errors: [issue('preview-not-found', 'This preview does not exist (any more). Please scan again.')], warnings, staleRecommendationIds: [], requiresRescan: true };
  }

  if (input.now.getTime() > new Date(preview.expiresAt).getTime()) {
    errors.push(issue('preview-expired', 'The preview has expired. Please scan again so the values match the current state.'));
    requiresRescan = true;
    for (const id of preview.selectedIds) stale.add(id);
  }

  if (preview.selectedIds.length === 0) errors.push(issue('empty-selection', 'No action is selected.'));

  const check = checkSelection(preview.recommendations, preview.selectedIds);
  // Unknown ids are never echoed back: they did not come from the backend.
  if (check.unknown.length > 0) errors.push(issue('unknown-id', `${check.unknown.length} unknown action(s) in the selection.`));
  for (const id of check.blocked) errors.push(issue('blocked-selected', 'Blocked actions must not be selected.', id));
  for (const id of check.notReady) {
    errors.push(issue('not-allowed', 'This action can no longer be carried out.', id));
    const recommendation = preview.recommendations.find((entry) => entry.id === id);
    if (recommendation?.status === 'stale') stale.add(id);
  }

  const selected = preview.recommendations.filter((recommendation) => check.accepted.includes(recommendation.id));

  if (selected.length > 0 && errors.every((entry) => entry.code !== 'preview-expired')) {
    if (!input.fresh) {
      errors.push(issue('verification-failed', 'The current state could not be checked. Please scan again.'));
    } else {
      const failedModules = new Set(input.fresh.snapshot.errors.map((error) => error.module));
      for (const recommendation of selected) {
        const module = MODULE_FOR_CATEGORY[recommendation.category];
        if (failedModules.has(module)) {
          errors.push(issue('verification-failed', 'The current state of this action could not be checked.', recommendation.id));
          continue;
        }
        const original = input.originalTargets.get(recommendation.id) ?? [];
        const fresh = input.fresh.targets.get(recommendation.id);
        let isStale: boolean;
        let critical = false;
        if (recommendation.category === 'cleanup') {
          isStale = presentShare(original, fresh, (target) => Math.max(1, target.diskBytes)) < MIN_CLEANUP_PRESENT_SHARE;
        } else if (recommendation.category === 'process') {
          isStale = presentShare(original, fresh, () => 1) < MIN_PROCESS_PRESENT_SHARE;
          critical = isStale;
        } else {
          // Startup entries and the power plan: the exact target must still be there, otherwise it is a critical change.
          isStale = presentShare(original, fresh, () => 1) < 1;
          critical = isStale;
        }
        if (isStale) {
          stale.add(recommendation.id);
          if (critical) requiresRescan = true;
          errors.push(issue(critical ? 'rescan-required' : 'stale-data', `"${recommendation.title}" no longer matches the current state of the PC.`, recommendation.id));
        }
      }
    }
  }

  for (const recommendation of selected) {
    if (recommendation.requiresAdmin) warnings.push(issue('requires-admin', 'Would need administrator rights later. None are requested in this phase.', recommendation.id));
    if (recommendation.safety === 'caution') warnings.push(issue('caution-selected', 'An action with increased risk is selected.', recommendation.id));
  }
  if (input.partialScan) warnings.push(issue('partial-scan', 'The scan was incomplete; some areas could not be read.'));
  warnings.push(issue('estimates-only', 'All values are estimates. No freed space is guaranteed.'));

  if (stale.size > 0 && !requiresRescan && stale.size === selected.length && selected.length > 0) requiresRescan = true;

  return {
    isValid: errors.length === 0,
    checkedAt,
    errors,
    warnings,
    staleRecommendationIds: preview.recommendations.filter((recommendation) => stale.has(recommendation.id)).map((recommendation) => recommendation.id),
    requiresRescan,
  };
}
