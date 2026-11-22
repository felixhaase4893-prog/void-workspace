import type { BadgeTone } from '../../components/ui/Badge';
import type { BugPriority, BugStatus, TaskPriority } from '../../domain/models';

/**
 * One colour language for status and priority everywhere: the same word always
 * gets the same colour, and the colour never carries meaning on its own (the
 * label is always written out).
 */
export const PRIORITY_TONES: Record<TaskPriority | BugPriority, BadgeTone> = {
  low: 'neutral',
  medium: 'accent',
  high: 'danger',
  critical: 'danger',
};

export const BUG_STATUS_TONES: Record<BugStatus, BadgeTone> = {
  open: 'accent',
  in_progress: 'warning',
  fixed: 'success',
  closed: 'neutral',
};
