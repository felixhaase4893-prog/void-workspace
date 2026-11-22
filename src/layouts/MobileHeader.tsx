import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from '../components/brand/Logo';
import { IconButton } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { QuickAddIconButton } from '../features/quickadd/QuickAddButton';
import { SearchIconButton } from '../features/search/SearchButton';
import { LocalDataBadge } from './LocalDataBadge';
import { NavList } from './NavList';

/** Top bar with a navigation drawer for phones. */
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-md md:hidden">
      <Link to="/" aria-label="VOID dashboard" className="rounded-lg">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">
        <SearchIconButton />
        <QuickAddIconButton />
        <IconButton label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu />
        </IconButton>
      </div>
      <Dialog open={open} onClose={close} title="Navigation" placement="left">
        <nav aria-label="Main">
          <NavList onNavigate={close} />
        </nav>
        <div className="mt-6 border-t border-line pt-3">
          <LocalDataBadge />
        </div>
      </Dialog>
    </header>
  );
}
