import { finding, type Finding } from '../findings';
import type { CommentText } from '../scanner';

/** Lines longer than this are hard to read side by side with other code. */
export const LONG_LINE_LIMIT = 160;
const MAX_LONG_LINE_FINDINGS = 5;

/** Checks that make sense for every language: notes left in comments, long lines, whitespace. */
export function commonFindings(code: string, comments: readonly CommentText[], options: { indentationMatters?: boolean } = {}): Finding[] {
  const findings: Finding[] = [];

  for (const comment of comments) {
    const match = /\b(TODO|FIXME|HACK|XXX)\b/.exec(comment.text);
    if (!match) continue;
    const before = comment.text.slice(0, match.index);
    const lineOffset = before.split('\n').length - 1;
    findings.push(
      finding({
        rule: 'todo-comment',
        category: 'info',
        title: `${match[1]} comment`,
        description: 'A note in a comment that marks unfinished or known problematic code.',
        line: comment.line + lineOffset,
        column: lineOffset === 0 ? comment.column + match.index : 1,
      }),
    );
  }

  const lines = code.split('\n');
  let longLines = 0;
  let trailing = 0;
  let firstTrailing = 0;
  let tabIndented = 0;
  let spaceIndented = 0;
  let firstMixed = 0;

  lines.forEach((raw, index) => {
    const text = raw.replace(/\r$/, '');
    const line = index + 1;
    if (text.length > LONG_LINE_LIMIT && longLines < MAX_LONG_LINE_FINDINGS) {
      longLines += 1;
      findings.push(
        finding({
          rule: 'long-line',
          category: 'info',
          title: 'Very long line',
          description: `This line has ${text.length} characters. Lines over ${LONG_LINE_LIMIT} characters are hard to read and review.`,
          line,
          column: LONG_LINE_LIMIT + 1,
          suggestion: 'Split it into several shorter lines.',
        }),
      );
    }
    if (/[ \t]+$/.test(text) && text.trim() !== '') {
      trailing += 1;
      if (firstTrailing === 0) firstTrailing = line;
    }
    const indent = /^[ \t]*/.exec(text)?.[0] ?? '';
    if (text.trim() !== '' && indent.length > 0) {
      if (indent.includes('\t') && indent.includes(' ') && /^ +\t/.test(indent) && firstMixed === 0) firstMixed = line;
      if (indent.startsWith('\t')) tabIndented += 1;
      else spaceIndented += 1;
    }
  });

  if (trailing > 0) {
    findings.push(
      finding({
        rule: 'trailing-whitespace',
        category: 'suggestion',
        title: 'Trailing whitespace',
        description: trailing === 1 ? 'One line ends with spaces or tabs.' : `${trailing} lines end with spaces or tabs. The first one is here.`,
        line: firstTrailing,
        column: 1,
        suggestion: 'Remove the spaces at the end of the lines; many editors can do this on save.',
      }),
    );
  }

  if (tabIndented > 0 && spaceIndented > 0) {
    const first = firstMixed || 1;
    findings.push(
      finding({
        rule: 'mixed-indentation',
        category: options.indentationMatters ? 'warning' : 'suggestion',
        title: 'Tabs and spaces mixed',
        description: options.indentationMatters
          ? `${tabIndented} lines are indented with tabs and ${spaceIndented} with spaces. In this language indentation has meaning, so mixing them can break the code.`
          : `${tabIndented} lines are indented with tabs and ${spaceIndented} with spaces.`,
        line: first,
        column: 1,
        suggestion: 'Use one kind of indentation throughout the file.',
      }),
    );
  }

  return findings;
}

/** Runs a regex over masked code (strings and comments blanked) and reports each match. */
export function matchAll(masked: string, pattern: RegExp, report: (match: RegExpExecArray, line: number, column: number) => Finding | null, limit = 20): Finding[] {
  const findings: Finding[] = [];
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(masked)) && findings.length < limit) {
    const before = masked.slice(0, match.index);
    const line = before.split('\n').length;
    const column = match.index - before.lastIndexOf('\n');
    const result = report(match, line, column);
    if (result) findings.push(result);
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return findings;
}
