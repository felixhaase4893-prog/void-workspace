import { Check } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { getDueState } from '../../domain/dueDates';
import { TASK_PRIORITY_LABELS } from '../../domain/labels';
import type { Task } from '../../domain/models';
import { useToday } from '../../hooks/useToday';
import { cn } from '../../lib/cn';
import { useWorkspaceActions } from '../../state/workspaceContext';
import { ItemActions } from '../create/ItemActions';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { RowSelectCheckbox } from '../selection/SelectionBar';
import { PRIORITY_TONES } from '../shared/tones';
import { TagList } from '../tags/TagList';
import { DueBadge } from './DueBadge';
import { t } from '../../i18n/translate';

interface TaskRowProps {
  task: Task;
  /** Shown before the description; left out on a project's own page. */
  projectName?: string | null;
  /** Set while the list is in selection mode: the row toggles its selection instead of offering its own actions. */
  selection?: { selected: boolean; onToggle: (extend: boolean) => void } | undefined;
}

export function TaskRow({ task, projectName = null, selection }: TaskRowProps) {
  const { setTaskStatus } = useWorkspaceActions();
  const today = useToday();
  const done = task.status === 'done';
  const overdue = getDueState(task, today) === 'overdue';
  const meta = [projectName, task.status === 'in_progress' ? t('In progress') : null, task.description].filter(Boolean).join(' · ');
  return (
    <li
      onClick={selection ? (event) => selection.onToggle(event.shiftKey) : undefined}
      className={cn(
        'relative flex items-start gap-3 px-4 py-3 sm:px-5',
        overdue && 'bg-danger/[0.04]',
        selection && 'cursor-pointer select-none hover:bg-raised/40',
        selection?.selected && 'bg-accent-500/[0.07] hover:bg-accent-500/10',
      )}
    >
      {/* A thin bar marks overdue tasks at a glance; the badge spells it out. */}
      {overdue && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-danger" />}
      {selection ? (
        <RowSelectCheckbox title={task.title} selected={selection.selected} onToggle={selection.onToggle} />
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? t('Mark “{title}” as not done', { title: task.title }) : t('Mark “{title}” as done', { title: task.title })}
          onClick={() => void setTaskStatus(task.id, done ? 'todo' : 'done')}
          className={cn(
            'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors',
            done ? 'border-accent-500 bg-accent-500 text-white' : 'border-line-strong hover:border-accent-400',
          )}
        >
          {done && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] [overflow-wrap:anywhere] text-fg', done && 'text-subtle line-through')}>{task.title}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-subtle">{meta}</p>}
        {(task.dueDate !== null || task.tagIds.length > 0) && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            <DueBadge item={task} today={today} />
            <TagList tagIds={task.tagIds} max={5} />
          </div>
        )}
      </div>
      <Badge tone={PRIORITY_TONES[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
      {!selection && (
        <div className="-my-1.5 -mr-2 flex shrink-0 items-center">
          <FavoriteButton type="task" id={task.id} title={task.title} favorite={task.favorite} />
          <ItemActions type="task" id={task.id} title={task.title} />
        </div>
      )}
    </li>
  );
}
