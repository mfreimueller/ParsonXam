export interface Line {
  code: string;
  indent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Share of solution slots filled with the right line, 0..100.
 * A slot is right when the placed line has the same code and indent as the solution line at that
 * position. Lines are compared by content, so identical lines (two `pass`, two `}`) are
 * interchangeable. Red herrings simply fail their slot; extra pieces past the end are ignored.
 */
export function scorePuzzle(solution: Line[], placed: Line[]): number {
  if (solution.length === 0) return 0;
  let right = 0;
  for (const [i, want] of solution.entries()) {
    const got = placed[i];
    if (got && got.code === want.code && got.indent === want.indent) right++;
  }
  return round2((right / solution.length) * 100);
}

/** Mean of the puzzle scores. A puzzle that was never touched counts as 0. */
export function scoreExam(puzzleScores: number[]): number {
  if (puzzleScores.length === 0) return 0;
  return round2(puzzleScores.reduce((a, b) => a + b, 0) / puzzleScores.length);
}
