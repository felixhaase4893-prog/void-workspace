import { describe, expect, it } from 'vitest';

import { markdownToPlainText, parseInline, parseMarkdown, safeLinkUrl } from './markdown';

describe('parseMarkdown blocks', () => {
  it('parses headings of every level', () => {
    expect(parseMarkdown('# One\n### Three ###\n###### Six')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'One' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', text: 'Three' }] },
      { type: 'heading', level: 6, children: [{ type: 'text', text: 'Six' }] },
    ]);
  });

  it('does not treat #hashtags as headings', () => {
    expect(parseMarkdown('#todo later')[0]).toMatchObject({ type: 'paragraph' });
  });

  it('keeps plain notes as paragraphs with their line breaks', () => {
    expect(parseMarkdown('Line one\nLine two\n\nNew paragraph')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'Line one' }, { type: 'break' }, { type: 'text', text: 'Line two' }] },
      { type: 'paragraph', children: [{ type: 'text', text: 'New paragraph' }] },
    ]);
  });

  it('parses bullet, numbered and task lists', () => {
    const [bullets, numbers, tasks] = parseMarkdown('- a\n* b\n\n3. three\n4. four\n\n- [x] done\n- [ ] open');
    expect(bullets).toMatchObject({ type: 'list', ordered: false, items: [{ checked: null }, { checked: null }] });
    expect(numbers).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(numbers?.type === 'list' && numbers.items).toHaveLength(2);
    expect(tasks).toMatchObject({ type: 'list', items: [{ checked: true }, { checked: false }] });
  });

  it('nests indented lists', () => {
    const [list] = parseMarkdown('- parent\n  - child\n- sibling');
    expect(list?.type === 'list' && list.items).toHaveLength(2);
    expect(list).toMatchObject({ items: [{ children: [{ type: 'paragraph' }, { type: 'list', items: [{}] }] }, {}] });
  });

  it('parses fenced code blocks verbatim, including Markdown inside', () => {
    expect(parseMarkdown('```ts\nconst a = **1**;\n# not a heading\n```\nafter')).toEqual([
      { type: 'code', language: 'ts', text: 'const a = **1**;\n# not a heading' },
      { type: 'paragraph', children: [{ type: 'text', text: 'after' }] },
    ]);
  });

  it('treats an unclosed fence as code until the end', () => {
    expect(parseMarkdown('```\nline')).toEqual([{ type: 'code', language: '', text: 'line' }]);
  });

  it('parses quotes and rules', () => {
    expect(parseMarkdown('> quoted\n\n---')).toEqual([
      { type: 'quote', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'quoted' }] }] },
      { type: 'rule' },
    ]);
  });

  it('handles Windows line endings', () => {
    expect(parseMarkdown('# A\r\nb')).toHaveLength(2);
  });

  it('survives deeply nested hostile input', () => {
    expect(() => parseMarkdown('>'.repeat(5000) + ' x')).not.toThrow();
    expect(() => parseMarkdown('*'.repeat(20000))).not.toThrow();
    expect(() => parseMarkdown('['.repeat(5000))).not.toThrow();
  });
});

describe('parseInline', () => {
  it('parses bold, italic, strikethrough and inline code', () => {
    expect(parseInline('**b** *i* _j_ ~~s~~ `c`')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'j' }] },
      { type: 'text', text: ' ' },
      { type: 'del', children: [{ type: 'text', text: 's' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
    ]);
  });

  it('nests emphasis', () => {
    expect(parseInline('**bold *and italic***')[0]).toMatchObject({ type: 'strong', children: [{ type: 'text' }, { type: 'em' }] });
  });

  it('leaves snake_case, lone stars and math alone', () => {
    expect(parseInline('my_var_name and 2 * 3 * 4')).toEqual([{ type: 'text', text: 'my_var_name and 2 * 3 * 4' }]);
  });

  it('does not format inside inline code', () => {
    expect(parseInline('`**x**`')).toEqual([{ type: 'code', text: '**x**' }]);
  });

  it('supports backslash escapes', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([{ type: 'text', text: '*not italic*' }]);
  });

  it('turns http(s) links, autolinks and bare URLs into links', () => {
    expect(parseInline('[Docs](https://example.com/a?b=1)')).toEqual([
      { type: 'link', href: 'https://example.com/a?b=1', children: [{ type: 'text', text: 'Docs' }] },
    ]);
    expect(parseInline('<https://void.app>')[0]).toMatchObject({ type: 'link', href: 'https://void.app/' });
    expect(parseInline('see https://example.com/x.')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', href: 'https://example.com/x', children: [{ type: 'text', text: 'https://example.com/x' }] },
      { type: 'text', text: '.' },
    ]);
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///C:/secret.txt', '/relative', 'vbscript:x'])(
    'never turns %s into a link',
    (url) => {
      const nodes = parseInline(`[click](${url})`);
      expect(JSON.stringify(nodes)).not.toContain('"link"');
    },
  );

  it('keeps raw HTML as plain text', () => {
    expect(parseInline('<img src=x onerror=alert(1)><script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)><script>alert(1)</script>' },
    ]);
  });
});

describe('safeLinkUrl', () => {
  it('accepts only http and https', () => {
    expect(safeLinkUrl('https://example.com')).toBe('https://example.com/');
    expect(safeLinkUrl(' http://localhost:5173/x ')).toBe('http://localhost:5173/x');
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeLinkUrl('mailto:a@b.c')).toBeNull();
    expect(safeLinkUrl('https://')).toBeNull();
  });
});

describe('markdownToPlainText', () => {
  it('strips the syntax but keeps the words', () => {
    expect(markdownToPlainText('# Title\n\n**bold** and [link](https://x.dev)\n\n- item')).toBe('Title\nbold and link\nitem');
  });
});
