import { finding, type Finding } from '../findings';
import { matchAll } from './common';

/**
 * Python checks that work on masked code (strings and comments blanked):
 * indentation (which is syntax in Python) and a few well-known pitfalls.
 */

interface LogicalLine {
  line: number;
  indent: string;
  text: string;
}

/** Lines that start a statement: not inside brackets, not continued with a backslash, not blank. */
function logicalLines(masked: string): LogicalLine[] {
  const result: LogicalLine[] = [];
  let depth = 0;
  let continued = false;
  masked.split('\n').forEach((raw, index) => {
    const text = raw.replace(/\r$/, '');
    const startsStatement = depth === 0 && !continued;
    for (const char of text) {
      if (char === '(' || char === '[' || char === '{') depth += 1;
      else if ((char === ')' || char === ']' || char === '}') && depth > 0) depth -= 1;
    }
    continued = /\\\s*$/.test(text);
    if (!startsStatement || text.trim() === '') return;
    result.push({ line: index + 1, indent: /^[ \t]*/.exec(text)?.[0] ?? '', text: text.trimEnd() });
  });
  return result;
}

/** Width of an indentation, with tabs counted to the next multiple of 8 like Python does. */
function indentWidth(indent: string): number {
  let width = 0;
  for (const char of indent) width = char === '\t' ? width + 8 - (width % 8) : width + 1;
  return width;
}

export function pythonIndentationFindings(masked: string): Finding[] {
  const findings: Finding[] = [];
  const lines = logicalLines(masked);
  const first = lines[0];
  if (!first) return findings;
  // Fragments copied from inside a class or function are indented as a whole; that is not an error.
  const stack = [indentWidth(first.indent)];
  let previous: LogicalLine | null = null;

  for (const current of lines) {
    const width = indentWidth(current.indent);
    const top = stack[stack.length - 1] as number;
    const opensBlock = previous !== null && previous.text.endsWith(':');

    if (current.indent.includes(' ') && current.indent.includes('\t')) {
      findings.push(
        finding({
          rule: 'python-mixed-indent',
          category: 'warning',
          title: 'Tabs and spaces in one indentation',
          description: 'This line is indented with both tabs and spaces. Python 3 raises TabError when they are used inconsistently.',
          line: current.line,
          column: 1,
          suggestion: 'Indent with spaces only (4 per level is the convention).',
        }),
      );
    }

    if (opensBlock && previous) {
      if (width <= top) {
        findings.push(
          finding({
            rule: 'python-expected-indent',
            category: 'error',
            title: 'Expected an indented block',
            description: `The line before ends with ":" and starts a block, but this line is not indented further.`,
            line: current.line,
            column: 1,
            suggestion: 'Indent the block body, or add pass if the block is intentionally empty.',
          }),
        );
      } else stack.push(width);
    } else if (width > top) {
      findings.push(
        finding({
          rule: 'python-unexpected-indent',
          category: 'error',
          title: 'Unexpected indent',
          description: 'This line is indented further than the line before, but no block was started.',
          line: current.line,
          column: 1,
          suggestion: 'Remove the extra indentation.',
        }),
      );
    } else if (width < top) {
      while (stack.length > 1 && (stack[stack.length - 1] as number) > width) stack.pop();
      if ((stack[stack.length - 1] as number) !== width) {
        findings.push(
          finding({
            rule: 'python-dedent-mismatch',
            category: 'error',
            title: 'Indentation does not match',
            description: 'This line is indented less, but not to the level of any enclosing block.',
            line: current.line,
            column: 1,
            suggestion: 'Align it with the block it belongs to.',
          }),
        );
        stack.push(width);
      }
    }
    previous = current;
  }

  const last = lines[lines.length - 1];
  if (last && last.text.endsWith(':')) {
    findings.push(
      finding({
        rule: 'python-expected-indent',
        category: 'error',
        title: 'Expected an indented block',
        description: 'The code ends right after a line that starts a block.',
        line: last.line,
        column: last.text.length,
        suggestion: 'Add the block body, or pass.',
      }),
    );
  }
  return findings;
}

