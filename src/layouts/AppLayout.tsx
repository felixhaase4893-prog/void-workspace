import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useNavigationShortcuts } from '../app/useNavigationShortcuts';
import { markStartup } from '../lib/startupMarks';

import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { StatusBanners } from './StatusBanners';
import { t } from '../i18n/translate';

export function AppLayout() {
  useEffect(() => markStartup('void:interactive'), []);
  useNavigationShortcuts();
  // A new page starts at the top, not at the scroll position of the previous one.
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo?.({ top: 0, left: 0 });
  }, [pathname]);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-accent-500 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2"
      >
        {t('Skip to content')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-10">
          <StatusBanners />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
