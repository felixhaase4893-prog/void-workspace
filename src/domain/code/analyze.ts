import { normalizeFindings, type Finding } from './findings';
import { exceedsLineLimit, getCodeLanguage, MAX_CODE_LINES, type CodeLanguageId } from './languages';
import { commonFindings } from './rules/common';
import { cssBlockFindings } from './rules/css';
import { jsonFindings } from './rules/json';
import { markupFindings } from './rules/markup';
import { patternFindings } from './rules/patterns';
import { pythonIndentationFindings, pythonPatternFindings, pythonScopeFindings } from './rules/python';
import { yamlDuplicateKeyFindings, yamlTabFindings } from './rules/yaml';
import { LEXERS, scanCode, type LexerConfig } from './scanner';

/**
 * The analysis engine of the Code Tester. It is independent of the editor and
 * of React: text and a language in, findings out. Code is only ever read,
 * never executed, and nothing leaves the device.
 */

export type ScanMode = 'quick' | 'deep';

export type AnalysisOutcome =
  | { status: 'done'; language: CodeLanguageId; mode: ScanMode; findings: Finding[]; durationMs: number }
  | { status: 'empty'; language: CodeLanguageId; mode: ScanMode }
  | { status: 'unsupported'; language: CodeLanguageId; mode: ScanMode; reason: string }
  | { status: 'failed'; language: CodeLanguageId; mode: ScanMode; message: string };

const LEXER_FOR: Partial<Record<CodeLanguageId, LexerConfig>> = {
  java: LEXERS.java,
  csharp: LEXERS.csharp,
  cpp: LEXERS.cpp,
  c: LEXERS.cpp,
  php: LEXERS.php,
  css: LEXERS.css,
  scss: LEXERS.scss,
  python: LEXERS.python,
  sql: LEXERS.sql,
  bash: LEXERS.bash,
  powershell: LEXERS.powershell,
  go: LEXERS.go,
  rust: LEXERS.rust,
  kotlin: LEXERS.kotlin,
  swift: LEXERS.swift,
  lua: LEXERS.lua,
};

/** PHP files mix HTML and code; only the parts inside <?php … ?> are PHP. */
function phpOnly(code: string): string {
  if (!/<\?(php|=)?/.test(code)) return code;
  let result = '';
  let inPhp = false;
  let index = 0;
  while (index < code.length) {
    if (!inPhp) {
      const open = code.indexOf('<?', index);
      const end = open === -1 ? code.length : open;
      result += code.slice(index, end).replace(/[^\n]/g, ' ');
      if (open === -1) break;
      const tag = /^<\?(php|=)?/.exec(code.slice(open))?.[0] ?? '<?';
      result += ' '.repeat(tag.length);
      index = open + tag.length;
      inPhp = true;
    } else {
      const close = code.indexOf('?>', index);
      const end = close === -1 ? code.length : close;
      result += code.slice(index, end);
      if (close === -1) break;
      result += '  ';
      index = close + 2;
      inPhp = false;
    }
  }
  return result;
}

function hasPreprocessorBranches(code: string): boolean {
  return /^\s*#\s*(if|ifdef|ifndef|else|elif)\b/m.test(code);
}

