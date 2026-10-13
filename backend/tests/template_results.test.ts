import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent, seedMixedExam, setExamTimes, SUM_PUZZLE, type SeededExam } from './helpers_exam.js';

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

/**
 * Line puzzle left empty. Template: gap 0 any-order both pieces reversed (2/2), gap 1 empty,
 * gap 2 right, gap 3 [SELECT, id] of [SELECT, id, SELECT] (2/3), gap 4 right, gap 5 the herring (0/1).
 * Template score: 6 of 8 = 75. Exam: mean(0, 75) = 37.5.
 */
async function takeExam(exam: SeededExam, opts: { submit?: boolean } = {}) {
  const s = await joinedStudent(exam.code, `Student ${++counter}`);
  const view = await json(await s.call('POST', '/api/student/start', {}));
  const puzzle = view.puzzles[1];
  const id = (text: string, n = 0) => puzzle.pieces.filter((x: any) => x.text === text)[n].pieceId;
  const gaps = {
    0: [id('@Gen'), id('@Id')],
    2: [id('note')],
    3: [id('SELECT'), id('id')],
    4: [id(')', 0)],
    5: [id('junk')],
  };
  await s.call('PUT', `/api/student/puzzles/${puzzle.id}/state`, { gaps });
  if (opts.submit !== false) await s.call('POST', '/api/student/submit', {});
  return s;
}

const endExam = (exam: SeededExam) => setExamTimes(t.current().db, exam.examId, new Date(Date.now() - 7200_000), new Date(Date.now() - 1000));

describe('mixed exam', () => {
  it('scores line and template puzzles with their own scorers', async () => {
    const exam = await seedMixedExam(anna, classId);
    const s = await takeExam(exam);
    const view = await json(await s.call('GET', '/api/student/attempt'));
    expect(view.status).toBe('submitted');
    expect(view.scorePercent).toBe(37.5);
    expect(view.review).toBeUndefined();
  });

  it('scores a timed-out attempt from the saved state', async () => {
    const exam = await seedMixedExam(anna, classId);
    const s = await takeExam(exam, { submit: false });
    await t.current().db`UPDATE attempts SET deadline_at = ${new Date(Date.now() - 1000)} WHERE exam_id = ${exam.examId}`;
    const view = await json(await s.call('GET', '/api/student/attempt'));
    expect(view.submitReason).toBe('timeout');
    expect(view.scorePercent).toBe(37.5);
  });

  it('scores a template puzzle with nothing placed as 0', async () => {
    const exam = await seedMixedExam(anna, classId);
    const s = await joinedStudent(exam.code, `Idle ${++counter}`);
    await s.call('POST', '/api/student/start', {});
    const res = await json(await s.call('POST', '/api/student/submit', {}));
    expect(res.scorePercent).toBe(0);
  });
});

describe('review after the exam is over', () => {
  it('returns template puzzles as lines with gaps, plus red herrings and reusable texts', async () => {
    const exam = await seedMixedExam(anna, classId);
    const s = await takeExam(exam);
    await endExam(exam);
    const view = await json(await s.call('GET', '/api/student/attempt'));
    const [lines, tpl] = view.review.puzzles;
    expect(lines.kind).toBe('lines');
    expect(tpl).toMatchObject({ kind: 'template', title: 'Entity', scorePercent: 75, redHerrings: ['junk'], reusable: ['SELECT'] });
    const gaps = tpl.lines.flat().filter((seg: any) => 'gap' in seg);
    expect(gaps).toEqual([
      { gap: 0, expected: ['@Id', '@Gen'], anyOrder: true, submitted: [{ text: '@Gen', correct: true }, { text: '@Id', correct: true }] },
      { gap: 1, expected: [], anyOrder: false, submitted: [] },
      { gap: 2, expected: ['note'], anyOrder: false, submitted: [{ text: 'note', correct: true }] },
      { gap: 3, expected: ['SELECT', 'id', 'SELECT'], anyOrder: false, submitted: [{ text: 'SELECT', correct: true }, { text: 'id', correct: true }] },
      { gap: 4, expected: [')'], anyOrder: false, submitted: [{ text: ')', correct: true }] },
      { gap: 5, expected: [')'], anyOrder: false, submitted: [{ text: 'junk', correct: false }] },
    ]);
    expect(tpl.lines[0]).toEqual([{ text: 'class A {' }]);
  });

  it('flags the extra piece of an over-filled ordered gap as wrong', async () => {
    const exam = await seedMixedExam(anna, classId);
    const s = await joinedStudent(exam.code, `Extra ${++counter}`);
    const view = await json(await s.call('POST', '/api/student/start', {}));
    const p = view.puzzles[1];
    const id = (text: string) => p.pieces.find((x: any) => x.text === text).pieceId;
    // Against [SELECT, id, SELECT] the common subsequence is [id, SELECT]; the later SELECTs are extra.
    await s.call('PUT', `/api/student/puzzles/${p.id}/state`, { gaps: { 3: [id('id'), id('SELECT'), id('SELECT'), id('SELECT')] } });
    await s.call('POST', '/api/student/submit', {});
    await endExam(exam);
    const review = (await json(await s.call('GET', '/api/student/attempt'))).review.puzzles[1];
    const gap3 = review.lines.flat().find((seg: any) => seg.gap === 3);
    expect(gap3.submitted.map((x: any) => x.correct)).toEqual([true, true, false, false]);
  });
});

describe('teacher views', () => {
  it('shows the same review in the attempt detail and lists kind and score in results', async () => {
    const exam = await seedMixedExam(anna, classId);
    await takeExam(exam);
    const list = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    expect(list.puzzles.map((p: any) => p.kind)).toEqual(['lines', 'template']);
    const row = list.attempts[0];
    expect(row.scorePercent).toBe(37.5);
    expect(row.puzzles.map((p: any) => p.scorePercent)).toEqual([0, 75]);

    const { attempt: detail } = await json(await anna.call('GET', `/api/teacher/attempts/${row.id}`));
    expect(detail.puzzles[1]).toMatchObject({ kind: 'template', scorePercent: 75, redHerrings: ['junk'], reusable: ['SELECT'] });
    expect(detail.puzzles[1].lines[1][1]).toMatchObject({ gap: 0, anyOrder: true, expected: ['@Id', '@Gen'] });
  });

  it('exports template puzzles with their source and per-gap results, scores equal to the list', async () => {
    const exam = await seedMixedExam(anna, classId);
    await takeExam(exam);
    const file = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/export`));
    expect(file.version).toBe(1);
    expect(file.exam.puzzles[0]).toMatchObject({ kind: 'lines', title: SUM_PUZZLE.title });
    expect(file.exam.puzzles[1]).toMatchObject({ kind: 'template', redHerrings: ['junk'], reusable: ['SELECT'] });
    expect(file.exam.puzzles[1].template).toContain('{{~@Id}}');

    const result = file.results[0];
    const list = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    expect(result.scorePercent).toBe(list.attempts[0].scorePercent);
    expect(result.puzzles.map((p: any) => p.scorePercent)).toEqual([0, 75]);
    expect(result.puzzles[0]).toMatchObject({ kind: 'lines', submitted: [] });
    expect(result.puzzles[1].kind).toBe('template');
    expect(result.puzzles[1].gaps).toHaveLength(6);
    expect(result.puzzles[1].gaps[5]).toEqual({ submitted: [{ text: 'junk', correct: false }] });
  });
});
