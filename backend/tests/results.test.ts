import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { hashToken } from '../src/lib/hash.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, join, joinedStudent, seedExam, SUM_PUZZLE, type SeededExam, type TestStudent } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let ben: TestTeacher;
let outsider: TestTeacher;
let classId: number;

beforeAll(async () => {
  const db = t.current().db;
  anna = await signedInTeacher(db, 'anna@school.edu', 'Anna Berger');
  ben = await signedInTeacher(db, 'ben@school.edu', 'Ben Huber');
  outsider = await signedInTeacher(db, 'eve@school.edu', 'Eve Outsider');
  classId = await createClass(anna, '5B Informatics');
  await anna.call('POST', `/api/teacher/classes/${classId}/members`, { email: 'ben@school.edu' });
});
beforeEach(() => resetRateLimits());

const json = async <T = any>(res: Response) => (await res.json()) as T;

/** A student who starts, places the Sum puzzle perfectly and the times table not at all, then submits. */
async function submittedStudent(exam: SeededExam, name: string): Promise<TestStudent> {
  const s = await joinedStudent(exam.code, name);
  const view = await json(await s.call('POST', '/api/student/start', {}));
  const idOf = (code: string) => view.puzzles[0].pieces.find((p: { code: string }) => p.code === code).pieceId;
  await s.call('PUT', `/api/student/puzzles/${view.puzzles[0].id}/state`, {
    placed: SUM_PUZZLE.solution.map((l) => ({ pieceId: idOf(l.code), indent: l.indent })),
  });
  await s.call('POST', '/api/student/submit', {});
  return s;
}

describe('results', () => {
  it('lists every attempt with status, per-puzzle and total scores, plus stats', async () => {
    const exam = await seedExam(anna, classId);
    await submittedStudent(exam, 'Zoe');
    const started = await joinedStudent(exam.code, 'Max');
    await started.call('POST', '/api/student/start', {});
    await joinedStudent(exam.code, 'Lena'); // joined only

    const res = await ben.call('GET', `/api/teacher/exams/${exam.examId}/results`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.stats).toEqual({
      joined: 3, inProgress: 1, submitted: 1, timedOut: 0, averagePercent: 50, highestPercent: 50, lowestPercent: 50,
    });
    expect(body.attempts.map((a: any) => [a.studentName, a.status])).toEqual([
      ['Lena', 'joined'], ['Max', 'in_progress'], ['Zoe', 'submitted'],
    ]);
    const zoe = body.attempts[2];
    expect(zoe).toMatchObject({ scorePercent: 50, submitReason: 'manual' });
    expect(zoe.puzzles.map((p: any) => p.scorePercent)).toEqual([100, 0]);
    expect(body.attempts[1].scorePercent).toBeNull();
  });

  it('settles attempts whose time ran out before reading, and marks them as timeout', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, 'Slow');
    await s.call('POST', '/api/student/start', {});
    await t.current().db`UPDATE attempts SET deadline_at = ${new Date(Date.now() - 60_000)} WHERE token_hash = ${hashToken(s.token)}`;

    const body = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    expect(body.stats).toMatchObject({ submitted: 1, timedOut: 1, inProgress: 0 });
    expect(body.attempts[0]).toMatchObject({ status: 'submitted', submitReason: 'timeout', scorePercent: 0 });
  });

  it('hides everything from teachers outside the class', async () => {
    const exam = await seedExam(anna, classId);
    await submittedStudent(exam, 'Zoe');
    const list = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    const attemptId = list.attempts[0].id;
    for (const [method, path] of [
      ['GET', `/api/teacher/exams/${exam.examId}/results`],
      ['GET', `/api/teacher/exams/${exam.examId}/export`],
      ['GET', `/api/teacher/attempts/${attemptId}`],
      ['DELETE', `/api/teacher/attempts/${attemptId}`],
    ] as const) {
      expect((await outsider.call(method, path)).status, `${method} ${path}`).toBe(404);
    }
    expect((await anna.call('GET', '/api/teacher/attempts/999999')).status).toBe(404);
  });

  it('requires a teacher session', async () => {
    const exam = await seedExam(anna, classId);
    const res = await (await import('../src/app.js')).app.request(`/api/teacher/exams/${exam.examId}/results`);
    expect(res.status).toBe(401);
  });
});

