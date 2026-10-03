import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent, seedExam, setExamTimes, SUM_PUZZLE, type SeededExam } from './helpers_exam.js';

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

/** Every key name anywhere in a JSON value. */
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

const SECRET_KEYS = ['solution', 'redHerrings', 'solutionPosition', 'correct', 'review', 'submission'];

interface View {
  status: string;
  exam: { phase: string };
  review?: {
    puzzles: {
      scorePercent: number;
      submission: { code: string; indent: number; correct: boolean }[];
      solution: { code: string; indent: number }[];
      redHerrings: { code: string }[];
    }[];
  };
  puzzles: { id: number; pieces: { pieceId: string; code: string }[] }[];
}

async function takeExam(exam: SeededExam, opts: { submit?: boolean; indentOf?: Record<string, number> } = {}) {
  const s = await joinedStudent(exam.code, `Student ${++counter}`);
  const view = await json<View>(await s.call('POST', '/api/student/start', {}));
  const id = (p: number, code: string) => view.puzzles[p]!.pieces.find((x) => x.code === code)!.pieceId;
  const put = (p: number, lines: { code: string; indent?: number }[]) =>
    s.call('PUT', `/api/student/puzzles/${view.puzzles[p]!.id}/state`, {
      placed: lines.map((l) => ({ pieceId: id(p, l.code), indent: l.indent ?? 0 })),
    });
  // Puzzle 1 perfect except the last two lines swapped; puzzle 2 left empty.
  const sol = SUM_PUZZLE.solution;
  await put(0, [sol[0]!, sol[1]!, sol[2]!, sol[4]!, sol[3]!].map((l) => ({ code: l.code, indent: opts.indentOf?.[l.code] ?? l.indent })));
  if (opts.submit !== false) await s.call('POST', '/api/student/submit', {});
  return { s, view, put };
}

const endExam = (exam: SeededExam) => setExamTimes(t.current().db, exam.examId, new Date(Date.now() - 7200_000), new Date(Date.now() - 1000));

describe('while the exam is running', () => {
  it('never returns anything that reveals the solution, at any step', async () => {
    const exam = await seedExam(anna, classId);
    const s = await joinedStudent(exam.code, `Leak ${++counter}`);
    const responses = [
      await s.call('GET', '/api/student/attempt'),
      await s.call('POST', '/api/student/start', {}),
      await s.call('GET', '/api/student/attempt'),
    ];
    const started = await json<View>(responses[1]!.clone());
    await s.call('PUT', `/api/student/puzzles/${started.puzzles[0]!.id}/state`, { placed: [] });
    responses.push(await s.call('POST', '/api/student/submit', {}));
    responses.push(await s.call('GET', '/api/student/attempt'));

    for (const res of responses) {
      const keys = keysOf(await json(res));
      for (const secret of SECRET_KEYS) expect(keys.has(secret), `${secret} in ${res.url}`).toBe(false);
    }
  });

  it('shows a submitted student only their percentage and the closing time', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await takeExam(exam);
    const view = await json<View & { scorePercent: number }>(await s.call('GET', '/api/student/attempt'));
    expect(view.status).toBe('submitted');
    expect(view.scorePercent).toBe(30); // puzzle 1: 3 of 5 right, puzzle 2: 0 -> mean 30
    expect(view.review).toBeUndefined();
  });
});

describe('after the exam is over', () => {
  it('shows submission and solution side by side with correctness flags', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await takeExam(exam);
    await endExam(exam);

    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view.exam.phase).toBe('over');
    const p1 = view.review!.puzzles[0]!;
    expect(p1.solution.map((l) => l.code)).toEqual(SUM_PUZZLE.solution.map((l) => l.code));
    expect(p1.solution[3]).toEqual({ code: 'total += i', indent: 1 });
    expect(p1.redHerrings.map((l) => l.code)).toEqual(['for i in range(n):']);
    expect(p1.submission.map((l) => l.correct)).toEqual([true, true, true, false, false]);
    expect(p1.scorePercent).toBe(60);
    const p2 = view.review!.puzzles[1]!;
    expect(p2.submission).toEqual([]);
    expect(p2.scorePercent).toBe(0);
    expect(p2.solution.length).toBeGreaterThan(0);
  });

  it('uses the pre-set indentation for the submission when students do not set it', async () => {
    const exam = await seedExam(anna, classId, { studentsIndent: false });
    const { s } = await takeExam(exam, { indentOf: { 'total += i': 0 } }); // client claims 0
    await endExam(exam);
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view.review!.puzzles[0]!.submission.find((l) => l.code === 'total += i')!.indent).toBe(1);
  });

  it('shows the indent the student chose when students set it themselves', async () => {
    const exam = await seedExam(anna, classId, { studentsIndent: true });
    const { s } = await takeExam(exam, { indentOf: { 'total += i': 0 } });
    await endExam(exam);
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    const line = view.review!.puzzles[0]!.submission.find((l) => l.code === 'total += i')!;
    expect(line.indent).toBe(0);
    expect(line.correct).toBe(false);
  });

  it('also reviews attempts that were submitted by the timer', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await takeExam(exam, { submit: false });
    await t.current().db`UPDATE attempts SET deadline_at = ${new Date(Date.now() - 1000)} WHERE exam_id = ${exam.examId}`;
    await endExam(exam);
    const view = await json<View & { submitReason: string }>(await s.call('GET', '/api/student/attempt'));
    expect(view.submitReason).toBe('timeout');
    expect(view.review!.puzzles[0]!.scorePercent).toBe(60);
  });

  it('does not review a student who is still working', async () => {
    const exam = await seedExam(anna, classId);
    const { s } = await takeExam(exam, { submit: false });
    await endExam(exam);
    const view = await json<View>(await s.call('GET', '/api/student/attempt'));
    expect(view.status).toBe('in_progress');
    const keys = keysOf(view);
    for (const secret of SECRET_KEYS) expect(keys.has(secret)).toBe(false);
  });
});
