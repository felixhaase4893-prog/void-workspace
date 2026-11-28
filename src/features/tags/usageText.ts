import type { EntityType } from '../../domain/models';
import type { TagUsage } from '../../domain/tags';
import { type MessageKey, tn } from '../../i18n/translate';

const NOUNS: Record<EntityType, MessageKey> = {
  project: '{count} project|{count} projects',
  task: '{count} task|{count} tasks',
  note: '{count} note|{count} notes',
  snippet: '{count} snippet|{count} snippets',
  bug: '{count} bug|{count} bugs',
};

const ORDER: EntityType[] = ['project', 'task', 'bug', 'note', 'snippet'];

/** "2 tasks, 1 note" – only the content types that actually use the tag. */
export function describeUsage(usage: TagUsage): string {
  return ORDER.filter((type) => usage.byType[type] > 0)
    .map((type) => tn(NOUNS[type], usage.byType[type]))
    .join(', ');
}
