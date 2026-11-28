import { CheckCircle2 } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import type { ExecutionResult } from '../../domain/optimizer/models';
import { formatBytes } from './format';
import { formatDateTime, formatNumber, t, translateText } from '../../i18n/translate';

interface DryRunReportProps {
  result: ExecutionResult;
  onRescan: () => void;
  onBack: () => void;
}

/** The report of a dry run. It states clearly that nothing on the PC was changed. */
export function DryRunReport({ result, onRescan, onBack }: DryRunReportProps) {
  return (
    <div className="space-y-4">
      <div role="status" className="flex items-start gap-3 rounded-card border border-success/30 bg-success/[0.07] px-5 py-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{translateText(result.message)}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {t('System changes: {changes}. Simulated {count} actions on {date}.', { changes: result.systemChanges, count: result.actions.length, date: formatDateTime(result.finishedAt) })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title={t('Result report')} description={t('What a real run would have done – estimated from the last scan.')} />
        <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
          <Stat label={t('Actions')} value={formatNumber(result.totals.selectedCount)} />
          <Stat label={t('Files')} value={formatNumber(result.totals.fileCount)} />
          <Stat label={t('Potentially freed')} value={formatBytes(result.totals.estimatedDiskBytes)} />
          <Stat label={t('Startup / processes')} value={`${result.totals.startupEntryCount} / ${result.totals.processCount}`} />
        </dl>
        <ul className="divide-y divide-line border-t border-line">
          {result.actions.map((action) => (
            <li key={action.recommendationId} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-fg">{translateText(action.title)}</span>
                <Badge tone="accent">{t('Simulated')}</Badge>
                {action.requiresAdmin && <Badge>{t('Admin needed later')}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {translateText(action.plannedChange)}
                {action.estimatedDiskBytes > 0 && ` ${t('Estimated {size}.', { size: formatBytes(action.estimatedDiskBytes) })}`}
                {action.estimatedMemoryBytes > 0 && ` ${t('Currently uses about {size} RAM.', { size: formatBytes(action.estimatedMemoryBytes) })}`}
              </p>
            </li>
          ))}
        </ul>
        {result.warnings.length > 0 && (
          <ul className="space-y-1 border-t border-line px-5 py-3 text-xs text-subtle">
            {[...new Set(result.warnings.map((warning) => warning.message))].map((message) => (
              <li key={message}>• {translateText(message)}</li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t('Back to preview')}
        </Button>
        <Button variant="primary" onClick={onRescan}>
          {t('Scan again')}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-fg">{value}</dd>
    </div>
  );
}