/** Pitfalls every Python linter warns about; all are decided on the masked text alone. */
export function pythonPatternFindings(masked: string): Finding[] {
  return [
    ...matchAll(masked, /^\s*except\s*:/m, (_match, line, column) =>
      finding({
        rule: 'python-bare-except',
        category: 'warning',
        title: 'Bare except',
        description: 'except: also catches KeyboardInterrupt and SystemExit, which hides bugs and makes the program hard to stop.',
        line,
        column,
        suggestion: 'Catch a specific exception, or at least except Exception:.',
      }),
    ),
    ...matchAll(masked, /\bdef\s+\w+\s*\([^)]*?\b(\w+)\s*(?::[^=,)]+)?=\s*(\[\s*\]|\{\s*\}|list\(\)|dict\(\)|set\(\))/, (match, line, column) =>
      finding({
        rule: 'python-mutable-default',
        category: 'warning',
        title: 'Mutable default argument',
        description: `The default value of "${match[1]}" is created once and shared between all calls, so changes leak from one call into the next.`,
        line,
        column,
        suggestion: `Use ${match[1]}=None and create the list or dict inside the function.`,
      }),
    ),
    ...matchAll(masked, /\bis\s+(not\s+)?(?:-?\d|[rbuf]?["'])/, (_match, line, column) =>
      finding({
        rule: 'python-is-literal',
        category: 'warning',
        title: '"is" with a literal',
        description: 'is checks identity, not equality. With numbers and strings the result depends on interpreter details (Python 3.8+ warns about this).',
        line,
        column,
        suggestion: 'Use == or != to compare values.',
      }),
    ),
    ...matchAll(masked, /[=!]=\s*None\b/, (_match, line, column) =>
      finding({
        rule: 'python-none-comparison',
        category: 'suggestion',
        title: 'Comparison with None',
        description: 'PEP 8 recommends comparing with None using is.',
        line,
        column,
        suggestion: 'Write x is None or x is not None.',
      }),
    ),
  ];
}

/** Unused imports and duplicate top-level definitions (Deep Scan). */
export function pythonScopeFindings(masked: string, withoutComments: string): Finding[] {
  const findings: Finding[] = [];
  const lines = masked.split('\n');
  // Strings may legitimately mention imported names (e.g. __all__ = ['x']); then the check is unreliable.
  const hasAll = /^__all__\s*=/m.test(masked);

  const imported: Array<{ name: string; line: number; column: number }> = [];
  lines.forEach((text, index) => {
    if (/^\s/.test(text)) return; // only module level imports
    const plain = /^import\s+(.+)$/.exec(text.trim());
    const from = /^from\s+[\w.]+\s+import\s+\(?([^)]*)\)?\s*$/.exec(text.trim());
    const parts = plain ? plain[1] : from ? from[1] : null;
    if (!parts || parts.includes('*')) return;
    for (const part of parts.split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const alias = /\bas\s+(\w+)$/.exec(piece);
      const name = alias ? alias[1] : plain ? piece.split('.')[0] : piece;
      if (!name || !/^\w+$/.test(name)) continue;
      imported.push({ name, line: index + 1, column: Math.max(1, text.indexOf(name) + 1) });
    }
  });

  if (!hasAll) {
    for (const entry of imported) {
      if (entry.name === '__future__' || entry.name.startsWith('_')) continue;
      const pattern = new RegExp(`(?<![\\w.])${entry.name}\\b`, 'g');
      const uses = (withoutComments.match(pattern) ?? []).length;
      if (uses <= 1) {
        findings.push(
          finding({
            rule: 'python-unused-import',
            category: 'warning',
            title: `Unused import "${entry.name}"`,
            description: `${entry.name} is imported but never used in this code.`,
            line: entry.line,
            column: entry.column,
            suggestion: 'Remove the import if it is not needed.',
          }),
        );
      }
    }
  }

  // def/class defined twice at the same level without a decorator in between (overloads and property setters use decorators).
  const seen = new Map<string, number>();
  let currentIndent = -1;
  lines.forEach((text, index) => {
    const match = /^([ \t]*)(?:async\s+)?(def|class)\s+(\w+)/.exec(text);
    if (!match) return;
    const indent = (match[1] as string).length;
    if (indent !== currentIndent) {
      if (indent < currentIndent || currentIndent === -1) seen.clear();
      currentIndent = indent;
    }
    if (indent > 0) return; // nested scopes are too ambiguous for a text check
    const decorated = index > 0 && /^\s*@/.test(lines[index - 1] ?? '');
    const key = `${match[2]}:${match[3]}`;
    const first = seen.get(key);
    if (first !== undefined && !decorated) {
      findings.push(
        finding({
          rule: 'python-duplicate-definition',
          category: 'warning',
          title: `"${match[3]}" is defined twice`,
          description: `A ${match[2] === 'def' ? 'function' : 'class'} with this name already exists on line ${first}. The second definition replaces the first.`,
          line: index + 1,
          column: indent + 1,
          suggestion: 'Rename or remove one of them.',
        }),
      );
    } else if (!decorated) seen.set(key, index + 1);
  });

  return findings;
}
