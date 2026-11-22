import { describe, expect, it } from 'vitest';

import { analyzeCode, type AnalysisOutcome } from './analyze';
import { countFindings, type Finding } from './findings';
import { CODE_LANGUAGES, countLines, exceedsLineLimit, MAX_CODE_LINES, resolveCodeLanguage } from './languages';

function findings(outcome: AnalysisOutcome): Finding[] {
  if (outcome.status !== 'done') throw new Error(`Expected a finished analysis, got ${outcome.status}`);
  return outcome.findings;
}

const rules = (outcome: AnalysisOutcome) => findings(outcome).map((item) => item.rule);
const errors = (outcome: AnalysisOutcome) => findings(outcome).filter((item) => item.category === 'error');

describe('languages', () => {
  it('lists every priority language with honest capabilities', () => {
    const ids = CODE_LANGUAGES.map((language) => language.id);
    for (const id of ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'java', 'csharp', 'cpp', 'php', 'sql', 'bash', 'yaml']) expect(ids).toContain(id);
    for (const language of CODE_LANGUAGES) {
      if (language.deepScan) expect(language.deepScanNote).not.toBe('');
      if (language.deepScan) expect(language.quickScan).toBe(true);
    }
  });

  it('maps free-text snippet languages to Code Tester languages', () => {
    expect(resolveCodeLanguage('TypeScript')).toBe('typescript');
    expect(resolveCodeLanguage(' tsx ')).toBe('typescript');
    expect(resolveCodeLanguage('C#')).toBe('csharp');
    expect(resolveCodeLanguage('Luau')).toBe('lua');
    expect(resolveCodeLanguage('yml')).toBe('yaml');
    expect(resolveCodeLanguage('Brainfuck')).toBeNull();
  });

  it('counts lines and enforces the 2,000 line limit', () => {
    expect(countLines('')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
    expect(exceedsLineLimit('x\n'.repeat(MAX_CODE_LINES - 1))).toBe(false);
    expect(exceedsLineLimit('x\n'.repeat(MAX_CODE_LINES))).toBe(true);
  });
});

describe('analyzeCode outcomes', () => {
  it('reports an empty editor separately from a clean result', async () => {
    expect((await analyzeCode('   \n', 'python', 'quick')).status).toBe('empty');
    const clean = await analyzeCode('x = 1\nprint(x)\n', 'python', 'quick');
    expect(clean.status).toBe('done');
    expect(findings(clean)).toEqual([]);
  });

  it('says when a language or scan mode is not supported', async () => {
    const ruby = await analyzeCode('puts 1', 'ruby', 'quick');
    expect(ruby).toMatchObject({ status: 'unsupported' });
    const go = await analyzeCode('package main', 'go', 'deep');
    expect(go.status).toBe('unsupported');
    if (go.status === 'unsupported') expect(go.reason).toMatch(/Quick Scan/);
  });

  it('refuses code above the line limit instead of analysing part of it', async () => {
    const outcome = await analyzeCode('a = 1\n'.repeat(MAX_CODE_LINES + 1), 'python', 'quick');
    expect(outcome.status).toBe('failed');
  });

  it('sorts findings by line and gives each a line, title and category', async () => {
    const outcome = await analyzeCode('{\n  "a": 1,\n  "a": 2\n}\n', 'json', 'deep');
    for (const item of findings(outcome)) {
      expect(item.line).toBeGreaterThan(0);
      expect(item.title).not.toBe('');
      expect(['error', 'warning', 'info', 'suggestion']).toContain(item.category);
    }
    expect(countFindings(findings(outcome)).warning).toBe(1);
  });
});

