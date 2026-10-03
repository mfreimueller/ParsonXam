import { describe, it, expect, beforeAll } from 'vitest';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';

const t = useTestDb();
let anna: TestTeacher;
let ben: TestTeacher;
let cara: TestTeacher;
let classId: number;

const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  ben = await signedInTeacher(t.current().db, 'ben@school.edu', 'Ben Kern');
  cara = await signedInTeacher(t.current().db, 'cara@school.edu', 'Cara Lang');
  const res = await anna.call('POST', '/api/teacher/classes', { name: '4AHIF' });
  classId = ((await res.json()) as { class: { id: number } }).class.id;
  await anna.call('POST', `/api/teacher/classes/${classId}/members`, { email: 'ben@school.edu' });
});

interface Exam {
  id: number;
  title: string;
  status: string;
  accessCode: string;
  timeLimitSeconds: number;
  studentsIndent: boolean;
  puzzleCount: number;
  createdBy: { displayName: string } | null;
}
const json = async <T>(res: Response) => (await res.json()) as T;

async function newExam(who: TestTeacher = anna, body: Record<string, unknown> = {}): Promise<Exam> {
  const res = await who.call('POST', `/api/teacher/classes/${classId}/exams`, { title: 'Loops', ...body });
  expect(res.status).toBe(201);
  return (await json<{ exam: Exam }>(res)).exam;
}

/** Adds a puzzle straight in the database (the puzzle API comes later). */
async function addPuzzle(examId: number, solutionLines: number, title = 'P1') {
  const db = t.current().db;
  const p = await db`INSERT INTO puzzles (exam_id, position, title, description) VALUES (${examId}, 1, ${title}, '')`;
  for (let i = 1; i <= solutionLines; i++) {
    await db`INSERT INTO puzzle_lines (puzzle_id, public_id, solution_position, code, indent)
             VALUES (${p.lastInsertRowid}, ${`${p.lastInsertRowid}`.padStart(6, 'p') + String(i).padStart(6, '0')}, ${i}, ${'x = ' + i}, 0)`;
  }
}

describe('create and read', () => {
  it('creates a draft with a formatted access code and the creator', async () => {
    const exam = await newExam(ben, { instructions: 'Reorder.', timeLimitSeconds: 300 });
    expect(exam.status).toBe('draft');
    expect(exam.accessCode).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    expect(exam.timeLimitSeconds).toBe(300);
    expect(exam.studentsIndent).toBe(false);
    expect(exam.createdBy?.displayName).toBe('Ben Kern');
  });

  it('gives every exam its own code', async () => {
    const codes = new Set((await Promise.all([1, 2, 3, 4, 5].map(() => newExam()))).map((e) => e.accessCode));
    expect(codes.size).toBe(5);
  });

  it('validates input', async () => {
    const path = `/api/teacher/classes/${classId}/exams`;
    expect((await anna.call('POST', path, { title: '' })).status).toBe(400);
    expect((await anna.call('POST', path, { title: 'x', timeLimitSeconds: 5 })).status).toBe(400);
    expect((await anna.call('POST', path, { title: 'x', opensAt: 'tomorrow' })).status).toBe(400);
    expect((await anna.call('POST', path, { title: 'x', opensAt: inDays(2), closesAt: inDays(1) })).status).toBe(400);
  });

  it('lists the exams of a class, newest first, for any member', async () => {
    const a = await newExam(anna, { title: 'List-A' });
    const b = await newExam(anna, { title: 'List-B' });
    const res = await ben.call('GET', `/api/teacher/classes/${classId}/exams`);
    const ids = (await json<{ exams: Exam[] }>(res)).exams.map((e) => e.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });
});

describe('access', () => {
  it('lets members read and edit, and hides everything from outsiders', async () => {
    const exam = await newExam();
    expect((await ben.call('GET', `/api/teacher/exams/${exam.id}`)).status).toBe(200);
    expect((await ben.call('PATCH', `/api/teacher/exams/${exam.id}`, { title: 'By Ben' })).status).toBe(200);

    for (const [method, path, body] of [
      ['GET', `/api/teacher/exams/${exam.id}`, undefined],
      ['PATCH', `/api/teacher/exams/${exam.id}`, { title: 'Hijack' }],
      ['DELETE', `/api/teacher/exams/${exam.id}`, undefined],
      ['POST', `/api/teacher/exams/${exam.id}/publish`, {}],
      ['POST', `/api/teacher/exams/${exam.id}/regenerate-code`, {}],
      ['GET', `/api/teacher/classes/${classId}/exams`, undefined],
      ['POST', `/api/teacher/classes/${classId}/exams`, { title: 'x' }],
    ] as const) {
      expect((await cara.call(method, path, body)).status, `${method} ${path}`).toBe(404);
    }
  });
});

describe('update', () => {
  it('changes only the given fields', async () => {
    const exam = await newExam(anna, { title: 'Keep', instructions: 'Keep me' });
    const res = await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { timeLimitSeconds: 900 });
    const updated = (await json<{ exam: Exam & { instructions: string } }>(res)).exam;
    expect(updated).toMatchObject({ title: 'Keep', instructions: 'Keep me', timeLimitSeconds: 900 });
  });

  it('keeps opening before closing, also across separate edits', async () => {
    const exam = await newExam(anna, { opensAt: inDays(1), closesAt: inDays(2) });
    const res = await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { closesAt: inDays(0.5) });
    expect(res.status).toBe(400);
  });

  it('changes the indentation option only while draft', async () => {
    const exam = await newExam();
    const on = await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { studentsIndent: true });
    expect((await json<{ exam: Exam }>(on)).exam.studentsIndent).toBe(true);

    await addPuzzle(exam.id, 2);
    await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { opensAt: inDays(1), closesAt: inDays(2) });
    expect((await anna.call('POST', `/api/teacher/exams/${exam.id}/publish`, {})).status).toBe(200);
    const locked = await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { studentsIndent: false });
    expect(locked.status).toBe(409);
    expect(await json(locked)).toMatchObject({ error: 'EXAM_LOCKED' });
    // Same value is not a change.
    expect((await anna.call('PATCH', `/api/teacher/exams/${exam.id}`, { studentsIndent: true })).status).toBe(200);
  });
});

