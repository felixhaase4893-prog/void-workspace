import type { EntityType } from '../../domain/models';
import type { TagUsage } from '../../domain/tags';

const NOUNS: Record<EntityType, [string, string]> = {
  project: ['project', 'projects'],
  task: ['task', 'tasks'],
  note: ['note', 'notes'],
  snippet: ['snippet', 'snippets'],
  bug: ['bug', 'bugs'],
};

const ORDER: EntityType[] = ['project', 'task', 'bug', 'note', 'snippet'];

/** "2 tasks, 1 note" – only the content types that actually use the tag. */
export function describeUsage(usage: TagUsage): string {
  return ORDER.filter((type) => usage.byType[type] > 0)
    .map((type) => {
      const count = usage.byType[type];
      return `${count} ${NOUNS[type][count === 1 ? 0 : 1]}`;
    })
    .join(', ');
}
