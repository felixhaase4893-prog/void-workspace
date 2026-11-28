import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { Finding } from '../../domain/code/findings';
import { MAX_CODE_LINES, type CodeLanguageId } from '../../domain/code/languages';
import { loadEditorLanguage } from './editorLanguages';
import { voidEditorTheme } from './editorTheme';
import { t, translateText } from '../../i18n/translate';

export interface CodeEditorHandle {
  /** Moves the cursor to a line (and column), scrolls it into the middle and focuses the editor. */
  goTo(line: number, column?: number): void;
  focus(): void;
}

interface CodeEditorProps {
  value: string;
  language: CodeLanguageId;
  wrap: boolean;
  findings: readonly Finding[];
  onChange: (value: string) => void;
  /** Called when an edit or paste was refused because it would exceed the line limit. */
  onLineLimit: () => void;
}

const SEVERITY: Record<Finding['category'], Diagnostic['severity']> = { error: 'error', warning: 'warning', info: 'info', suggestion: 'hint' };

function toDiagnostics(state: EditorState, findings: readonly Finding[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const item of findings) {
    if (item.line < 1 || item.line > state.doc.lines) continue;
    const line = state.doc.line(item.line);
    const from = Math.min(line.from + Math.max(0, item.column - 1), line.to);
    // Mark the word at the position (or one character), so the squiggle sits where the problem is.
    const word = /^[\w$]+/.exec(state.doc.sliceString(from, line.to))?.[0].length ?? 1;
    diagnostics.push({ from, to: Math.min(line.to, from + Math.max(1, word)), severity: SEVERITY[item.category], message: `${translateText(item.title)}: ${translateText(item.description)}`, source: 'VOID' });
  }
  return diagnostics;
}

/**
 * The Code Tester's editor (CodeMirror 6). Only edits text: analysis and
 * formatting live in `domain/code` and never touch the editor directly.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ value, language, wrap, findings, onChange, onLineLimit }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const callbacks = useRef({ onChange, onLineLimit });

  useEffect(() => {
    callbacks.current = { onChange, onLineLimit };
  }, [onChange, onLineLimit]);

  useEffect(() => {
    if (!host.current) return;
    const lineLimit = EditorState.transactionFilter.of((transaction) => {
      if (!transaction.docChanged || transaction.newDoc.lines <= MAX_CODE_LINES) return transaction;
      queueMicrotask(() => callbacks.current.onLineLimit());
      return [];
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: false }),
        highlightSelectionMatches(),
        lintGutter(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        placeholder(t('Paste or type code here…')),
        lineLimit,
        languageCompartment.current.of([]),
        wrapCompartment.current.of([]),
        voidEditorTheme,
        EditorView.contentAttributes.of({ 'aria-label': t('Code editor'), 'aria-multiline': 'true' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
        }),
      ],
    });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; later value changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes (a loaded snippet, accepted formatting, restore) replace the document.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void loadEditorLanguage(language).then((extension) => {
      if (!cancelled) view.current?.dispatch({ effects: languageCompartment.current.reconfigure(extension) });
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapCompartment.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch(setDiagnostics(editor.state, toDiagnostics(editor.state, findings)));
  }, [findings]);

  useImperativeHandle(
    ref,
    () => ({
      goTo(line, column = 1) {
        const editor = view.current;
        if (!editor) return;
        const target = editor.state.doc.line(Math.min(Math.max(1, line), editor.state.doc.lines));
        const position = Math.min(target.from + Math.max(0, column - 1), target.to);
        editor.dispatch({ selection: EditorSelection.cursor(position), effects: EditorView.scrollIntoView(position, { y: 'center' }) });
        editor.focus();
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
});
