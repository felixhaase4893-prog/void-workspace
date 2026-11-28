import { Plus } from 'lucide-react';

import { QUICK_ADD_SHORTCUT_ARIA, QUICK_ADD_SHORTCUT_LABEL } from '../../app/shortcuts';
import { IconButton } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { useQuickAdd } from './quickAddContext';
import { t } from '../../i18n/translate';

/** Quick Add entry for the sidebar, next to search. */
export function QuickAddButton({ responsive = false }: { responsive?: boolean }) {
  const { openQuickAdd } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={() => openQuickAdd()}
      aria-keyshortcuts={QUICK_ADD_SHORTCUT_ARIA}
      title={t('Quick add ({shortcut})', { shortcut: QUICK_ADD_SHORTCUT_LABEL })}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg text-[13px] font-medium text-muted transition-colors hover:bg-raised/60 hover:text-fg',
        responsive ? 'justify-center lg:justify-start lg:px-3' : 'px-3',
      )}
    >
      <Plus className="size-4 shrink-0 text-accent-300" aria-hidden="true" />
      <span className={cn('flex-1 text-left', responsive && 'sr-only lg:not-sr-only')}>{t('Quick add')}</span>
      <kbd className={cn('rounded border border-line-strong px-1.5 font-mono text-[10px] font-normal text-subtle', responsive && 'hidden lg:inline')}>
        {QUICK_ADD_SHORTCUT_LABEL}
      </kbd>
    </button>
  );
}

/** Compact Quick Add entry for the phone header. */
export function QuickAddIconButton() {
  const { openQuickAdd } = useQuickAdd();
  return (
    <IconButton label={t('Quick add')} aria-keyshortcuts={QUICK_ADD_SHORTCUT_ARIA} onClick={() => openQuickAdd()}>
      <Plus />
    </IconButton>
  );
}
