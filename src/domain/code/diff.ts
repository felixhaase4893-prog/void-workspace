/**
 * Line diff for the formatter preview (Myers' O(ND) algorithm). Shows exactly
 * which lines the formatter would change, so nothing is altered unnoticed.
 */

export type DiffLine =
  | { kind: 'same'; text: string; oldLine: number; newLine: number }
  | { kind: 'removed'; text: string; oldLine: number }
  | { kind: 'added'; text: string; newLine: number };

export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

/** Above this many edits the exact diff would cost too much memory; the changed block is then shown as replaced. */
const MAX_EDIT_DISTANCE = 1500;

/** Myers' shortest edit script between two line arrays, or null when it needs more than `limit` edits. */
function myers(a: readonly string[], b: readonly string[], limit: number): Array<'same' | 'added' | 'removed'> | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, limit);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;

  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number)) ? (v[offset + k + 1] as number) : (v[offset + k - 1] as number) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;

  const script: Array<'same' | 'added' | 'removed'> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const snapshot = trace[d] as Int32Array;
    const value = (k: number) => snapshot[k + d + 1] as number;
    const k = x - y;
    const previousK = k === -d || (k !== d && value(k - 1) < value(k + 1)) ? k + 1 : k - 1;
    const previousX = d === 0 ? 0 : value(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      script.push('same');
    }
    if (d > 0) {
      if (x === previousX) {
        y -= 1;
        script.push('added');
      } else {
        x -= 1;
        script.push('removed');
      }
    }
  }
  return script.reverse();
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const result: DiffLine[] = [];

  // Unchanged lines at the start and the end need no diffing.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    result.push({ kind: 'same', text: a[start] as string, oldLine: start + 1, newLine: start + 1 });
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  const script = myers(middleA, middleB, MAX_EDIT_DISTANCE) ?? [...middleA.map(() => 'removed' as const), ...middleB.map(() => 'added' as const)];
  let i = 0;
  let j = 0;
  for (const step of script) {
    if (step === 'same') {
      result.push({ kind: 'same', text: middleA[i] as string, oldLine: start + i + 1, newLine: start + j + 1 });
      i += 1;
      j += 1;
    } else if (step === 'removed') {
      result.push({ kind: 'removed', text: middleA[i] as string, oldLine: start + i + 1 });
      i += 1;
    } else {
      result.push({ kind: 'added', text: middleB[j] as string, newLine: start + j + 1 });
      j += 1;
    }
  }

  for (let index = 0; index < a.length - endA; index += 1) {
    result.push({ kind: 'same', text: a[endA + index] as string, oldLine: endA + index + 1, newLine: endB + index + 1 });
  }
  return result;
}

export interface DiffSummary {
  added: number;
  removed: number;
}

export function summarizeDiff(lines: readonly DiffLine[]): DiffSummary {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'added') added += 1;
    else if (line.kind === 'removed') removed += 1;
  }
  return { added, removed };
}
