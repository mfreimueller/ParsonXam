export interface Line {
  code: string;
  indent: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Share of solution slots filled with the right line, 0..100.
 * A slot is right when the placed line has the same code and indent as the solution line at that
 * position. Lines are compared by content, so identical lines (two `pass`, two `}`) are
 * interchangeable. Red herrings simply fail their slot; extra pieces past the end are ignored.
 */
export function puzzlePercent(solution: Line[], placed: Line[]): number {
  if (solution.length === 0) return 0;
  let right = 0;
  for (const [i, want] of solution.entries()) {
    const got = placed[i];
    if (got && got.code === want.code && got.indent === want.indent) right++;
  }
  return (right / solution.length) * 100;
}

/** The same, rounded to two decimals for storing and showing. */
export function scorePuzzle(solution: Line[], placed: Line[]): number {
  return round2(puzzlePercent(solution, placed));
}

/**
 * Mean of the puzzle percentages. Pass the unrounded values (puzzlePercent) so rounding happens
 * once, at the end. A puzzle that was never touched counts as 0.
 */
export function scoreExam(puzzleScores: number[]): number {
  if (puzzleScores.length === 0) return 0;
  return round2(puzzleScores.reduce((a, b) => a + b, 0) / puzzleScores.length);
}

export interface TemplateGap {
  expected: string[];
  anyOrder: boolean;
}

/**
 * Which placed pieces of one gap are right. Ordered gaps: the pieces of the longest common
 * subsequence with the expected ones (the backtrack takes the earliest match, so the result is
 * deterministic). Any-order gaps: the multiset intersection, earlier copies first.
 */
export function correctFlags(gap: TemplateGap, placed: string[]): boolean[] {
  const { expected } = gap;
  const flags = placed.map(() => false);
  if (gap.anyOrder) {
    const left = new Map<string, number>();
    for (const e of expected) left.set(e, (left.get(e) ?? 0) + 1);
    for (const [j, text] of placed.entries()) {
      const n = left.get(text) ?? 0;
      if (n > 0) {
        flags[j] = true;
        left.set(text, n - 1);
      }
    }
    return flags;
  }
  // lcs[i][j]: length of the LCS of expected[i..] and placed[j..].
  const lcs = Array.from({ length: expected.length + 1 }, () => new Array<number>(placed.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = placed.length - 1; j >= 0; j--) {
      lcs[i]![j] = expected[i] === placed[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < expected.length && j < placed.length) {
    if (expected[i] === placed[j]) {
      flags[j++] = true;
      i++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  return flags;
}

/**
 * Template puzzles, 0..100: sum of matching pieces over the sum of max(expected, placed) per gap.
 * `placed[g]` holds the piece texts in gap g. Extra, missing and wrong pieces all lower the score;
 * a puzzle with nothing placed scores 0.
 */
export function templatePercent(gaps: TemplateGap[], placed: string[][]): number {
  let match = 0;
  let denom = 0;
  for (const [g, gap] of gaps.entries()) {
    const mine = placed[g] ?? [];
    match += correctFlags(gap, mine).filter(Boolean).length;
    denom += Math.max(gap.expected.length, mine.length);
  }
  return denom === 0 ? 0 : (match / denom) * 100;
}
