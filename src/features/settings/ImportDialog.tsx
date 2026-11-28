import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import { ANALYZED_COLLECTIONS, analyzeImport, countItems, type ConflictPolicy, type ImportMode, type ImportStats } from '../../domain/import';
import { WORKSPACE_SCHEMA_VERSION } from '../../domain/models';
import type { ParsedBackup } from '../../storage/backup';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';
import { formatDateTime, localized, t, tn } from '../../i18n/translate';

const COLLECTION_LABELS = localized({ projects: 'Projects', tasks: 'Tasks', notes: 'Notes', snippets: 'Snippets', bugs: 'Bugs', tags: 'Tags' });

const conflictOptions = (): Array<{ value: ConflictPolicy; label: string; hint: string }> => [
  { value: 'keep-current', label: t('Keep my current version'), hint: t('Differing items from the file are skipped.') },
  { value: 'use-imported', label: t('Use the version from the file'), hint: t('Your current version of those items is replaced.') },
  { value: 'keep-both', label: t('Keep both'), hint: t('Items from the file are added as copies with new IDs.') },
];

interface ImportDialogProps {
  fileName: string;
  backup: ParsedBackup;
  onClose: () => void;
  onExportCurrent: () => void;
}

function summarize(stats: ImportStats): string {
  const parts = [
    stats.added > 0 && t('{count} added', { count: stats.added }),
    stats.replaced > 0 && t('{count} replaced', { count: stats.replaced }),
    stats.copied > 0 && t('{count} added as copies', { count: stats.copied }),
    stats.skipped > 0 && t('{count} skipped', { count: stats.skipped }),
    stats.tagsAdded > 0 && tn('{count} new tag|{count} new tags', stats.tagsAdded),
    stats.tagsUpdated > 0 && tn('{count} tag updated|{count} tags updated', stats.tagsUpdated),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : t('nothing changed');
}

/** Shows what a backup contains and how it would be imported, and only imports after confirmation. */
export function ImportDialog({ fileName, backup, onClose, onExportCurrent }: ImportDialogProps) {
  const workspace = useWorkspace();
  const { importWorkspace } = useWorkspaceActions();
  const { showToast } = useToast();
  const [mode, setMode] = useState<ImportMode['kind']>('merge');
  const [conflicts, setConflicts] = useState<ConflictPolicy>('keep-current');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = analyzeImport(workspace, backup.workspace);
  const totals = ANALYZED_COLLECTIONS.reduce(
    (sum, key) => ({
      added: sum.added + analysis[key].added,
      identical: sum.identical + analysis[key].identical,
      conflicting: sum.conflicting + analysis[key].conflicting,
    }),
    { added: 0, identical: 0, conflicting: 0 },
  );
  const currentCount = countItems(workspace);
  const importCount = countItems(backup.workspace);
  const mergeChangesNothing = totals.added === 0 && totals.conflicting === 0;
  const canImport = mode === 'merge' ? !mergeChangesNothing : replaceConfirmed || currentCount === 0;

  const confirm = async () => {
    setPending(true);
    setError(null);
    const result = await importWorkspace(backup.workspace, mode === 'merge' ? { kind: 'merge', conflicts } : { kind: 'replace' });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    showToast(mode === 'replace' ? t('Data replaced: {count} items imported.', { count: importCount }) : t('Import complete: {summary}.', { summary: summarize(result.value) }));
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Import backup')}
      description={t('Check what the file contains before anything changes.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {t('Cancel')}
          </Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={!canImport || pending} onClick={() => void confirm()}>
            {pending ? t('Importing…') : mode === 'replace' ? t('Replace all data') : t('Import')}
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-[13px]">
        <dl className="grid gap-x-6 gap-y-1 rounded-lg bg-raised px-3 py-2.5 sm:grid-cols-[auto_1fr]">
          <dt className="text-subtle">{t('File')}</dt>
          <dd className="truncate font-mono text-fg">{fileName}</dd>
          <dt className="text-subtle">{t('Exported')}</dt>
          <dd className="text-fg">{backup.exportedAt ? formatDateTime(backup.exportedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('Unknown (older VOID export)')}</dd>
          <dt className="text-subtle">{t('Data format')}</dt>
          <dd className="text-fg">
            v{backup.sourceSchemaVersion}
            {backup.sourceSchemaVersion < WORKSPACE_SCHEMA_VERSION && t(' (upgraded to v{version} on import)', { version: WORKSPACE_SCHEMA_VERSION })}
          </dd>
        </dl>

        <table className="w-full text-left">
          <caption className="sr-only">{t('Contents of the backup compared with your current data')}</caption>
          <thead className="text-xs text-subtle">
            <tr>
              <th scope="col" className="pb-2 font-normal">
                {t('Type')}
              </th>
              <Th>{t('In file')}</Th>
              <Th>{t('New')}</Th>
              <Th>{t('Already here')}</Th>
              <Th>{t('Different')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {ANALYZED_COLLECTIONS.map((key) => (
              <tr key={key}>
                <th scope="row" className="py-1.5 font-normal text-muted">
                  {COLLECTION_LABELS[key]}
                </th>
                <Td>{analysis[key].total}</Td>
                <Td>{analysis[key].added}</Td>
                <Td>{analysis[key].identical}</Td>
                <Td highlight={analysis[key].conflicting > 0}>{analysis[key].conflicting}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {analysis.tags.total > 0 && (
          <p className="-mt-3 text-xs text-subtle">{t('Tags are matched by name, ignoring case: a tag you already have is reused instead of added twice.')}</p>
        )}

        {backup.clearedReferences > 0 && (
          <Alert tone="warning" title={t('{count} items referred to projects missing from the file.', { count: backup.clearedReferences })}>
            {t('They will be imported without a project.')}
          </Alert>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium text-fg">{t('How should the data be imported?')}</legend>
          <Choice name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} label={t('Merge into my current data')} hint={t('Recommended. New items are added; nothing is deleted.')} />
          <Choice name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} label={t('Replace all my current data')} hint={t("Your current data is removed and the file's data is used instead.")} />
        </fieldset>

        {(backup.clearedTagReferences > 0 || backup.mergedTags > 0) && (
          <Alert tone="warning" title={t('Some tags in the file were tidied up.')}>
            {[
              backup.mergedTags > 0 && tn('{count} duplicate tag was merged with a tag of the same name.|{count} duplicate tags were merged with a tag of the same name.', backup.mergedTags),
              backup.clearedTagReferences > 0 &&
                tn('{count} reference to tags missing from the file will be left out.|{count} references to tags missing from the file will be left out.', backup.clearedTagReferences),
            ]
              .filter(Boolean)
              .join(' ')}
          </Alert>
        )}

        {mode === 'merge' && mergeChangesNothing && (
          <Alert title={t('Nothing to import')}>{t('Everything in this file already exists with the same content. Duplicates are never imported twice.')}</Alert>
        )}

        {mode === 'merge' && totals.conflicting > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-fg">
              {tn('{count} item exists in both, with different content|{count} items exist in both, with different content', totals.conflicting)}
            </legend>
            {conflictOptions().map((option) => (
              <Choice key={option.value} name="import-conflicts" checked={conflicts === option.value} onChange={() => setConflicts(option.value)} label={option.label} hint={option.hint} />
            ))}
          </fieldset>
        )}

        {mode === 'replace' && currentCount > 0 && (
          <div className="space-y-3">
            <Alert tone="danger" title={t('This deletes your {count} current items.', { count: currentCount })}>
              {t('Export them first if you might need them again.')}
            </Alert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-start gap-2.5 text-fg">
                <input type="checkbox" className="mt-0.5 accent-accent-500" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} />
                {t('I understand that my current data will be replaced.')}
              </label>
              <Button size="sm" icon={<Download />} onClick={onExportCurrent}>
                {t('Export current data')}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert tone="danger" title={t('The import failed. Your existing data was not changed.')}>
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="pb-2 text-right font-normal">
      {children}
    </th>
  );
}

function Td({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return <td className={highlight ? 'py-1.5 text-right font-mono text-warning' : 'py-1.5 text-right font-mono text-fg'}>{children}</td>;
}

interface ChoiceProps {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}

function Choice({ name, checked, onChange, label, hint }: ChoiceProps) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-line-strong has-[:checked]:border-accent-500/50 has-[:checked]:bg-accent-500/[0.06]">
      <input type="radio" name={name} className="mt-0.5 accent-accent-500" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-fg">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  );
}
