import { describe, it, expect, beforeAll } from 'vitest';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';

const t = useTestDb();
let anna: TestTeacher;
let ben: TestTeacher;
let cara: TestTeacher;
let examId: number;

interface Line {
  id: string;
  code: string;
  indent: number;
}
interface Puzzle {
  id: number;
  position: number;
  title: string;
  solution: Line[];
  redHerrings: Line[];
}
const json = async <T>(res: Response) => (await res.json()) as T;

const SUM = {
  title: 'Sum of 1 to N',
  description: 'Print the sum.',
  solution: [
    { code: 'n = int(input())', indent: 0 },
    { code: 'total = 0', indent: 0 },
    { code: 'for i in range(1, n + 1):', indent: 0 },
    { code: 'total += i', indent: 1 },
    { code: 'print(total)', indent: 0 },
  ],
  redHerrings: [{ code: 'for i in range(n):', indent: 0 }],
};

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  ben = await signedInTeacher(t.current().db, 'ben@school.edu', 'Ben Kern');
  cara = await signedInTeacher(t.current().db, 'cara@school.edu', 'Cara Lang');
  const cls = await json<{ class: { id: number } }>(await anna.call('POST', '/api/teacher/classes', { name: '4AHIF' }));
  await anna.call('POST', `/api/teacher/classes/${cls.class.id}/members`, { email: 'ben@school.edu' });
  const exam = await json<{ exam: { id: number } }>(
    await anna.call('POST', `/api/teacher/classes/${cls.class.id}/exams`, { title: 'Loops' })
  );
  examId = exam.exam.id;
});

async function create(body: unknown = SUM, who = anna): Promise<Puzzle> {
  const res = await who.call('POST', `/api/teacher/exams/${examId}/puzzles`, body);
  expect(res.status).toBe(201);
  return (await json<{ puzzle: Puzzle }>(res)).puzzle;
}

describe('create and read', () => {
  it('stores solution order, indentation and red herrings, with random line ids', async () => {
    const p = await create();
    expect(p.solution.map((l) => l.code)).toEqual(SUM.solution.map((l) => l.code));
    expect(p.solution.map((l) => l.indent)).toEqual([0, 0, 0, 1, 0]);
    expect(p.redHerrings.map((l) => l.code)).toEqual(['for i in range(n):']);
    const ids = [...p.solution, ...p.redHerrings].map((l) => l.id);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const again = await json<{ puzzle: Puzzle }>(await ben.call('GET', `/api/teacher/puzzles/${p.id}`));
    expect(again.puzzle).toEqual(p);
  });

  it('appends puzzles at the end', async () => {
    const a = await create({ ...SUM, title: 'Pos-A' });
    const b = await create({ ...SUM, title: 'Pos-B' });
    expect(b.position).toBe(a.position + 1);
  });

  it('lists summaries with line counts', async () => {
    const res = await anna.call('GET', `/api/teacher/exams/${examId}/puzzles`);
    const list = (await json<{ puzzles: { title: string; solutionLineCount: number; redHerringCount: number }[] }>(res)).puzzles;
    expect(list.find((p) => p.title === 'Sum of 1 to N')).toMatchObject({ solutionLineCount: 5, redHerringCount: 1 });
  });

  it('lets a created puzzle count towards publishing', async () => {
    const res = await anna.call('POST', '/api/teacher/classes', { name: 'Publish' });
    const cid = (await json<{ class: { id: number } }>(res)).class.id;
    const e = await json<{ exam: { id: number } }>(
      await anna.call('POST', `/api/teacher/classes/${cid}/exams`, {
        title: 'Ready',
        opensAt: new Date(Date.now() + 86400_000).toISOString(),
        closesAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
      })
    );
    await anna.call('POST', `/api/teacher/exams/${e.exam.id}/puzzles`, SUM);
    expect((await anna.call('POST', `/api/teacher/exams/${e.exam.id}/publish`, {})).status).toBe(200);
  });
});

