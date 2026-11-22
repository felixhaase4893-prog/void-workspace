/**
 * A small, dependency-free Markdown parser for notes.
 *
 * It turns note text into a plain data tree (no HTML strings), which the UI
 * renders as React elements. Raw HTML in a note is never interpreted: it
 * simply shows up as text. Links are only kept for http(s) URLs; anything
 * else (javascript:, data:, file:, relative paths, ...) is shown as plain text.
 *
 * Supported: headings, paragraphs with line breaks, **bold**, *italic*,
 * ~~strikethrough~~, `inline code`, fenced code blocks, bullet, numbered and
 * task lists (nestable by indentation), block quotes, horizontal rules,
 * [links](https://…), <https://…> and bare https:// URLs.
 */

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'del'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] }
  | { type: 'break' };

export interface MarkdownListItem {
  /** `null` for a normal item, `true`/`false` for a task list item (`- [x]` / `- [ ]`). */
  checked: boolean | null;
  children: MarkdownBlock[];
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownListItem[] }
  | { type: 'quote'; children: MarkdownBlock[] }
  | { type: 'rule' };

/** Deeper nesting than this is shown as text, so hostile input cannot exhaust the stack. */
const MAX_DEPTH = 12;

/* ---------- Links ---------- */

/** Returns a normalised http(s) URL, or `null` for anything that must not become a link. */
export function safeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/* ---------- Blocks ---------- */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^( {0,3})([-*+])([ \t]+)(.*)$/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+)(.*)$/;
const EMPTY_BULLET = /^( {0,3})([-*+])[ \t]*$/;
const EMPTY_ORDERED = /^( {0,3})(\d{1,9})[.)][ \t]*$/;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function listMarker(line: string): { ordered: boolean; start: number; contentOffset: number; content: string } | null {
  const bullet = BULLET.exec(line);
  if (bullet) {
    const [, indent = '', marker = '', space = '', content = ''] = bullet;
    return { ordered: false, start: 1, contentOffset: indent.length + marker.length + Math.min(space.length, 4), content };
  }
  const ordered = ORDERED.exec(line);
  if (ordered) {
    const [, indent = '', digits = '', dot = '', space = '', content = ''] = ordered;
    return { ordered: true, start: Number(digits), contentOffset: indent.length + digits.length + dot.length + Math.min(space.length, 4), content };
  }
  const emptyBullet = EMPTY_BULLET.exec(line);
  if (emptyBullet) return { ordered: false, start: 1, contentOffset: (emptyBullet[1] ?? '').length + 2, content: '' };
  const emptyOrdered = EMPTY_ORDERED.exec(line);
  if (emptyOrdered) {
    const digits = emptyOrdered[2] ?? '1';
    return { ordered: true, start: Number(digits), contentOffset: (emptyOrdered[1] ?? '').length + digits.length + 2, content: '' };
  }
  return null;
}

/** Lines that end a paragraph because they start another block. */
function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line);
}

/** Removes up to `width` leading spaces (a tab counts as four). */
function dedent(line: string, width: number): string {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < width) {
    const char = line[index];
    if (char === ' ') removed += 1;
    else if (char === '\t') removed += 4;
    else break;
    index += 1;
  }
  return line.slice(index);
}

function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
}

