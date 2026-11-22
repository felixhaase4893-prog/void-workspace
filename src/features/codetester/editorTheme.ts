import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * The editor uses the same colours as VOID's read-only code blocks
 * (`.hljs-code` in index.css), so code looks the same everywhere.
 */

const color = {
  keyword: '#b4a7ff',
  string: '#9fdba9',
  number: '#f5b97a',
  comment: '#6e6e7e',
  title: '#7cc7f5',
  type: '#f0c674',
  attr: '#e8a3c9',
  meta: '#8fb8c9',
  plain: '#d4d4de',
  muted: '#a1a1b0',
  danger: '#f87171',
};

const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: color.comment, fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self, t.bool, t.null, t.atom], color: color.keyword },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.inserted], color: color.string },
  { tag: [t.number, t.integer, t.float, t.unit], color: color.number },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.heading, t.tagName, t.labelName], color: color.title },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.variableName), t.macroName], color: color.type },
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName), t.special(t.variableName)], color: color.attr },
  { tag: [t.meta, t.processingInstruction, t.documentMeta, t.annotation], color: color.meta },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator, t.angleBracket], color: color.muted },
  { tag: [t.invalid, t.deleted], color: color.danger },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.link, color: color.keyword, textDecoration: 'underline' },
]);

const theme = EditorView.theme(
  {
    '&': {
      color: color.plain,
      backgroundColor: 'var(--color-canvas)',
      height: '100%',
      fontSize: '13px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.6',
      fontVariantLigatures: 'none',
    },
    '.cm-content': { caretColor: 'var(--color-accent-300)', padding: '10px 0' },
    '.cm-line': { padding: '0 14px 0 10px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent-300)', borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in oklab, var(--color-accent-500) 32%, transparent)',
    },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--color-raised) 70%, transparent)' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-subtle)',
      borderRight: '1px solid var(--color-line)',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--color-raised)', color: 'var(--color-muted)' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '3.25em' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: 'color-mix(in oklab, var(--color-accent-500) 22%, transparent)', outline: '1px solid color-mix(in oklab, var(--color-accent-400) 45%, transparent)' },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 22%, transparent)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in oklab, var(--color-warning) 40%, transparent)' },
    '.cm-panels': { backgroundColor: 'var(--color-surface)', color: 'var(--color-fg)', borderColor: 'var(--color-line)' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'var(--font-sans)', fontSize: '12px' },
    '.cm-textfield': { backgroundColor: 'var(--color-canvas)', border: '1px solid var(--color-line-strong)', borderRadius: '6px', color: 'var(--color-fg)' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', borderRadius: '6px', color: 'var(--color-fg)' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--color-danger)', textUnderlineOffset: '3px' },
    '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--color-warning)', textUnderlineOffset: '3px' },
    '.cm-lintRange-info': { backgroundImage: 'none', textDecoration: 'underline dotted var(--color-accent-300)', textUnderlineOffset: '3px' },
    '.cm-lintRange-hint': { backgroundImage: 'none', textDecoration: 'underline dotted var(--color-subtle)', textUnderlineOffset: '3px' },
    '.cm-flash-line': { backgroundColor: 'color-mix(in oklab, var(--color-accent-500) 20%, transparent)', transition: 'background-color 600ms ease-out' },
    '.cm-tooltip': { backgroundColor: 'var(--color-overlay)', border: '1px solid var(--color-line-strong)', borderRadius: '8px', color: 'var(--color-fg)' },
    '.cm-tooltip-lint': { padding: '2px' },
    '.cm-diagnostic': { borderLeftWidth: '3px', fontFamily: 'var(--font-sans)', fontSize: '12px' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--color-danger)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--color-warning)' },
    '.cm-diagnostic-info': { borderLeftColor: 'var(--color-accent-400)' },
    '.cm-diagnostic-hint': { borderLeftColor: 'var(--color-subtle)' },
  },
  { dark: true },
);

export const voidEditorTheme = [theme, syntaxHighlighting(highlightStyle)];