describe('publish', () => {
  it('lists every problem when the exam is not ready', async () => {
    const exam = await newExam();
    const res = await anna.call('POST', `/api/teacher/exams/${exam.id}/publish`, {});
    expect(res.status).toBe(409);
    const body = await json<{ error: string; problems: string[] }>(res);
    expect(body.error).toBe('EXAM_NOT_READY');
    expect(body.problems).toHaveLength(2);
  });

  it('wants at least two solution lines per puzzle', async () => {
    const exam = await newExam(anna, { opensAt: inDays(1), closesAt: inDays(2) });
    await addPuzzle(exam.id, 1, 'Tiny');
    const res = await anna.call('POST', `/api/teacher/exams/${exam.id}/publish`, {});
    expect((await json<{ problems: string[] }>(res)).problems[0]).toContain('Tiny');
  });

  it('publishes a ready exam and reports scheduled / live / over', async () => {
    const scheduled = await newExam(anna, { opensAt: inDays(1), closesAt: inDays(2) });
    await addPuzzle(scheduled.id, 2);
    const res = await anna.call('POST', `/api/teacher/exams/${scheduled.id}/publish`, {});
    expect((await json<{ exam: Exam }>(res)).exam.status).toBe('scheduled');

    const live = await newExam(anna, { opensAt: inDays(-1), closesAt: inDays(1) });
    await addPuzzle(live.id, 2);
    expect((await json<{ exam: Exam }>(await anna.call('POST', `/api/teacher/exams/${live.id}/publish`, {}))).exam.status).toBe('live');

    const done = await newExam(anna, { opensAt: inDays(-2), closesAt: inDays(-1) });
    await addPuzzle(done.id, 2);
    expect((await json<{ exam: Exam }>(await anna.call('POST', `/api/teacher/exams/${done.id}/publish`, {}))).exam.status).toBe('over');
  });

  it('can be unpublished back to draft', async () => {
    const exam = await newExam(anna, { opensAt: inDays(1), closesAt: inDays(2) });
    await addPuzzle(exam.id, 2);
    await anna.call('POST', `/api/teacher/exams/${exam.id}/publish`, {});
    const res = await anna.call('POST', `/api/teacher/exams/${exam.id}/unpublish`, {});
    expect((await json<{ exam: Exam }>(res)).exam.status).toBe('draft');
  });
});

describe('access code and deletion', () => {
  it('regenerates the code', async () => {
    const exam = await newExam();
    const res = await anna.call('POST', `/api/teacher/exams/${exam.id}/regenerate-code`, {});
    expect((await json<{ exam: Exam }>(res)).exam.accessCode).not.toBe(exam.accessCode);
  });

  it('deletes an exam with its puzzles and lines', async () => {
    const exam = await newExam();
    await addPuzzle(exam.id, 2);
    expect((await anna.call('DELETE', `/api/teacher/exams/${exam.id}`)).status).toBe(200);
    expect((await anna.call('GET', `/api/teacher/exams/${exam.id}`)).status).toBe(404);
    const left = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzles WHERE exam_id = ${exam.id}`;
    expect(Number(left[0]!.n)).toBe(0);
  });

  it('refuses to delete a class that still has exams, and shows the count', async () => {
    const res = await anna.call('POST', '/api/teacher/classes', { name: 'With exams' });
    const id = (await json<{ class: { id: number } }>(res)).class.id;
    await anna.call('POST', `/api/teacher/classes/${id}/exams`, { title: 'One' });
    const list = await json<{ classes: { id: number; examCount: number }[] }>(await anna.call('GET', '/api/teacher/classes'));
    expect(list.classes.find((c) => c.id === id)?.examCount).toBe(1);
    const del = await anna.call('DELETE', `/api/teacher/classes/${id}`);
    expect(del.status).toBe(409);
    expect(await json(del)).toMatchObject({ error: 'CLASS_NOT_EMPTY' });
  });
});
