import { describe, it, expect } from 'vitest';
import { scoreExam, scorePuzzle } from '../src/lib/scoring.js';

const sol = [
  { code: 'n = 5', indent: 0 },
  { code: 'for i in range(1, 11):', indent: 0 },
  { code: 'print(n * i)', indent: 1 },
  { code: 'print("done")', indent: 0 },
];

describe('scorePuzzle', () => {
  it('gives 100 for the exact solution', () => {
    expect(scorePuzzle(sol, sol)).toBe(100);
  });

  it('counts correctly placed slots: one swapped pair loses two slots', () => {
    const swapped = [sol[0]!, sol[2]!, sol[1]!, sol[3]!];
    expect(scorePuzzle(sol, swapped)).toBe(50);
  });

  it('is strict about position: a missing early line shifts and fails everything after it', () => {
    expect(scorePuzzle(sol, sol.slice(1))).toBe(0);
  });

  it('scores a red herring in a slot as wrong', () => {
    const withHerring = [sol[0]!, sol[1]!, sol[2]!, { code: 'print(n)', indent: 1 }];
    expect(scorePuzzle(sol, withHerring)).toBe(75);
  });

  it('requires the right indentation', () => {
    const flat = [sol[0]!, sol[1]!, { code: 'print(n * i)', indent: 0 }, sol[3]!];
    expect(scorePuzzle(sol, flat)).toBe(75);
  });

  it('gives 0 for nothing placed and ignores extra pieces past the end', () => {
    expect(scorePuzzle(sol, [])).toBe(0);
    expect(scorePuzzle(sol, [...sol, { code: 'extra', indent: 0 }])).toBe(100);
  });

  it('treats identical lines as interchangeable', () => {
    const twice = [{ code: 'pass', indent: 1 }, { code: 'pass', indent: 1 }];
    expect(scorePuzzle(twice, twice)).toBe(100);
  });

  it('rounds to two decimals', () => {
    const three = [{ code: 'a', indent: 0 }, { code: 'b', indent: 0 }, { code: 'c', indent: 0 }];
    expect(scorePuzzle(three, [three[0]!])).toBe(33.33);
  });

  it('gives 0 when the solution is empty', () => {
    expect(scorePuzzle([], [])).toBe(0);
  });
});

describe('scoreExam', () => {
  it('averages puzzles equally, untouched ones count as 0', () => {
    expect(scoreExam([100, 75, 60])).toBe(78.33);
    expect(scoreExam([100, 0])).toBe(50);
  });

  it('rounds once at the end, not per puzzle', () => {
    // 100 and 2/3: rounding the second first would give 83.34
    expect(scoreExam([100, (2 / 3) * 100])).toBe(83.33);
  });

  it('handles no puzzles', () => {
    expect(scoreExam([])).toBe(0);
  });
});
