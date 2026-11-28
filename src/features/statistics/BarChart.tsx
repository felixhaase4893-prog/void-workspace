import type { StatsBucket } from '../../domain/statistics';
import { cn } from '../../lib/cn';
import { t } from '../../i18n/translate';

export interface ChartSeries {
  key: 'tasksCreated' | 'tasksCompleted' | 'bugsReported' | 'bugsClosed';
  label: string;
  /** Tailwind background class, e.g. bg-accent-500. */
  color: string;
}

interface BarChartProps {
  title: string;
  buckets: StatsBucket[];
  series: [ChartSeries, ChartSeries];
}

/** Pairs of bars per period. Plain HTML, so it scales to any width; a hidden table carries the same numbers for screen readers. */
export function BarChart({ title, buckets, series }: BarChartProps) {
  const max = Math.max(1, ...buckets.flatMap((bucket) => series.map((entry) => bucket[entry.key])));
  // Roughly six labels, whatever the number of bars.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, index) => index) : [0, Math.round(max / 2), max];

  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        {series.map((entry) => (
          <span key={entry.key} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', entry.color)} />
            {entry.label}
          </span>
        ))}
      </div>
      <div className="flex gap-2" aria-hidden="true">
        <div className="relative flex h-40 w-6 shrink-0 flex-col-reverse justify-between text-right font-mono text-[10px] text-subtle">
          {ticks.map((tick) => (
            <span key={tick} className="leading-none">
              {tick}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-40 items-end gap-[2px] border-b border-l border-line pl-[2px]">
            {buckets.map((bucket) => (
              <div
                key={bucket.start}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-[1px] rounded-t-sm hover:bg-raised/60"
                title={`${bucket.start === bucket.end ? bucket.label : `${bucket.start} – ${bucket.end}`}: ${series.map((entry) => `${entry.label} ${bucket[entry.key]}`).join(', ')}`}
              >
                {series.map((entry) => (
                  <div
                    key={entry.key}
                    className={cn('w-full max-w-4 rounded-t-[2px]', entry.color)}
                    style={{ height: bucket[entry.key] === 0 ? 0 : `max(2px, ${(bucket[entry.key] / max) * 100}%)` }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] pl-[2px]">
            {buckets.map((bucket, index) => (
              <span key={bucket.start} className="min-w-0 flex-1 overflow-visible text-center font-mono text-[10px] whitespace-nowrap text-subtle">
                {index % labelEvery === 0 ? bucket.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{t('Period')}</th>
            {series.map((entry) => (
              <th key={entry.key} scope="col">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.start}>
              <th scope="row">{bucket.start === bucket.end ? bucket.start : `${bucket.start} to ${bucket.end}`}</th>
              {series.map((entry) => (
                <td key={entry.key}>{bucket[entry.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
