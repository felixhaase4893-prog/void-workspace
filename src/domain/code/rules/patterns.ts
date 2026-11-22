import { finding, type Finding } from '../findings';
import type { CodeLanguageId } from '../languages';
import { matchAll } from './common';

/**
 * Pattern checks on masked code (comment and string contents blanked). Each
 * one targets a construct that is almost always a mistake or a known risk, and
 * is worded as such: these are hints, not compiler errors.
 */

function assignmentInCondition(masked: string): Finding[] {
  return matchAll(masked, /\b(if|while)\s*\(\s*[A-Za-z_$][\w$.]*\s*=(?![=>])/, (match, line, column) =>
    finding({
      rule: 'assignment-in-condition',
      category: 'warning',
      title: 'Assignment in condition',
      description: `The ${match[1]} condition assigns a value with = instead of comparing it. This is usually a typo for == or ===.`,
      line,
      column,
      suggestion: 'Use a comparison operator, or wrap the assignment in extra parentheses if it is intended.',
    }),
  );
}

function emptyCatch(masked: string, original: string): Finding[] {
  return matchAll(masked, /\bcatch\b\s*(\([^)]*\))?\s*\{\s*\}/, (match, line, column) => {
    // A comment inside the block documents that ignoring the error is intended.
    const body = original.slice(match.index, match.index + match[0].length);
    if (/\/\/|\/\*|#/.test(body.slice(body.indexOf('{')))) return null;
    return finding({
      rule: 'empty-catch',
      category: 'warning',
      title: 'Empty catch block',
      description: 'Errors caught here are silently ignored, which makes problems hard to find.',
      line,
      column,
      suggestion: 'Handle or log the error, or add a comment explaining why it is safe to ignore.',
    });
  });
}

function javaRules(masked: string): Finding[] {
  return matchAll(masked, /(?:==|!=)\s*"|"\s*(?:==|!=)/, (_match, line, column) =>
    finding({
      rule: 'string-reference-compare',
      category: 'warning',
      title: 'String compared with ==',
      description: 'In Java, == compares object references, not text. Two equal strings can still be different objects.',
      line,
      column,
      suggestion: 'Use .equals(...) to compare the text.',
    }),
  );
}

function csharpRules(masked: string): Finding[] {
  return matchAll(masked, /\basync\s+void\s+(\w+)\s*\(([^)]*)\)/, (match, line, column) => {
    if (/EventArgs\b/.test(match[2] ?? '')) return null; // event handlers are the accepted exception
    return finding({
      rule: 'async-void',
      category: 'warning',
      title: 'async void method',
      description: `Exceptions thrown in ${match[1]} cannot be awaited or caught by the caller, and can crash the process.`,
      line,
      column,
      suggestion: 'Return Task instead of void, unless this is an event handler.',
    });
  });
}

