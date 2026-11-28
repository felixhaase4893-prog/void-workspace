import { Download, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/toastContext';
import type { Workspace } from '../../domain/models';
import { backupFileName, downloadTextFile } from '../../lib/download';
import { createBackup, parseBackup, serializeBackup, type BackupError, type ParsedBackup } from '../../storage/backup';
import { useWorkspace } from '../../state/workspaceContext';
import { ImportDialog } from './ImportDialog';
import { SettingsSection } from './SettingsSection';
import { t } from '../../i18n/translate';

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(t('The file could not be read.')));
    reader.readAsText(file);
  });
}

function exportWorkspace(workspace: Workspace): void {
  downloadTextFile(backupFileName('void-backup'), serializeBackup(createBackup(workspace)));
}

export function BackupSection() {
  const workspace = useWorkspace();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<BackupError | null>(null);
  const [pendingImport, setPendingImport] = useState<{ fileName: string; backup: ParsedBackup } | null>(null);

  const exportNow = () => {
    exportWorkspace(workspace);
    showToast(t('Backup downloaded.'));
  };

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again triggers another change event.
    event.target.value = '';
    if (!file) return;
    setError(null);
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      setError({ kind: 'not-json', message: t('The file could not be read.') });
      return;
    }
    const parsed = parseBackup(text);
    if (parsed.ok) setPendingImport({ fileName: file.name, backup: parsed.value });
    else setError(parsed.error);
  };

  return (
    <SettingsSection title={t('Backup')} description={t('Move your data between devices or keep a copy you own.')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] text-fg">{t('Export')}</p>
          <p className="text-xs text-subtle">{t('All projects, tasks, notes and snippets as a versioned JSON file.')}</p>
        </div>
        <Button icon={<Download />} onClick={exportNow}>
          {t('Export JSON')}
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] text-fg">{t('Import')}</p>
          <p className="text-xs text-subtle">{t('The file is checked first. You see a summary before anything changes.')}</p>
        </div>
        <Button icon={<Upload />} onClick={() => inputRef.current?.click()}>
          {t('Import JSON')}
        </Button>
        <input ref={inputRef} type="file" accept="application/json,.json" aria-label={t('Backup file to import')} className="sr-only" tabIndex={-1} onChange={(event) => void onFileChosen(event)} />
      </div>
      {error && (
        <Alert
          tone="danger"
          title={t('This file cannot be imported')}
          className="mt-4"
          action={
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              {t('Dismiss')}
            </Button>
          }
        >
          <p>
            {error.message} {t('Your data was not changed.')}
          </p>
          {error.kind === 'invalid' && error.issues.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-mono text-xs">
              {error.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {pendingImport && (
        <ImportDialog
          fileName={pendingImport.fileName}
          backup={pendingImport.backup}
          onClose={() => setPendingImport(null)}
          onExportCurrent={exportNow}
        />
      )}
    </SettingsSection>
  );
}
