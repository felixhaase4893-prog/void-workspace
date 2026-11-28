import { Ban, CircleAlert, CircleCheck, FileQuestion, Info, Lightbulb, ScanSearch, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Spinner } from '../../components/ui/Spinner';
import type { AnalysisOutcome } from '../../domain/code/analyze';
import { countFindings, FINDING_CATEGORIES, FINDING_CATEGORY_LABELS, FINDING_CATEGORY_SINGULAR, type Finding, type FindingCategory } from '../../domain/code/findings';
import { getCodeLanguage } from '../../domain/code/languages';
import { translateText, t, type MessageKey } from '../../i18n/translate';
import { cn } from '../../lib/cn';

const CATEGORY_ICONS: Record<FindingCategory, LucideIcon> = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  suggestion: Lightbulb,
};

const CATEGORY_TEXT: Record<FindingCategory, string> = {
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-accent-300',
  suggestion: 'text-muted',
};

const HIDE: Record<FindingCategory, MessageKey> = { error: 'Hide errors', warning: 'Hide warnings', info: 'Hide info', suggestion: 'Hide suggestions' };
const SHOW: Record<FindingCategory, MessageKey> = { error: 'Show errors', warning: 'Show warnings', info: 'Show info', suggestion: 'Show suggestions' };
const SEVERITY: Record<Finding['severity'], MessageKey> = { high: 'high severity', medium: 'medium severity', low: 'low severity' };

interface ResultsPanelProps {
  outcome: AnalysisOutcome | null;
  running: boolean;
  /** The code changed after the analysis ran. */
  outdated: boolean;
  onSelect: (finding: Finding) => void;
}

export function ResultsPanel({ outcome, running, outdated, onSelect }: ResultsPanelProps) {
  const [hidden, setHidden] = useState<FindingCategory[]>([]);
  const findings = useMemo(() => (outcome?.status === 'done' ? outcome.findings : []), [outcome]);
  const counts = useMemo(() => countFindings(findings), [findings]);
  const visible = findings.filter((item) => !hidden.includes(item.category));

  const toggle = (category: FindingCategory) =>
    setHidden((current) => (current.includes(category) ? current.filter((entry) => entry !== category) : [...current, category]));

  return (
    <section aria-labelledby="analysis-heading" className="@container flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="analysis-heading" className="text-[13px] font-semibold text-fg">
          {t('Analysis')}
          {outcome?.status === 'done' && <span className="ml-2 font-normal text-subtle">{outcome.mode === 'deep' ? t('Deep Scan') : t('Quick Scan')} · {translateText(getCodeLanguage(outcome.language).label)}</span>}
        </h2>
        {running && <Spinner />}
      </header>

      <div className="grid grid-cols-2 border-b border-line @sm:grid-cols-4" role="group" aria-label={t('Filter findings')}>
        {FINDING_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          const active = !hidden.includes(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              disabled={outcome?.status !== 'done'}
              onClick={() => toggle(category)}
              title={t(active ? HIDE[category] : SHOW[category])}
              className={cn(
                'flex min-w-0 flex-col items-start gap-0.5 border-r border-b border-line px-3 py-2 text-left transition-colors even:border-r-0 hover:bg-raised/60 disabled:pointer-events-none @sm:border-b-0 @sm:even:border-r @sm:last:border-r-0',
                !active && 'opacity-45',
              )}
            >
              <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', CATEGORY_TEXT[category])}>
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{FINDING_CATEGORY_LABELS[category]}</span>
              </span>
              <span className="font-mono text-lg leading-tight font-medium text-fg tabular-nums" data-testid={`count-${category}`}>
                {outcome?.status === 'done' ? counts[category] : '–'}
              </span>
            </button>
          );
        })}
      </div>

      {outdated && outcome?.status === 'done' && (
        <p className="border-b border-line bg-warning/[0.06] px-4 py-2 text-xs text-warning" role="status">
          {t('The code changed since this scan. Line numbers may be off; scan again.')}
        </p>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <PanelBody outcome={outcome} running={running} findings={findings} visible={visible} onSelect={onSelect} onShowAll={() => setHidden([])} />
      </div>
    </section>
  );
}

