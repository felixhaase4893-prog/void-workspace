import { finding, type Finding } from '../findings';
import { LineIndex } from '../scanner';

/**
 * Structure checks for HTML and XML. HTML rules follow the living standard:
 * void elements never close, and elements like <p>, <li> or <td> may omit
 * their end tag. Anything a browser accepts silently by spec is not reported.
 */

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen', 'command']);
const OPTIONAL_END = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'rt', 'rp', 'colgroup', 'caption', 'html', 'head', 'body']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const OBSOLETE = new Set(['center', 'font', 'marquee', 'big', 'strike', 'tt', 'blink', 'frame', 'frameset', 'acronym', 'applet', 'basefont', 'dir']);

interface OpenTag {
  name: string;
  offset: number;
}

interface Tag {
  name: string;
  offset: number;
  closing: boolean;
  selfClosing: boolean;
  attributes: Array<{ name: string; value: string | null; offset: number }>;
}

export interface MarkupOptions {
  mode: 'html' | 'xml';
  deep: boolean;
}

export function markupFindings(code: string, { mode, deep }: MarkupOptions): Finding[] {
  const lines = new LineIndex(code);
  const findings: Finding[] = [];
  const add = (offset: number, input: Omit<Parameters<typeof finding>[0], 'line' | 'column'>) => {
    const { line, column } = lines.locate(offset);
    findings.push(finding({ ...input, line, column }));
  };
  const html = mode === 'html';
  const normalize = (name: string) => (html ? name.toLowerCase() : name);
  const stack: OpenTag[] = [];
  const tags: Tag[] = [];
  let rootElements = 0;
  let index = 0;

  while (index < code.length) {
    const lt = code.indexOf('<', index);
    if (lt === -1) break;
    index = lt;

    if (code.startsWith('<!--', index)) {
      const end = code.indexOf('-->', index + 4);
      if (end === -1) {
        add(index, { rule: 'unclosed-comment', category: 'error', title: 'Unclosed comment', description: 'This comment is never closed with -->, so the rest of the document is hidden.', suggestion: 'Close it with -->.' });
        break;
      }
      index = end + 3;
      continue;
    }
    if (code.startsWith('<![CDATA[', index)) {
      const end = code.indexOf(']]>', index);
      if (end === -1) {
        add(index, { rule: 'unclosed-cdata', category: 'error', title: 'Unclosed CDATA section', description: 'This CDATA section is never closed with ]]>.' });
        break;
      }
      index = end + 3;
      continue;
    }
    if (code.startsWith('<!', index) || code.startsWith('<?', index)) {
      const end = code.indexOf('>', index);
      index = end === -1 ? code.length : end + 1;
      continue;
    }

    const match = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(code.slice(index, index + 200));
    if (!match) {
      index += 1;
      continue;
    }
    const closing = match[1] === '/';
    const name = normalize(match[2] as string);
    const tagStart = index;
    index += match[0].length;

    // Attributes, with quotes respected, up to the closing >.
    const attributes: Tag['attributes'] = [];
    let ended = false;
    let selfClosing = false;
    while (index < code.length) {
      const char = code[index] as string;
      if (char === '>') {
        ended = true;
        index += 1;
        break;
      }
      if (char === '/' && code[index + 1] === '>') {
        selfClosing = true;
        ended = true;
        index += 2;
        break;
      }
      if (char === '<') break; // a new tag starts: this one was never closed
      const attribute = /^([^\s"'>/=]+)(\s*=\s*)?/.exec(code.slice(index, index + 200));
      if (attribute && attribute[1]) {
        const attributeOffset = index;
        index += attribute[0].length;
        let value: string | null = null;
        if (attribute[2]) {
          const quote = code[index];
          if (quote === '"' || quote === "'") {
            const end = code.indexOf(quote, index + 1);
            if (end === -1) {
              add(index, { rule: 'unclosed-attribute', category: 'error', title: 'Unclosed attribute value', description: `The value of ${attribute[1]} starts with ${quote} but is never closed.`, suggestion: `Add the closing ${quote}.` });
              index = code.length;
              break;
            }
            value = code.slice(index + 1, end);
            index = end + 1;
          } else {
            const unquoted = /^[^\s>]*/.exec(code.slice(index))?.[0] ?? '';
            value = unquoted;
            index += unquoted.length;
          }
        }
        attributes.push({ name: normalize(attribute[1]), value, offset: attributeOffset });
        continue;
      }
      index += 1;
    }

    if (!ended) {
      add(tagStart, { rule: 'unclosed-tag', category: 'error', title: `Tag <${closing ? '/' : ''}${name}> is not closed`, description: 'The tag is missing its closing >.', suggestion: 'Add > at the end of the tag.' });
      continue;
    }

    tags.push({ name, offset: tagStart, closing, selfClosing, attributes });

    if (!closing) {
      const seenAttributes = new Set<string>();
      for (const attribute of attributes) {
        if (seenAttributes.has(attribute.name)) {
          add(attribute.offset, { rule: 'duplicate-attribute', category: 'warning', title: `Duplicate attribute "${attribute.name}"`, description: 'The same attribute appears twice on this element. Only one of the values is used.' });
        }
        seenAttributes.add(attribute.name);
      }
    }

    if (closing) {
      if (html && VOID_ELEMENTS.has(name)) {
        add(tagStart, { rule: 'void-end-tag', category: 'warning', title: `</${name}> is not allowed`, description: `<${name}> is a void element and never has an end tag.`, suggestion: `Remove </${name}>.` });
        continue;
      }
      const position = stack.map((entry) => entry.name).lastIndexOf(name);
      if (position === -1) {
        if (html && name === 'p') {
          add(tagStart, { rule: 'stray-end-tag', category: 'warning', title: 'Stray </p>', description: 'There is no open <p> here. Browsers insert an empty paragraph.' });
        } else if (!(html && OPTIONAL_END.has(name))) {
          add(tagStart, { rule: 'stray-end-tag', category: 'error', title: `Unexpected </${name}>`, description: `There is no open <${name}> element for this end tag to close.`, suggestion: `Remove it, or add the missing <${name}>.` });
        }
        continue;
      }
      const unclosed = stack.splice(position);
      unclosed.shift();
      for (const entry of unclosed) {
        if (html && OPTIONAL_END.has(entry.name)) continue;
        const { line } = lines.locate(tagStart);
        add(entry.offset, {
          rule: 'unclosed-element',
          category: 'error',
          title: `<${entry.name}> is not closed`,
          description: `The element is still open when </${name}> on line ${line} closes its parent.`,
          suggestion: `Add </${entry.name}> before </${name}>.`,
        });
      }
      continue;
    }

    if (stack.length === 0 && !closing) rootElements += 1;
    const isVoid = html && VOID_ELEMENTS.has(name);
    if (!selfClosing && !isVoid) {
      // <p> is closed implicitly by a following block element; model the common case of <p> after <p>, <li> after <li>.
      if (html && (name === 'p' || name === 'li' || name === 'dt' || name === 'dd' || name === 'tr' || name === 'td' || name === 'th' || name === 'option')) {
        const top = stack[stack.length - 1];
        if (top && top.name === name) stack.pop();
      }
      stack.push({ name, offset: tagStart });
    }

    if (html && RAW_TEXT.has(name) && !selfClosing) {
      const endPattern = new RegExp(`</${name}\\s*>`, 'i');
      const rest = code.slice(index);
      const end = endPattern.exec(rest);
      if (end) {
        index += end.index;
      } else {
        add(tagStart, { rule: 'unclosed-element', category: 'error', title: `<${name}> is not closed`, description: `Everything after <${name}> is read as its content because </${name}> is missing.`, suggestion: `Add </${name}>.` });
        stack.pop();
        index = code.length;
      }
    }
  }

  for (const entry of stack) {
    if (html && OPTIONAL_END.has(entry.name)) continue;
    add(entry.offset, { rule: 'unclosed-element', category: 'error', title: `<${entry.name}> is not closed`, description: `The document ends while <${entry.name}> is still open.`, suggestion: `Add </${entry.name}>.` });
  }

  if (mode === 'xml' && rootElements > 1) {
    const second = tags.filter((tag) => !tag.closing)[1];
    add(second?.offset ?? 0, { rule: 'xml-multiple-roots', category: 'error', title: 'More than one root element', description: 'An XML document must have exactly one top-level element.', suggestion: 'Wrap the elements in a single root element.' });
  }

  if (deep && html) findings.push(...htmlQualityFindings(code, tags, add));
  return findings;
}

function htmlQualityFindings(code: string, tags: Tag[], add: (offset: number, input: Omit<Parameters<typeof finding>[0], 'line' | 'column'>) => void): Finding[] {
  const ids = new Map<string, number>();
  const lines = new LineIndex(code);
  for (const tag of tags) {
    if (tag.closing) continue;
    for (const attribute of tag.attributes) {
      if (attribute.name !== 'id' || !attribute.value) continue;
      const first = ids.get(attribute.value);
      if (first !== undefined) {
        add(attribute.offset, {
          rule: 'duplicate-id',
          category: 'warning',
          title: `Duplicate id "${attribute.value}"`,
          description: `The id is already used on line ${lines.locate(first).line}. Ids must be unique, or labels, links and scripts pick the wrong element.`,
          suggestion: 'Give each element its own id.',
        });
      } else ids.set(attribute.value, attribute.offset);
    }
    if (tag.name === 'img' && !tag.attributes.some((attribute) => attribute.name === 'alt')) {
      add(tag.offset, { rule: 'img-alt', category: 'suggestion', title: 'Image without alt text', description: 'Screen readers cannot describe this image.', suggestion: 'Add alt="…" (or alt="" for purely decorative images).' });
    }
    if (tag.name === 'html' && !tag.attributes.some((attribute) => attribute.name === 'lang')) {
      add(tag.offset, { rule: 'html-lang', category: 'suggestion', title: '<html> without lang', description: 'The page language helps screen readers and translation tools.', suggestion: 'Add lang="en" (or the page language).' });
    }
    if (OBSOLETE.has(tag.name)) {
      add(tag.offset, { rule: 'obsolete-element', category: 'warning', title: `<${tag.name}> is obsolete`, description: 'This element is no longer part of HTML and may stop working.', suggestion: 'Use CSS for presentation instead.' });
    }
  }
  if (tags.some((tag) => tag.name === 'html' && !tag.closing) && !/^\s*<!doctype html/i.test(code)) {
    add(0, { rule: 'missing-doctype', category: 'info', title: 'No <!DOCTYPE html>', description: 'Without a doctype, browsers render the page in quirks mode.', suggestion: 'Start the document with <!DOCTYPE html>.' });
  }
  return [];
}
