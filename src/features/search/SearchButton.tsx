import { Search } from 'lucide-react';

import { IconButton } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { useSearch } from './searchContext';
import { SEARCH_SHORTCUT_ARIA, SEARCH_SHORTCUT_LABEL } from './shortcut';
import { t } from '../../i18n/translate';

interface SearchButtonProps {
  /** Icon only below the `lg` breakpoint, matching the tablet sidebar rail. */
  responsive?: boolean;
}

/** Search entry for the sidebar, styled like a quiet input. */
export function SearchButton({ responsive = false }: SearchButtonProps) {
  const { openSearch } = useSearch();
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-keyshortcuts={SEARCH_SHORTCUT_ARIA}
      title={t('Search ({shortcut})', { shortcut: SEARCH_SHORTCUT_LABEL })}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-canvas/60 text-[13px] text-subtle transition-colors hover:border-line-strong hover:text-muted',
        responsive ? 'justify-center lg:justify-start lg:px-3' : 'px-3',
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn('flex-1 text-left', responsive && 'sr-only lg:not-sr-only')}>{t('Search')}</span>
      <kbd className={cn('rounded border border-line-strong px-1.5 font-mono text-[10px] text-subtle', responsive && 'hidden lg:inline')}>
        {SEARCH_SHORTCUT_LABEL}
      </kbd>
    </button>
  );
}

/** Compact search entry for the phone header. */
export function SearchIconButton() {
  const { openSearch } = useSearch();
  return (
    <IconButton label={t('Search')} aria-keyshortcuts={SEARCH_SHORTCUT_ARIA} onClick={openSearch}>
      <Search />
    </IconButton>
  );
}
