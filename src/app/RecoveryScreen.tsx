import { Download, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { LogoMark } from '../components/brand/Logo';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { backupFileName, downloadTextFile } from '../lib/download';
import type { StorageError } from '../storage/errors';
import { useWorkspaceContext } from '../state/workspaceContext';

/** Shown when stored data cannot be loaded. Never discards the data silently. */
export function RecoveryScreen({ error }: { error: StorageError }) {
  const { repository, actions } = useWorkspaceContext();
  const [failure, setFailure] = useState<string | null>(null);
  const raw = repository.readRaw();

  const startFresh = async () => {
    const result = await actions.startFresh();
    if (!result.ok) setFailure(result.error.message);
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <LogoMark className="mb-5 size-10" />
        <h1 className="text-lg font-semibold text-fg">VOID could not open your saved data</h1>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        {error.kind === 'invalid' && error.issues.length > 0 && (
          <details className="mt-4 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-subtle">
            <summary className="cursor-pointer text-muted">Technical details</summary>
            <ul className="mt-2 space-y-1 font-mono">
              {error.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-4 text-[13px] text-muted">
          Nothing has been deleted. Download the raw data to keep a copy, then start fresh. The unreadable data also stays in browser storage as a backup.
        </p>
        {failure && <Alert tone="danger" title={failure} className="mt-4" />}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" icon={<Sparkles />} onClick={() => void startFresh()}>
            Start fresh
          </Button>
          {raw !== null && (
            <Button icon={<Download />} onClick={() => downloadTextFile(backupFileName('void-raw-data'), raw)}>
              Download raw data
            </Button>
          )}
          <Button variant="ghost" icon={<RotateCcw />} onClick={() => void actions.reload()}>
            Try again
          </Button>
        </div>
      </Card>
    </main>
  );
}
