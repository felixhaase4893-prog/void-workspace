import { ACTION_CATALOG } from './catalog';
import { DRY_RUN_MESSAGE, type ExecutionResult, type PlannedAction, type PreviewState, type ValidationResult } from './models';
import { deepFreeze } from './preview';

/**
 * Dry run: describes what a real run would do. It only reads the preview and
 * builds a report. There is no code path in here (or anywhere in phase A–C)
 * that deletes, moves, ends or changes anything.
 */

export interface DryRunInput {
  preview: PreviewState;
  validation: ValidationResult;
  executionId: string;
  startedAt: Date;
  finishedAt: Date;
}

export function simulateExecution({ preview, validation, executionId, startedAt, finishedAt }: DryRunInput): ExecutionResult {
  const selected = new Set(preview.selectedIds);
  const actions: PlannedAction[] = preview.recommendations
    .filter((recommendation) => selected.has(recommendation.id) && recommendation.safety !== 'blocked' && recommendation.status === 'ready')
    .map((recommendation) => ({
      recommendationId: recommendation.id,
      actionType: recommendation.actionType,
      title: recommendation.title,
      plannedChange: ACTION_CATALOG[recommendation.actionType].plannedChange.replace('{count}', recommendation.targetCount.toLocaleString('en-US')),
      targetCount: recommendation.targetCount,
      estimatedDiskBytes: recommendation.estimatedDiskBytes,
      estimatedMemoryBytes: recommendation.estimatedMemoryBytes,
      sampleTargets: recommendation.preview.sampleTargets.slice(0, 8),
      outcome: 'simulated' as const,
      requiresAdmin: recommendation.requiresAdmin,
    }));
  return deepFreeze({
    executionId,
    previewId: preview.previewId,
    scanId: preview.scanId,
    mode: 'dry-run',
    status: 'simulated',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    systemChanges: 0,
    message: DRY_RUN_MESSAGE,
    actions,
    totals: preview.totals,
    warnings: validation.warnings,
  });
}
