import { useEffect, type ReactNode } from 'react';

import { markStartup } from '../lib/startupMarks';

import { LogoMark } from '../components/brand/Logo';
import { Spinner } from '../components/ui/Spinner';
import { useWorkspaceContext } from '../state/workspaceContext';
import { RecoveryScreen } from './RecoveryScreen';
import { t } from '../i18n/translate';

/** Renders the app only once the workspace has loaded; handles loading and load errors. */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { state } = useWorkspaceContext();
  useEffect(() => markStartup('void:first-render'), []);

  if (state.status === 'loading') {
    return (
      <div role="status" className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4 text-sm text-subtle">
          <LogoMark className="size-10" />
          <Spinner />
          <span>{t('Loading your workspace…')}</span>
        </div>
      </div>
    );
  }
  if (state.status === 'error') return <RecoveryScreen error={state.error} />;
  return children;
}
