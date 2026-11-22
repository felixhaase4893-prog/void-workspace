import { finding, type Finding } from './findings';

/**
 * A small, language-configurable lexer. It knows where comments and strings
 * start and end, and nothing else. That is enough to check brackets and quotes
 * reliably (a `}` inside a string or comment never counts) and to give the
 * pattern rules a "masked" copy of the code in which comment and string
 * contents are blanked out, so a rule can never match text inside them.
 */

export interface StringRule {
  open: string;
  close: string;
  /** `\\`: backslash escapes the next character. `double`: the closing quote is written twice (SQL, C# verbatim). */
  escape: '\\' | 'double' | null;
  /** Single-line strings that hit a line end are reported as unclosed. */
  multiline: boolean;
}

export interface BlockCommentRule {
  open: string;
  close: string;
  nested?: boolean;
}

export interface LexerConfig {
  lineComments: string[];
  /** Shell: `#` only starts a comment at the beginning of a word (`${#x}` and `a#b` are not comments). */
  lineCommentsAtWordStart?: boolean;
  blockComments: BlockCommentRule[];
  strings: StringRule[];
  /** Extra syntax that a plain string rule cannot describe. */
  extras?: ReadonlyArray<'rust-char' | 'cpp-raw' | 'cpp-digit-separator' | 'lua-long' | 'shell-heredoc' | 'php-heredoc' | 'scss-url'>;
  /**
   * `strict`: (), [] and {} must match.
   * `shell`: only {} must match; an unmatched `)` is allowed (case patterns), an unclosed `(` is a warning; [] is ignored.
   */
  brackets: 'strict' | 'shell' | 'none';
}

export interface CommentText {
  text: string;
  line: number;
  column: number;
}

export interface ScanResult {
  /** Same length and line breaks as the input; comment and string contents replaced by spaces. String quotes are kept. */
  masked: string;
  /** The code with only the comments blanked out (strings kept). */
  withoutComments: string;
  comments: CommentText[];
  findings: Finding[];
}

const C_LINE = ['//'];
const C_BLOCK: BlockCommentRule[] = [{ open: '/*', close: '*/' }];
const DQ: StringRule = { open: '"', close: '"', escape: '\\', multiline: false };
const SQ: StringRule = { open: "'", close: "'", escape: '\\', multiline: false };

