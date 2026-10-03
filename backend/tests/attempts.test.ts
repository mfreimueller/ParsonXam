import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { asStudent, createClass, join, joinedStudent, seedExam, setExamTimes } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let classId: number;

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  classId = await createClass(anna, '4AHIF');
});
beforeEach(() => resetRateLimits());

const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

describe('join', () => {
  it('accepts the code in any case, with or without the dash', async () => {
    const exam = await seedExam(anna, classId);
    const plain = exam.code.replace('-', '');
    expect((await join(exam.code.toLowerCase(), 'Anna Huber')).status).toBe(201);
    expect((await join(plain, 'Ben Moser')).status).toBe(201);
    expect((await join(` ${exam.code} `, 'Clara Gruber')).status).toBe(201);
  });

  it('answers unknown, malformed and unpublished codes the same way', async () => {
    const draft = await seedExam(anna, classId, { publish: false });
    for (const code of ['ZZZ-ZZZ', 'nope', '', draft.code]) {
      const res = await join(code, 'Anna');
      expect(res.status, code).toBe(404);
      expect(await json(res)).toMatchObject({ error: 'CODE_NOT_FOUND' });
    }
  });

  it('tells students when the exam has not started, with the opening time', async () => {
    const exam = await seedExam(anna, classId, { state: 'scheduled' });
    const res = await join(exam.code, 'Anna');
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: 'EXAM_NOT_OPEN', examTitle: 'Loops', opensAt: expect.any(String) });
  });

  it('refuses new students once the exam is over', async () => {
    const exam = await seedExam(anna, classId, { state: 'over' });
    const res = await join(exam.code, 'Anna');
    expect(res.status).toBe(410);
    expect(await json(res)).toMatchObject({ error: 'EXAM_CLOSED', examTitle: 'Loops' });
  });

  it('rejects a second student with the same name, ignoring case and spacing', async () => {
    const exam = await seedExam(anna, classId);
    expect((await join(exam.code, 'Anna Huber')).status).toBe(201);
    for (const name of ['anna huber', '  ANNA   Huber ']) {
      const res = await join(exam.code, name);
      expect(res.status, name).toBe(409);
      expect(await json(res)).toMatchObject({ error: 'NAME_TAKEN' });
    }
    // The same name is fine in another exam.
    const other = await seedExam(anna, classId);
    expect((await join(other.code, 'Anna Huber')).status).toBe(201);
  });

  it('validates the name', async () => {
    const exam = await seedExam(anna, classId);
    expect((await join(exam.code, '   ')).status).toBe(400);
    expect((await join(exam.code, 'x'.repeat(61))).status).toBe(400);
  });

  it('does not limit successful joins, so a whole class behind one school IP can join', async () => {
    const exam = await seedExam(anna, classId);
    for (let i = 0; i < 40; i++) expect((await join(exam.code, `Pupil ${i}`)).status).toBe(201);
  });

  it('stops clients that keep guessing wrong codes, but only after many tries', async () => {
    for (let i = 0; i < 300; i++) expect((await join('ZZZ-ZZZ', 'x')).status).toBe(404);
    const res = await join('ZZZ-ZZZ', 'x');
    expect(res.status).toBe(429);
    expect(await json(res)).toMatchObject({ error: 'RATE_LIMITED' });
  });
});

describe('lookup', () => {
  const lookup = (code: string) =>
    app.request('/api/student/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });

  it('returns what the "exam found" card needs, and nothing about the puzzles', async () => {
    const exam = await seedExam(anna, classId, { timeLimitSeconds: 600 });
    const res = await lookup(exam.code.toLowerCase());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ examTitle: 'Loops', className: '4AHIF', timeLimitSeconds: 600, puzzleCount: 2 });
    expect(JSON.stringify(body)).not.toContain('total');
  });

  it('reports not found, not open and closed like join does', async () => {
    const draft = await seedExam(anna, classId, { publish: false });
    const later = await seedExam(anna, classId, { state: 'scheduled' });
    const done = await seedExam(anna, classId, { state: 'over' });
    expect((await lookup('ABC-234')).status).toBe(404);
    expect((await lookup(draft.code)).status).toBe(404);
    expect(await json(await lookup(later.code))).toMatchObject({ error: 'EXAM_NOT_OPEN', opensAt: expect.any(String) });
    expect(await json(await lookup(done.code))).toMatchObject({ error: 'EXAM_CLOSED' });
  });

  it('shares the wrong-code limit with join', async () => {
    for (let i = 0; i < 150; i++) await lookup('ZZZ-ZZZ');
    for (let i = 0; i < 150; i++) await join('ZZZ-ZZZ', 'x');
    expect((await lookup('ZZZ-ZZZ')).status).toBe(429);
  });
});

describe('student session', () => {
  it('needs a valid token', async () => {
    expect((await app.request('/api/student/attempt')).status).toBe(401);
    expect((await asStudent('nonsense').call('GET', '/api/student/attempt')).status).toBe(401);
  });

  it('shows the joined state before the exam is started, without any puzzle content', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const view = await json<{ status: string; studentName: string; exam: { title: string; puzzleCount: number; phase: string } }>(
      await s.call('GET', '/api/student/attempt')
    );
    expect(view).toMatchObject({ status: 'joined', studentName: 'Anna Huber', exam: { title: 'Loops', puzzleCount: 2, phase: 'live' } });
    expect(JSON.stringify(view)).not.toContain('total = 0');
  });
});

