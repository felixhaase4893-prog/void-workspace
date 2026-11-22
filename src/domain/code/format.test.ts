import { describe, expect, it } from 'vitest';

import { diffLines, summarizeDiff } from './diff';
import { formatCode } from './format';

describe('formatCode', () => {
  it('formats JavaScript with consistent indentation and spacing', async () => {
    const outcome = await formatCode('function  add(a,b){\nreturn a+b}', 'javascript');
    expect(outcome).toEqual({ status: 'formatted', code: 'function add(a, b) {\n  return a + b;\n}\n', changed: true });
  });

  it('formats TypeScript, TSX, JSON, CSS, SCSS, HTML and YAML', async () => {
    expect(await formatCode('const x:number=1', 'typescript')).toMatchObject({ code: 'const x: number = 1;\n' });
    expect(await formatCode('export const A=()=><div className="a">{1}</div>', 'typescript')).toMatchObject({ status: 'formatted' });
    expect(await formatCode('{"a":1,"b":[1,2]}', 'json')).toMatchObject({ code: '{ "a": 1, "b": [1, 2] }\n' });
    expect(await formatCode('a{color:red;margin:0}', 'css')).toMatchObject({ code: 'a {\n  color: red;\n  margin: 0;\n}\n' });
    expect(await formatCode('a{&:hover{color:red}}', 'scss')).toMatchObject({ status: 'formatted' });
    expect(await formatCode('<div><p>Hi</p></div>', 'html')).toMatchObject({ status: 'formatted' });
    expect(await formatCode('a:   1\nb:\n    - x', 'yaml')).toMatchObject({ code: 'a: 1\nb:\n  - x\n' });
  });

  it('reports already formatted code as unchanged', async () => {
    expect(await formatCode('const a = 1;\n', 'javascript')).toEqual({ status: 'formatted', code: 'const a = 1;\n', changed: false });
  });

  it('refuses languages without reliable formatting', async () => {
    for (const language of ['python', 'java', 'csharp', 'cpp', 'php', 'sql', 'bash'] as const) {
      const outcome = await formatCode('x', language);
      expect(outcome.status).toBe('unsupported');
    }
  });

  it('fails with the line of the syntax error instead of changing broken code', async () => {
    const outcome = await formatCode('const a = {\n  b: 1,\n  c: [\n};\n', 'javascript');
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.line).toBe(4);
      expect(outcome.message).toMatch(/could not be formatted/);
    }
  });
});

describe('diffLines', () => {
  it('marks added, removed and unchanged lines with their numbers', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(lines).toEqual([
      { kind: 'same', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'removed', text: 'b', oldLine: 2 },
      { kind: 'added', text: 'B', newLine: 2 },
      { kind: 'same', text: 'c', oldLine: 3, newLine: 3 },
      { kind: 'added', text: 'd', newLine: 4 },
    ]);
    expect(summarizeDiff(lines)).toEqual({ added: 2, removed: 1 });
  });

  it('returns only unchanged lines for identical text', () => {
    expect(diffLines('x\ny', 'x\ny').every((line) => line.kind === 'same')).toBe(true);
  });

  it('stays correct for large, completely different inputs', () => {
    const before = Array.from({ length: 2000 }, (_, index) => `old ${index}`).join('\n');
    const after = Array.from({ length: 2000 }, (_, index) => `new ${index}`).join('\n');
    const lines = diffLines(before, after);
    expect(summarizeDiff(lines)).toEqual({ added: 2000, removed: 2000 });
  });

  it('rebuilds both texts from the diff', () => {
    const before = 'one\ntwo\nthree\nfour\nfive';
    const after = 'zero\none\nthree\nfour!\nfive\nsix';
    const lines = diffLines(before, after);
    expect(lines.filter((line) => line.kind !== 'added').map((line) => line.text).join('\n')).toBe(before);
    expect(lines.filter((line) => line.kind !== 'removed').map((line) => line.text).join('\n')).toBe(after);
  });
});
