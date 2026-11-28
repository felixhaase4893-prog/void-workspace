/**
 * The result of a static code analysis. The Code Tester never runs code: every
 * finding comes from reading the text (scanners, parsers, the TypeScript
 * checker in syntax-only mode). Findings that cannot be decided reliably are
 * worded as "possible" and never shown as a certain error.
 */

import { localized } from '../../i18n/translate';

export const FINDING_CATEGORIES = ['error', 'warning', 'info', 'suggestion'] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_CATEGORY_LABELS = localized<FindingCategory>({
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
  suggestion: 'Suggestions',
});

export const FINDING_CATEGORY_SINGULAR = localized<FindingCategory>({
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  suggestion: 'Suggestion',
});

/** How much a finding matters within its category. */
export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  /** Stable within one analysis; used as React key. */
  id: string;
  /** Machine name of the check, e.g. `unclosed-bracket`. */
  rule: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  /** 1-based line the editor jumps to. */
  line: number;
  /** 1-based column, when known. */
  column: number;
  /** Optional hint how to improve the code. Never applied automatically. */
  suggestion?: string;
}

export type FindingInput = Omit<Finding, 'id' | 'severity'> & { severity?: FindingSeverity };

const DEFAULT_SEVERITY: Record<FindingCategory, FindingSeverity> = {
  error: 'high',
  warning: 'medium',
  info: 'low',
  suggestion: 'low',
};

export function finding(input: FindingInput): Finding {
  return {
    ...input,
    severity: input.severity ?? DEFAULT_SEVERITY[input.category],
    id: `${input.rule}:${input.line}:${input.column}`,
  };
}

const CATEGORY_ORDER: Record<FindingCategory, number> = { error: 0, warning: 1, info: 2, suggestion: 3 };

/** Sorted by line, then by importance; duplicates of the same rule at the same place are dropped. */
export function normalizeFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const item of findings) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique.sort((a, b) => a.line - b.line || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.column - b.column);
}

export type FindingCounts = Record<FindingCategory, number>;

export function countFindings(findings: readonly Finding[]): FindingCounts {
  const counts: FindingCounts = { error: 0, warning: 0, info: 0, suggestion: 0 };
  for (const item of findings) counts[item.category] += 1;
  return counts;
}
