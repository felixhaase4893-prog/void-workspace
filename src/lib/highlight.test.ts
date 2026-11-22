import { describe, expect, it } from 'vitest';

import { highlightCode, resolveHighlightLanguage } from './highlight';

const SAMPLES: Array<[string, string, string]> = [
  ['JavaScript', 'const answer = 42; // comment', 'hljs-keyword'],
  ['TypeScript', 'interface User { name: string }', 'hljs-keyword'],
  ['Python', 'def greet(name):\n    return f"hi {name}"', 'hljs-keyword'],
  ['Java', 'public class Main { }', 'hljs-keyword'],
  ['HTML', '<div class="a">Hi</div>', 'hljs-tag'],
  ['CSS', '.card { color: red; }', 'hljs-selector-class'],
  ['JSON', '{ "a": 1, "b": true }', 'hljs-attr'],
  ['SQL', 'SELECT id FROM users WHERE id = 1;', 'hljs-keyword'],
  ['Bash', 'echo "hello" && ls -la', 'hljs-built_in'],
  ['C#', 'public void Run() { var x = 1; }', 'hljs-keyword'],
  ['Luau', 'local function jump() return true end', 'hljs-keyword'],
];

describe('highlightCode', () => {
  it.each(SAMPLES)('highlights %s', (language, code, expectedClass) => {
    const tokens = highlightCode(code, language);
    expect(tokens).not.toBeNull();
    expect(tokens?.some((token) => token.classes.includes(expectedClass))).toBe(true);
  });

  it.each(SAMPLES)('keeps %s code byte-for-byte identical', (language, code) => {
    expect(highlightCode(code, language)?.map((token) => token.text).join('')).toBe(code);
  });

  it('keeps whitespace, tabs, unicode and very long lines intact', () => {
    const code = `\tconst s = "äöü 🚀";\r\n${'x'.repeat(5000)}\n\n`;
    expect(highlightCode(code, 'ts')?.map((token) => token.text).join('')).toBe(code);
  });

  it('never produces markup from code', () => {
    const tokens = highlightCode('<script>alert("x")</script>', 'html');
    expect(tokens?.map((token) => token.text).join('')).toBe('<script>alert("x")</script>');
  });

  it('shows unknown languages plain instead of guessing', () => {
    expect(highlightCode('extends Node2D', 'GDScript')).toBeNull();
    expect(highlightCode('anything', '')).toBeNull();
  });
});

describe('resolveHighlightLanguage', () => {
  it('maps the names people type to grammars, ignoring case and spaces', () => {
    expect(resolveHighlightLanguage(' TypeScript ')).toBe('typescript');
    expect(resolveHighlightLanguage('c#')).toBe('csharp');
    expect(resolveHighlightLanguage('Shell')).toBe('bash');
    expect(resolveHighlightLanguage('C++')).toBe('cpp');
    expect(resolveHighlightLanguage('Luau')).toBe('lua');
    expect(resolveHighlightLanguage('Brainfuck')).toBeNull();
  });
});