describe('JavaScript and TypeScript', () => {
  it('finds syntax errors with their line', async () => {
    const outcome = await analyzeCode('function f() {\n  const a = [1, 2;\n  return a;\n}\n', 'javascript', 'quick');
    const [first] = errors(outcome);
    expect(first?.line).toBe(2);
  });

  it('accepts JSX in JavaScript and TSX in TypeScript', async () => {
    expect(errors(await analyzeCode("export const App = () => <div>Don't panic {1 + 1}</div>;\n", 'javascript', 'deep'))).toEqual([]);
    expect(errors(await analyzeCode('export const App = (p: { n: number }) => <span>{p.n}</span>;\n', 'typescript', 'deep'))).toEqual([]);
    expect(errors(await analyzeCode('export const n = <number>(window as unknown);\n', 'typescript', 'deep'))).toEqual([]);
  });

  it('finds unused variables, duplicates, unreachable code and constant assignment in Deep Scan only', async () => {
    const code = ['import fs from "fs";', 'export function f(x) {', '  const unused = 1;', '  return x;', '  x++;', '}', 'let a = 1;', 'let a = 2;', 'export const c = 1;', 'c = 2;', ''].join('\n');
    const quick = rules(await analyzeCode(code, 'javascript', 'quick'));
    expect(quick).not.toContain('unused-variable');
    const deep = findings(await analyzeCode(code, 'javascript', 'deep'));
    const byRule = (rule: string) => deep.filter((item) => item.rule === rule);
    expect(byRule('unused-import')[0]?.line).toBe(1);
    expect(byRule('unused-variable')[0]?.line).toBe(3);
    expect(byRule('unreachable-code')[0]?.line).toBe(5);
    expect(byRule('duplicate-declaration').map((item) => item.line)).toEqual([7, 8]);
    expect(byRule('assign-to-constant')[0]?.line).toBe(10);
  });

  it('never reports type errors, because types from other files are unknown', async () => {
    const outcome = await analyzeCode('import { thing } from "./elsewhere";\nexport const value: number = thing.call(document.body, console);\n', 'typescript', 'deep');
    expect(errors(outcome)).toEqual([]);
  });

  it('treats unused top-level code as info and unused parameters as suggestions', async () => {
    const deep = findings(await analyzeCode('const limit = 5;\nexport function helper(a, b) {\n  return a;\n}\n', 'javascript', 'deep'));
    expect(deep.find((item) => item.rule === 'unused-top-level')?.category).toBe('info');
    expect(deep.find((item) => item.rule === 'unused-parameter')?.category).toBe('suggestion');
  });

  it('flags debugger, eval, loose equality and assignment in conditions', async () => {
    const found = rules(await analyzeCode('let x = 1;\nif (x = 2) { debugger; }\nif (x == "2") eval("1");\nif (x == null) {}\n', 'javascript', 'quick'));
    expect(found).toEqual(expect.arrayContaining(['assignment-in-condition', 'debugger', 'loose-equality', 'eval']));
    expect(found.filter((rule) => rule === 'loose-equality')).toHaveLength(1);
  });
});

describe('Python', () => {
  it('finds unclosed brackets and strings', async () => {
    const outcome = await analyzeCode('items = [1, 2\nname = "Ada\n', 'python', 'quick');
    expect(rules(outcome)).toEqual(expect.arrayContaining(['unclosed-string', 'unclosed-bracket']));
  });

  it('checks indentation like the interpreter', async () => {
    const missing = await analyzeCode('def f():\nreturn 1\n', 'python', 'quick');
    expect(errors(missing)[0]).toMatchObject({ rule: 'python-expected-indent', line: 2 });
    const unexpected = await analyzeCode('x = 1\n    y = 2\n', 'python', 'quick');
    expect(errors(unexpected)[0]).toMatchObject({ rule: 'python-unexpected-indent', line: 2 });
    const mismatch = await analyzeCode('if x:\n    a = 1\n  b = 2\n', 'python', 'quick');
    expect(errors(mismatch)[0]).toMatchObject({ rule: 'python-dedent-mismatch', line: 3 });
  });

  it('accepts code copied from inside a class and multi-line brackets', async () => {
    const code = '    def area(self):\n        return (self.w *\n                self.h)\n';
    expect(errors(await analyzeCode(code, 'python', 'deep'))).toEqual([]);
  });

  it('finds unused imports, bare except, mutable defaults and duplicate definitions in Deep Scan', async () => {
    const code = ['import os', 'import sys as system', 'from json import dumps, loads', '', 'def f(items=[]):', '    try:', '        return dumps(items)', '    except:', '        return None', '', 'def f():', '    print(system.argv)', ''].join('\n');
    const found = findings(await analyzeCode(code, 'python', 'deep'));
    const unused = found.filter((item) => item.rule === 'python-unused-import').map((item) => item.title);
    expect(unused).toEqual(['Unused import "os"', 'Unused import "loads"']);
    expect(found.map((item) => item.rule)).toEqual(expect.arrayContaining(['python-bare-except', 'python-mutable-default', 'python-duplicate-definition']));
  });

  it('does not count names in comments as uses but does count f-strings', async () => {
    const used = await analyzeCode('import math\nprint(f"{math.pi}")\n', 'python', 'deep');
    expect(rules(used)).not.toContain('python-unused-import');
    const commentOnly = await analyzeCode('import math\n# math is great\n', 'python', 'deep');
    expect(rules(commentOnly)).toContain('python-unused-import');
  });

  it('does not treat # inside strings as a comment', async () => {
    expect(findings(await analyzeCode('color = "#fff"\nprint(color)\n', 'python', 'deep'))).toEqual([]);
  });
});

