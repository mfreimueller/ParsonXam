import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { correctFlags, templatePercent } from '../src/lib/scoring.js';
import { buildPool, parseTemplate } from '../src/lib/template.js';

const expectedOf = (src: string) => parseTemplate(src).gaps.map((g) => g.expected);
const errorsOf = (src: string) => parseTemplate(src).errors;

describe('parseTemplate', () => {
  it('splits fixed text and gaps, numbering gaps in reading order', () => {
    const p = parseTemplate('int x = {{1}};\nreturn {{x}} + {{y}};');
    expect(p.errors).toEqual([]);
    expect(p.lines).toEqual([
      [{ text: 'int x = ' }, { gap: 0 }, { text: ';' }],
      [{ text: 'return ' }, { gap: 1 }, { text: ' + ' }, { gap: 2 }, { text: ';' }],
    ]);
    expect(p.pieces).toEqual(['1', 'x', 'y']);
  });

  it('joins markers separated by blanks into one gap and keeps their order', () => {
    const p = parseTemplate('{{SELECT}} {{e.name}}\t{{FROM}}{{t}}');
    expect(p.gaps).toEqual([{ index: 0, expected: ['SELECT', 'e.name', 'FROM', 't'], anyOrder: false }]);
  });

  it('keeps pure context lines and blank lines', () => {
    const p = parseTemplate('class A {\n\n}');
    expect(p.lines).toEqual([[{ text: 'class A {' }], [], [{ text: '}' }]]);
    expect(p.gaps).toEqual([]);
  });

  it('turns tabs in the indentation into four spaces and drops trailing blanks', () => {
    const p = parseTemplate('\t\tfoo({{a}})   \t');
    expect(p.lines[0]).toEqual([{ text: '        foo(' }, { gap: 0 }, { text: ')' }]);
  });

  it('trims piece texts and collapses inner whitespace', () => {
    expect(expectedOf('{{  a   \t b  }}')).toEqual([['a b']]);
  });

  it('marks any-order gaps with ~ on the first marker and strips it', () => {
    const p = parseTemplate('{{~@Id}} {{@Gen}}');
    expect(p.gaps).toEqual([{ index: 0, expected: ['@Id', '@Gen'], anyOrder: true }]);
  });

  it('accepts {{}} as an empty gap that is a gap but not a piece', () => {
    const p = parseTemplate('a\n{{}}\nb');
    expect(p.errors).toEqual([]);
    expect(p.gaps).toEqual([{ index: 0, expected: [], anyOrder: false }]);
    expect(p.pieces).toEqual([]);
    expect(p.lines[1]).toEqual([{ gap: 0 }]);
  });

  it('handles escapes', () => {
    const p = parseTemplate('x = \\{{ not a marker }};\n{{a \\}} b}} {{\\~c}}');
    expect(p.errors).toEqual([]);
    expect(p.lines[0]).toEqual([{ text: 'x = {{ not a marker }};' }]);
    expect(p.gaps[0]).toEqual({ index: 0, expected: ['a }} b', '~c'], anyOrder: false });
  });

  it.each([
    ['empty gap next to a marker', '{{}} {{a}}', 1],
    ['empty gap after a marker', 'x\n{{a}}{{}}', 2],
    ['{{~}}', '{{~}}', 1],
    ['blank marker', 'a\nb\n{{  }}', 3],
    ['unclosed marker', 'ok\n{{abc', 2],
    ['~ on a later marker', '{{a}} {{~b}}', 1],
    ['piece too long', `{{${'x'.repeat(201)}}}`, 1],
  ])('reports %s with the line number', (_name, src, line) => {
    const errs = errorsOf(src);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]!.line).toBe(line);
  });

  it('enforces the size limits', () => {
    expect(errorsOf('x\n'.repeat(81))[0]!.line).toBe(81);
    expect(errorsOf('x'.repeat(6001))[0]!.message).toMatch(/6000/);
    const gaps = Array.from({ length: 31 }, (_, i) => `{{p${i}}}`).join('\n');
    expect(errorsOf(gaps).find((e) => /gaps/.test(e.message))!.line).toBe(31);
    const pieces = Array.from({ length: 31 }, (_, i) => `{{p${i}}} x {{q${i}}}`).join('\n').split('\n');
    const many = pieces.slice(0, 30).join('\n') + '\n{{a}}';
    expect(errorsOf(many).find((e) => /pieces/.test(e.message))!.line).toBe(31);
  });
});

