import { Plus } from 'lucide-react';

import { ENTITY_ICONS } from '../../app/navigation';
import type { EntityType } from '../../domain/models';
import { useEntityDialogs } from '../create/entityDialogContext';
import { localized, t, type MessageKey } from '../../i18n/translate';

const ORDER: EntityType[] = ['project', 'task', 'note', 'snippet', 'bug'];

const HINTS = localized<EntityType>({
  project: 'Group your work',
  task: 'Track what is next',
  note: 'Write it down',
  snippet: 'Keep useful code',
  bug: 'Log a bug',
});

const NEW_LABELS: Record<EntityType, MessageKey> = { project: 'New project', task: 'New task', note: 'New note', snippet: 'New snippet', bug: 'New bug' };

export function QuickActions() {
  const { openCreateDialog } = useEntityDialogs();
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        {t('Quick actions')}
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {ORDER.map((type) => {
          const Icon = ENTITY_ICONS[type];
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => openCreateDialog(type)}
                className="group flex w-full items-center gap-2.5 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-accent-500/40 hover:bg-raised"
              >
                <span className="grid size-8 shrink-0 place-items-center sm:size-9 rounded-lg bg-raised text-muted transition-colors group-hover:bg-accent-500/15 group-hover:text-accent-300">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[13px] font-medium whitespace-nowrap text-fg">
                    <Plus className="hidden size-3.5 text-subtle sm:block" aria-hidden="true" />
                    {t(NEW_LABELS[type])}
                  </span>
                  <span className="block truncate text-xs text-subtle">{HINTS[type]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
