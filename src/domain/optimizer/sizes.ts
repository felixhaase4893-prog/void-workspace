import type { CleanupCandidate, CleanupEstimate, CleanupLocationScan } from './models';

/**
 * Size calculation for cleanup candidates.
 *
 *   totalBytes = sum of all unique cleanup candidates
 *
 * A file counts once even if it was found twice (two locations, two
 * recommendations, or hard links to the same data). The result is always an
 * estimate of what could potentially be freed, never a guarantee.
 */

/** Keeps the first candidate of every physical file. */
export function dedupeCandidates(candidates: readonly CleanupCandidate[]): { unique: CleanupCandidate[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: CleanupCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.physicalKey)) continue;
    seen.add(candidate.physicalKey);
    unique.push(candidate);
  }
  return { unique, duplicateCount: candidates.length - unique.length };
}

export function sumUniqueBytes(candidates: readonly CleanupCandidate[]): number {
  return dedupeCandidates(candidates).unique.reduce((total, candidate) => total + candidate.sizeBytes, 0);
}

/**
 * How much the estimate can be trusted: lower when many files could not be
 * read or were skipped, or when the scan stopped at its file limit.
 */
export function estimateConfidence(candidateCount: number, uncertainCount: number, limitReached: boolean): CleanupEstimate['confidence'] {
  if (limitReached) return 'low';
  const total = candidateCount + uncertainCount;
  if (total === 0) return 'high';
  const share = uncertainCount / total;
  if (share <= 0.05) return 'high';
  if (share <= 0.25) return 'medium';
  return 'low';
}

export function buildCleanupEstimate(locations: readonly CleanupLocationScan[]): CleanupEstimate {
  const { unique, duplicateCount } = dedupeCandidates(locations.flatMap((location) => location.candidates));
  const inaccessibleCount = locations.reduce((total, location) => total + location.inaccessibleCount, 0);
  // Recently changed files are counted as skipped too: they are real files we deliberately leave alone.
  const skippedCount = locations.reduce((total, location) => total + location.skipped.reduce((sum, item) => sum + item.count, 0), 0);
  const occupiedBytes = locations.reduce((total, location) => total + location.occupiedBytes, 0);
  const limitReached = locations.some((location) => location.limitReached);
  return {
    candidateCount: unique.length,
    totalBytes: unique.reduce((total, candidate) => total + candidate.sizeBytes, 0),
    occupiedBytes,
    inaccessibleCount,
    skippedCount,
    duplicateCount,
    confidence: estimateConfidence(unique.length, inaccessibleCount, limitReached),
  };
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** All optimizer numbers use English formatting ("1,234.5"). */
export const NUMBER_LOCALE = 'en-US';

/** "1,234" / "12.5" – at most one decimal. */
export function formatNumber(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 1 });
}

/** "1.8 GB" – binary steps (as Windows Explorer shows sizes). The page passes its own locale; the engine always writes English. */
export function formatBytes(value: number, locale: string = NUMBER_LOCALE): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  let unit = 0;
  let amount = value;
  while (amount >= 1024 && unit < UNITS.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : amount >= 100 ? 0 : 1;
  return `${amount.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

/** Small deterministic hash (FNV-1a, 32 bit, base 36) for stable ids. Not for security. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Two independent 32-bit hashes, so collisions between thousands of files are practically impossible. */
export function stableId(value: string): string {
  return `${stableHash(value)}${stableHash(`${value.length}:${value}`)}`.slice(0, 16);
}
