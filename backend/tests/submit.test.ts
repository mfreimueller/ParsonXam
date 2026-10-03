import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { finaliseOverdue } from '../src/lib/finalise.js';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent, seedExam, SUM_PUZZLE, TABLE_PUZZLE, type SeededExam, type TestStudent } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let classId: number;
let counter = 0;

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  classId = await createClass(anna);
});
beforeEach(() => resetRateLimits());

const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

interface View {
  status: string;
  deadlineAt: string;
  scorePercent?: number;
  submitReason?: string;
  puzzles: { id: number; pieces: { pieceId: string; code: string }[] }[];
}

/** Starts an exam as a fresh student and returns helpers to place pieces by code. */
async function startStudent(exam: SeededExam) {
  const s = await joinedStudent(exam.code, `Student ${++counter}`);
  const view = await json<View>(await s.call('POST', '/api/student/start', {}));
  const idOf = (puzzle: number, code: string) => view.puzzles[puzzle]!.pieces.find((p) => p.code === code)!.pieceId;
  const arrange = (puzzle: number, lines: { code: string; indent?: number }[]) =>
    s.call('PUT', `/api/student/puzzles/${view.puzzles[puzzle]!.id}/state`, {
      placed: lines.map((l) => ({ pieceId: idOf(puzzle, l.code), indent: l.indent ?? 0 })),
    });
  return { s, view, idOf, arrange };
}

const perfect = (p: typeof SUM_PUZZLE) => p.solution.map((l) => ({ code: l.code, indent: l.indent }));

describe('autosave and submit', () => {
  it('scores each puzzle and averages them; the response carries only the percentage', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    expect((await arrange(0, perfect(SUM_PUZZLE))).status).toBe(200);
    // Puzzle 2: 3 solution lines, first two right, herring in the last slot -> 66.67
    await arrange(1, [{ code: 'n = 5' }, { code: 'for i in range(1, 11):' }, { code: 'print(n)', indent: 1 }]);

    const res = await s.call('POST', '/api/student/submit', {});
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    expect(body).toEqual({ scorePercent: 83.33, reason: 'manual', closesAt: expect.any(String) });
  });

  it('shows the score in the attempt view afterwards, still without solutions while the exam runs', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    await s.call('POST', '/api/student/submit', {});
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view).toMatchObject({ status: 'submitted', scorePercent: 50, submitReason: 'manual' });
    expect(JSON.stringify(view)).not.toContain('total = 0');
  });

  it('submitting twice returns the same result', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    const first = await json(await s.call('POST', '/api/student/submit', {}));
    const second = await json(await s.call('POST', '/api/student/submit', {}));
    expect(second).toEqual(first);
  });

  it('two simultaneous submits finalise once', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    const [a, b] = await Promise.all([s.call('POST', '/api/student/submit', {}), s.call('POST', '/api/student/submit', {})]);
    expect(await json(a)).toEqual(await json(b));
  });

  it('refuses to submit or save before starting', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, `Early ${++counter}`);
    expect((await s.call('POST', '/api/student/submit', {})).status).toBe(409);
    expect((await s.call('PUT', '/api/student/puzzles/1/state', { placed: [] })).status).toBe(409);
  });

  it('rejects saving after submitting', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await s.call('POST', '/api/student/submit', {});
    const res = await arrange(0, perfect(SUM_PUZZLE));
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: 'ATTEMPT_SUBMITTED', reason: 'manual' });
  });

  it('restores the last saved arrangement on reload', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange, idOf } = await startStudent(exam);
    await arrange(0, [{ code: 'total = 0' }, { code: 'n = int(input())' }]);
    const view = await json<{ puzzles: { placed: { pieceId: string }[] }[] }>(await s.call('GET', '/api/student/attempt'));
    expect(view.puzzles[0]!.placed.map((p) => p.pieceId)).toEqual([idOf(0, 'total = 0'), idOf(0, 'n = int(input())')]);
  });
});

describe('validation', () => {
  it('rejects unknown, foreign and repeated pieces', async () => {
    const exam = await seedExam(anna, classId);
    const { s, view, idOf } = await startStudent(exam);
    const put = (puzzle: number, placed: unknown[]) => s.call('PUT', `/api/student/puzzles/${view.puzzles[puzzle]!.id}/state`, { placed });
    expect((await put(0, [{ pieceId: 'doesnotexist', indent: 0 }])).status).toBe(400);
    expect((await put(0, [{ pieceId: idOf(1, 'n = 5'), indent: 0 }])).status).toBe(400); // piece of puzzle 2
    expect((await put(0, [{ pieceId: idOf(0, 'total = 0'), indent: 0 }, { pieceId: idOf(0, 'total = 0'), indent: 0 }])).status).toBe(400);
    expect((await put(0, [{ pieceId: idOf(0, 'total = 0'), indent: 9 }])).status).toBe(400);
  });

  it('rejects puzzles from other exams', async () => {
    const mine = await seedExam(anna, classId);
    const other = await seedExam(anna, classId);
    const { s } = await startStudent(mine);
    const res = await s.call('PUT', `/api/student/puzzles/${other.puzzleIds[0]}/state`, { placed: [] });
    expect(res.status).toBe(404);
  });

  it('keeps students out of each other’s attempts', async () => {
    const exam = await seedExam(anna, classId);
    const a = await startStudent(exam);
    const b = await startStudent(exam);
    await b.arrange(0, perfect(SUM_PUZZLE));
    const viewA = await json<{ puzzles: { placed: unknown[] }[] }>(await a.s.call('GET', '/api/student/attempt'));
    expect(viewA.puzzles[0]!.placed).toEqual([]);
  });
});

