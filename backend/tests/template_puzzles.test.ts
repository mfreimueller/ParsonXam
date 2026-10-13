import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let classId: number;
let examId: number;

const json = async <T = Record<string, any>>(res: Response) => (await res.json()) as T;

export const SQL_PUZZLE = {
  kind: 'template',
  title: 'Subquery',
  description: 'Employees earning more than their department average.',
  template: [
    '{{SELECT}} {{e.name}}',
    '{{FROM}} {{employees e}}',
    '{{WHERE}} {{e.salary > (}}',
    '    {{SELECT}} {{AVG(x.salary)}} {{FROM}} {{employees x}}',
    '    {{WHERE}} {{x.dept_id = e.dept_id}}',
    '{{)}}',
  ].join('\n'),
  redHerrings: ['GROUP BY', 'HAVING'],
  reusable: ['SELECT', 'FROM', 'WHERE'],
};

const LINES = {
  title: 'Sum',
  description: '',
  solution: [
    { code: 'a = 1', indent: 0 },
    { code: 'print(a)', indent: 0 },
  ],
  redHerrings: [],
};

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  classId = await createClass(anna);
});

async function freshExam(): Promise<number> {
  const res = await anna.call('POST', `/api/teacher/classes/${classId}/exams`, { title: 'T' });
  return (await json(res)).exam.id;
}
const post = (e: number, body: unknown) => anna.call('POST', `/api/teacher/exams/${e}/puzzles`, body);
const create = async (body: unknown = SQL_PUZZLE, e?: number) => {
  const res = await post(e ?? examId, body);
  expect(res.status).toBe(201);
  return (await json(res)).puzzle;
};

describe('template puzzles: create, read, list', () => {
  beforeAll(async () => {
    examId = await freshExam();
  });

  it('returns the teacher fields plus kind', async () => {
    const p = await create();
    expect(p).toMatchObject({ kind: 'template', title: 'Subquery', template: SQL_PUZZLE.template, redHerrings: ['GROUP BY', 'HAVING'] });
    expect(p.reusable).toEqual(['SELECT', 'FROM', 'WHERE']);
    const again = await json(await anna.call('GET', `/api/teacher/puzzles/${p.id}`));
    expect(again.puzzle).toEqual(p);
  });

  it('builds one pool tile per reusable text and one per other occurrence', async () => {
    const p = await create();
    const tiles = await t.current().db<{ pieceText: string; reusable: number; herring: number }[]>`
      SELECT text AS pieceText, reusable, herring FROM puzzle_pieces WHERE puzzle_id = ${p.id} ORDER BY id`;
    // SELECT, FROM, WHERE once each; e.name, employees e, e.salary > (, AVG, employees x, x.dept_id.., ) ; 2 herrings
    expect(tiles.filter((x) => x.pieceText === 'SELECT')).toHaveLength(1);
    expect(tiles).toHaveLength(3 + 7 + 2);
    expect(tiles.filter((x) => x.herring).map((x) => x.pieceText)).toEqual(['GROUP BY', 'HAVING']);
  });

  it('lists piece and gap counts instead of line counts', async () => {
    await create();
    await post(examId, LINES);
    const list = (await json(await anna.call('GET', `/api/teacher/exams/${examId}/puzzles`))).puzzles;
    const tpl = list.find((p: any) => p.kind === 'template');
    expect(tpl).toMatchObject({ pieceCount: 13, gapCount: 6 });
    expect(tpl.solutionLineCount).toBeUndefined();
    expect(list.find((p: any) => p.kind === 'lines')).toMatchObject({ solutionLineCount: 2 });
  });

  it('keeps the old line body working without kind', async () => {
    const res = await post(examId, LINES);
    expect((await json(res)).puzzle.kind).toBe('lines');
  });
});

describe('template puzzles: validation', () => {
  it.each([
    ['a parse error with its line number', { ...SQL_PUZZLE, template: 'ok {{a}}\nbad {{}} {{b}}' }, /template: line 2: /],
    ['an unclosed marker', { ...SQL_PUZZLE, template: '{{a}}\n{{b' }, /line 2: /],
    ['an unknown reusable entry', { ...SQL_PUZZLE, reusable: ['NOPE'] }, /NOPE/],
    ['too many red herrings', { ...SQL_PUZZLE, redHerrings: Array.from({ length: 16 }, (_, i) => `h${i}`) }, /red herrings/],
    ['an unknown kind', { ...SQL_PUZZLE, kind: 'other' }, /./],
  ])('rejects %s', async (_name, body, message) => {
    const res = await post(await freshExam(), body);
    expect(res.status).toBe(400);
    expect((await json(res)).message).toMatch(message);
  });
});

