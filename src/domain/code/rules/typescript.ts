import type * as TS from 'typescript';

import { finding, type Finding, type FindingCategory } from '../findings';

/**
 * JavaScript and TypeScript analysis with the real TypeScript parser and
 * checker. The checker runs without any library or type information, so it is
 * only asked for things it can decide from this one file: unused and
 * duplicate declarations, unreachable code, fall-through cases, assignments
 * to constants. Type errors are never reported because the types of anything
 * imported or global are unknown here. Nothing is compiled or executed.
 *
 * The TypeScript package is large, so it is loaded only when JS/TS code is
 * analysed for the first time.
 */

type TypeScript = typeof TS;

let loading: Promise<TypeScript> | null = null;

export function loadTypeScript(): Promise<TypeScript> {
  loading ??= import('typescript').then((module) => (module as unknown as { default?: TypeScript }).default ?? (module as unknown as TypeScript));
  return loading;
}

/** Checker diagnostics that do not depend on types from other files, mapped to how they are shown. */
const CHECKER_RULES: Record<number, { rule: string; category: FindingCategory; title: string }> = {
  2300: { rule: 'duplicate-declaration', category: 'error', title: 'Duplicate identifier' },
  2451: { rule: 'duplicate-declaration', category: 'error', title: 'Variable declared twice' },
  2393: { rule: 'duplicate-declaration', category: 'error', title: 'Duplicate function implementation' },
  2588: { rule: 'assign-to-constant', category: 'error', title: 'Assignment to a constant' },
  2448: { rule: 'used-before-declaration', category: 'warning', title: 'Used before its declaration' },
  7027: { rule: 'unreachable-code', category: 'warning', title: 'Unreachable code' },
  7028: { rule: 'unused-label', category: 'info', title: 'Unused label' },
  7029: { rule: 'switch-fallthrough', category: 'warning', title: 'Fall-through in switch' },
  1108: { rule: 'syntax', category: 'error', title: 'return outside a function' },
  1104: { rule: 'syntax', category: 'error', title: 'continue outside a loop' },
  1105: { rule: 'syntax', category: 'error', title: 'break outside a loop or switch' },
  1308: { rule: 'syntax', category: 'error', title: 'await outside an async function' },
};

const UNUSED_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6199, 6205]);

export interface TsAnalysisOptions {
  language: 'javascript' | 'typescript';
  deep: boolean;
}

interface Parsed {
  file: TS.SourceFile;
  fileName: string;
  syntax: readonly TS.Diagnostic[];
}

/**
 * TypeScript code can be plain TS (`<T>x` casts) or TSX (`<div/>`); both are
 * tried and the reading with fewer syntax errors wins. JavaScript always
 * allows JSX, like in React projects.
 */
function parse(ts: TypeScript, code: string, language: TsAnalysisOptions['language']): Parsed {
  const variants = language === 'javascript' ? ['snippet.jsx'] : ['snippet.ts', 'snippet.tsx'];
  let best: Parsed | null = null;
  for (const fileName of variants) {
    const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
    const syntax = (file as unknown as { parseDiagnostics?: TS.Diagnostic[] }).parseDiagnostics ?? [];
    if (!best || syntax.length < best.syntax.length) best = { file, fileName, syntax };
    if (syntax.length === 0) break;
  }
  return best as Parsed;
}

function position(file: TS.SourceFile, start: number | undefined) {
  const { line, character } = file.getLineAndCharacterOfPosition(start ?? 0);
  return { line: line + 1, column: character + 1 };
}

function syntaxSuggestion(message: string): string | undefined {
  if (/'[)}\]]' expected/.test(message)) return 'A closing bracket is missing; check the brackets opened before this point.';
  if (/Unterminated string/.test(message)) return 'Close the string with the same quote it starts with.';
  if (/Unterminated template/.test(message)) return 'Close the template literal with a backtick.';
  if (/';' expected/.test(message)) return 'A semicolon or an operator is missing between two expressions.';
  if (/Unterminated regular expression/.test(message)) return 'Close the regular expression with /.';
  return undefined;
}

