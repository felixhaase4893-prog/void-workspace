import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ENTITY_ROUTES } from '../../app/navigation';
import { useToast } from '../../components/ui/toastContext';
import { ENTITY_LABELS } from '../../domain/labels';
import type { SearchResult } from '../../domain/search';
import { findEntity } from '../../domain/workspace';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { SearchContext, type SearchContextValue } from './searchContext';
import { SearchDialog } from './SearchDialog';
import { isEditableTarget, isModalOpen, isSearchShortcut } from './shortcut';

/**
 * Owns the search dialog and the Ctrl+K shortcut. Opening a result reuses the
 * existing pages and edit dialogs: projects have a detail page, everything
 * else opens in its edit dialog on top of its own list.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { openEditDialog } = useEntityDialogs();
  const { showToast } = useToast();

  const openSearch = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isSearchShortcut(event)) return;
      if (isEditableTarget(event.target) || isModalOpen()) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const openResult = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      // The item may have been deleted since the results were shown, e.g. in another window.
      if (!findEntity(workspace, result.type, result.id)) {
        showToast(`This ${ENTITY_LABELS[result.type].toLowerCase()} no longer exists.`, 'danger');
        return;
      }
      if (result.type === 'project') {
        navigate(`/projects/${encodeURIComponent(result.id)}`);
        return;
      }
      navigate(ENTITY_ROUTES[result.type]);
      openEditDialog(result.type, result.id);
    },
    [workspace, navigate, openEditDialog, showToast],
  );

  const value = useMemo<SearchContextValue>(() => ({ openSearch }), [openSearch]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      {open && <SearchDialog onClose={close} onSelect={openResult} />}
    </SearchContext.Provider>
  );
}
