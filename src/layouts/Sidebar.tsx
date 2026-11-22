import { Link } from 'react-router-dom';

import { Logo } from '../components/brand/Logo';
import { QuickAddButton } from '../features/quickadd/QuickAddButton';
import { SearchButton } from '../features/search/SearchButton';
import { LocalDataBadge } from './LocalDataBadge';
import { NavList } from './NavList';

/** Persistent navigation: icon rail on tablets, full sidebar on desktops. Hidden on phones. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/60 md:flex md:w-16 lg:w-60">
      <div className="flex h-16 items-center justify-center lg:justify-start lg:px-5">
        <Link to="/" aria-label="VOID dashboard" className="rounded-lg">
          <Logo responsive />
        </Link>
      </div>
      <div className="space-y-1 px-3 pb-2">
        <SearchButton responsive />
        <QuickAddButton responsive />
      </div>
      <nav aria-label="Main" className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        <p className="mb-2 hidden px-3 font-mono text-[10px] tracking-[0.16em] text-subtle uppercase lg:block">Workspace</p>
        <NavList responsive />
      </nav>
      <div className="border-t border-line p-3">
        <LocalDataBadge responsive />
      </div>
    </aside>
  );
}