describe('JSON', () => {
  it('reports the exact position of syntax errors', async () => {
    const trailing = errors(await analyzeCode('{\n  "a": 1,\n}', 'json', 'quick'));
    expect(trailing[0]).toMatchObject({ title: 'Trailing comma', line: 2 });
    const quotes = errors(await analyzeCode("{'a': 1}", 'json', 'quick'));
    expect(quotes[0]?.title).toMatch(/Single quotes/);
    const comment = errors(await analyzeCode('{\n  // note\n  "a": 1\n}', 'json', 'quick'));
    expect(comment[0]).toMatchObject({ line: 2, title: 'Comments are not allowed in JSON' });
  });

  it('accepts valid JSON', async () => {
    expect(findings(await analyzeCode('{"a": [1, 2.5e3, true, null, "\\u00e9"], "b": {}}', 'json', 'deep'))).toEqual([]);
  });
});

describe('HTML and XML', () => {
  it('respects void elements and optional end tags', async () => {
    const code = '<!DOCTYPE html>\n<html lang="en"><body>\n<ul><li>One<li>Two</ul>\n<p>Text<br><img src="a.png" alt="">\n</body></html>\n';
    expect(findings(await analyzeCode(code, 'html', 'deep'))).toEqual([]);
  });

  it('finds mismatched and unclosed elements', async () => {
    const outcome = await analyzeCode('<div>\n  <span>text</div>\n<section>\n', 'html', 'quick');
    const titles = errors(outcome).map((item) => `${item.line}:${item.title}`);
    expect(titles).toEqual(['2:<span> is not closed', '3:<section> is not closed']);
  });

  it('does not read tags inside scripts', async () => {
    expect(errors(await analyzeCode('<script>if (a < b && c > d) { document.write("<div>"); }</script>', 'html', 'quick'))).toEqual([]);
  });

  it('finds duplicate ids and images without alt text in Deep Scan', async () => {
    const found = rules(await analyzeCode('<div id="a"></div>\n<div id="a"><img src="x.png"></div>\n', 'html', 'deep'));
    expect(found).toEqual(expect.arrayContaining(['duplicate-id', 'img-alt']));
  });

  it('requires a single root element and closed tags in XML', async () => {
    expect(rules(await analyzeCode('<a/>\n<b/>\n', 'xml', 'quick'))).toContain('xml-multiple-roots');
    expect(rules(await analyzeCode('<root><br></root>', 'xml', 'quick'))).toContain('unclosed-element');
  });
});

describe('CSS', () => {
  it('finds unclosed blocks and comments', async () => {
    expect(rules(await analyzeCode('a { color: red;\n/* note\n', 'css', 'quick'))).toEqual(expect.arrayContaining(['unclosed-comment']));
    expect(rules(await analyzeCode('a { color: red;\n', 'css', 'quick'))).toContain('unclosed-bracket');
  });

  it('separates duplicate declarations from deliberate fallbacks', async () => {
    const found = findings(await analyzeCode('a {\n  color: red;\n  color: red;\n  display: flex;\n  display: grid;\n}\n.empty {}\n', 'css', 'deep'));
    expect(found.find((item) => item.rule === 'css-duplicate-property')?.category).toBe('warning');
    expect(found.find((item) => item.rule === 'css-repeated-property')?.category).toBe('info');
    expect(found.find((item) => item.rule === 'css-empty-rule')?.line).toBe(7);
  });

  it('does not mistake url() slashes for comments in SCSS', async () => {
    expect(errors(await analyzeCode('a { background: url(http://x.test/a.png); }\n', 'scss', 'deep'))).toEqual([]);
  });
});

