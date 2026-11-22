import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * Syntax highlighting for snippets and Markdown code blocks.
 *
 * Uses lowlight (highlight.js grammars) with a hand-picked set of languages, so
 * the bundle stays small. The result is a token tree, never an HTML string,
 * so code is always rendered as text. The language comes from the snippet's
 * language field; there is no guessing, because automatic detection is not
 * reliable for short snippets and a wrong guess looks worse than none.
 */

const lowlight = createLowlight({
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  php,
  powershell,
  python,
  rust,
  scss,
  sql,
  typescript,
  xml,
  yaml,
});

/** Free-text language names (as users type them) → registered grammar. */
const ALIASES: Record<string, string> = {
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  'node.js': 'javascript',
  nodejs: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  python: 'python',
  py: 'python',
  python3: 'python',
  java: 'java',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  json: 'json',
  jsonc: 'json',
  sql: 'sql',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  terminal: 'bash',
  powershell: 'powershell',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  'c#': 'csharp',
  csharp: 'csharp',
  cs: 'csharp',
  'c sharp': 'csharp',
  c: 'c',
  h: 'c',
  'c++': 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  lua: 'lua',
  luau: 'lua',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  php: 'php',
  kotlin: 'kotlin',
  kt: 'kotlin',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  ini: 'ini',
  toml: 'ini',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  diff: 'diff',
  patch: 'diff',
};

/** The grammar used for a stored language name, or `null` when it is unknown (the code is then shown plain). */
export function resolveHighlightLanguage(language: string): string | null {
  return ALIASES[language.trim().toLowerCase()] ?? null;
}

/** One highlighted piece of code: text plus the highlight.js classes that colour it. */
export interface HighlightToken {
  text: string;
  /** e.g. `['hljs-keyword']`; empty for plain text. */
  classes: string[];
}

/** Very large inputs are shown plain so typing and scrolling never stall. */
const MAX_HIGHLIGHT_LENGTH = 50_000;

interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  properties?: { className?: unknown };
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string };

/**
 * Splits code into coloured tokens. Joining all token texts always gives back
 * the exact input, so what is shown is what gets copied.
 */
export function highlightCode(code: string, language: string): HighlightToken[] | null {
  const grammar = resolveHighlightLanguage(language);
  if (!grammar || code.length > MAX_HIGHLIGHT_LENGTH) return null;
  let tree: { children: HastNode[] };
  try {
    tree = lowlight.highlight(grammar, code) as unknown as { children: HastNode[] };
  } catch {
    return null;
  }
  const tokens: HighlightToken[] = [];
  const walk = (nodes: HastNode[], classes: string[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        const { value } = node as HastText;
        const last = tokens[tokens.length - 1];
        if (last && last.classes.join(' ') === classes.join(' ')) last.text += value;
        else if (value) tokens.push({ text: value, classes });
      } else if (node.type === 'element') {
        const element = node as HastElement;
        const own = Array.isArray(element.properties?.className) ? element.properties.className.filter((name): name is string => typeof name === 'string') : [];
        walk(element.children, [...classes, ...own]);
      }
    }
  };
  walk(tree.children, []);
  return tokens.map((token) => token.text).join('') === code ? tokens : null;
}

export const HIGHLIGHT_LANGUAGES = Array.from(new Set(Object.values(ALIASES))).sort();