describe('attempt detail and delete', () => {
  it('shows the submission against the solution, per puzzle', async () => {
    const exam = await seedExam(anna, classId);
    await submittedStudent(exam, 'Zoe');
    const id = (await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`))).attempts[0].id;

    const { attempt } = await json(await ben.call('GET', `/api/teacher/attempts/${id}`));
    expect(attempt).toMatchObject({ examId: exam.examId, studentName: 'Zoe', status: 'submitted', scorePercent: 50 });
    expect(attempt.puzzles).toHaveLength(2);
    const sum = attempt.puzzles[0];
    expect(sum.scorePercent).toBe(100);
    expect(sum.solution).toEqual(SUM_PUZZLE.solution);
    expect(sum.redHerrings).toEqual(SUM_PUZZLE.redHerrings);
    expect(sum.submission.every((l: any) => l.correct)).toBe(true);
    expect(attempt.puzzles[1]).toMatchObject({ scorePercent: 0, submission: [] });
  });

  it('deleting an attempt frees the name so the student can rejoin', async () => {
    const exam = await seedExam(anna, classId);
    await submittedStudent(exam, 'Zoe');
    expect((await join(exam.code, 'Zoe')).status).toBe(409);
    const id = (await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`))).attempts[0].id;

    expect((await ben.call('DELETE', `/api/teacher/attempts/${id}`)).status).toBe(200);
    expect((await ben.call('GET', `/api/teacher/attempts/${id}`)).status).toBe(404);
    expect((await join(exam.code, 'Zoe')).status).toBe(201);
  });
});

describe('export', () => {
  it('matches the spec shape and its scores equal the results list', async () => {
    const exam = await seedExam(anna, classId);
    await submittedStudent(exam, 'Zoe');
    await submittedStudent(exam, 'Yan');
    await joinedStudent(exam.code, 'Not submitted');

    const res = await anna.call('GET', `/api/teacher/exams/${exam.examId}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename=loops.json');
    const file = await json(res);
    expect(file).toMatchObject({ version: 1, exportedAt: expect.any(String) });
    expect(file.exam).toMatchObject({
      title: 'Loops', class: '5B Informatics', timeLimitSeconds: 600, studentsIndent: false,
      opensAt: expect.any(String), closesAt: expect.any(String),
    });
    expect(file.exam.puzzles[0]).toEqual({
      id: exam.puzzleIds[0],
      title: SUM_PUZZLE.title,
      solution: SUM_PUZZLE.solution,
      redHerrings: ['for i in range(n):'],
    });

    expect(file.results.map((r: any) => r.studentName)).toEqual(['Yan', 'Zoe']); // submitted only
    const list = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    for (const r of file.results) {
      const row = list.attempts.find((a: any) => a.studentName === r.studentName);
      expect(r.scorePercent).toBe(row.scorePercent);
      expect(r.puzzles.map((p: any) => p.scorePercent)).toEqual(row.puzzles.map((p: any) => p.scorePercent));
      expect(r).toMatchObject({ submitReason: 'manual', startedAt: expect.any(String), submittedAt: expect.any(String) });
    }
    expect(file.results[0].puzzles[0].submitted).toEqual(
      SUM_PUZZLE.solution.map((l) => ({ ...l, correct: true }))
    );
  });

  it('is an empty but valid file when nobody submitted', async () => {
    const exam = await seedExam(anna, classId);
    const file = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/export`));
    expect(file.results).toEqual([]);
    expect(file.exam.puzzles).toHaveLength(2);
  });
});

describe('class cards', () => {
  it('count the students who joined across the class exams', async () => {
    const id = await createClass(anna, 'Counting');
    const exam = await seedExam(anna, id);
    await joinedStudent(exam.code, 'A');
    await joinedStudent(exam.code, 'B');
    const { classes } = await json(await anna.call('GET', '/api/teacher/classes'));
    expect(classes.find((c: any) => c.id === id)).toMatchObject({ examCount: 1, studentCount: 2 });
  });
});
