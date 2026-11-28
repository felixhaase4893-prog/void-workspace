import { Flame } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS } from '../../domain/labels';
import { BUG_STATUSES, type Bug, type BugStatus } from '../../domain/models';
import { useToday } from '../../hooks/useToday';
import { cn } from '../../lib/cn';
import { formatRelativeTime } from '../../lib/format';
import { useWorkspaceActions } from '../../state/workspaceContext';
import { ItemActions } from '../create/ItemActions';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { RowSelectCheckbox } from '../selection/SelectionBar';
import { BUG_STATUS_TONES, PRIORITY_TONES } from '../shared/tones';
import { TagList } from '../tags/TagList';
import { DueBadge } from '../tasks/DueBadge';
import { t } from '../../i18n/translate';

const STATUS_SELECT_TONES: Record<BugStatus, string> = {
  open: 'border-accent-500/30 bg-accent-500/10 text-accent-300',
  in_progress: 'border-warning/25 bg-warning/10 text-warning',
  fixed: 'border-success/25 bg-success/10 text-success',
  closed: 'border-line-strong text-muted',
};

interface BugRowProps {
  bug: Bug;
  /** Shown in the meta line; left out on a project's own page. */
  projectName?: string | null;
  /** Set while the list is in selection mode: the row toggles its selection instead of offering its own actions. */
  selection?: { selected: boolean; onToggle: (extend: boolean) => void } | undefined;
}

/** One bug: title, project, age, due date and tags, with its status changeable in place. */
export function BugRow({ bug, projectName = null, selection }: BugRowProps) {
  const { setBugStatus } = useWorkspaceActions();
  const today = useToday();
  const resolved = bug.status === 'fixed' || bug.status === 'closed';
  const meta = [projectName, t('Reported {time}', { time: formatRelativeTime(bug.createdAt) }), bug.description].filter(Boolean).join(' · ');

  return (
    <li
      onClick={selection ? (event) => selection.onToggle(event.shiftKey) : undefined}
      className={cn(
        'flex items-start gap-3 px-4 py-3 sm:px-5',
        selection && 'cursor-pointer select-none hover:bg-raised/40',
        selection?.selected && 'bg-accent-500/[0.07] hover:bg-accent-500/10',
      )}
    >
      {selection && <RowSelectCheckbox title={bug.title} selected={selection.selected} onToggle={selection.onToggle} />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] [overflow-wrap:anywhere] text-fg', resolved && 'text-muted')}>{bug.title}</p>
        <p className="mt-0.5 truncate text-xs text-subtle">{meta}</p>
        {(bug.dueDate !== null || bug.tagIds.length > 0) && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            <DueBadge item={bug} today={today} />
            <TagList tagIds={bug.tagIds} max={5} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        <Badge tone={PRIORITY_TONES[bug.priority]} className={bug.priority === 'critical' ? 'bg-danger/20' : undefined}>
          {bug.priority === 'critical' && <Flame className="size-3" aria-hidden="true" />}
          {BUG_PRIORITY_LABELS[bug.priority]}
        </Badge>
        {selection ? (
          <BugStatusBadge status={bug.status} />
        ) : (
          <label className="relative">
            <span className="sr-only">{t('Status of {title}', { title: bug.title })}</span>
            <select
              value={bug.status}
              onChange={(event) => void setBugStatus(bug.id, event.target.value as BugStatus)}
              className={cn(
                'h-5 cursor-pointer appearance-none rounded-md border px-1.5 text-[11px] font-medium tracking-wide focus:ring-2 focus:ring-accent-500/25 focus:outline-none',
                STATUS_SELECT_TONES[bug.status],
              )}
            >
              {BUG_STATUSES.map((status) => (
                <option key={status} value={status} className="bg-surface text-fg">
                  {BUG_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!selection && (
        <div className="-my-1.5 -mr-2 flex shrink-0 items-center">
          <FavoriteButton type="bug" id={bug.id} title={bug.title} favorite={bug.favorite} />
          <ItemActions type="bug" id={bug.id} title={bug.title} />
        </div>
      )}
    </li>
  );
}

/** The status as a read-only badge, e.g. on the dashboard. */
export function BugStatusBadge({ status }: { status: BugStatus }) {
  return <Badge tone={BUG_STATUS_TONES[status]}>{BUG_STATUS_LABELS[status]}</Badge>;
}
