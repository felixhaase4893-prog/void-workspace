import { Gauge, HardDrive, ListChecks, MemoryStick, Microscope, ScanSearch, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { CATEGORY_LABELS, driveTarget, OPEN_TARGETS } from '../../domain/optimizer/catalog';
import { OPTIMIZATION_CATEGORIES, type ExecutionResult, type PreviewState, type ScanResult } from '../../domain/optimizer/models';
import { formatBytes } from './format';
import { cn } from '../../lib/cn';
import { ConfirmOptimizationDialog } from './ConfirmOptimizationDialog';
import { FindingsSection, ResourceSummarySection } from './DeepScanSections';
import { DryRunReport } from './DryRunReport';
import { OpenTargetButton, OpenTargetContext } from './OpenTargetButton';
import { createOptimizerClient, type OptimizerClient } from './optimizerClient';
import { RecommendationItem, recommendationAnchor } from './RecommendationItem';
import { useOptimizer } from './useOptimizer';
import { formatDateTime, formatNumber, type MessageKey, t, tn, translateText } from '../../i18n/translate';

const SKIP_LABELS: Record<string, MessageKey> = {
  'recently-modified': 'changed in the last 24 hours (may be in use)',
  'junction-or-link': 'links/junctions (not followed)',
  symlink: 'symbolic links (not followed)',
  'outside-root': 'outside the allowed folder',
  'not-a-regular-file': 'not regular files',
  'limit-reached': 'file limit reached',
  'depth-limit': 'nested too deeply',
};

/**
 * PC Optimizer, phase A–C: read-only scan, preview with selection and live
 * totals, validation, confirmation and a dry run. Nothing on the PC changes.
 */
export default function OptimizerPage({ client: injected }: { client?: OptimizerClient }) {
  const [client] = useState(() => injected ?? createOptimizerClient());
  const optimizer = useOptimizer(client);
  const { state } = optimizer;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  /** t('Go to action'): scrolls to the recommendation and highlights it for a moment. */
  const jumpTo = useCallback((recommendationId: string) => {
    document.getElementById(recommendationAnchor(recommendationId))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(recommendationId);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2200);
  }, []);
  const deep = state.scan?.mode === 'deep';

  const openConfirm = async () => {
    // Validated just now and still valid? Otherwise validate first; the dialog only opens for a valid preview.
    const preview = state.preview?.validationStatus === 'valid' ? state.preview : await optimizer.validate();
    if (preview?.validationStatus === 'valid') setConfirmOpen(true);
  };

  return (
    <OpenTargetContext.Provider value={client.openTarget}>
      <PageHeader
        eyebrow={t('PC Optimizer')}
        title={state.preview ? t('Optimization preview') : t('PC Optimizer')}
        description={t('Analyses your PC read-only and shows what could be optimized safely. In this version, actions are only simulated.')}
        actions={
          state.phase !== 'scanning' && (
            <div className="flex flex-wrap gap-2">
              <Button variant={state.preview ? 'secondary' : 'primary'} icon={<ScanSearch />} onClick={() => void optimizer.scan('quick')}>
                {state.scan?.mode === 'quick' ? t('Repeat quick scan') : t('Quick scan')}
              </Button>
              <Button icon={<Microscope />} onClick={() => void optimizer.scan('deep')}>
                {state.scan?.mode === 'deep' ? t('Repeat deep scan') : t('Deep scan')}
              </Button>
            </div>
          )
        }
      />

      <div className="space-y-6">
        {client.mode === 'demo' && (
          <Alert tone="info" title={t('Demo mode with simulated data')}>
            {t('In the browser, VOID has no access to your PC. The real, read-only scan is available in the desktop app.')}
          </Alert>
        )}
        {state.error && (
          <Alert
            tone="danger"
            title={translateText(state.error.message)}
            action={
              <Button size="sm" variant="ghost" onClick={optimizer.dismissError}>
                {t('Dismiss')}
              </Button>
            }
          >
            {state.error.validation && <IssueList issues={state.error.validation.errors.map((entry) => entry.message)} />}
          </Alert>
        )}

        {state.phase === 'scanning' && (
          <Card>
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="status">
              <Spinner className="size-7" />
              <p className="text-sm font-medium text-fg">{state.scanMode === 'deep' ? t('Deep scan running… (about 15–30 seconds)') : t('Analysing your PC…')}</p>
              <p className="max-w-sm text-[13px] text-muted">
                {state.scanMode === 'deep'
                  ? t('CPU, GPU, RAM, network and disk I/O are measured per program, plus browser caches and error reports. Nothing is changed.')
                  : t('Processes, startup entries, temporary files and system information are read. Nothing is changed.')}
              </p>
            </div>
          </Card>
        )}

        {state.phase === 'idle' && !state.scan && (
          <Card>
            <EmptyState
              icon={Gauge}
              title={t('No scan yet')}
              description={t('The scan reads processes, startup entries, temporary files and system information. It deletes, ends or changes nothing and never asks for administrator rights.')}
              action={<ScanChoice onScan={(mode) => void optimizer.scan(mode)} />}
            />
          </Card>
        )}

        {state.scan && state.phase !== 'scanning' && state.phase !== 'done' && <ScanOverview scan={state.scan} />}

        {deep && state.scan && state.phase !== 'scanning' && state.phase !== 'done' && (
          <>
            {state.scan.resources && <ResourceSummarySection resources={state.scan.resources} onJump={jumpTo} />}
            <FindingsSection findings={state.scan.findings} onJump={jumpTo} />
          </>
        )}

        {state.preview && (state.phase === 'preview' || state.phase === 'validating' || state.phase === 'running') && (
          <PreviewSection
            preview={state.preview}
            busy={state.phase !== 'preview'}
            highlightId={highlightId}
            validating={state.phase === 'validating'}
            onToggle={optimizer.toggle}
            onSelectSafe={optimizer.selectSafe}
            onReset={optimizer.resetSelection}
            onValidate={() => void optimizer.validate()}
            onConfirm={() => void openConfirm()}
            onCancel={optimizer.cancel}
          />
        )}

        {state.phase === 'done' && state.result && <DryRunReport result={state.result} onRescan={() => void optimizer.scan(state.scanMode)} onBack={optimizer.backToPreview} />}

        {state.history.length > 0 && <HistoryCard history={state.history} />}
      </div>

      {confirmOpen && state.preview && (
        <ConfirmOptimizationDialog
          preview={state.preview}
          pending={state.phase === 'running'}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void optimizer.confirmAndSimulate();
          }}
        />
      )}
    </OpenTargetContext.Provider>
  );
}

