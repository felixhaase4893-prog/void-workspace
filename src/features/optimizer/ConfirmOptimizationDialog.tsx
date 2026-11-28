import { useId, useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { SAFETY_LABELS } from '../../domain/optimizer/catalog';
import type { PreviewState } from '../../domain/optimizer/models';
import { formatBytes } from './format';
import { describeImpact, SAFETY_TONES } from './RecommendationItem';
import { formatNumber, t, translateText } from '../../i18n/translate';

interface ConfirmOptimizationDialogProps {
  preview: PreviewState;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The explicit "yes" before the run. In phase A–C confirming only starts a
 * simulation (dry run); the dialog says so, and nothing on the PC changes.
 */
export function ConfirmOptimizationDialog({ preview, pending, onConfirm, onClose }: ConfirmOptimizationDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const ackId = useId();
  const selected = preview.recommendations.filter((recommendation) => preview.selectedIds.includes(recommendation.id));
  const risky = selected.filter((recommendation) => recommendation.safety !== 'safe');

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Confirm optimization')}
      description={t('Review the selected actions. In this version only a simulation runs.')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {t('Cancel')}
          </Button>
          <Button variant="primary" disabled={!acknowledged || pending} onClick={onConfirm}>
            {pending ? t('Simulation running…') : t('Confirm and simulate')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <Alert tone="info" title={t('Simulation mode – no system changes')}>
          {t('Confirming only starts a dry run. No files are deleted, no processes are ended and no settings are changed.')}
        </Alert>

        <section aria-labelledby={`${ackId}-list`}>
          <h3 id={`${ackId}-list`} className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">
            {t('Selected actions ({count})', { count: selected.length })}
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {selected.map((recommendation) => (
              <li key={recommendation.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 [overflow-wrap:anywhere] text-fg">{translateText(recommendation.title)}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {describeImpact(recommendation)}
                  <Badge tone={SAFETY_TONES[recommendation.safety]}>{translateText(SAFETY_LABELS[recommendation.safety])}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-raised/40 p-3">
          <div>
            <dt className="text-xs text-subtle">{t('Estimated space freed')}</dt>
            <dd className="text-base font-semibold text-fg">{formatBytes(preview.totals.estimatedDiskBytes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t('Affected items')}</dt>
            <dd className="text-base font-semibold text-fg">{formatNumber(preview.totals.affectedItemCount)}</dd>
          </div>
        </dl>

        <section>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{t('Possible risks')}</h3>
          {risky.length === 0 ? (
            <p className="text-muted">{t('Only actions rated safe are selected. In a real run, deleted temporary files could not be restored.')}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {risky.map((recommendation) => (
                <li key={recommendation.id}>
                  <span className="text-fg">{translateText(recommendation.title)}:</span> {translateText(recommendation.preview.risks)}
                </li>
              ))}
            </ul>
          )}
          {preview.totals.requiresAdmin && <p className="mt-2 text-xs text-warning">{t('Some actions would need administrator rights later. None are requested now.')}</p>}
        </section>

        <p className="text-xs text-subtle">{t('All values are estimates based on the last scan. No specific amount of freed disk space or RAM is guaranteed.')}</p>

        <label htmlFor={ackId} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line-strong bg-raised px-3 py-2">
          <input id={ackId} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-4 accent-accent-500" />
          <span className="text-fg">{t('I have read the actions and risks and want to start the simulation.')}</span>
        </label>
      </div>
    </Dialog>
  );
}