function Message({ icon: Icon, tone = 'text-accent-300', title, children }: { icon: LucideIcon; tone?: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className={cn('mb-3 grid size-10 place-items-center rounded-xl border border-line-strong bg-raised', tone)}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      <div className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

interface PanelBodyProps {
  outcome: AnalysisOutcome | null;
  running: boolean;
  findings: Finding[];
  visible: Finding[];
  onSelect: (finding: Finding) => void;
  onShowAll: () => void;
}

function PanelBody({ outcome, running, findings, visible, onSelect, onShowAll }: PanelBodyProps) {
  if (!outcome) {
    return running ? (
      <Message icon={ScanSearch} title={t('Analysing…')}>{t('Reading the code. Nothing is executed.')}</Message>
    ) : (
      <Message icon={ScanSearch} title={t('No analysis yet')}>
        <NoAnalysisText />
      </Message>
    );
  }
  switch (outcome.status) {
    case 'empty':
      return <Message icon={FileQuestion} title={t('Nothing to analyse')}>{t('Paste or type some code first.')}</Message>;
    case 'unsupported':
      return (
        <Message icon={Ban} tone="text-subtle" title={t('Not available for this language')}>
          {translateText(outcome.reason)}
        </Message>
      );
    case 'failed':
      return (
        <Message icon={CircleAlert} tone="text-danger" title={t('Analysis failed')}>
          {translateText(outcome.message)}
        </Message>
      );
    case 'done':
      break;
  }
  const note = outcome.mode === 'deep' ? translateText(getCodeLanguage(outcome.language).deepScanNote) : t('Quick Scan checks brackets, quotes, comments and obvious problem patterns.');
  if (findings.length === 0) {
    return (
      <Message icon={CircleCheck} tone="text-success" title={t('No problems found')}>
        <span className="block">{note}</span>
        <span className="mt-2 block text-xs text-subtle">{t('A clean static analysis does not prove that the code runs correctly.')}</span>
      </Message>
    );
  }
  if (visible.length === 0) {
    return (
      <Message icon={ScanSearch} tone="text-subtle" title={t('All findings are filtered out')}>
        <button type="button" onClick={onShowAll} className="rounded font-medium text-accent-300 hover:text-accent-200">
          {t('Show all {count} findings', { count: findings.length })}
        </button>
      </Message>
    );
  }
  return (
    <>
      <ul className="divide-y divide-line" aria-label={t('Findings')}>
        {visible.map((item) => {
          const Icon = CATEGORY_ICONS[item.category];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised/60 focus-visible:bg-raised/60"
                aria-label={t('{category} on line {line}: {title}', { category: FINDING_CATEGORY_SINGULAR[item.category], line: item.line, title: translateText(item.title) })}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', CATEGORY_TEXT[item.category])} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium [overflow-wrap:anywhere] text-fg">{translateText(item.title)}</span>
                    <span className="shrink-0 font-mono text-[11px] text-subtle">{t('Ln {line}', { line: item.line })}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed [overflow-wrap:anywhere] text-muted">{translateText(item.description)}</span>
                  {item.suggestion && (
                    <span className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed [overflow-wrap:anywhere] text-subtle">
                      <Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {translateText(item.suggestion)}
                    </span>
                  )}
                  <span className="mt-1.5 block font-mono text-[10px] tracking-wide text-subtle uppercase">
                    {FINDING_CATEGORY_SINGULAR[item.category]} · {t(SEVERITY[item.severity])}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-subtle">{note}</p>
    </>
  );
}

/** The empty-state hint, with the two scan names in bold wherever the language puts them. */
function NoAnalysisText() {
  const text = t('Run a {quick} for brackets, strings and obvious problems, or a {deep} for parser-based checks. The code is only read, never run.');
  return (
    <>
      {text.split(/(\{quick\}|\{deep\})/).map((part, index) =>
        part === '{quick}' || part === '{deep}' ? (
          <strong key={index} className="font-medium text-fg">
            {part === '{quick}' ? t('Quick Scan') : t('Deep Scan')}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