function ScanChoice({ onScan }: { onScan: (mode: 'quick' | 'deep') => void }) {
  return (
    <div className="grid w-full max-w-xl gap-3 text-left sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <p className="text-[13px] font-semibold text-fg">{t('Quick scan')}</p>
        <p className="flex-1 text-xs text-muted">{t('A few seconds. Processes, startup, Temp folder and system info.')}</p>
        <Button variant="primary" icon={<ScanSearch />} onClick={() => onScan('quick')}>
          {t('Quick scan')}
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <p className="text-[13px] font-semibold text-fg">{t('Deep scan')}</p>
        <p className="flex-1 text-xs text-muted">{t('About 15–30 seconds. Measures CPU, GPU, RAM and network per program, finds performance hogs and tells you how to fix them.')}</p>
        <Button icon={<Microscope />} onClick={() => onScan('deep')}>
          {t('Deep scan')}
        </Button>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: readonly string[] }) {
  const unique = [...new Set(issues)];
  if (unique.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      {unique.map((message) => (
        <li key={message}>{translateText(message)}</li>
      ))}
    </ul>
  );
}

function ScanOverview({ scan }: { scan: ScanResult }) {
  const system = scan.system;
  const estimate = scan.cleanupEstimate;
  return (
    <Card>
      <CardHeader
        title={t('System overview')}
        description={t('Scanned {date} · {seconds} s', { date: formatDateTime(scan.createdAt), seconds: formatNumber(scan.durationMs / 1000, { maximumFractionDigits: 1 }) })}
        action={<Badge tone={scan.status === 'completed' ? 'success' : scan.status === 'partial' ? 'warning' : 'danger'}>{scan.status === 'completed' ? t('Complete') : scan.status === 'partial' ? t('Partial') : t('Failed')}</Badge>}
      />
      <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact icon={<Gauge />} label={t('Processor')} value={system ? translateText(system.cpuModel) : '–'} hint={system ? t('{count} logical cores', { count: system.cpuCores }) : undefined} />
        <Fact
          icon={<MemoryStick />}
          label={t('Memory (actually in use)')}
          value={system ? t('{used} of {total}', { used: formatBytes(system.usedMemoryBytes), total: formatBytes(system.totalMemoryBytes) }) : '–'}
          hint={tn('{count} process|{count} processes', scan.counts.processes)}
        />
        <Fact icon={<ShieldCheck />} label="Windows" value={system ? translateText(system.windowsVersion) : '–'} hint={system ? (system.powerPlan ? t('Build {build} · Power: {plan}', { build: system.windowsBuild, plan: translateText(system.powerPlan.name) }) : t('Build {build}', { build: system.windowsBuild })) : undefined} />
        <Fact
          icon={<HardDrive />}
          label={t('Temporary files (actually on disk)')}
          value={formatBytes(estimate.occupiedBytes)}
          hint={t('{size} potentially cleanable · accuracy {accuracy}', { size: formatBytes(estimate.totalBytes), accuracy: t(estimate.confidence) })}
        />
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
        <OpenTargetButton target={OPEN_TARGETS.userTemp} variant="ghost" />
        <OpenTargetButton target={OPEN_TARGETS.taskManager} variant="ghost" />
        <OpenTargetButton target={OPEN_TARGETS.storage} variant="ghost" />
      </div>
      {system && system.drives.length > 0 && (
        <ul className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {system.drives.map((drive) => {
            const used = drive.totalBytes > 0 ? 1 - drive.freeBytes / drive.totalBytes : 0;
            return (
              <li key={drive.id} className="min-w-0">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium text-fg">
                    {drive.id} {drive.label}
                  </span>
                  <span className="text-muted">{t('{free} free of {total}', { free: formatBytes(drive.freeBytes), total: formatBytes(drive.totalBytes) })}</span>
                </div>
                {/^[A-Z]:$/.test(drive.id) && (
                  <div className="mt-1.5">
                    <OpenTargetButton target={driveTarget(drive.id)} variant="ghost" />
                  </div>
                )}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                  <div className={cn('h-full rounded-full', used > 0.9 ? 'bg-danger' : used > 0.75 ? 'bg-warning' : 'bg-accent-500')} style={{ width: `${Math.round(used * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(scan.errors.length > 0 || scan.skipped.length > 0 || estimate.inaccessibleCount > 0) && (
        <div className="space-y-1 border-t border-line px-5 py-3 text-xs text-subtle">
          {scan.errors.map((error, index) => (
            <p key={`${error.module}-${index}`} className="text-warning">
              {translateText(error.message)}
            </p>
          ))}
          {estimate.inaccessibleCount > 0 && <p>{t('{count} files or folders could not be read and were not counted.', { count: formatNumber(estimate.inaccessibleCount) })}</p>}
          {scan.skipped.map((item) => (
            <p key={`${item.module}-${item.reason}`}>
              {t('Skipped: {count} × {reason}', { count: formatNumber(item.count), reason: SKIP_LABELS[item.reason] ? t(SKIP_LABELS[item.reason] as MessageKey) : item.reason })}
              {item.bytes > 0 ? ` (${formatBytes(item.bytes)})` : ''}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function Fact({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="mt-0.5 text-subtle [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-subtle">{label}</dt>
        <dd className="text-[13px] font-medium [overflow-wrap:anywhere] text-fg">{value}</dd>
        {hint && <dd className="text-xs text-muted">{hint}</dd>}
      </div>
    </div>
  );
}

interface PreviewSectionProps {
  preview: PreviewState;
  busy: boolean;
  highlightId: string | null;
  validating: boolean;
  onToggle: (id: string, selected: boolean) => void;
  onSelectSafe: () => void;
  onReset: () => void;
  onValidate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function PreviewSection({ preview, busy, highlightId, validating, onToggle, onSelectSafe, onReset, onValidate, onConfirm, onCancel }: PreviewSectionProps) {
  const titles = useMemo(() => new Map(preview.recommendations.map((recommendation) => [recommendation.id, recommendation.title])), [preview.recommendations]);
  const selected = new Set(preview.selectedIds);
  const { totals } = preview;
  const blockedCount = preview.recommendations.filter((recommendation) => recommendation.safety === 'blocked').length;
  const validation = preview.validation;

  return (
    <section aria-labelledby="optimizer-preview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="optimizer-preview" className="text-sm font-semibold text-fg">
            {tn('{count} recommendation found|{count} recommendations found', preview.recommendations.length)}
          </h2>
          <Badge tone="accent">
            <ShieldCheck className="size-3" aria-hidden="true" />
            {t('Read-only · simulation mode')}
          </Badge>
          {blockedCount > 0 && <Badge tone="danger">{t('{count} blocked', { count: blockedCount })}</Badge>}
          <ValidationBadge preview={preview} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <SummaryTile icon={<ListChecks />} label={t('Selected actions')} value={formatNumber(totals.selectedCount)} hint={totals.hasCaution ? t('includes actions marked caution') : t('safe actions only')} />
        <SummaryTile icon={<HardDrive />} label={t('Potentially freed')} value={formatBytes(totals.estimatedDiskBytes)} hint={t('{size} potentially cleanable (estimate)', { size: formatBytes(totals.estimatedDiskBytes) })} />
        <SummaryTile
          icon={<Gauge />}
          label={t('Affected items')}
          value={formatNumber(totals.affectedItemCount)}
          hint={t(totals.estimatedMemoryBytes > 0 ? '{files} files · {startup} startup · {processes} processes (about {memory} RAM)' : '{files} files · {startup} startup · {processes} processes', { files: formatNumber(totals.fileCount), startup: totals.startupEntryCount, processes: totals.processCount, memory: formatBytes(totals.estimatedMemoryBytes) })}
        />
      </div>

      {validation && (validation.errors.length > 0 || validation.isValid) && (
        <Alert tone={validation.isValid ? 'info' : 'warning'} title={validation.isValid ? t('Preview is valid') : validation.requiresRescan ? t('New scan required') : t('Preview not valid')}>
          <IssueList issues={(validation.isValid ? validation.warnings : validation.errors).map((entry) => entry.message)} />
        </Alert>
      )}

      {preview.recommendations.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title={t('Nothing to do')} description={t('The scan found no actions worth taking.')} />
        </Card>
      ) : (
        OPTIMIZATION_CATEGORIES.map((category) => {
          const items = preview.recommendations.filter((recommendation) => recommendation.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">
                {translateText(CATEGORY_LABELS[category])} ({items.length})
              </h3>
              <ul className="space-y-2">
                {items.map((recommendation) => (
                  <RecommendationItem
                    key={recommendation.id}
                    recommendation={recommendation}
                    selected={selected.has(recommendation.id)}
                    overlaps={preview.overlaps}
                    titleOf={(id) => titles.get(id) ?? id}
                    disabled={busy}
                    highlighted={highlightId === recommendation.id}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {/* Sticky from tablet width up; on phones it would cover a quarter of the screen. */}
      <div className="z-10 flex sm:sticky sm:bottom-3 flex-wrap items-center justify-between gap-2 rounded-card border border-line-strong bg-overlay/95 px-3 py-2.5 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={busy}>
            {t('Reset selection')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSelectSafe} disabled={busy}>
            {t('Select all safe')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onValidate} disabled={busy || totals.selectedCount === 0}>
            {validating ? t('Checking…') : t('Validate preview')}
          </Button>
          <Button size="sm" variant="primary" onClick={onConfirm} disabled={busy || totals.selectedCount === 0 || preview.validationStatus === 'stale'}>
            {t('Confirm optimization')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ValidationBadge({ preview }: { preview: PreviewState }) {
  switch (preview.validationStatus) {
    case 'valid':
      return <Badge tone="success">{t('Validated')}</Badge>;
    case 'stale':
      return <Badge tone="warning">{t('Outdated')}</Badge>;
    case 'invalid':
      return <Badge tone="danger">{t('Invalid')}</Badge>;
    default:
      return <Badge>{t('Not validated')}</Badge>;
  }
}

function SummaryTile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card className="flex gap-3 px-4 py-3">
      <span className="mt-0.5 text-accent-300 [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-subtle">{label}</p>
        <p className="text-xl font-semibold tracking-tight text-fg">{value}</p>
        <p className="text-xs [overflow-wrap:anywhere] text-muted">{hint}</p>
      </div>
    </Card>
  );
}

function HistoryCard({ history }: { history: readonly ExecutionResult[] }) {
  return (
    <Card>
      <CardHeader title={t('Recent simulations')} description={t('Only kept for this session. No system changes were ever made.')} as="h2" />
      <ul className="divide-y divide-line">
        {history.slice(0, 5).map((entry) => (
          <li key={entry.executionId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
            <span className="text-fg">{formatDateTime(entry.finishedAt)}</span>
            <span className="text-muted">
              {t('{actions} actions · {size} estimated · {changes} changes', { actions: entry.actions.length, size: formatBytes(entry.totals.estimatedDiskBytes), changes: entry.systemChanges })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