function cRules(masked: string, language: 'c' | 'cpp'): Finding[] {
  const findings = matchAll(masked, /\bgets\s*\(/, (_match, line, column) =>
    finding({
      rule: 'unsafe-gets',
      category: 'warning',
      severity: 'high',
      title: 'gets() is unsafe',
      description: 'gets() cannot limit how much it reads and was removed from C11 and C++14. It is a classic buffer overflow source.',
      line,
      column,
      suggestion: 'Use fgets(buffer, size, stdin) instead.',
    }),
  );
  if (language === 'cpp') {
    findings.push(
      ...matchAll(masked, /^\s*using\s+namespace\s+std\s*;/m, (_match, line, column) =>
        finding({
          rule: 'using-namespace-std',
          category: 'suggestion',
          title: 'using namespace std',
          description: 'Pulling the whole std namespace in can cause name clashes, especially in headers.',
          line,
          column,
          suggestion: 'Prefer std:: prefixes or targeted using declarations.',
        }),
      ),
    );
  }
  return findings;
}

function phpRules(masked: string, code: string): Finding[] {
  const findings = matchAll(masked, /\bmysql_\w+\s*\(/, (match, line, column) =>
    finding({
      rule: 'removed-mysql-api',
      category: 'warning',
      severity: 'high',
      title: 'Removed mysql_* function',
      description: `${match[0].replace(/\s*\($/, '')} belongs to the old mysql extension, which was removed in PHP 7.`,
      line,
      column,
      suggestion: 'Use PDO or mysqli with prepared statements.',
    }),
  );
  findings.push(
    ...matchAll(masked, /(?<![\w$>])eval\s*\(/, (_match, line, column) =>
      finding({
        rule: 'eval',
        category: 'warning',
        title: 'eval()',
        description: 'eval runs text as code. With any outside input this is a code injection risk.',
        line,
        column,
      }),
    ),
  );
  if (!/<\?(php|=)/.test(code) && /\$\w+\s*=/.test(masked)) {
    findings.push(
      finding({
        rule: 'missing-php-tag',
        category: 'info',
        title: 'No <?php tag',
        description: 'The code has no opening <?php tag. That is fine for a fragment, but a .php file needs it.',
        line: 1,
        column: 1,
      }),
    );
  }
  return findings;
}

function sqlRules(masked: string): Finding[] {
  const findings: Finding[] = [];
  // Split into statements at semicolons (strings are blanked, so a ; inside a string never splits).
  let offset = 0;
  for (const statement of masked.split(';')) {
    const start = offset;
    offset += statement.length + 1;
    const text = statement.trim();
    if (text === '') continue;
    const leading = statement.length - statement.trimStart().length;
    const position = masked.slice(0, start + leading);
    const line = position.split('\n').length;
    const column = start + leading - position.lastIndexOf('\n');
    if (/^delete\s+from\b/i.test(text) && !/\bwhere\b/i.test(text)) {
      findings.push(
        finding({
          rule: 'delete-without-where',
          category: 'warning',
          severity: 'high',
          title: 'DELETE without WHERE',
          description: 'This statement deletes every row of the table.',
          line,
          column,
          suggestion: 'Add a WHERE clause, or use TRUNCATE if emptying the table is intended.',
        }),
      );
    }
    if (/^update\b[\s\S]*\bset\b/i.test(text) && !/\bwhere\b/i.test(text)) {
      findings.push(
        finding({
          rule: 'update-without-where',
          category: 'warning',
          severity: 'high',
          title: 'UPDATE without WHERE',
          description: 'This statement changes every row of the table.',
          line,
          column,
          suggestion: 'Add a WHERE clause that limits the rows.',
        }),
      );
    }
  }
  findings.push(
    ...matchAll(masked, /\bselect\s+(distinct\s+)?\*/i, (_match, line, column) =>
      finding({
        rule: 'select-star',
        category: 'info',
        title: 'SELECT *',
        description: 'Selecting every column returns more data than needed and breaks silently when columns change.',
        line,
        column,
        suggestion: 'List the columns you need.',
      }),
    ),
    ...matchAll(masked, /(?:=|<>|!=)\s*null\b/i, (_match, line, column) =>
      finding({
        rule: 'null-comparison',
        category: 'warning',
        title: 'Comparison with NULL',
        description: 'A comparison with NULL using =, <> or != is never true in SQL.',
        line,
        column,
        suggestion: 'Use IS NULL or IS NOT NULL.',
      }),
    ),
  );
  return findings;
}

function bashRules(masked: string, code: string): Finding[] {
  const findings: Finding[] = [];
  const lineCount = code.split('\n').filter((line) => line.trim() !== '').length;
  if (lineCount > 2 && !code.startsWith('#!')) {
    findings.push(
      finding({
        rule: 'missing-shebang',
        category: 'info',
        title: 'No shebang line',
        description: 'Without a first line like #!/usr/bin/env bash, the script runs in whatever shell starts it.',
        line: 1,
        column: 1,
        suggestion: 'Start the script with #!/usr/bin/env bash.',
      }),
    );
  }
  findings.push(
    ...matchAll(masked, /\brm\s+-[a-zA-Z]*\s+\$\{?\w+\}?\//, (_match, line, column) =>
      finding({
        rule: 'rm-unquoted-variable',
        category: 'warning',
        severity: 'high',
        title: 'rm with an unquoted variable path',
        description: 'If the variable is empty, this path becomes / and the command deletes from the root directory.',
        line,
        column,
        suggestion: 'Quote the variable and guard it, e.g. rm -rf "${DIR:?}/".',
      }),
    ),
    ...matchAll(masked, /\[\s+\$\{?\w+\}?\s/, (_match, line, column) =>
      finding({
        rule: 'unquoted-test-variable',
        category: 'warning',
        title: 'Unquoted variable in [ ]',
        description: 'If the variable is empty or contains spaces, the test breaks or tests something else.',
        line,
        column,
        suggestion: 'Quote it: [ "$var" ... ], or use [[ ]].',
      }),
    ),
    ...matchAll(masked, /^\s*cd\s+[^|&;\n]+$/m, (_match, line, column) =>
      finding({
        rule: 'cd-without-check',
        category: 'suggestion',
        title: 'cd without a check',
        description: 'If cd fails, the following commands run in the wrong directory.',
        line,
        column,
        suggestion: 'Use cd dir || exit.',
      }),
    ),
    ...matchAll(masked, /`/, (_match, line, column) =>
      finding({
        rule: 'backticks',
        category: 'suggestion',
        title: 'Backtick command substitution',
        description: 'Backticks are hard to nest and read.',
        line,
        column,
        suggestion: 'Use $( ... ) instead.',
      }),
      1,
    ),
  );
  return findings;
}

/** Language-specific pattern findings for the languages without a real parser. */
export function patternFindings(language: CodeLanguageId, masked: string, code: string): Finding[] {
  switch (language) {
    case 'java':
      return [...assignmentInCondition(masked), ...emptyCatch(masked, code), ...javaRules(masked)];
    case 'csharp':
      return [...assignmentInCondition(masked), ...emptyCatch(masked, code), ...csharpRules(masked)];
    case 'cpp':
    case 'c':
      return [...assignmentInCondition(masked), ...(language === 'cpp' ? emptyCatch(masked, code) : []), ...cRules(masked, language)];
    case 'php':
      return [...assignmentInCondition(masked), ...emptyCatch(masked, code), ...phpRules(masked, code)];
    case 'sql':
      return sqlRules(masked);
    case 'bash':
      return bashRules(masked, code);
    default:
      return [];
  }
}