describe('start', () => {
  it('starts the clock and returns the shuffled pieces', async () => {
    const exam = await seedExam(anna, classId, { timeLimitSeconds: 300 });
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const before = Date.now();
    const res = await s.call('POST', '/api/student/start', {});
    expect(res.status).toBe(200);
    const view = await json<{
      status: string;
      startedAt: string;
      deadlineAt: string;
      puzzles: { id: number; pieces: { pieceId: string; code: string; indent?: number }[]; placed: unknown[] }[];
    }>(res);
    expect(view.status).toBe('in_progress');
    expect(new Date(view.deadlineAt).getTime() - new Date(view.startedAt).getTime()).toBe(300_000);
    expect(new Date(view.startedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(view.puzzles).toHaveLength(2);
    expect(view.puzzles[0]!.pieces).toHaveLength(6); // 5 solution lines + 1 red herring
    expect(view.puzzles[1]!.pieces).toHaveLength(5);
    expect(view.puzzles[0]!.placed).toEqual([]);
    // Indentation is pre-set for this exam, so pieces carry it.
    expect(view.puzzles[0]!.pieces.find((p) => p.code === 'total += i')!.indent).toBe(1);
  });

  it('is idempotent: a second start keeps the same deadline and pieces', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const first = await json<{ deadlineAt: string }>(await s.call('POST', '/api/student/start', {}));
    const second = await json<{ deadlineAt: string }>(await s.call('POST', '/api/student/start', {}));
    expect(second.deadlineAt).toBe(first.deadlineAt);
    const rows = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM attempt_puzzles`;
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  it('keeps the piece order stable across requests and reloads', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const order = async (path: string, method: string) => {
      const v = await json<{ puzzles: { pieces: { pieceId: string }[] }[] }>(await s.call(method, path, method === 'POST' ? {} : undefined));
      return v.puzzles.map((p) => p.pieces.map((x) => x.pieceId));
    };
    const a = await order('/api/student/start', 'POST');
    const b = await order('/api/student/attempt', 'GET');
    const c = await order('/api/student/attempt', 'GET');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('shuffles differently for different students', async () => {
    const exam = await seedExam(anna, classId);
    const orders = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = await joinedStudent(exam.code, `Student ${i}`);
      const v = await json<{ puzzles: { pieces: { code: string }[] }[] }>(await s.call('POST', '/api/student/start', {}));
      orders.add(v.puzzles[0]!.pieces.map((p) => p.code).join('|'));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('sends flat pieces when students set the indentation themselves', async () => {
    const exam = await seedExam(anna, classId, { studentsIndent: true });
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const v = await json<{ puzzles: { pieces: Record<string, unknown>[] }[] }>(await s.call('POST', '/api/student/start', {}));
    for (const p of v.puzzles[0]!.pieces) expect(p).not.toHaveProperty('indent');
  });

  it('never reveals the solution, red herrings or positions', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const text = JSON.stringify(await json(await s.call('POST', '/api/student/start', {})));
    for (const forbidden of ['solution', 'redHerring', 'herring', 'position', 'correct', 'isDistractor']) {
      expect(text.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('refuses to start after the exam is over, but lets a started attempt keep its view', async () => {
    const exam = await seedExam(anna, classId);
    const late = await joinedStudent(exam.code, 'Late Larry');
    const working = await joinedStudent(exam.code, 'Working Wanda');
    await working.call('POST', '/api/student/start', {});
    await setExamTimes(t.current().db, exam.examId, new Date(Date.now() - 7200_000), new Date(Date.now() - 1000));

    const res = await late.call('POST', '/api/student/start', {});
    expect(res.status).toBe(410);
    expect(await json(res)).toMatchObject({ error: 'EXAM_CLOSED' });
    expect((await working.call('GET', '/api/student/attempt')).status).toBe(200);
  });
});

describe('teacher side effects', () => {
  it('locks puzzles and unpublishing once a student has started, but not when they only joined', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Anna Huber');
    const edit = () => anna.call('POST', `/api/teacher/exams/${exam.examId}/puzzles`, { title: 'New', solution: [{ code: 'x', indent: 0 }] });
    expect((await edit()).status).toBe(201);

    await s.call('POST', '/api/student/start', {});
    const locked = await edit();
    expect(locked.status).toBe(409);
    expect(await json(locked)).toMatchObject({ error: 'EXAM_LOCKED' });
    const del = await anna.call('DELETE', `/api/teacher/puzzles/${exam.puzzleIds[0]}`);
    expect(del.status).toBe(409);
    const unpublish = await anna.call('POST', `/api/teacher/exams/${exam.examId}/unpublish`, {});
    expect(unpublish.status).toBe(409);
  });

  it('counts attempts and submissions on the exam', async () => {
    const exam = await seedExam(anna, classId);
    await joinedStudent(exam.code, 'One');
    await joinedStudent(exam.code, 'Two');
    const res = await anna.call('GET', `/api/teacher/exams/${exam.examId}`);
    expect(await json<{ exam: Record<string, number> }>(res)).toMatchObject({ exam: { attemptCount: 2, submissionCount: 0 } });
  });
});