describe('buildPool', () => {
  const pool = (src: string, herrings: string[] = [], reusable: string[] = []) => buildPool(parseTemplate(src), herrings, reusable);

  it('gives one tile per occurrence, except reusable texts', () => {
    const { tiles, errors } = pool('{{SELECT}} {{a}}\n{{SELECT}} {{)}}\n{{)}}', ['GROUP BY'], ['SELECT']);
    expect(errors).toEqual([]);
    expect(tiles).toEqual([
      { text: 'SELECT', reusable: true, herring: false },
      { text: 'a', reusable: false, herring: false },
      { text: ')', reusable: false, herring: false },
      { text: ')', reusable: false, herring: false },
      { text: 'GROUP BY', reusable: false, herring: true },
    ]);
  });

  it('accepts reusable red herrings and normalises their text', () => {
    const { tiles, errors } = pool('{{a}}', ['  HAVING   x '], ['HAVING x']);
    expect(errors).toEqual([]);
    expect(tiles[1]).toEqual({ text: 'HAVING x', reusable: true, herring: true });
  });

  it('rejects unknown reusable entries and too many or empty herrings', () => {
    expect(pool('{{a}}', [], ['b']).errors).toHaveLength(1);
    expect(pool('{{a}}', Array.from({ length: 16 }, (_, i) => `h${i}`)).errors).toHaveLength(1);
    expect(pool('{{a}}', ['  ']).errors).toHaveLength(1);
  });
});

describe('templatePercent', () => {
  const ordered = (...expected: string[]) => ({ expected, anyOrder: false });
  const unordered = (...expected: string[]) => ({ expected, anyOrder: true });

  it('is 100 for the solution and for a decoy gap left empty', () => {
    expect(templatePercent([ordered('a', 'b'), ordered()], [['a', 'b'], []])).toBe(100);
  });

  it('counts a missing piece against the expected length', () => {
    expect(templatePercent([ordered('a', 'b')], [['a']])).toBe(50);
  });

  it('counts an extra piece or a red herring against the placed length', () => {
    expect(templatePercent([ordered('a')], [['a', 'x']])).toBe(50);
    expect(templatePercent([ordered('a')], [['herring']])).toBe(0);
  });

  it('penalises anything placed in an empty gap', () => {
    expect(templatePercent([ordered('a'), ordered()], [['a'], ['x']])).toBe(50);
  });

  it('uses the common subsequence for ordered gaps', () => {
    expect(templatePercent([ordered('a', 'b', 'c')], [['b', 'a', 'c']])).toBeCloseTo(66.667, 2);
    expect(templatePercent([ordered('a', 'b')], [['b', 'a']])).toBe(50);
  });

  it('ignores order in any-order gaps', () => {
    expect(templatePercent([unordered('a', 'b')], [['b', 'a']])).toBe(100);
    expect(templatePercent([unordered('a', 'b')], [['b', 'b']])).toBe(50);
  });

  it('scores nothing placed as 0, even with no expected pieces at all', () => {
    expect(templatePercent([ordered('a'), ordered('b')], [[], []])).toBe(0);
    expect(templatePercent([ordered()], [[]])).toBe(0);
  });

  it('accepts a reusable piece placed twice', () => {
    expect(templatePercent([ordered('SELECT'), ordered('SELECT')], [['SELECT'], ['SELECT']])).toBe(100);
  });
});

describe('correctFlags', () => {
  it('flags the earliest-matching pieces of the LCS', () => {
    expect(correctFlags({ expected: ['a', 'b'], anyOrder: false }, ['a', 'a', 'b'])).toEqual([true, false, true]);
    expect(correctFlags({ expected: ['a', 'b'], anyOrder: false }, ['x', 'b', 'a'])).toEqual([false, true, false]);
  });
  it('flags the multiset intersection for any-order gaps', () => {
    expect(correctFlags({ expected: ['a', 'b'], anyOrder: true }, ['b', 'x', 'a', 'a'])).toEqual([true, false, true, false]);
  });
});

describe('teacher copy', () => {
  it('is byte-identical to the backend parser', () => {
    const a = readFileSync(new URL('../src/lib/template.ts', import.meta.url));
    const b = readFileSync(new URL('../../teacher/src/lib/template.ts', import.meta.url));
    expect(b.equals(a)).toBe(true);
  });
});
