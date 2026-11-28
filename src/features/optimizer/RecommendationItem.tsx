import { ChevronDown, Lock, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { REVERSIBILITY_LABELS, SAFETY_LABELS } from '../../domain/optimizer/catalog';
import type { OptimizationRecommendation, Overlap, SafetyLevel } from '../../domain/optimizer/models';
import { isSelectable } from '../../domain/optimizer/safety';
import { formatBytes } from './format';
import { cn } from '../../lib/cn';
import { OpenTargetButton } from './OpenTargetButton';
import { formatNumber, t, tn, translateText } from '../../i18n/translate';

/** DOM id of a recommendation, used by t('Go to action') jumps. */
export const recommendationAnchor = (id: string) => `optimizer-rec-${id.replace(/[^a-z0-9-]/gi, '-')}`;

export const SAFETY_TONES: Record<SafetyLevel, BadgeTone> = { safe: 'success', caution: 'warning', blocked: 'danger' };
const SAFETY_ICONS = { safe: ShieldCheck, caution: ShieldAlert, blocked: ShieldX } as const;

/** "1.2 GB potentially cleanable", "about 800 MB RAM in use", "1 startup entry" … */
export function describeImpact(recommendation: OptimizationRecommendation): string {
  if (recommendation.estimatedDiskBytes > 0) return t('{size} potentially cleanable', { size: formatBytes(recommendation.estimatedDiskBytes) });
  if (recommendation.estimatedMemoryBytes > 0) return t('about {size} RAM in use', { size: formatBytes(recommendation.estimatedMemoryBytes) });
  if (recommendation.affects.startupEntries > 0) return tn('{count} startup entry|{count} startup entries', recommendation.affects.startupEntries);
  if (recommendation.affects.powerSettings > 0) return t('Power setting');
  return tn('{count} item|{count} items', recommendation.targetCount);
}

interface RecommendationItemProps {
  recommendation: OptimizationRecommendation;
  selected: boolean;
  overlaps: readonly Overlap[];
  titleOf: (id: string) => string;
  disabled?: boolean;
  /** Briefly highlighted after a jump. */
  highlighted?: boolean;
  onToggle: (id: string, selected: boolean) => void;
}

export function RecommendationItem({ recommendation, selected, overlaps, titleOf, disabled = false, highlighted = false, onToggle }: RecommendationItemProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const checkboxId = useId();
  const selectable = isSelectable(recommendation);
  const SafetyIcon = SAFETY_ICONS[recommendation.safety];
  const { preview } = recommendation;
  const myOverlaps = overlaps.filter((overlap) => overlap.recommendationIds.includes(recommendation.id));

  return (
    <li
      id={recommendationAnchor(recommendation.id)}
      className={cn('scroll-mt-24 rounded-xl border bg-surface transition-colors', selected ? 'border-accent-500/40' : 'border-line', !selectable && 'opacity-80', highlighted && 'ring-2 ring-accent-400')}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="pt-0.5">
          {selectable ? (
            <input
              id={checkboxId}
              type="checkbox"
              checked={selected}
              disabled={disabled}
              onChange={(event) => onToggle(recommendation.id, event.target.checked)}
              className="size-[18px] cursor-pointer accent-accent-500 disabled:cursor-not-allowed"
              aria-describedby={`${checkboxId}-description`}
            />
          ) : (
            <Lock className="size-[18px] text-subtle" aria-label={t('Not selectable')} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectable ? checkboxId : undefined} className={cn('text-[13px] font-medium [overflow-wrap:anywhere] text-fg', selectable && 'cursor-pointer')}>
              {translateText(recommendation.title)}
            </label>
            <Badge tone={SAFETY_TONES[recommendation.safety]}>
              <SafetyIcon className="size-3" aria-hidden="true" />
              {translateText(SAFETY_LABELS[recommendation.safety])}
            </Badge>
            {recommendation.requiresAdmin && <Badge tone="neutral">{t('Admin needed later')}</Badge>}
            {recommendation.status === 'stale' && <Badge tone="warning">{t('Outdated')}</Badge>}
          </div>
          <p id={`${checkboxId}-description`} className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted">
            {translateText(recommendation.description)}
          </p>
          {recommendation.statusReason && <p className="mt-1 text-xs text-warning">{translateText(recommendation.statusReason)}</p>}
          {recommendation.openTarget && (
            <div className="mt-2">
              <OpenTargetButton target={recommendation.openTarget} variant="ghost" />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-[13px] font-medium whitespace-nowrap text-fg">{describeImpact(recommendation)}</span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-raised hover:text-fg"
          >
            {t('Details')}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div id={detailsId} className="border-t border-line px-4 py-3">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <Detail term={t('What was found?')}>{translateText(preview.found)}</Detail>
            <Detail term={t('Why is this recommended?')}>{translateText(preview.why)}</Detail>
            <Detail term={t('What would change?')}>{translateText(preview.changes)}</Detail>
            <Detail term={t('What are the risks?')}>{translateText(preview.risks)}</Detail>
            <Detail term={t('Can the change be undone?')}>
              <span className="font-medium text-fg">{translateText(REVERSIBILITY_LABELS[preview.reversible])}.</span> {translateText(preview.reversibleNote)}
            </Detail>
            {preview.sampleTargets.length > 0 && (
              <Detail term={t('Examples')}>
                <ul className="space-y-0.5 font-mono text-[11px]">
                  {preview.sampleTargets.map((target) => (
                    <li key={target} className="[overflow-wrap:anywhere]">
                      {target}
                    </li>
                  ))}
                  {preview.moreTargets > 0 && <li className="font-sans text-subtle">{t('… and {count} more', { count: formatNumber(preview.moreTargets) })}</li>}
                </ul>
              </Detail>
            )}
          </dl>
          {preview.manualSteps.length > 0 && (
            <div className="mt-3 text-xs">
              <p className="font-medium text-fg">{t('How to do it yourself')}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 leading-relaxed text-muted">
                {preview.manualSteps.map((step) => (
                  <li key={step}>{translateText(step)}</li>
                ))}
              </ol>
            </div>
          )}
          {myOverlaps.length > 0 && (
            <p className="mt-3 text-xs text-subtle">
              {t('Overlaps with {list}. Shared items are counted only once in the total.', {
                list: myOverlaps
                  .map((overlap) => {
                    const other = overlap.recommendationIds.find((id) => id !== recommendation.id) ?? '';
                    return t('"{title}" ({count} shared items, {size})', { title: translateText(titleOf(other)), count: overlap.sharedCount, size: formatBytes(overlap.sharedDiskBytes) });
                  })
                  .join(', '),
              })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-fg">{term}</dt>
      <dd className="mt-0.5 leading-relaxed [overflow-wrap:anywhere] text-muted">{children}</dd>
    </div>
  );
}
