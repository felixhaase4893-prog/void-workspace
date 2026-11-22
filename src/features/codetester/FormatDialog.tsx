import { CircleAlert, CircleCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { CodeBlock } from '../../components/code/CodeBlock';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Spinner } from '../../components/ui/Spinner';
import { diffLines, summarizeDiff } from '../../domain/code/diff';
import { formatCode, type FormatOutcome } from '../../domain/code/format';
import { getCodeLanguage, type CodeLanguageId } from '../../domain/code/languages';
import { cn } from '../../lib/cn';

interface FormatDialogProps {
  code: string;
  language: CodeLanguageId;
  onApply: (formatted: string) => void;
  onClose: () => void;
}

type View = 'changes' | 'formatted';

/**
 * Formatting preview. The code in the editor only changes when "Apply
 * formatting" is pressed; until then this is a read-only comparison.
 */
export function FormatDialog({ code, language, onApply, onClose }: FormatDialogProps) {
  const [outcome, setOutcome] = useState<FormatOutcome | null>(null);
  const [view, setView] = useState<View>('changes');

  useEffect(() => {
    let cancelled = false;
    void formatCode(code, language).then((result) => {
      if (!cancelled) setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const diff = useMemo(() => (outcome?.status === 'formatted' && outcome.changed ? diffLines(code, outcome.code) : []), [code, outcome]);
  const summary = summarizeDiff(diff);
  const canApply = outcome?.status === 'formatted' && outcome.changed;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Format code"
      description={`Preview for ${getCodeLanguage(language).label}. Nothing changes until you apply it.`}
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canApply ? 'Cancel' : 'Close'}
          </Button>
          {canApply && (
            <Button variant="primary" onClick={() => onApply(outcome.code)} data-autofocus>
              Apply formatting
            </Button>
          )}
        </>
      }
    >
      {!outcome ? (
        <div className="flex items-center gap-3 py-8 text-[13px] text-muted">
          <Spinner /> Formatting…
        </div>
      ) : outcome.status === 'unsupported' ? (
        <Alert tone="info" title="Formatting is not available">
          {outcome.reason}
        </Alert>
      ) : outcome.status === 'failed' ? (
        <Alert tone="danger" title={outcome.line ? `Formatting stopped at line ${outcome.line}` : 'Formatting failed'}>
          {outcome.message} Your code was not changed. Fix the syntax error first, a Deep Scan shows where.
        </Alert>
      ) : !outcome.changed ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/[0.06] px-4 py-3 text-[13px] text-success" role="status">
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          The code is already formatted. Nothing to change.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Preview" className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
              {(['changes', 'formatted'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={view === entry}
                  onClick={() => setView(entry)}
                  className={cn('h-7 rounded-md px-3 text-xs font-medium transition-colors', view === entry ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
                >
                  {entry === 'changes' ? 'Changes' : 'Formatted code'}
                </button>
              ))}
            </div>
            <p className="text-xs text-subtle" aria-live="polite">
              <span className="text-success">+{summary.added}</span> <span className="text-danger">−{summary.removed}</span> lines
            </p>
          </div>
          {view === 'changes' ? (
            <div className="scrollbar-thin max-h-[52dvh] overflow-auto rounded-lg border border-line bg-canvas py-2 font-mono text-[12px] leading-relaxed" aria-label="Changes">
              <table className="w-full border-collapse">
                <tbody>
                  {diff.map((line, index) => (
                    <tr
                      key={index}
                      className={cn(line.kind === 'added' && 'bg-success/[0.08]', line.kind === 'removed' && 'bg-danger/[0.08]')}
                      data-kind={line.kind}
                    >
                      <td className="w-10 pr-2 pl-3 text-right align-top text-subtle select-none">{line.kind === 'added' ? '' : line.oldLine}</td>
                      <td className="w-10 pr-2 text-right align-top text-subtle select-none">{line.kind === 'removed' ? '' : line.newLine}</td>
                      <td className={cn('w-5 text-center align-top select-none', line.kind === 'added' ? 'text-success' : line.kind === 'removed' ? 'text-danger' : 'text-subtle')}>
                        {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ''}
                      </td>
                      <td className="pr-3 align-top whitespace-pre text-fg/90">{line.text || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CodeBlock code={outcome.code} language={language === 'html' ? 'html' : language} className="max-h-[52dvh] rounded-lg border border-line bg-canvas px-4 py-3" />
          )}
          <p className="flex items-start gap-2 text-xs text-subtle">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            After applying, “Restore original” or Ctrl+Z brings the previous version back.
          </p>
        </div>
      )}
    </Dialog>
  );
}