describe('validation', () => {
  const bad: [string, unknown][] = [
    ['empty title', { ...SUM, title: ' ' }],
    ['line with a line break', { ...SUM, solution: [{ code: 'a\nb', indent: 0 }] }],
    ['empty code', { ...SUM, solution: [{ code: '   ', indent: 0 }] }],
    ['leading spaces', { ...SUM, solution: [{ code: '  x = 1', indent: 0 }] }],
    ['indent too deep', { ...SUM, solution: [{ code: 'x = 1', indent: 7 }] }],
    ['too many lines', { ...SUM, solution: Array.from({ length: 31 }, () => ({ code: 'x', indent: 0 })) }],
    ['duplicate ids', { ...SUM, solution: [{ id: 'same', code: 'a', indent: 0 }], redHerrings: [{ id: 'same', code: 'b', indent: 0 }] }],
  ];
  for (const [name, body] of bad) {
    it(`rejects ${name}`, async () => {
      const res = await anna.call('POST', `/api/teacher/exams/${examId}/puzzles`, body);
      expect(res.status).toBe(400);
    });
  }

  it('drops trailing spaces', async () => {
    const p = await create({ ...SUM, solution: [{ code: 'x = 1   ', indent: 0 }, { code: 'y = 2', indent: 0 }] });
    expect(p.solution[0]!.code).toBe('x = 1');
  });

  it('accepts identical lines, as in real code', async () => {
    const p = await create({ ...SUM, solution: [{ code: 'pass', indent: 1 }, { code: 'pass', indent: 1 }], redHerrings: [] });
    expect(p.solution).toHaveLength(2);
  });
});

describe('replace', () => {
  it('keeps the ids of retained lines, even when they move, and drops removed ones', async () => {
    const p = await create();
    const [a, b, c, d, e] = p.solution as [Line, Line, Line, Line, Line];
    const herring = p.redHerrings[0]!;
    const res = await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, {
      title: 'Renamed',
      description: '',
      // reorder: e first, then a; drop b, c, d; edit a; add a new line
      solution: [{ id: e.id, code: e.code, indent: 0 }, { id: a.id, code: 'n = 10', indent: 0 }, { code: 'brand new', indent: 2 }],
      redHerrings: [{ id: herring.id, code: herring.code, indent: 0 }],
    });
    expect(res.status).toBe(200);
    const after = (await json<{ puzzle: Puzzle }>(res)).puzzle;
    expect(after.title).toBe('Renamed');
    expect(after.solution.map((l) => l.code)).toEqual(['print(total)', 'n = 10', 'brand new']);
    expect(after.solution[0]!.id).toBe(e.id);
    expect(after.solution[1]!.id).toBe(a.id);
    expect(after.solution[2]!.indent).toBe(2);
    expect(after.redHerrings[0]!.id).toBe(herring.id);
    const gone = [b.id, c.id, d.id];
    expect([...after.solution, ...after.redHerrings].some((l) => gone.includes(l.id))).toBe(false);
  });

  it('treats ids from other puzzles as new lines instead of stealing them', async () => {
    const one = await create({ ...SUM, title: 'Steal-A' });
    const two = await create({ ...SUM, title: 'Steal-B' });
    const foreign = one.solution[0]!;
    const res = await anna.call('PUT', `/api/teacher/puzzles/${two.id}`, {
      title: 'Steal-B',
      solution: [{ id: foreign.id, code: 'changed', indent: 0 }],
    });
    expect(res.status).toBe(200);
    const stillOne = await json<{ puzzle: Puzzle }>(await anna.call('GET', `/api/teacher/puzzles/${one.id}`));
    expect(stillOne.puzzle.solution[0]!.code).toBe('n = int(input())');
  });

  it('can move a line from the solution to the red herrings', async () => {
    const p = await create();
    const last = p.solution[4]!;
    const res = await anna.call('PUT', `/api/teacher/puzzles/${p.id}`, {
      title: p.title,
      solution: p.solution.slice(0, 4),
      redHerrings: [...p.redHerrings, last],
    });
    const after = (await json<{ puzzle: Puzzle }>(res)).puzzle;
    expect(after.solution).toHaveLength(4);
    expect(after.redHerrings.map((l) => l.id)).toContain(last.id);
  });
});

