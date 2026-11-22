/**
 * Languages of the Code Tester and what VOID can honestly do with each one.
 *
 * Highlighting, analysis and formatting are separate capabilities:
 * - `deepScan: 'parser'` means a real parser or checker reads the code,
 * - `deepScan: 'heuristic'` means only structural checks and known patterns,
 * - `quickScan: false` / `format: false` are shown as "not available".
 */

export const CODE_LANGUAGE_IDS = [
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'scss',
  'json',
  'java',
  'csharp',
  'cpp',
  'c',
  'php',
  'sql',
  'bash',
  'powershell',
  'yaml',
  'go',
  'rust',
  'kotlin',
  'swift',
  'lua',
  'ruby',
  'xml',
  'toml',
  'dockerfile',
  'plaintext',
] as const;

export type CodeLanguageId = (typeof CODE_LANGUAGE_IDS)[number];

export type DeepScanLevel = 'parser' | 'heuristic' | false;

export interface CodeLanguage {
  id: CodeLanguageId;
  label: string;
  quickScan: boolean;
  deepScan: DeepScanLevel;
  format: boolean;
  /** What Deep Scan actually does, shown next to the results. */
  deepScanNote: string;
}

const LANGUAGES: Record<CodeLanguageId, CodeLanguage> = {
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    quickScan: true,
    deepScan: 'parser',
    format: true,
    deepScanNote: 'TypeScript parser (JSX supported) plus scope checks for unused, duplicate and unreachable code. No type checking, nothing is executed.',
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    quickScan: true,
    deepScan: 'parser',
    format: true,
    deepScanNote: 'TypeScript parser (TSX supported) plus scope checks for unused, duplicate and unreachable code. Types from other files are unknown, so type errors are not checked.',
  },
  python: {
    id: 'python',
    label: 'Python',
    quickScan: true,
    deepScan: 'parser',
    format: false,
    deepScanNote: 'Indentation and bracket checks plus a Python grammar parser. Parser findings are shown as possible problems, because very new syntax may not be known.',
  },
  html: {
    id: 'html',
    label: 'HTML',
    quickScan: true,
    deepScan: 'parser',
    format: true,
    deepScanNote: 'Tag structure (void elements and optional end tags respected), duplicate ids and accessibility hints.',
  },
  css: {
    id: 'css',
    label: 'CSS',
    quickScan: true,
    deepScan: 'parser',
    format: true,
    deepScanNote: 'CSS grammar parser plus checks for duplicate properties and empty rules.',
  },
  scss: {
    id: 'scss',
    label: 'SCSS',
    quickScan: true,
    deepScan: 'heuristic',
    format: true,
    deepScanNote: 'Bracket, string and comment checks plus duplicate properties and empty rules. No SCSS parser.',
  },
  json: {
    id: 'json',
    label: 'JSON',
    quickScan: true,
    deepScan: 'parser',
    format: true,
    deepScanNote: 'Strict JSON parser (RFC 8259) with duplicate key detection.',
  },
  java: { id: 'java', label: 'Java', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Structural checks and known problem patterns. No Java compiler: syntax and type errors beyond brackets and strings are not detected.' },
  csharp: { id: 'csharp', label: 'C#', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Structural checks and known problem patterns. No C# compiler: syntax and type errors beyond brackets and strings are not detected.' },
  cpp: { id: 'cpp', label: 'C++', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Structural checks and known problem patterns. No C++ compiler: syntax and type errors beyond brackets and strings are not detected.' },
  c: { id: 'c', label: 'C', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Structural checks and known problem patterns. No C compiler: syntax and type errors beyond brackets and strings are not detected.' },
  php: { id: 'php', label: 'PHP', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Structural checks inside <?php … ?> blocks and known problem patterns. No PHP parser.' },
  sql: { id: 'sql', label: 'SQL', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Bracket and string checks plus risky statement patterns. No database is contacted and no query is run.' },
  bash: { id: 'bash', label: 'Bash', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Quote and bracket checks plus common shell pitfalls. Nothing is executed.' },
  powershell: { id: 'powershell', label: 'PowerShell', quickScan: true, deepScan: 'heuristic', format: false, deepScanNote: 'Quote, comment and bracket checks only. Nothing is executed.' },
  yaml: { id: 'yaml', label: 'YAML', quickScan: true, deepScan: 'parser', format: true, deepScanNote: 'YAML grammar parser plus duplicate key and indentation checks. Parser findings are shown as possible problems.' },
  go: { id: 'go', label: 'Go', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  rust: { id: 'rust', label: 'Rust', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  kotlin: { id: 'kotlin', label: 'Kotlin', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  swift: { id: 'swift', label: 'Swift', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  lua: { id: 'lua', label: 'Lua / Luau', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  ruby: { id: 'ruby', label: 'Ruby', quickScan: false, deepScan: false, format: false, deepScanNote: '' },
  xml: { id: 'xml', label: 'XML', quickScan: true, deepScan: false, format: false, deepScanNote: '' },
  toml: { id: 'toml', label: 'TOML', quickScan: false, deepScan: false, format: false, deepScanNote: '' },
  dockerfile: { id: 'dockerfile', label: 'Dockerfile', quickScan: false, deepScan: false, format: false, deepScanNote: '' },
  plaintext: { id: 'plaintext', label: 'Plain text', quickScan: false, deepScan: false, format: false, deepScanNote: '' },
};

export const CODE_LANGUAGES: CodeLanguage[] = CODE_LANGUAGE_IDS.map((id) => LANGUAGES[id]);

export function getCodeLanguage(id: CodeLanguageId): CodeLanguage {
  return LANGUAGES[id];
}

export function isCodeLanguageId(value: unknown): value is CodeLanguageId {
  return typeof value === 'string' && (CODE_LANGUAGE_IDS as readonly string[]).includes(value);
}

/** Free-text language names (as stored on snippets) → Code Tester language. */
const ALIASES: Record<string, CodeLanguageId> = {
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  'node.js': 'javascript',
  nodejs: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  htm: 'html',
  sass: 'scss',
  jsonc: 'json',
  'c#': 'csharp',
  cs: 'csharp',
  'c sharp': 'csharp',
  'c++': 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  h: 'c',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  terminal: 'bash',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  luau: 'lua',
  'lua / luau': 'lua',
  rb: 'ruby',
  svg: 'xml',
  docker: 'dockerfile',
  text: 'plaintext',
  txt: 'plaintext',
  'plain text': 'plaintext',
};

/** The Code Tester language for a snippet's free-text language, or `null` when VOID does not know it. */
export function resolveCodeLanguage(name: string): CodeLanguageId | null {
  const key = name.trim().toLowerCase();
  if (isCodeLanguageId(key)) return key;
  return ALIASES[key] ?? null;
}

/** The maximum the Code Tester accepts, so editing and analysis stay fast. */
export const MAX_CODE_LINES = 2000;

export function countLines(code: string): number {
  if (code === '') return 1;
  let lines = 1;
  for (let index = 0; index < code.length; index += 1) if (code.charCodeAt(index) === 10) lines += 1;
  return lines;
}

export function exceedsLineLimit(code: string, limit = MAX_CODE_LINES): boolean {
  return countLines(code) > limit;
}
