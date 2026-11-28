import { AlertCircle, CalendarClock, CalendarDays } from 'lucide-react';

import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { describeDue, formatDueDate, getDueState, type DueState } from '../../domain/dueDates';
import { t } from '../../i18n/translate';

const TONES: Record<Exclude<DueState, 'none'>, BadgeTone> = {
  overdue: 'danger',
  today: 'warning',
  upcoming: 'accent',
  later: 'neutral',
  finished: 'neutral',
};

interface DueBadgeProps {
  item: { dueDate: string | null; status: string };
  today: string;
  className?: string;
}

/**
 * The due date of a task or bug. Overdue is red with an alert icon, due today
 * amber, the coming week accent-coloured. Finished items only show the date,
 * never "overdue". Renders nothing without a due date.
 */
export function DueBadge({ item, today, className }: DueBadgeProps) {
  const state = getDueState(item, today);
  if (state === 'none' || item.dueDate === null) return null;
  const label = state === 'finished' ? t('Due {date}', { date: formatDueDate(item.dueDate, today) }) : describeDue(item.dueDate, today);
  const Icon = state === 'overdue' ? AlertCircle : state === 'today' ? CalendarClock : CalendarDays;
  return (
    <Badge tone={TONES[state]} className={className}>
      <Icon className="size-3" aria-hidden="true" />
      <time dateTime={item.dueDate}>{label}</time>
    </Badge>
  );
}
