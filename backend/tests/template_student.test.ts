import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent, seedMixedExam, type SeededExam } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let classId: number;
let counter = 0;

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  classId = await createClass(anna);
});
beforeEach(() => resetRateLimits());

const json = async <T = Record<string, any>>(res: Response) => (await res.json()) as T;

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

interface Tile {
  pieceId: string;
  text: string;
  reusable: boolean;
}

/** Starts a mixed exam and returns the student plus helpers for the template puzzle. */
async function start(exam: SeededExam) {
  const s = await joinedStudent(exam.code, `Student ${++counter}`);
  const view = await json(await s.call('POST', '/api/student/start', {}));
  const puzzle = view.puzzles[1];
  const tiles: Tile[] = puzzle.pieces;
  const ids = (text: string) => tiles.filter((x) => x.text === text).map((x) => x.pieceId);
  const save = (gaps: unknown) => s.call('PUT', `/api/student/puzzles/${puzzle.id}/state`, { gaps });
  return { s, view, puzzle, tiles, ids, save };
}

describe('student view of a template puzzle', () => {
  it('sends segments, shuffled tiles and kind, and nothing about the solution', async () => {
    const exam = await seedMixedExam(anna, classId);
    const { view, puzzle, tiles } = await start(exam);
    expect(view.puzzles[0].kind).toBe('lines');
    expect(puzzle.kind).toBe('template');
    expect(puzzle.lines[0]).toEqual([{ text: 'class A {' }]);
    expect(puzzle.lines[1]).toEqual([{ text: '    ' }, { gap: 0 }]);
    expect(puzzle.lines[3]).toEqual([{ text: '    ' }, { gap: 1 }]); // the empty gap looks like any other
    expect(puzzle.placed).toEqual({ gaps: {} });
    // @Id @Gen note SELECT id ) ) junk
    expect(tiles.map((x) => x.text).sort()).toEqual([')', ')', '@Gen', '@Id', 'SELECT', 'id', 'junk', 'note']);
    expect(tiles.find((x) => x.text === 'SELECT')!.reusable).toBe(true);
    expect(tiles.find((x) => x.text === 'junk')!.reusable).toBe(false);
  });

  it('never leaks expected texts, ~, herring or empty-gap flags at any step', async () => {
    const exam = await seedMixedExam(anna, classId);
    const { s, view, puzzle, ids, save } = await start(exam);
    const responses = [
      await s.call('GET', '/api/student/attempt'),
      await save({ 0: ids('@Id') }),
      await s.call('GET', '/api/student/attempt'),
      await s.call('POST', '/api/student/submit', {}),
      await s.call('GET', '/api/student/attempt'),
    ];
    const secretKeys = ['expected', 'anyOrder', 'herring', 'empty', 'redHerrings', 'reusableTexts', 'solution', 'correct', 'review', 'submission', 'template'];
    for (const res of [new Response(JSON.stringify(view)), ...responses]) {
      const body = JSON.stringify(await json(res));
      const keys = keysOf(JSON.parse(body));
      for (const k of secretKeys) expect(keys.has(k), `${k} in payload`).toBe(false);
      expect(body).not.toContain('~');
    }
    // Segments are only {text} or {gap}.
    for (const seg of puzzle.lines.flat()) expect(Object.keys(seg)).toHaveLength(1);
  });

  it('shuffles the same way for the same attempt', async () => {
    const exam = await seedMixedExam(anna, classId);
    const { s, tiles } = await start(exam);
    const again = await json(await s.call('GET', '/api/student/attempt'));
    expect(again.puzzles[1].pieces).toEqual(tiles);
  });
});

describe('autosave of template puzzles', () => {
  it('stores gaps and returns them in the next view', async () => {
    const { s, ids, save } = await start(await seedMixedExam(anna, classId));
    const gaps = { 0: [ids('@Gen')[0], ids('@Id')[0]], 2: ids('note') };
    expect((await save(gaps)).status).toBe(200);
    const view = await json(await s.call('GET', '/api/student/attempt'));
    expect(view.puzzles[1].placed).toEqual({ gaps: { '0': gaps[0], '2': gaps[2] } });
  });

  it('accepts a reusable piece several times, in one gap or across gaps', async () => {
    const { ids, save } = await start(await seedMixedExam(anna, classId));
    const sel = ids('SELECT')[0]!;
    expect((await save({ 3: [sel, ids('id')[0], sel], 0: [sel] })).status).toBe(200);
  });

  it.each([
    ['an unknown gap', (x: any) => ({ 9: x.ids('id') })],
    ['a non-numeric gap', (x: any) => ({ a: x.ids('id') })],
    ['a foreign piece', () => ({ 0: ['nope'] })],
    ['a non-reusable piece twice in one gap', (x: any) => ({ 0: [x.ids('id')[0], x.ids('id')[0]] })],
    ['a non-reusable piece in two gaps', (x: any) => ({ 0: x.ids('id'), 2: x.ids('id') })],
    ['more than 20 pieces in a gap', (x: any) => ({ 3: Array(21).fill(x.ids('SELECT')[0]) })],
  ])('rejects %s', async (_name, build) => {
    const x = await start(await seedMixedExam(anna, classId));
    const res = await x.save(build(x));
    expect(res.status).toBe(400);
  });

  it('accepts exactly 20 pieces in a gap', async () => {
    const x = await start(await seedMixedExam(anna, classId));
    expect((await x.save({ 3: Array(20).fill(x.ids('SELECT')[0]) })).status).toBe(200);
  });

  it('accepts two different tiles with the same text in different gaps', async () => {
    const x = await start(await seedMixedExam(anna, classId));
    const [a, b] = x.ids(')');
    expect((await x.save({ 4: [a], 5: [b] })).status).toBe(200);
  });

  it('rejects the wrong body for the kind of puzzle', async () => {
    const x = await start(await seedMixedExam(anna, classId));
    expect((await x.s.call('PUT', `/api/student/puzzles/${x.puzzle.id}/state`, { placed: [] })).status).toBe(400);
    expect((await x.s.call('PUT', `/api/student/puzzles/${x.view.puzzles[0].id}/state`, { gaps: {} })).status).toBe(400);
  });

  it('still saves line puzzles as before', async () => {
    const x = await start(await seedMixedExam(anna, classId));
    const p = x.view.puzzles[0];
    const res = await x.s.call('PUT', `/api/student/puzzles/${p.id}/state`, { placed: [{ pieceId: p.pieces[0].pieceId, indent: 0 }] });
    expect(res.status).toBe(200);
  });
});