function syntaxTitle(message: string): string {
  if (/Unterminated string/.test(message)) return 'Unclosed string';
  if (/Unterminated template/.test(message)) return 'Unclosed template literal';
  if (/'[)}\]]' expected/.test(message)) return 'Missing closing bracket';
  if (/Unterminated regular expression/.test(message)) return 'Unclosed regular expression';
  if (/comment/i.test(message) && /\*\/' expected/.test(message)) return 'Unclosed comment';
  return 'Syntax error';
}

/** True when the identifier at `start` belongs to a declaration inside a function or block, not at the top of the file. */
function isLocalDeclaration(ts: TypeScript, file: TS.SourceFile, start: number): boolean {
  let found: TS.Node | null = null;
  const visit = (node: TS.Node) => {
    if (found || start < node.getFullStart() || start >= node.getEnd()) return;
    if (node.getStart(file) === start && ts.isIdentifier(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Skip the declaration the name belongs to: `function helper` is itself function-like but declared at the top.
  let current: TS.Node | undefined = (found as TS.Node | null)?.parent?.parent;
  while (current && current !== file) {
    if (ts.isFunctionLike(current) || ts.isClassLike(current) || ts.isBlock(current) || ts.isModuleBlock(current)) return true;
    current = current.parent;
  }
  return false;
}

function isParameterAt(ts: TypeScript, file: TS.SourceFile, start: number): boolean {
  let result = false;
  const visit = (node: TS.Node) => {
    if (result || start < node.getFullStart() || start >= node.getEnd()) return;
    if (ts.isParameter(node) && node.name.getStart(file) === start) {
      result = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function isImportAt(ts: TypeScript, file: TS.SourceFile, start: number): boolean {
  return file.statements.some((statement) => ts.isImportDeclaration(statement) && start >= statement.getStart(file) && start < statement.getEnd());
}

/** Readable AST checks: constructs that are legal but usually mistakes. */
function patternFindings(ts: TypeScript, file: TS.SourceFile, language: TsAnalysisOptions['language']): Finding[] {
  const findings: Finding[] = [];
  const at = (node: TS.Node) => position(file, node.getStart(file));
  const visit = (node: TS.Node) => {
    if (findings.length > 60) return;
    if (node.kind === ts.SyntaxKind.DebuggerStatement) {
      findings.push(finding({ rule: 'debugger', category: 'warning', title: 'debugger statement', description: 'This pauses execution whenever developer tools are open. It is usually left over from debugging.', ...at(node), suggestion: 'Remove the debugger statement.' }));
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
      findings.push(finding({ rule: 'eval', category: 'warning', title: 'eval()', description: 'eval runs text as code. With any outside input this is a code injection risk, and it prevents many optimisations.', ...at(node), suggestion: 'Parse data with JSON.parse or restructure the code.' }));
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const loose = operator === ts.SyntaxKind.EqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken;
      const comparesNull = node.left.kind === ts.SyntaxKind.NullKeyword || node.right.kind === ts.SyntaxKind.NullKeyword;
      if (loose && !comparesNull) {
        const strict = operator === ts.SyntaxKind.EqualsEqualsToken ? '===' : '!==';
        findings.push(finding({ rule: 'loose-equality', category: 'suggestion', title: `${node.operatorToken.getText(file)} instead of ${strict}`, description: 'Loose equality converts types before comparing, e.g. 0 == "" is true.', ...position(file, node.operatorToken.getStart(file)), suggestion: `Use ${strict}.` }));
      }
    }
    if ((ts.isIfStatement(node) || ts.isWhileStatement(node)) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      findings.push(finding({ rule: 'assignment-in-condition', category: 'warning', title: 'Assignment in condition', description: 'The condition assigns a value with = instead of comparing it. This is usually a typo for ===.', ...at(node.expression), suggestion: 'Use ===, or wrap the assignment in extra parentheses if it is intended.' }));
    }
    if (ts.isVariableDeclarationList(node) && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0 && !ts.isForInStatement(node.parent) && !ts.isForOfStatement(node.parent)) {
      findings.push(finding({ rule: 'no-var', category: 'suggestion', title: 'var declaration', description: 'var is function-scoped and hoisted, which causes surprising bugs in loops and blocks.', ...at(node), suggestion: 'Use let or const.' }));
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const text = node.block.getFullText(file);
      if (!/\/\/|\/\*/.test(text)) {
        findings.push(finding({ rule: 'empty-catch', category: 'warning', title: 'Empty catch block', description: 'Errors caught here are silently ignored, which makes problems hard to find.', ...at(node), suggestion: 'Handle or log the error, or add a comment explaining why it is safe to ignore.' }));
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console' && ['log', 'debug'].includes(node.expression.name.text)) {
      findings.push(finding({ rule: 'console-log', category: 'info', title: `console.${node.expression.name.text}`, description: 'Debug output left in the code.', ...at(node) }));
    }
    if (language === 'typescript' && node.kind === ts.SyntaxKind.AnyKeyword) {
      findings.push(finding({ rule: 'explicit-any', category: 'suggestion', title: 'any type', description: 'any turns off type checking for this value.', ...at(node), suggestion: 'Use a specific type or unknown.' }));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

function checkerFindings(ts: TypeScript, parsed: Parsed): Finding[] {
  const { file, fileName } = parsed;
  const options: TS.CompilerOptions = {
    noLib: true,
    noEmit: true,
    allowJs: true,
    checkJs: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    noFallthroughCasesInSwitch: true,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ESNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    types: [],
  };
  const host: TS.CompilerHost = {
    getSourceFile: (name) => (name === fileName ? file : undefined),
    writeFile: () => undefined,
    getDefaultLibFileName: () => 'lib.d.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => '/',
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: () => undefined,
    directoryExists: () => true,
    getDirectories: () => [],
  };
  const program = ts.createProgram([fileName], options, host);
  const findings: Finding[] = [];
  for (const diagnostic of program.getSemanticDiagnostics(file)) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const { line, column } = position(file, diagnostic.start);
    if (UNUSED_CODES.has(diagnostic.code)) {
      const start = diagnostic.start ?? 0;
      const name = /'([^']+)'/.exec(message)?.[1] ?? 'This declaration';
      if (isImportAt(ts, file, start)) {
        findings.push(finding({ rule: 'unused-import', category: 'warning', title: `Unused import "${name}"`, description: `${name} is imported but never used.`, line, column, suggestion: 'Remove the import.' }));
      } else if (isParameterAt(ts, file, start)) {
        findings.push(finding({ rule: 'unused-parameter', category: 'suggestion', title: `Unused parameter "${name}"`, description: `${name} is never used in the function body.`, line, column, suggestion: `Remove it, or prefix it with _ (_${name}) if it is required by a signature.` }));
      } else if (isLocalDeclaration(ts, file, start)) {
        findings.push(finding({ rule: 'unused-variable', category: 'warning', title: `"${name}" is never used`, description: `${name} is declared but its value is never read.`, line, column, suggestion: 'Remove it if it is not needed.' }));
      } else {
        findings.push(finding({ rule: 'unused-top-level', category: 'info', title: `"${name}" is not used in this code`, description: `${name} is declared at the top level but not used here. That is fine if another file uses it.`, line, column }));
      }
      continue;
    }
    const rule = CHECKER_RULES[diagnostic.code];
    if (!rule) continue;
    findings.push(finding({ rule: rule.rule, category: rule.category, title: rule.title, description: `${message}.`.replace(/\.\.$/, '.'), line, column }));
  }
  return findings;
}

export async function typescriptFindings(code: string, { language, deep }: TsAnalysisOptions): Promise<Finding[]> {
  const ts = await loadTypeScript();
  const parsed = parse(ts, code, language);
  const findings: Finding[] = parsed.syntax.slice(0, 10).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const suggestion = syntaxSuggestion(message);
    return finding({
      rule: 'syntax',
      category: 'error',
      title: syntaxTitle(message),
      description: `${message}.`.replace(/\.\.$/, '.'),
      ...position(parsed.file, diagnostic.start),
      ...(suggestion ? { suggestion } : {}),
    });
  });
  findings.push(...patternFindings(ts, parsed.file, language));
  // The checker builds on a syntax tree; with syntax errors its results would be guesses.
  if (deep && parsed.syntax.length === 0) findings.push(...checkerFindings(ts, parsed));
  else if (deep) {
    findings.push(
      finding({
        rule: 'deep-checks-skipped',
        category: 'info',
        title: 'Deeper checks skipped',
        description: 'Unused, duplicate and unreachable code are only checked once the syntax errors are fixed, because the results would be unreliable.',
        ...position(parsed.file, parsed.syntax[0]?.start),
      }),
    );
  }
  return findings;
}