function parseBlocks(lines: string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const language = fence[2] ?? '';
      const fenceIndent = indentOf(line);
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const trimmed = current.trim();
        if (trimmed.length >= marker.length && trimmed === (marker[0] ?? '`').repeat(trimmed.length)) {
          i += 1;
          break;
        }
        body.push(dedent(current, fenceIndent));
        i += 1;
      }
      blocks.push({ type: 'code', language, text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: 'heading', level, children: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    if (depth < MAX_DEPTH && QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const match = QUOTE.exec(lines[i] ?? '');
        if (!match) break;
        inner.push(match[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1) });
      continue;
    }

    const first = depth < MAX_DEPTH ? listMarker(line) : null;
    if (first) {
      const items: MarkdownListItem[] = [];
      while (i < lines.length) {
        const marker = listMarker(lines[i] ?? '');
        if (!marker || marker.ordered !== first.ordered) break;
        const itemLines = [marker.content];
        i += 1;
        // Continuation: indented lines, and blank lines followed by indented lines.
        while (i < lines.length) {
          const current = lines[i] ?? '';
          if (isBlank(current)) {
            const next = lines[i + 1];
            if (next !== undefined && !isBlank(next) && indentOf(next) >= marker.contentOffset) {
              itemLines.push('');
              i += 1;
              continue;
            }
            break;
          }
          if (indentOf(current) >= Math.min(marker.contentOffset, 2) && !listMarkerAtLevel(current, marker.contentOffset)) {
            itemLines.push(dedent(current, marker.contentOffset));
            i += 1;
            continue;
          }
          // Lazy continuation of the item's paragraph.
          if (!startsBlock(current) && indentOf(current) === 0 && itemLines[itemLines.length - 1] !== '') {
            itemLines.push(current);
            i += 1;
            continue;
          }
          break;
        }
        items.push(toListItem(itemLines, depth));
        // A single blank line between items keeps the list going.
        if (isBlank(lines[i] ?? 'x') && listMarker(lines[i + 1] ?? '')?.ordered === first.ordered && indentOf(lines[i + 1] ?? '') < 4) i += 1;
      }
      blocks.push({ type: 'list', ordered: first.ordered, start: first.start, items });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && !isBlank(lines[i] ?? '') && !startsBlock(lines[i] ?? '')) {
      paragraph.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.map((part) => part.trim()).join('\n')) });
  }

  return blocks;
}

/** A sibling item of the current list (same indentation level), as opposed to a nested one. */
function listMarkerAtLevel(line: string, contentOffset: number): boolean {
  return listMarker(line) !== null && indentOf(line) < contentOffset;
}

function toListItem(itemLines: string[], depth: number): MarkdownListItem {
  const firstLine = itemLines[0] ?? '';
  const task = /^\[([ xX])\][ \t]+(.*)$/.exec(firstLine) ?? /^\[([ xX])\]$/.exec(firstLine);
  const checked = task ? (task[1] ?? ' ').toLowerCase() === 'x' : null;
  const lines = task ? [task[2] ?? '', ...itemLines.slice(1)] : itemLines;
  return { checked, children: parseBlocks(lines, depth + 1) };
}

/* ---------- Inline ---------- */

const ESCAPABLE = new Set('\\`*_{}[]()#+-.!~<>|"\''.split(''));
const BARE_URL = /^https?:\/\/[^\s<>"'`]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/** Finds the closing delimiter for emphasis that starts at `from`, or -1. */
function findCloser(text: string, delimiter: string, from: number): number {
  const single = delimiter.length === 1;
  let index = from;
  while (index < text.length) {
    const found = text.indexOf(delimiter, index);
    if (found === -1) return -1;
    const before = text[found - 1];
    const after = text[found + delimiter.length];
    const doubledSingle = single && (after === delimiter || before === delimiter);
    const validEnd = found > from && before !== ' ' && before !== '\t' && before !== '\n';
    const intraword = delimiter[0] === '_' && isWordChar(after);
    if (!doubledSingle && validEnd && !intraword) {
      // In `***` after inner emphasis (`**a *b***`) the double delimiter is the last two characters.
      if (!single && text[found + delimiter.length] === delimiter[0]) return found + 1;
      return found;
    }
    index = found + 1;
  }
  return -1;
}

/** Index of the `]` that closes the `[` at `open`, honouring nesting and escapes. */
function findLabelEnd(text: string, open: number): number {
  let level = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
    } else if (char === '`') {
      const close = text.indexOf('`', index + 1);
      if (close !== -1) index = close;
    } else if (char === '[') {
      level += 1;
    } else if (char === ']') {
      level -= 1;
      if (level === 0) return index;
    } else if (char === '\n' && text[index + 1] === '\n') {
      return -1;
    }
  }
  return -1;
}