describe('template puzzles: replace and kind switch', () => {
  it('rewrites the template and its tiles', async () => {
    const e = await freshExam();
    const p = await create(SQL_PUZZLE, e);
    const res = await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, { ...SQL_PUZZLE, template: '{{a}} {{b}}', redHerrings: [], reusable: [] });
    expect(res.status).toBe(200);
    expect((await json(res)).puzzle).toMatchObject({ kind: 'template', template: '{{a}} {{b}}', redHerrings: [], reusable: [] });
    const n = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzle_pieces WHERE puzzle_id = ${p.id}`;
    expect(Number(n[0]!.n)).toBe(2);
  });

  it('switches from template to lines and back, dropping the other kind', async () => {
    const e = await freshExam();
    const p = await create(SQL_PUZZLE, e);
    const toLines = await json(await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, LINES));
    expect(toLines.puzzle.kind).toBe('lines');
    expect(toLines.puzzle.template).toBeUndefined();
    const pieces = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzle_pieces WHERE puzzle_id = ${p.id}`;
    expect(Number(pieces[0]!.n)).toBe(0);

    const back = await json(await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, SQL_PUZZLE));
    expect(back.puzzle.kind).toBe('template');
    const lines = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzle_lines WHERE puzzle_id = ${p.id}`;
    expect(Number(lines[0]!.n)).toBe(0);
  });

  it('is locked once a student has started', async () => {
    const e = await freshExam();
    const p = await create(SQL_PUZZLE, e);
    const now = new Date();
    await t.current().db`UPDATE exams SET opens_at = ${new Date(+now - 3600_000)}, closes_at = ${new Date(+now + 3600_000)} WHERE id = ${e}`;
    expect((await anna.call('POST', `/api/teacher/exams/${e}/publish`, {})).status).toBe(200);
    const code = (await json(await anna.call('GET', `/api/teacher/exams/${e}`))).exam.accessCode;
    const s = await joinedStudent(code, 'Locker');
    await s.call('POST', '/api/student/start', {});
    const res = await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, LINES);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe('EXAM_LOCKED');
  });
});

describe('template puzzles: import and publish', () => {
  it('imports both shapes in one file, all or nothing', async () => {
    const e = await freshExam();
    const ok = await anna.call('POST', `/api/teacher/exams/${e}/puzzles/import`, { puzzles: [LINES, SQL_PUZZLE] });
    expect(ok.status).toBe(201);
    expect((await json(ok)).puzzles.map((p: any) => p.kind)).toEqual(['lines', 'template']);

    const e2 = await freshExam();
    const bad = await anna.call('POST', `/api/teacher/exams/${e2}/puzzles/import`, {
      puzzles: [SQL_PUZZLE, { ...SQL_PUZZLE, template: '{{a}}\n{{}} {{b}}' }],
    });
    expect(bad.status).toBe(400);
    expect((await json(bad)).message).toMatch(/puzzles\.1\.template: line 2/);
    expect((await json(await anna.call('GET', `/api/teacher/exams/${e2}/puzzles`))).puzzles).toEqual([]);
  });

  it('needs at least two solution pieces to publish', async () => {
    const e = await freshExam();
    await anna.call('PUT', `/api/teacher/exams/${e}`, {
      opensAt: new Date(Date.now() + 86400_000).toISOString(),
      closesAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    });
    await create({ ...SQL_PUZZLE, title: 'Tiny', template: 'x = {{1}}\n{{}}', redHerrings: [], reusable: [] }, e);
    const res = await anna.call('POST', `/api/teacher/exams/${e}/publish`, {});
    expect(res.status).toBe(409);
    expect(JSON.stringify(await json(res))).toMatch(/Tiny.*two solution pieces/);
  });
});

describe('migration 0006', () => {
  it('turns existing puzzles into line puzzles', async () => {
    const e = await freshExam();
    const p = (await json(await post(e, LINES))).puzzle;
    const db = t.current().db;
    // Put the schema back to version 5, then migrate again.
    await db.unsafe('DROP TABLE puzzle_pieces');
    await db.unsafe('ALTER TABLE puzzles DROP COLUMN kind, DROP COLUMN template');
    await db`DELETE FROM schema_migrations WHERE version = 6`;
    await runMigrations(db);
    const rows = await db<{ kind: string; template: string | null }[]>`SELECT kind, template FROM puzzles WHERE id = ${p.id}`;
    expect(rows[0]).toEqual({ kind: 'lines', template: null });
  });
});
