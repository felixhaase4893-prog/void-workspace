import { Bold, Code, Eye, Heading, Italic, Link, List, ListOrdered, Pencil, SquareCode } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { Textarea } from '../../components/ui/Field';
import { cn } from '../../lib/cn';
import { MarkdownView } from './MarkdownView';
import { t } from '../../i18n/translate';

type Mode = 'write' | 'preview';

interface MarkdownEditorProps {
  /** Label wiring from <Field>: id, aria-invalid, aria-describedby. */
  field: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined };
  value: string;
  onChange: (value: string) => void;
}

interface Edit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection (or a placeholder) in `before`/`after`, e.g. `**bold**`. */
export function wrapSelection(text: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  const selected = text.slice(start, end) || placeholder;
  const value = text.slice(0, start) + before + selected + after + text.slice(end);
  return { value, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
}

/** Adds a prefix to every line touched by the selection, e.g. `- ` for a list. */
export function prefixLines(text: string, start: number, end: number, prefix: (index: number) => string): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const replaced = lines.map((line, index) => prefix(index) + line).join('\n');
  const value = text.slice(0, lineStart) + replaced + text.slice(lineEnd);
  return { value, selectionStart: lineStart, selectionEnd: lineStart + replaced.length };
}

type Build = (text: string, start: number, end: number) => Edit;

/** Built on render, so the labels and placeholder texts follow the active language. */
const tools = (): Array<{ label: string; icon: ReactNode; build: Build }> => [
  { label: t('Heading'), icon: <Heading />, build: (text, s, e) => prefixLines(text, s, e, () => '## ') },
  { label: t('Bold'), icon: <Bold />, build: (text, s, e) => wrapSelection(text, s, e, '**', '**', t('bold text')) },
  { label: t('Italic'), icon: <Italic />, build: (text, s, e) => wrapSelection(text, s, e, '*', '*', t('italic text')) },
  { label: t('Bulleted list'), icon: <List />, build: (text, s, e) => prefixLines(text, s, e, () => '- ') },
  { label: t('Numbered list'), icon: <ListOrdered />, build: (text, s, e) => prefixLines(text, s, e, (i) => `${i + 1}. `) },
  { label: t('Link'), icon: <Link />, build: (text, s, e) => wrapSelection(text, s, e, '[', '](https://)', t('link text')) },
  { label: t('Inline code'), icon: <Code />, build: (text, s, e) => wrapSelection(text, s, e, '`', '`', 'code') },
  { label: t('Code block'), icon: <SquareCode />, build: (text, s, e) => wrapSelection(text, s, e, '```\n', '\n```', 'code') },
];

/** Note content editor: plain text with Markdown, a small formatting toolbar and a preview tab. */
export function MarkdownEditor({ field, value, onChange }: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('write');
  const textarea = useRef<HTMLTextAreaElement>(null);

  const apply = (build: Build) => {
    const element = textarea.current;
    if (!element) return;
    const edit = build(value, element.selectionStart, element.selectionEnd);
    onChange(edit.value);
    // Restore the selection after React has rendered the new value.
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5',
      active ? 'bg-raised text-fg' : 'text-subtle hover:text-fg',
    );

  return (
    <div className="min-w-0 rounded-lg border border-line bg-canvas focus-within:border-accent-400 focus-within:ring-2 focus-within:ring-accent-500/25">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line px-1.5 py-1">
        <div role="tablist" aria-label={t('Note editor mode')} className="flex items-center gap-0.5">
          <button type="button" role="tab" aria-selected={mode === 'write'} className={tabClass(mode === 'write')} onClick={() => setMode('write')}>
            <Pencil aria-hidden="true" /> {t('Write')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'preview'} className={tabClass(mode === 'preview')} onClick={() => setMode('preview')}>
            <Eye aria-hidden="true" /> {t('Preview')}
          </button>
        </div>
        {mode === 'write' && (
          <div role="toolbar" aria-label={t('Formatting')} className="flex flex-wrap items-center">
            {tools().map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                onClick={() => apply(tool.build)}
                className="grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-raised hover:text-fg [&_svg]:size-3.5"
              >
                {tool.icon}
              </button>
            ))}
          </div>
        )}
      </div>
      <Textarea
        {...field}
        ref={textarea}
        hidden={mode !== 'write'}
        spellCheck
        className="min-h-48 rounded-t-none border-0 bg-transparent font-mono text-[13px] hover:border-0 focus:ring-0 [font-variant-ligatures:none]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('# Heading\n\nWrite with **Markdown**: lists, `code`, [links](https://example.com) …')}
      />
      {mode === 'preview' && (
        <div className="scrollbar-thin max-h-[26rem] min-h-48 overflow-auto px-3 py-2.5" aria-label={t('Note preview')} role="region">
          {value.trim() ? <MarkdownView source={value} /> : <p className="text-[13px] text-subtle">{t('Nothing to preview yet.')}</p>}
        </div>
      )}
    </div>
  );
}