async function analyzeLanguage(code: string, language: CodeLanguageId, mode: ScanMode): Promise<Finding[]> {
  const deep = mode === 'deep';
  switch (language) {
    case 'javascript':
    case 'typescript': {
      const { typescriptFindings } = await import('./rules/typescript');
      const scan = scanCode(code, { lineComments: ['//'], blockComments: [{ open: '/*', close: '*/' }], strings: [], brackets: 'none' });
      return [...(await typescriptFindings(code, { language, deep })), ...commonFindings(code, scan.comments)];
    }
    case 'json':
      return [...jsonFindings(code, deep), ...(deep ? commonFindings(code, []).filter((item) => item.rule !== 'mixed-indentation') : [])];
    case 'html':
    case 'xml': {
      const comments = [...code.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => {
        const before = code.slice(0, match.index);
        return { text: match[0], line: before.split('\n').length, column: match.index - before.lastIndexOf('\n') };
      });
      return [...markupFindings(code, { mode: language, deep }), ...commonFindings(code, comments)];
    }
    case 'yaml': {
      const comments = code.split('\n').flatMap((text, index) => {
        const match = /(^|\s)#.*/.exec(text);
        return match ? [{ text: match[0], line: index + 1, column: match.index + 1 }] : [];
      });
      const findings = [...yamlTabFindings(code), ...commonFindings(code, comments).filter((item) => item.rule !== 'mixed-indentation')];
      if (deep) {
        const { grammarFindings } = await import('./rules/grammar');
        findings.push(...yamlDuplicateKeyFindings(code));
        if (!findings.some((item) => item.category === 'error')) findings.push(...(await grammarFindings(code, 'yaml')));
      }
      return findings;
    }
    default:
      break;
  }

  const lexer = LEXER_FOR[language];
  if (!lexer) return [];
  const source = language === 'php' ? phpOnly(code) : code;
  const scan = scanCode(source, lexer);
  let findings = [...scan.findings, ...commonFindings(code, scan.comments, { indentationMatters: language === 'python' })];

  if ((language === 'c' || language === 'cpp') && hasPreprocessorBranches(code)) {
    // #if/#else branches can open a brace twice on purpose; brackets are then only a hint.
    findings = findings.map((item) =>
      item.rule.includes('bracket') && item.category === 'error'
        ? { ...item, category: 'warning' as const, description: `${item.description} The code uses #if/#else branches, so this may be intended.` }
        : item,
    );
  }

  if (language === 'python') {
    findings.push(...pythonIndentationFindings(scan.masked), ...pythonPatternFindings(scan.masked));
    if (deep) {
      findings.push(...pythonScopeFindings(scan.masked, scan.withoutComments));
      // Only ask the grammar when the cheaper checks found no certain error; otherwise it repeats them less clearly.
      if (!findings.some((item) => item.category === 'error')) {
        const { grammarFindings } = await import('./rules/grammar');
        findings.push(...(await grammarFindings(code, 'python')));
      }
    }
    return findings;
  }

  if (language === 'css' || language === 'scss') {
    if (deep) {
      findings.push(...cssBlockFindings(scan.masked));
      if (language === 'css' && !findings.some((item) => item.category === 'error')) {
        const { grammarFindings } = await import('./rules/grammar');
        findings.push(...(await grammarFindings(code, 'css')));
      }
    }
    return findings;
  }

  // Pattern rules are cheap; Quick Scan already runs the high-confidence ones, Deep Scan all of them.
  const patterns = patternFindings(language, scan.masked, source);
  findings.push(...(deep ? patterns : patterns.filter((item) => item.category === 'warning' && item.severity === 'high')));
  return findings;
}

export async function analyzeCode(code: string, language: CodeLanguageId, mode: ScanMode, now: () => number = () => performance.now()): Promise<AnalysisOutcome> {
  const info = getCodeLanguage(language);
  if (mode === 'quick' && !info.quickScan) {
    return { status: 'unsupported', language, mode, reason: `Analysis is not available for ${info.label} yet. Highlighting still works.` };
  }
  if (mode === 'deep' && !info.deepScan) {
    return {
      status: 'unsupported',
      language,
      mode,
      reason: info.quickScan
        ? `Deep Scan is not available for ${info.label}. Quick Scan checks brackets, strings and comments.`
        : `Analysis is not available for ${info.label} yet. Highlighting still works.`,
    };
  }
  if (code.trim() === '') return { status: 'empty', language, mode };
  if (exceedsLineLimit(code)) {
    return { status: 'failed', language, mode, message: `The code has more than ${MAX_CODE_LINES.toLocaleString('en')} lines. Shorten it to analyse it.` };
  }
  const started = now();
  try {
    const findings = normalizeFindings(await analyzeLanguage(code, language, mode));
    return { status: 'done', language, mode, findings, durationMs: Math.max(0, Math.round(now() - started)) };
  } catch (error) {
    return { status: 'failed', language, mode, message: error instanceof Error ? error.message : 'The analysis stopped unexpectedly.' };
  }
}
