import { HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '../lib/cn';
import { useWorkspaceContext } from '../state/workspaceContext';
import { t } from '../i18n/translate';

export function LocalDataBadge({ responsive = false }: { responsive?: boolean }) {
  const { repository } = useWorkspaceContext();
  const text = repository.persistent ? t('Saved on this device') : t('Not saved: storage unavailable');
  return (
    <Link
      to="/settings"
      title={responsive ? text : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg py-2 text-xs text-subtle transition-colors hover:bg-raised/60 hover:text-muted',
        responsive ? 'justify-center lg:justify-start lg:px-3' : 'px-3',
      )}
    >
      <HardDrive aria-hidden="true" className={cn('size-4 shrink-0', !repository.persistent && 'text-warning')} />
      <span className={cn(responsive && 'sr-only lg:not-sr-only')}>{text}</span>
    </Link>
  );
}