describe('indentation', () => {
  it('ignores client indents when indentation is pre-set', async () => {
    const exam = await seedExam(anna, classId, { studentsIndent: false });
    const { s, arrange } = await startStudent(exam);
    // Client claims indent 0 for every line; the preset indent of `total += i` (1) still counts.
    await arrange(0, SUM_PUZZLE.solution.map((l) => ({ code: l.code, indent: 0 })));
    const res = await json<{ scorePercent: number }>(await s.call('POST', '/api/student/submit', {}));
    expect(res.scorePercent).toBe(50);
  });

  it('grades the indent the student chose when students set it themselves', async () => {
    const exam = await seedExam(anna, classId, { studentsIndent: true });
    const right = await startStudent(exam);
    await right.arrange(0, perfect(SUM_PUZZLE));
    await right.arrange(1, perfect(TABLE_PUZZLE as unknown as typeof SUM_PUZZLE));
    expect((await json<{ scorePercent: number }>(await right.s.call('POST', '/api/student/submit', {}))).scorePercent).toBe(100);

    const flat = await startStudent(exam);
    await flat.arrange(0, SUM_PUZZLE.solution.map((l) => ({ code: l.code, indent: 0 })));
    // 4 of 5 lines are right (only `total += i` needs indent 1) -> 80, other puzzle empty -> mean 40
    expect((await json<{ scorePercent: number }>(await flat.s.call('POST', '/api/student/submit', {}))).scorePercent).toBe(40);
  });
});

describe('time running out', () => {
  async function expire(s: TestStudent, minutesAgo = 1) {
    await t.current().db`UPDATE attempts SET deadline_at = ${new Date(Date.now() - minutesAgo * 60_000)} WHERE token_hash = ${(await import('../src/lib/hash.js')).hashToken(s.token)}`;
  }

  it('submits the last saved state on the next request after the deadline', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    await expire(s);
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view).toMatchObject({ status: 'submitted', submitReason: 'timeout', scorePercent: 50 });
  });

  it('records the timeout at the deadline, not when it was noticed', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await startStudent(exam);
    await expire(s, 5);
    await s.call('GET', '/api/student/attempt');
    const rows = await t.current().db<{ submittedAt: Date; deadlineAt: Date }[]>`
      SELECT submitted_at AS submittedAt, deadline_at AS deadlineAt FROM attempts WHERE exam_id = ${exam.examId}`;
    expect(rows[0]!.submittedAt.getTime()).toBe(rows[0]!.deadlineAt.getTime());
  });

  it('rejects an autosave that arrives after the deadline and keeps the earlier state', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    await expire(s);
    const late = await arrange(1, perfect(TABLE_PUZZLE as unknown as typeof SUM_PUZZLE));
    expect(late.status).toBe(409);
    expect(await json(late)).toMatchObject({ error: 'ATTEMPT_SUBMITTED', reason: 'timeout' });
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view.scorePercent).toBe(50);
  });

  it('reports a manual submit after the deadline as a timeout', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await startStudent(exam);
    await expire(s);
    const res = await json<{ reason: string }>(await s.call('POST', '/api/student/submit', {}));
    expect(res.reason).toBe('timeout');
  });

  it('is settled by the sweeper without any request from the student', async () => {
    const exam = await seedExam(anna, classId);
    const quiet = await startStudent(exam);
    const busy = await startStudent(exam);
    await quiet.arrange(0, perfect(SUM_PUZZLE));
    await expire(quiet.s);

    const n = await finaliseOverdue(t.current().db, new Date(), exam.examId);
    expect(n).toBe(1);
    expect(await finaliseOverdue(t.current().db, new Date(), exam.examId)).toBe(0); // idempotent

    const rows = await t.current().db<{ submitReason: string | null; scorePercent: number | null }[]>`
      SELECT submit_reason AS submitReason, score_percent AS scorePercent FROM attempts WHERE exam_id = ${exam.examId} ORDER BY id`;
    expect(rows[0]).toMatchObject({ submitReason: 'timeout' });
    expect(Number(rows[0]!.scorePercent)).toBe(50);
    expect(rows[1]!.submitReason).toBeNull(); // still working
    expect((await busy.s.call('GET', '/api/student/attempt')).status).toBe(200);
  });

  it('does not touch attempts that were already submitted', async () => {
    const exam = await seedExam(anna, classId);
    const { s, arrange } = await startStudent(exam);
    await arrange(0, perfect(SUM_PUZZLE));
    await s.call('POST', '/api/student/submit', {});
    await expire(s);
    await finaliseOverdue(t.current().db, new Date(), exam.examId);
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view.submitReason).toBe('manual');
  });

  it('lets a student who started before the exam closed finish after it closed', async () => {
    const exam = await seedExam(anna, classId, { timeLimitSeconds: 600 });
    const { s, arrange } = await startStudent(exam);
    await t.current().db`UPDATE exams SET closes_at = ${new Date(Date.now() - 1000)} WHERE id = ${exam.examId}`;
    expect((await arrange(0, perfect(SUM_PUZZLE))).status).toBe(200);
    expect((await s.call('POST', '/api/student/submit', {})).status).toBe(200);
  });
});