export const LEXERS = {
  cLike: { lineComments: C_LINE, blockComments: C_BLOCK, strings: [DQ, SQ], brackets: 'strict' },
  java: {
    lineComments: C_LINE,
    blockComments: C_BLOCK,
    strings: [{ open: '"""', close: '"""', escape: '\\', multiline: true }, DQ, SQ],
    brackets: 'strict',
  },
  csharp: {
    lineComments: C_LINE,
    blockComments: C_BLOCK,
    strings: [
      { open: '"""', close: '"""', escape: null, multiline: true },
      { open: '@"', close: '"', escape: 'double', multiline: true },
      DQ,
      SQ,
    ],
    brackets: 'strict',
  },
  cpp: { lineComments: C_LINE, blockComments: C_BLOCK, strings: [DQ, SQ], extras: ['cpp-raw', 'cpp-digit-separator'], brackets: 'strict' },
  go: {
    lineComments: C_LINE,
    blockComments: C_BLOCK,
    strings: [{ open: '`', close: '`', escape: null, multiline: true }, DQ, SQ],
    brackets: 'strict',
  },
  rust: {
    lineComments: C_LINE,
    blockComments: [{ open: '/*', close: '*/', nested: true }],
    strings: [{ open: '"', close: '"', escape: '\\', multiline: true }],
    extras: ['rust-char'],
    brackets: 'strict',
  },
  kotlin: {
    lineComments: C_LINE,
    blockComments: [{ open: '/*', close: '*/', nested: true }],
    strings: [{ open: '"""', close: '"""', escape: null, multiline: true }, DQ, SQ],
    brackets: 'strict',
  },
  swift: {
    lineComments: C_LINE,
    blockComments: [{ open: '/*', close: '*/', nested: true }],
    strings: [{ open: '"""', close: '"""', escape: '\\', multiline: true }, DQ],
    brackets: 'strict',
  },
  php: {
    lineComments: ['//', '#'],
    blockComments: C_BLOCK,
    strings: [
      { open: '"', close: '"', escape: '\\', multiline: true },
      { open: "'", close: "'", escape: '\\', multiline: true },
      { open: '`', close: '`', escape: '\\', multiline: true },
    ],
    extras: ['php-heredoc'],
    brackets: 'strict',
  },
  css: {
    lineComments: [],
    blockComments: C_BLOCK,
    strings: [DQ, SQ],
    brackets: 'strict',
  },
  scss: {
    lineComments: ['//'],
    blockComments: C_BLOCK,
    strings: [DQ, SQ],
    extras: ['scss-url'],
    brackets: 'strict',
  },
  python: {
    lineComments: ['#'],
    blockComments: [],
    strings: [
      { open: '"""', close: '"""', escape: '\\', multiline: true },
      { open: "'''", close: "'''", escape: '\\', multiline: true },
      DQ,
      SQ,
    ],
    brackets: 'strict',
  },
  sql: {
    lineComments: ['--'],
    blockComments: C_BLOCK,
    strings: [
      { open: "'", close: "'", escape: 'double', multiline: true },
      { open: '"', close: '"', escape: 'double', multiline: true },
      { open: '`', close: '`', escape: 'double', multiline: true },
    ],
    brackets: 'strict',
  },
  bash: {
    lineComments: ['#'],
    lineCommentsAtWordStart: true,
    blockComments: [],
    strings: [
      { open: "$'", close: "'", escape: '\\', multiline: true },
      { open: "'", close: "'", escape: null, multiline: true },
      { open: '"', close: '"', escape: '\\', multiline: true },
      { open: '`', close: '`', escape: '\\', multiline: true },
    ],
    extras: ['shell-heredoc'],
    brackets: 'shell',
  },
  powershell: {
    lineComments: ['#'],
    blockComments: [{ open: '<#', close: '#>' }],
    strings: [
      { open: '@"', close: '\n"@', escape: null, multiline: true },
      { open: "@'", close: "\n'@", escape: null, multiline: true },
      { open: '"', close: '"', escape: null, multiline: true },
      { open: "'", close: "'", escape: 'double', multiline: true },
    ],
    brackets: 'strict',
  },
  lua: {
    lineComments: ['--'],
    blockComments: [],
    strings: [DQ, SQ, { open: '`', close: '`', escape: '\\', multiline: false }],
    extras: ['lua-long'],
    brackets: 'strict',
  },
} as const satisfies Record<string, LexerConfig>;

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** 1-based line and column for every offset, computed once per scan. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) this.starts.push(index + 1);
  }

  get lineCount(): number {
    return this.starts.length;
  }

  locate(offset: number): { line: number; column: number } {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((this.starts[middle] as number) <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - (this.starts[low] as number) + 1 };
  }
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function startsAt(text: string, index: number, token: string): boolean {
  return text.startsWith(token, index);
}

