import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button';

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <Button size="sm" variant="ghost" aria-label={label} icon={state === 'copied' ? <Check /> : <Copy />} onClick={() => void copy()}>
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </Button>
  );
}
