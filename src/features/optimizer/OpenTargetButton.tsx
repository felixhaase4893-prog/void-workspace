import { ExternalLink } from 'lucide-react';
import { createContext, useContext, useState } from 'react';

import { Button } from '../../components/ui/Button';
import type { OpenTarget } from '../../domain/optimizer/models';
import { t, translateText } from '../../i18n/translate';

/** The client's one-click opener; null in the browser demo. */
export const OpenTargetContext = createContext<((id: string) => Promise<boolean>) | null>(null);

/**
 * t('Open'): shows the folder, settings page or Task Manager where the user can
 * look or fix things themselves. Only the fixed target id goes to the app.
 */
export function OpenTargetButton({ target, size = 'sm', variant = 'secondary' }: { target: OpenTarget; size?: 'sm' | 'md'; variant?: 'secondary' | 'ghost' }) {
  const open = useContext(OpenTargetContext);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  if (!open) {
    return (
      <Button size={size} variant={variant} icon={<ExternalLink />} disabled title={t('Only available in the desktop app')}>
        {translateText(target.label)}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant={variant}
        icon={<ExternalLink />}
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          void open(target.id).then((opened) => setState(opened ? 'idle' : 'failed'));
        }}
      >
        {translateText(target.label)}
      </Button>
      {state === 'failed' && (
        <span className="text-xs text-warning" role="status">
          {t('Could not be opened (folder missing?).')}
        </span>
      )}
    </span>
  );
}
