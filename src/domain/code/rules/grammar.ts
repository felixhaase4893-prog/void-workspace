import type { Parser } from '@lezer/common';

import { finding, type Finding } from '../findings';
import { LineIndex } from '../scanner';

/**
 * Syntax checks with the Lezer grammars that CodeMirror uses for highlighting.
 * They recover from errors instead of failing, and a grammar can lag behind
 * the newest language version, so every report is worded as a *possible*
 * syntax error and filed as a warning, never as a certain error.
 */

export type GrammarLanguage = 'python' | 'css' | 'yaml';

async function loadParser(language: GrammarLanguage): Promise<Parser> {
  switch (language) {
    case 'python':
      return (await import('@lezer/python')).parser;
    case 'css':
      return (await import('@lezer/css')).parser;
    case 'yaml':
      return (await import('@lezer/yaml')).parser;
  }
}

const MAX_REPORTS = 5;

export async function grammarFindings(code: string, language: GrammarLanguage): Promise<Finding[]> {
  const parser = await loadParser(language);
  const tree = parser.parse(code);
  const lines = new LineIndex(code);
  const findings: Finding[] = [];
  const reportedLines = new Set<number>();
  tree.iterate({
    enter: (node) => {
      if (findings.length >= MAX_REPORTS) return false;
      if (!node.type.isError) return undefined;
      const { line, column } = lines.locate(Math.min(node.from, Math.max(0, code.length - 1)));
      if (reportedLines.has(line)) return false;
      reportedLines.add(line);
      const snippet = code.slice(node.from, Math.min(node.to, node.from + 24)).split('\n')[0]?.trim();
      findings.push(
        finding({
          rule: 'possible-syntax-error',
          category: 'warning',
          severity: 'high',
          title: 'Possible syntax error',
          description: snippet
            ? `The ${language === 'css' ? 'CSS' : language === 'yaml' ? 'YAML' : 'Python'} parser could not read "${snippet}" here. Check this line; very new syntax can also cause this.`
            : `The ${language === 'css' ? 'CSS' : language === 'yaml' ? 'YAML' : 'Python'} parser expected something else here. Check this line; very new syntax can also cause this.`,
          line,
          column,
        }),
      );
      return false;
    },
  });
  return findings;
}
