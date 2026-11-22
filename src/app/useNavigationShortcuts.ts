import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { isModalOpen } from '../features/search/shortcut';
import { NAVIGATION } from './navigation';
import { navigationDigit } from './shortcuts';

/**
 * Ctrl+1 … Ctrl+9 jump between the pages. They also work while a text
 * field has focus (Ctrl+digit never types anything), but not while a dialog
 * is open, so nothing changes behind an unsaved form.
 */
export function useNavigationShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const digit = navigationDigit(event);
      if (digit === null) return;
      const target = NAVIGATION.find((item) => item.shortcut === digit);
      if (!target || isModalOpen()) return;
      event.preventDefault();
      navigate(target.to);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