describe('YAML', () => {
  it('reports tabs in indentation as errors', async () => {
    expect(errors(await analyzeCode('a:\n\tb: 1\n', 'yaml', 'quick'))[0]).toMatchObject({ rule: 'yaml-tab-indent', line: 2 });
  });

  it('finds duplicate keys per mapping but not across list items', async () => {
    const code = 'name: a\nitems:\n  - id: 1\n    tag: x\n  - id: 2\n    tag: y\nname: b\n';
    const duplicates = findings(await analyzeCode(code, 'yaml', 'deep')).filter((item) => item.rule === 'yaml-duplicate-key');
    expect(duplicates.map((item) => item.line)).toEqual([7]);
  });

  it('accepts block scalars', async () => {
    expect(errors(await analyzeCode('script: |\n  echo "a: b"\n  echo \'x\'\nnext: 1\n', 'yaml', 'deep'))).toEqual([]);
  });
});

describe('C-family, SQL and shell heuristics', () => {
  it('ignores brackets inside strings, chars and comments', async () => {
    const java = 'class A {\n  String s = "}";\n  char c = \'{\';\n  // )\n  String t = """\n    ( text block\n    """;\n}\n';
    expect(errors(await analyzeCode(java, 'java', 'deep'))).toEqual([]);
  });

  it('finds a missing closing brace and points at the opener', async () => {
    const outcome = await analyzeCode('public class A {\n  void f() {\n    int x = 1;\n}\n', 'csharp', 'quick');
    expect(errors(outcome)[0]).toMatchObject({ rule: 'unclosed-bracket', line: 1 });
  });

  it('handles C# verbatim strings, C++ raw strings and digit separators', async () => {
    expect(errors(await analyzeCode('var p = @"C:\\temp\\";\nvar q = @"say ""hi""";\n', 'csharp', 'quick'))).toEqual([]);
    expect(errors(await analyzeCode('auto s = R"(a ) " ( b)";\nint n = 1\'000\'000;\n', 'cpp', 'quick'))).toEqual([]);
  });

  it('flags Java string comparison and empty catch blocks', async () => {
    const found = rules(await analyzeCode('if (name == "x") {}\ntry { f(); } catch (Exception e) {}\n', 'java', 'deep'));
    expect(found).toEqual(expect.arrayContaining(['string-reference-compare', 'empty-catch']));
  });

  it('flags risky SQL statements', async () => {
    const found = rules(await analyzeCode("DELETE FROM users;\nUPDATE users SET name = 'x' WHERE id = 1;\nSELECT * FROM t WHERE a = NULL;\n", 'sql', 'deep'));
    expect(found.filter((rule) => rule === 'delete-without-where')).toHaveLength(1);
    expect(found).not.toContain('update-without-where');
    expect(found).toEqual(expect.arrayContaining(['select-star', 'null-comparison']));
  });

  it('understands shell quoting, heredocs and case patterns', async () => {
    const script = '#!/usr/bin/env bash\ncase "$1" in\n  start) echo "go" ;;\nesac\ncat <<EOF\nIt\'s (fine\nEOF\necho ${#array[@]}\n';
    expect(errors(await analyzeCode(script, 'bash', 'deep'))).toEqual([]);
    expect(rules(await analyzeCode('echo "unclosed\n', 'bash', 'quick'))).toContain('unclosed-string');
  });

  it('only checks PHP inside <?php blocks', async () => {
    expect(errors(await analyzeCode('<p>Don\'t (</p>\n<?php $a = [1, 2]; ?>\n', 'php', 'deep'))).toEqual([]);
  });

  it('handles Rust lifetimes and Lua long strings', async () => {
    expect(errors(await analyzeCode("fn f<'a>(x: &'a str) -> char { 'x' }\n", 'rust', 'quick'))).toEqual([]);
    expect(errors(await analyzeCode('local s = [[ ( { ]]\n--[[ ) ]]\nprint(s)\n', 'lua', 'quick'))).toEqual([]);
  });

  it('reports TODO comments as info', async () => {
    const outcome = await analyzeCode('int main() {\n  // TODO: handle errors\n  return 0;\n}\n', 'c', 'quick');
    expect(findings(outcome)[0]).toMatchObject({ rule: 'todo-comment', category: 'info', line: 2 });
  });
});
