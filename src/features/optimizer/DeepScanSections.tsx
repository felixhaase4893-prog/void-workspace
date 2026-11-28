import { ArrowDownToLine, Cpu, Flame, MemoryStick, MonitorPlay, Network, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import type { PerformanceFinding, ResourceKind, ResourceSummary, ResourceUser } from '../../domain/optimizer/models';
import { formatBytes } from './format';
import { cn } from '../../lib/cn';
import { OpenTargetButton } from './OpenTargetButton';
import { formatNumber, type MessageKey, t, tn, translateText } from '../../i18n/translate';

const SEVERITY: Record<PerformanceFinding['severity'], { label: MessageKey; tone: BadgeTone }> = {
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'neutral' },
};

const MAIN_LABELS: Record<ResourceKind, string> = { cpu: 'CPU', gpu: 'GPU', memory: 'RAM', network: 'network/I/O' };

const percent = (value: number | null) => (value === null ? '–' : `${formatNumber(value, { maximumFractionDigits: 1 })} %`);
const rate = (value: number | null) => (value === null ? '–' : `${formatBytes(value)}/s`);

/** Deep scan: every performance hog with cause, impact and how to fix it yourself. */
export function FindingsSection({ findings, onJump }: { findings: readonly PerformanceFinding[]; onJump: (recommendationId: string) => void }) {
  return (
    <section aria-labelledby="optimizer-findings" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Flame className="size-4 text-warning" aria-hidden="true" />
        <h2 id="optimizer-findings" className="text-sm font-semibold text-fg">
          {t('Performance hogs ({count})', { count: findings.length })}
        </h2>
        <span className="text-xs text-muted">{t('What slows your PC down, why, and how to fix it yourself.')}</span>
      </div>
      {findings.length === 0 ? (
        <Card className="px-5 py-4 text-[13px] text-muted">{t('No noticeable performance hogs found. Your PC is running relaxed right now.')}</Card>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding) => (
            <li key={finding.id}>
              <Card className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY[finding.severity].tone}>{t(SEVERITY[finding.severity].label)}</Badge>
                  <h3 className="text-[13px] font-medium [overflow-wrap:anywhere] text-fg">{translateText(finding.title)}</h3>
                  <span className="text-xs text-muted">{translateText(finding.impact)}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  <span className="font-medium text-fg">{t('Cause:')} </span>
                  {translateText(finding.cause)}
                </p>
                <p className="mt-2 text-xs font-medium text-fg">{t('How to fix it:')}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-muted">
                  {finding.fixSteps.map((step) => (
                    <li key={step}>{translateText(step)}</li>
                  ))}
                </ol>
                {(finding.openTarget || finding.recommendationId) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {finding.openTarget && <OpenTargetButton target={finding.openTarget} />}
                    {finding.recommendationId && (
                      <Button size="sm" variant="ghost" icon={<ArrowDownToLine />} onClick={() => onJump(finding.recommendationId ?? '')}>
                        {t('Go to action')}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Deep scan: who pulls the most CPU, GPU, RAM and network – and overall. */
export function ResourceSummarySection({ resources, onJump }: { resources: ResourceSummary; onJump: (recommendationId: string) => void }) {
  const { cpu, gpu, memory, network } = resources;
  const maxScore = Math.max(1, ...resources.overall.map((user) => user.score));
  return (
    <section aria-labelledby="optimizer-resources" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Trophy className="size-4 text-accent-300" aria-hidden="true" />
        <h2 id="optimizer-resources" className="text-sm font-semibold text-fg">
          {t('What uses the most performance?')}
        </h2>
        <span className="text-xs text-muted">{t('Snapshot over about 1.5 seconds, processes grouped per program.')}</span>
      </div>

      {resources.overall.length > 0 && (
        <Card>
          <CardHeader title={t('Overall ranking')} description={t('CPU, GPU, RAM and I/O rated together')} as="h3" />
          <ol className="divide-y divide-line">
            {resources.overall.map((user, index) => (
              <li key={user.name} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="w-5 text-right text-xs font-semibold text-subtle">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium [overflow-wrap:anywhere] text-fg">{user.name}</span>
                    {user.processCount > 1 && <span className="text-xs text-subtle">{tn('{count} process|{count} processes', user.processCount)}</span>}
                    <Badge tone="accent">{t('mostly {resource}', { resource: translateText(MAIN_LABELS[user.main]) })}</Badge>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(4, Math.round((user.score / maxScore) * 100))}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    CPU {percent(user.cpuPercent)} · GPU {percent(user.gpuPercent)} · RAM {formatBytes(user.memoryBytes)} · I/O {rate(user.ioBytesPerSec)}
                  </p>
                </div>
                {user.recommendationId && (
                  <div className="w-full pl-6 sm:w-auto sm:pl-0">
                    <Button size="sm" variant="ghost" icon={<ArrowDownToLine />} onClick={() => onJump(user.recommendationId ?? '')}>
                      {t('Go to action')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ResourceCard icon={<Cpu />} title="CPU" summary={cpu.totalPercent === null ? t('{cores} cores', { cores: cpu.cores }) : t('{percent} total · {cores} cores', { percent: percent(cpu.totalPercent), cores: cpu.cores })} users={cpu.top} value={(user) => percent(user.cpuPercent)} empty={t('No measurable CPU load.')} />
        <ResourceCard
          icon={<MonitorPlay />}
          title="GPU"
          summary={gpu.measured ? t('Load of the graphics engines') : t('Not measurable (no GPU counter)')}
          users={gpu.top}
          value={(user) => percent(user.gpuPercent)}
          empty={gpu.measured ? t('No measurable GPU load.') : t('Windows reports no per-program values for this graphics card.')}
        />
        <ResourceCard
          icon={<MemoryStick />}
          title="RAM"
          summary={`${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)} in use`}
          users={memory.top}
          value={(user) => formatBytes(user.memoryBytes)}
          empty={t('No data.')}
        />
        <ResourceCard
          icon={<Network />}
          title={t('Network')}
          summary={network.receivedBytesPerSec === null ? t('Totals not measurable') : `↓ ${rate(network.receivedBytesPerSec)} · ↑ ${rate(network.sentBytesPerSec)} total`}
          users={network.top}
          value={(user) => `${rate(user.ioBytesPerSec)}${user.connections ? ` · ${user.connections} conn.` : ''}`}
          empty={t('No measurable network or I/O load.')}
          note={t('Windows does not measure network traffic per program without admin rights. So per program, VOID shows the I/O rate (disk + network) and the open TCP connections.')}
        />
      </div>
    </section>
  );
}

function ResourceCard({ icon, title, summary, users, value, empty, note }: { icon: ReactNode; title: string; summary: string; users: readonly ResourceUser[]; value: (user: ResourceUser) => string; empty: string; note?: string }) {
  return (
    <Card>
      <div className="flex items-start gap-3 px-4 pt-3">
        <span className="mt-0.5 text-accent-300 [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
          <p className="text-xs text-muted">{summary}</p>
        </div>
      </div>
      {users.length === 0 ? (
        <p className="px-4 py-3 text-xs text-subtle">{empty}</p>
      ) : (
        <ol className="space-y-1 px-4 py-3">
          {users.map((user, index) => (
            <li key={user.name} className={cn('flex justify-between gap-3 text-xs', index === 0 ? 'font-medium text-fg' : 'text-muted')}>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {index + 1}. {user.name}
                {user.processCount > 1 ? ` (${user.processCount})` : ''}
              </span>
              <span className="shrink-0 whitespace-nowrap">{value(user)}</span>
            </li>
          ))}
        </ol>
      )}
      {note && <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-subtle">{note}</p>}
    </Card>
  );
}
