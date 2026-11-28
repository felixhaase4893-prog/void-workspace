import { ClipboardPaste, Eraser, Microscope, RotateCcw, Save, WandSparkles, WrapText, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/toastContext';
import { analyzeCode, type ScanMode } from '../../domain/code/analyze';
import type { Finding } from '../../domain/code/findings';
import { CODE_LANGUAGES, countLines, exceedsLineLimit, getCodeLanguage, isCodeLanguageId, MAX_CODE_LINES, resolveCodeLanguage } from '../../domain/code/languages';
import { cn } from '../../lib/cn';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';
import { CopyButton } from '../snippets/CopyButton';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { hasUnsavedCode, useCodeTesterSession, type CodeTesterState } from './codeTesterSession';
import { FormatDialog } from './FormatDialog';
import { ResultsPanel } from './ResultsPanel';
import { SaveDialog, snippetLanguageLabel } from './SaveDialog';
import { SplitPane } from './SplitPane';
import { formatNumber, t, translateText } from '../../i18n/translate';

const NO_FINDINGS: Finding[] = [];

/**
 * The Code Tester: an editor with static analysis and formatting. Code is only
 * read, never executed, and nothing leaves the device. Scratch code lives in
 * memory until VOID closes; saving goes through the Snippet Vault.
 */
export default function CodeTesterPage() {
  const { state, update } = useCodeTesterSession();
  const workspace = useWorkspace();
  const { updateSnippet } = useWorkspaceActions();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editor = useRef<CodeEditorHandle>(null);
  const [running, setRunning] = useState(false);
  const [dialog, setDialog] = useState<'format' | 'save' | 'clear' | null>(null);
  const [pendingSnippet, setPendingSnippet] = useState<string | null>(null);
  const runId = useRef(0);

  const language = getCodeLanguage(state.language);
  const snippet = state.snippetId ? (workspace.snippets.find((entry) => entry.id === state.snippetId) ?? null) : null;
  const unsaved = hasUnsavedCode(state);
  const lines = countLines(state.code);
  const outdated = state.analyzedCode !== null && state.analyzedCode !== state.code;
  const findings = state.outcome?.status === 'done' && !outdated ? state.outcome.findings : NO_FINDINGS;

  // The linked snippet was deleted meanwhile: fall back to scratch mode, keep the code.
  useEffect(() => {
    if (state.snippetId && !snippet) update({ snippetId: null, savedCode: null });
  }, [state.snippetId, snippet, update]);

  // Tell the user on leaving that unsaved code is only kept in memory.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(
    () => () => {
      if (hasUnsavedCode(latest.current)) showToast(t('Your Code Tester code is not saved. It stays there until you close VOID.'), 'warning');
    },
    [showToast],
  );

  const loadSnippet = useCallback(
    (id: string) => {
      const target = workspace.snippets.find((entry) => entry.id === id);
      if (!target) {
        showToast(t('That snippet no longer exists.'), 'warning');
        return;
      }
      if (exceedsLineLimit(target.code)) {
        showToast(t('“{title}” has more than {max} lines and cannot be opened in the Code Tester.', { title: target.title, max: formatNumber(MAX_CODE_LINES) }), 'warning');
        return;
      }
      update({
        code: target.code,
        language: resolveCodeLanguage(target.language) ?? 'plaintext',
        snippetId: target.id,
        savedCode: target.code,
        outcome: null,
        analyzedCode: null,
        formatBackup: null,
      });
    },
    [workspace.snippets, update, showToast],
  );

  // /code-tester?snippet=<id> opens a snippet; unsaved code is never replaced without asking.
  const requested = searchParams.get('snippet');
  useEffect(() => {
    if (!requested) return;
    navigate('/code-tester', { replace: true });
    if (requested === latest.current.snippetId && !hasUnsavedCode(latest.current)) return;
    if (hasUnsavedCode(latest.current)) setPendingSnippet(requested);
    else loadSnippet(requested);
  }, [requested, navigate, loadSnippet]);

  const setCode = useCallback((code: string) => update({ code }), [update]);
  const onLineLimit = useCallback(
    () => showToast(t('The Code Tester holds up to {max} lines. That change was not applied.', { max: formatNumber(MAX_CODE_LINES) }), 'warning'),
    [showToast],
  );

  const run = async (mode: ScanMode) => {
    const id = ++runId.current;
    const code = state.code;
    setRunning(true);
    const outcome = await analyzeCode(code, state.language, mode);
    if (id !== runId.current) return;
    setRunning(false);
    update({ outcome, analyzedCode: code });
  };

  const changeLanguage = (value: string) => {
    if (!isCodeLanguageId(value)) return;
    update({ language: value, outcome: null, analyzedCode: null });
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (exceedsLineLimit(text)) {
        onLineLimit();
        return;
      }
      update({ code: text, formatBackup: null });
      editor.current?.focus();
    } catch {
      showToast(t('VOID could not read the clipboard. Click into the editor and press Ctrl+V.'), 'info');
    }
  };

  const saveToLinked = async () => {
    if (!snippet) {
      setDialog('save');
      return;
    }
    const result = await updateSnippet(snippet.id, {
      title: snippet.title,
      description: snippet.description,
      language: getCodeLanguage(state.language).label.toLowerCase() === snippet.language.trim().toLowerCase() ? snippet.language : snippetLanguageLabel(state.language),
      code: state.code,
      projectId: snippet.projectId,
      tags: snippet.tagIds.map((id) => ({ id })),
    });
    if (!result.ok) {
      showToast(result.error.message, 'danger');
      return;
    }
    update({ savedCode: state.code });
    showToast(t('Saved to “{title}”.', { title: snippet.title }), 'success');
  };

  const clear = () => {
    update({ code: '', snippetId: null, savedCode: null, outcome: null, analyzedCode: null, formatBackup: null });
    setDialog(null);
    editor.current?.focus();
  };

  const select = (finding: Finding) => editor.current?.goTo(finding.line, finding.column);
  const canRestore = state.formatBackup !== null && state.formatBackup.formatted === state.code;

  return (
    <>
      <PageHeader title={t('Code Tester')} description={t('Static analysis and formatting for your code. It is only read, never run, and never leaves this device.')} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="code-language">
          {t('Language')}
        </label>
        <Select id="code-language" value={state.language} onChange={(event) => changeLanguage(event.target.value)} className="w-auto min-w-[10rem]">
          {CODE_LANGUAGES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {translateText(entry.label)}
            </option>
          ))}
        </Select>
        <Button size="md" icon={<Zap />} onClick={() => void run('quick')} disabled={running || !language.quickScan} title={language.quickScan ? t('Brackets, strings and obvious problems') : t('Not available for this language')}>
          {t('Quick Scan')}
        </Button>
        <Button size="md" variant="primary" icon={<Microscope />} onClick={() => void run('deep')} disabled={running || !language.deepScan} title={language.deepScan ? language.deepScanNote : t('Not available for this language')}>
          {t('Deep Scan')}
        </Button>
        <Button size="md" icon={<WandSparkles />} onClick={() => setDialog('format')} disabled={state.code.trim() === ''} title={language.format ? t('Preview formatting') : t('Formatting is not available for this language')}>
          {t('Format')}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton label={t('Paste from clipboard')} onClick={() => void paste()}>
            <ClipboardPaste />
          </IconButton>
          <CopyButton text={state.code} label={t('Copy code')} />
          <IconButton label={state.wrap ? t('Turn off line wrapping') : t('Wrap long lines')} aria-pressed={state.wrap} onClick={() => update({ wrap: !state.wrap })} className={cn(state.wrap && 'bg-raised text-accent-300')}>
            <WrapText />
          </IconButton>
          <IconButton label={t('Clear editor')} onClick={() => (unsaved ? setDialog('clear') : clear())} disabled={state.code === '' && !state.snippetId}>
            <Eraser />
          </IconButton>
          <Button size="md" icon={<Save />} onClick={() => void saveToLinked()} disabled={state.code.trim() === '' || (snippet !== null && !unsaved)}>
            {snippet ? t('Save') : t('Save…')}
          </Button>
          {snippet && (
            <Button size="md" variant="ghost" onClick={() => setDialog('save')} disabled={state.code.trim() === ''}>
              {t('Save as…')}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" aria-live="polite">
        {snippet ? (
          <span className="flex min-w-0 items-center gap-2 text-muted">
            <Badge tone="accent">{t('Snippet')}</Badge>
            <span className="truncate text-fg">{snippet.title}</span>
            {unsaved ? <span className="text-warning">{t('· Unsaved changes')}</span> : <span className="text-subtle">{t('· Saved')}</span>}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted">
            <Badge tone={unsaved ? 'warning' : 'neutral'}>{t('Scratch')}</Badge>
            {unsaved ? t('Not saved. Kept until you close VOID; save it as a snippet to keep it.') : t('Paste code to analyse it. Nothing is saved automatically.')}
          </span>
        )}
        <span className={cn('ml-auto font-mono tabular-nums', lines > MAX_CODE_LINES * 0.9 ? 'text-warning' : 'text-subtle')}>
          {formatNumber(lines)} / {formatNumber(MAX_CODE_LINES)} {t('lines')}
        </span>
      </div>

      {canRestore && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-500/25 bg-accent-500/[0.06] px-4 py-2 text-[13px] text-accent-200" role="status">
          {t('Formatting applied.')}
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => state.formatBackup && update({ code: state.formatBackup.original, formatBackup: null })}>
            {t('Restore original')}
          </Button>
        </div>
      )}

      <SplitPane
        label={t('Resize editor and analysis')}
        first={<CodeEditor ref={editor} value={state.code} language={state.language} wrap={state.wrap} findings={findings} onChange={setCode} onLineLimit={onLineLimit} />}
        second={<ResultsPanel outcome={state.outcome} running={running} outdated={outdated} onSelect={select} />}
      />

      {dialog === 'format' && (
        <FormatDialog
          code={state.code}
          language={state.language}
          onClose={() => setDialog(null)}
          onApply={(formatted) => {
            update((current: CodeTesterState) => ({ code: formatted, formatBackup: { original: current.code, formatted } }));
            setDialog(null);
            showToast(t('Formatting applied.'), 'success');
          }}
        />
      )}
      {dialog === 'save' && (
        <SaveDialog
          code={state.code}
          language={state.language}
          snippetId={state.snippetId}
          onClose={() => setDialog(null)}
          onSaved={(id) => {
            update({ snippetId: id, savedCode: state.code });
            setDialog(null);
          }}
        />
      )}
      {dialog === 'clear' && (
        <ConfirmDialog
          title={t('Clear the editor?')}
          description={t('The code is not saved and cannot be brought back.')}
          confirmLabel={t('Clear code')}
          onConfirm={clear}
          onClose={() => setDialog(null)}
        />
      )}
      {pendingSnippet && (
        <ConfirmDialog
          title={t('Replace unsaved code?')}
          description={t('The Code Tester has code that is not saved. Opening the snippet replaces it.')}
          confirmLabel={t('Open snippet')}
          onConfirm={() => {
            loadSnippet(pendingSnippet);
            setPendingSnippet(null);
          }}
          onClose={() => setPendingSnippet(null)}
        />
      )}
    </>
  );
}