export function parseInline(text: string, allowLinks = true, depth = 0): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };
  const nested = (inner: string, links = allowLinks) => (depth >= MAX_DEPTH ? [{ type: 'text' as const, text: inner }] : parseInline(inner, links, depth + 1));

  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? '';
    const rest = text.slice(i);

    if (char === '\\' && i + 1 < text.length && ESCAPABLE.has(text[i + 1] ?? '')) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === '\n') {
      flush();
      nodes.push({ type: 'break' });
      i += 1;
      continue;
    }

    if (char === '`') {
      const run = /^`+/.exec(rest)?.[0] ?? '`';
      const close = text.indexOf(run, i + run.length);
      // The closing run must be exactly as long as the opening one.
      if (close !== -1 && text[close + run.length] !== '`') {
        let code = text.slice(i + run.length, close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1);
        flush();
        nodes.push({ type: 'code', text: code });
        i = close + run.length;
        continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }

    if (char === '[' && allowLinks) {
      const labelEnd = findLabelEnd(text, i);
      if (labelEnd !== -1 && text[labelEnd + 1] === '(') {
        const destination = /^\(\s*<?([^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(text.slice(labelEnd + 1));
        if (destination) {
          const label = text.slice(i + 1, labelEnd);
          const href = safeLinkUrl(destination[1] ?? '');
          flush();
          // An unsafe or relative target keeps only its label, as plain formatted text.
          if (href) nodes.push({ type: 'link', href, children: nested(label, false) });
          else nodes.push(...nested(label, false));
          i = labelEnd + 1 + destination[0].length;
          continue;
        }
      }
    }

    if (char === '<' && allowLinks) {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(rest);
      const href = auto ? safeLinkUrl(auto[1] ?? '') : null;
      if (auto && href) {
        flush();
        nodes.push({ type: 'link', href, children: [{ type: 'text', text: auto[1] ?? '' }] });
        i += auto[0].length;
        continue;
      }
    }

    if ((char === 'h' || char === 'H') && allowLinks && !isWordChar(text[i - 1])) {
      const bare = BARE_URL.exec(rest);
      if (bare) {
        const raw = bare[0].replace(TRAILING_PUNCTUATION, '');
        const href = safeLinkUrl(raw);
        if (href && raw.length > 'https://'.length) {
          flush();
          nodes.push({ type: 'link', href, children: [{ type: 'text', text: raw }] });
          i += raw.length;
          continue;
        }
      }
    }

    const double = rest.slice(0, 2);
    if (double === '**' || double === '__' || double === '~~') {
      const opensWord = double !== '__' || !isWordChar(text[i - 1]);
      const startsContent = rest[2] !== undefined && !/\s/.test(rest[2]);
      const close = opensWord && startsContent ? findCloser(text, double, i + 2) : -1;
      if (close !== -1) {
        flush();
        const children = nested(text.slice(i + 2, close));
        nodes.push(double === '~~' ? { type: 'del', children } : { type: 'strong', children });
        i = close + 2;
        continue;
      }
      buffer += double;
      i += 2;
      continue;
    }

    if (char === '*' || char === '_') {
      const opensWord = char !== '_' || !isWordChar(text[i - 1]);
      const startsContent = rest[1] !== undefined && !/\s/.test(rest[1]);
      const close = opensWord && startsContent ? findCloser(text, char, i + 1) : -1;
      if (close !== -1) {
        flush();
        nodes.push({ type: 'em', children: nested(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return nodes;
}

/* ---------- Entry points ---------- */

export function parseMarkdown(source: string): MarkdownBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'), 0);
}

/** Plain text of a note without Markdown syntax, e.g. for compact previews. */
export function markdownToPlainText(source: string): string {
  const inlineText = (nodes: MarkdownInline[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
          case 'code':
            return node.text;
          case 'break':
            return '\n';
          default:
            return inlineText(node.children);
        }
      })
      .join('');
  const blockText = (blocks: MarkdownBlock[]): string[] =>
    blocks.flatMap((block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          return [inlineText(block.children)];
        case 'code':
          return [block.text];
        case 'list':
          return block.items.flatMap((item) => blockText(item.children));
        case 'quote':
          return blockText(block.children);
        case 'rule':
          return [];
      }
    });
  return blockText(parseMarkdown(source)).join('\n');
}