/** Scans code and reports unclosed strings, comments and brackets. */
export function scanCode(code: string, config: LexerConfig): ScanResult {
  const lines = new LineIndex(code);
  const out = code.split('');
  const comments: CommentText[] = [];
  const findings: Finding[] = [];
  const stripped = code.split('');
  const blank = (from: number, to: number) => {
    for (let index = from; index < to; index += 1) if (out[index] !== '\n' && out[index] !== '\r') out[index] = ' ';
  };
  const blankComment = (from: number, to: number) => {
    blank(from, to);
    for (let index = from; index < to; index += 1) if (stripped[index] !== '\n' && stripped[index] !== '\r') stripped[index] = ' ';
  };
  const at =(offset: number) => lines.locate(offset);
  const strings = [...config.strings].sort((a, b) => b.open.length - a.open.length);
  const blocks = [...config.blockComments].sort((a, b) => b.open.length - a.open.length);
  const extras = new Set<string>(config.extras ?? []);
  const pendingHeredocs: Array<{ tag: string; indented: boolean }> = [];

  let index = 0;
  const length = code.length;

  const skipHeredocBodies = () => {
    // Called right after a line break: consume the bodies of heredocs started on the previous line.
    while (pendingHeredocs.length > 0) {
      const { tag, indented } = pendingHeredocs.shift() as { tag: string; indented: boolean };
      const bodyStart = index;
      let found = false;
      while (index < length) {
        const lineEnd = code.indexOf('\n', index);
        const end = lineEnd === -1 ? length : lineEnd;
        const lineText = code.slice(index, end).replace(/\r$/, '');
        const candidate = indented ? lineText.replace(/^\t+/, '') : lineText;
        if (candidate === tag) {
          blank(bodyStart, index);
          index = lineEnd === -1 ? length : lineEnd + 1;
          found = true;
          break;
        }
        index = lineEnd === -1 ? length : lineEnd + 1;
      }
      if (!found) {
        blank(bodyStart, length);
        const { line, column } = at(bodyStart);
        findings.push(
          finding({
            rule: 'unclosed-heredoc',
            category: 'error',
            title: 'Unclosed heredoc',
            description: `The heredoc that starts here is never ended with a line containing only "${tag}".`,
            line: Math.max(1, line - 1),
            column,
            suggestion: `Add a line with just ${tag} where the text should end.`,
          }),
        );
      }
    }
  };

  while (index < length) {
    const char = code[index] as string;

    if (char === '\n') {
      index += 1;
      if (pendingHeredocs.length > 0) skipHeredocBodies();
      continue;
    }

    // Block comments
    const block = blocks.find((rule) => startsAt(code, index, rule.open));
    if (block) {
      const start = index;
      let depth = 1;
      index += block.open.length;
      while (index < length && depth > 0) {
        if (block.nested && startsAt(code, index, block.open)) {
          depth += 1;
          index += block.open.length;
        } else if (startsAt(code, index, block.close)) {
          depth -= 1;
          index += block.close.length;
        } else index += 1;
      }
      const { line, column } = at(start);
      comments.push({ text: code.slice(start, index), line, column });
      blankComment(start, index);
      if (depth > 0) {
        findings.push(
          finding({
            rule: 'unclosed-comment',
            category: 'error',
            title: 'Unclosed comment',
            description: `This comment starts with ${block.open} but is never closed with ${block.close}, so everything after it is treated as a comment.`,
            line,
            column,
            suggestion: `Close the comment with ${block.close}.`,
          }),
        );
      }
      continue;
    }

    // Lua: --[[ long comments ]] and [[ long strings ]], with optional = levels.
    if (extras.has('lua-long')) {
      const long = /^(--)?\[(=*)\[/.exec(code.slice(index, index + 64));
      if (long) {
        const start = index;
        const close = `]${long[2]}]`;
        const end = code.indexOf(close, index + long[0].length);
        const isComment = Boolean(long[1]);
        const { line, column } = at(start);
        if (end === -1) {
          index = length;
          findings.push(
            finding({
              rule: isComment ? 'unclosed-comment' : 'unclosed-string',
              category: 'error',
              title: isComment ? 'Unclosed comment' : 'Unclosed string',
              description: `This long ${isComment ? 'comment' : 'string'} is never closed with ${close}.`,
              line,
              column,
            }),
          );
        } else index = end + close.length;
        if (isComment) {
          comments.push({ text: code.slice(start, index), line, column });
          blankComment(start, index);
        } else blank(start + long[0].length, Math.max(start + long[0].length, index - close.length));
        continue;
      }
    }

    // Line comments
    const lineComment = config.lineComments.find((token) => startsAt(code, index, token));
    if (
      lineComment &&
      !(config.lineCommentsAtWordStart && index > 0 && !/[\s;&|(]/.test(code[index - 1] as string)) &&
      !(lineComment === '#' && code[index + 1] === '[' && extras.has('php-heredoc')) &&
      !(extras.has('scss-url') && lineComment === '//' && code[index - 1] === ':')
    ) {
      const start = index;
      const end = code.indexOf('\n', index);
      index = end === -1 ? length : end;
      const { line, column } = at(start);
      comments.push({ text: code.slice(start, index), line, column });
      blankComment(start, index);
      continue;
    }

    // Shell heredocs: <<EOF, <<-EOF, <<'EOF', <<"EOF" (but not the <<< here-string).
    if (extras.has('shell-heredoc') && startsAt(code, index, '<<') && code[index + 2] !== '<') {
      const match = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(code.slice(index, index + 80));
      if (match) {
        pendingHeredocs.push({ tag: match[3] as string, indented: match[1] === '-' });
        index += match[0].length;
        continue;
      }
    }

    // PHP heredoc / nowdoc: <<<ID … ID
    if (extras.has('php-heredoc') && startsAt(code, index, '<<<')) {
      const match = /^<<<\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(code.slice(index, index + 80));
      if (match) {
        const tag = match[2] as string;
        const bodyStart = index + match[0].length;
        const endPattern = new RegExp(`^[ \\t]*${tag}\\b`, 'm');
        const rest = code.slice(bodyStart);
        const endMatch = endPattern.exec(rest);
        if (!endMatch) {
          const { line, column } = at(index);
          findings.push(finding({ rule: 'unclosed-heredoc', category: 'error', title: 'Unclosed heredoc', description: `The heredoc is never ended with "${tag}".`, line, column }));
          blank(bodyStart, length);
          index = length;
        } else {
          blank(bodyStart, bodyStart + endMatch.index);
          index = bodyStart + endMatch.index + endMatch[0].length;
        }
        continue;
      }
    }

    // C++ raw strings: R"delim( … )delim"
    if (extras.has('cpp-raw') && !isWordChar(code[index - 1]) && /^(?:u8|[uUL])?R"/.test(code.slice(index, index + 4))) {
      const match = /^(?:u8|[uUL])?R"([^()\\\s]{0,16})\(/.exec(code.slice(index, index + 24));
      if (match) {
        const close = `)${match[1]}"`;
        const start = index;
        const end = code.indexOf(close, index + match[0].length);
        if (end === -1) {
          const { line, column } = at(start);
          findings.push(finding({ rule: 'unclosed-string', category: 'error', title: 'Unclosed raw string', description: `This raw string is never closed with ${close}.`, line, column }));
          blank(start + match[0].length, length);
          index = length;
        } else {
          blank(start + match[0].length, end);
          index = end + close.length;
        }
        continue;
      }
    }

    // C++14 digit separators: 1'000'000
    if (extras.has('cpp-digit-separator') && char === "'" && /[0-9a-fA-F]/.test(code[index - 1] ?? '') && /[0-9a-fA-F]/.test(code[index + 1] ?? '')) {
      const before = /[0-9][0-9a-fA-F'xXbB.]*$/.exec(code.slice(Math.max(0, index - 40), index));
      if (before) {
        index += 1;
        continue;
      }
    }

    // Rust: 'a' / '\n' are chars, 'a (without closing quote) is a lifetime.
    if (extras.has('rust-char') && char === "'") {
      const charLiteral = /^'(?:\\u\{[0-9a-fA-F]{1,6}\}|\\x[0-9a-fA-F]{2}|\\.|[^'\\\n])'/.exec(code.slice(index, index + 16));
      if (charLiteral) {
        blank(index + 1, index + charLiteral[0].length - 1);
        index += charLiteral[0].length;
      } else index += 1;
      continue;
    }

    // Strings
    const rule = strings.find((candidate) => startsAt(code, index, candidate.open));
    if (rule) {
      const start = index;
      index += rule.open.length;
      let closed = false;
      while (index < length) {
        const current = code[index] as string;
        if (rule.escape === '\\' && current === '\\') {
          index += 2;
          continue;
        }
        if (startsAt(code, index, rule.close)) {
          if (rule.escape === 'double' && startsAt(code, index + rule.close.length, rule.close)) {
            index += rule.close.length * 2;
            continue;
          }
          closed = true;
          break;
        }
        if (current === '\n' && !rule.multiline) break;
        index += 1;
      }
      const contentStart = start + rule.open.length;
      const { line, column } = at(start);
      if (closed) {
        blank(contentStart, index);
        index += rule.close.length;
      } else {
        blank(contentStart, index);
        findings.push(
          finding({
            rule: 'unclosed-string',
            category: 'error',
            title: 'Unclosed string',
            description: rule.multiline
              ? `This string starts with ${rule.open.trim()} but is never closed, so the rest of the code is read as text.`
              : `This string starts with ${rule.open} but the line ends before the closing ${rule.close}.`,
            line,
            column,
            suggestion: `Add the closing ${rule.close.trim()}.`,
          }),
        );
      }
      continue;
    }

    index += 1;
  }

  const masked = out.join('');
  if (config.brackets !== 'none') findings.push(...checkBrackets(masked, lines, config.brackets));
  return { masked, withoutComments: stripped.join(''), comments, findings };
}

interface OpenBracket {
  char: string;
  offset: number;
}

/** Bracket matching on masked code. Reports at most a handful of problems so one typo does not flood the list. */
export function checkBrackets(masked: string, lines: LineIndex, policy: 'strict' | 'shell'): Finding[] {
  const findings: Finding[] = [];
  const stack: OpenBracket[] = [];
  const tracked = policy === 'shell' ? /[(){}]/ : /[()[\]{}]/;
  const limit = 5;

  for (let offset = 0; offset < masked.length && findings.length < limit; offset += 1) {
    const char = masked[offset] as string;
    if (!tracked.test(char)) continue;
    if (PAIRS[char]) {
      stack.push({ char, offset });
      continue;
    }
    const opener = CLOSERS[char] as string;
    const top = stack[stack.length - 1];
    if (top && top.char === opener) {
      stack.pop();
      continue;
    }
    if (policy === 'shell' && char === ')') {
      // `case` patterns like `a)` have no opening parenthesis.
      if (!stack.some((entry) => entry.char === '(')) continue;
    }
    const { line, column } = lines.locate(offset);
    const deeper = stack.map((entry) => entry.char).lastIndexOf(opener);
    if (deeper === -1) {
      findings.push(
        finding({
          rule: 'unexpected-bracket',
          category: 'error',
          title: `Unexpected ${char}`,
          description: `There is no open ${opener} for this ${char} to close.`,
          line,
          column,
          suggestion: `Remove the ${char}, or add the missing ${opener} before it.`,
        }),
      );
      continue;
    }
    // A closer for something further out: everything in between was never closed.
    const unclosed = stack.splice(deeper);
    unclosed.shift();
    for (const entry of unclosed.reverse()) {
      const position = lines.locate(entry.offset);
      findings.push(
        finding({
          rule: 'mismatched-bracket',
          category: 'error',
          title: `Unclosed ${entry.char}`,
          description: `This ${entry.char} is not closed before the ${char} on line ${line}.`,
          line: position.line,
          column: position.column,
          suggestion: `Add the missing ${PAIRS[entry.char]}.`,
        }),
      );
    }
  }

  if (findings.length < limit) {
    for (const entry of stack.slice(0, limit - findings.length)) {
      if (policy === 'shell' && entry.char === '(') {
        const { line, column } = lines.locate(entry.offset);
        findings.push(
          finding({
            rule: 'unclosed-bracket',
            category: 'warning',
            title: 'Possibly unclosed (',
            description: 'This ( seems to have no matching ). Shell syntax is flexible, so check this by hand.',
            line,
            column,
          }),
        );
        continue;
      }
      const { line, column } = lines.locate(entry.offset);
      findings.push(
        finding({
          rule: 'unclosed-bracket',
          category: 'error',
          title: `Unclosed ${entry.char}`,
          description: `This ${entry.char} is never closed.`,
          line,
          column,
          suggestion: `Add the matching ${PAIRS[entry.char]}.`,
        }),
      );
    }
  }
  return findings;
}
