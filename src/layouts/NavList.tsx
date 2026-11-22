import { NavLink } from 'react-router-dom';

import { NAVIGATION } from '../app/navigation';
import { cn } from '../lib/cn';

interface NavListProps {
  /** Shows an icon-only rail below the `lg` breakpoint (tablet sidebar). */
  responsive?: boolean;
  onNavigate?: () => void;
}

export function NavList({ responsive = false, onNavigate }: NavListProps) {
  return (
    <ul className="space-y-0.5">
      {NAVIGATION.map(({ to, label, shortcut, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            title={`${label} (Ctrl ${shortcut})`}
            aria-keyshortcuts={`Control+${shortcut}`}
            className={({ isActive }) =>
              cn(
                'group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium transition-colors',
                responsive ? 'justify-center lg:justify-start lg:px-3' : 'px-3',
                isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent-400 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon
                  aria-hidden="true"
                  className={cn('size-[18px] shrink-0', isActive ? 'text-accent-300' : 'text-subtle group-hover:text-muted')}
                />
                <span className={cn(responsive && 'sr-only lg:not-sr-only')}>{label}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