describe('delete and reorder puzzles', () => {
  it('closes the gap after deleting', async () => {
    const res = await anna.call('POST', '/api/teacher/classes', { name: 'Order' });
    const cid = (await json<{ class: { id: number } }>(res)).class.id;
    const e = (await json<{ exam: { id: number } }>(await anna.call('POST', `/api/teacher/classes/${cid}/exams`, { title: 'O' }))).exam.id;
    const mk = async (title: string) =>
      (await json<{ puzzle: Puzzle }>(await anna.call('POST', `/api/teacher/exams/${e}/puzzles`, { ...SUM, title }))).puzzle;
    const [p1, p2, p3] = [await mk('one'), await mk('two'), await mk('three')];

    expect((await anna.call('DELETE', `/api/teacher/puzzles/${p2.id}`)).status).toBe(200);
    let list = (await json<{ puzzles: { id: number; position: number }[] }>(await anna.call('GET', `/api/teacher/exams/${e}/puzzles`))).puzzles;
    expect(list.map((p) => [p.id, p.position])).toEqual([[p1.id, 1], [p3.id, 2]]);

    const res2 = await anna.call('PUT', `/api/teacher/exams/${e}/puzzles/order`, { puzzleIds: [p3.id, p1.id] });
    list = (await json<{ puzzles: { id: number; position: number }[] }>(res2)).puzzles;
    expect(list.map((p) => p.id)).toEqual([p3.id, p1.id]);

    expect((await anna.call('PUT', `/api/teacher/exams/${e}/puzzles/order`, { puzzleIds: [p3.id] })).status).toBe(400);
    expect((await anna.call('PUT', `/api/teacher/exams/${e}/puzzles/order`, { puzzleIds: [p3.id, p3.id] })).status).toBe(400);
    expect((await anna.call('PUT', `/api/teacher/exams/${e}/puzzles/order`, { puzzleIds: [p3.id, p1.id, p2.id] })).status).toBe(400);
  });
});

describe('import', () => {
  async function freshExam(): Promise<number> {
    const cid = (await json<{ class: { id: number } }>(await anna.call('POST', '/api/teacher/classes', { name: 'Import' }))).class.id;
    return (await json<{ exam: { id: number } }>(await anna.call('POST', `/api/teacher/classes/${cid}/exams`, { title: 'I' }))).exam.id;
  }
  const post = (e: number, body: unknown, who = anna) => who.call('POST', `/api/teacher/exams/${e}/puzzles/import`, body);
  const titles = async (e: number) =>
    (await json<{ puzzles: { title: string }[] }>(await anna.call('GET', `/api/teacher/exams/${e}/puzzles`))).puzzles.map((p) => p.title);

  it('appends every puzzle in file order after the existing ones', async () => {
    const e = await freshExam();
    await anna.call('POST', `/api/teacher/exams/${e}/puzzles`, { ...SUM, title: 'existing' });
    const res = await post(e, { puzzles: [{ ...SUM, title: 'first' }, { ...SUM, title: 'second', redHerrings: [] }] });
    expect(res.status).toBe(201);
    const out = await json<{ imported: number; puzzles: { title: string; position: number; redHerringCount: number }[] }>(res);
    expect(out.imported).toBe(2);
    expect(out.puzzles.map((p) => [p.position, p.title, p.redHerringCount])).toEqual([[1, 'existing', 1], [2, 'first', 1], [3, 'second', 0]]);
  });

  it('is all or nothing when one puzzle is invalid', async () => {
    const e = await freshExam();
    const res = await post(e, { puzzles: [SUM, { ...SUM, solution: [{ code: '  indented', indent: 0 }] }] });
    expect(res.status).toBe(400);
    expect((await json<{ message: string }>(res)).message).toMatch(/^puzzles\.1\.solution\.0\.code/);
    expect(await titles(e)).toEqual([]);
  });

  for (const [name, body] of [
    ['an empty list', { puzzles: [] }],
    ['a bare puzzle without the puzzles wrapper', SUM],
    ['more than 50 puzzles', { puzzles: Array.from({ length: 51 }, () => SUM) }],
  ] as [string, unknown][]) {
    it(`rejects ${name}`, async () => {
      expect((await post(await freshExam(), body)).status).toBe(400);
    });
  }

  it('is refused for outsiders', async () => {
    const e = await freshExam();
    expect((await post(e, { puzzles: [SUM] }, cara)).status).toBe(404);
    expect(await titles(e)).toEqual([]);
  });
});

describe('access', () => {
  it('shows nothing to outsiders', async () => {
    const p = await create({ ...SUM, title: 'Secret' });
    for (const [method, path, body] of [
      ['GET', `/api/teacher/puzzles/${p.id}`, undefined],
      ['PUT', `/api/teacher/puzzles/${p.id}`, SUM],
      ['DELETE', `/api/teacher/puzzles/${p.id}`, undefined],
      ['GET', `/api/teacher/exams/${examId}/puzzles`, undefined],
      ['POST', `/api/teacher/exams/${examId}/puzzles`, SUM],
      ['PUT', `/api/teacher/exams/${examId}/puzzles/order`, { puzzleIds: [p.id] }],
    ] as const) {
      expect((await cara.call(method, path, body)).status, `${method} ${path}`).toBe(404);
    }
  });
});
