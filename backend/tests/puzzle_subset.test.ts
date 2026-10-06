import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resetRateLimits } from '../src/lib/rate_limit.js';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';
import { createClass, joinedStudent, seedExam } from './helpers_exam.js';

const t = useTestDb();
let anna: TestTeacher;
let classId: number;

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  classId = await createClass(anna, '4AHIF');
});
beforeEach(() => resetRateLimits());

const json = async <T = Record<string, any>>(res: Response) => (await res.json()) as T;

async function startedPuzzleIds(code: string, name: string) {
  const s = await joinedStudent(code, name);
  const view = await json(await s.call('POST', '/api/student/start', {}));
  return { student: s, ids: (view.puzzles as { id: number }[]).map((p) => p.id) };
}

describe('puzzles per student', () => {
  it('gives everyone every puzzle when it is not set', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 2 });
    const { ids } = await startedPuzzleIds(exam.code, 'Anna');
    expect(ids).toHaveLength(4);
    const res = await anna.call('GET', `/api/teacher/exams/${exam.examId}`);
    expect((await json(res)).exam.puzzlesPerStudent).toBeNull();
  });

  it('gives each student n distinct puzzles from the exam, in exam order', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 6, puzzlesPerStudent: 3 });
    const seen = new Set<string>();
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const { ids } = await startedPuzzleIds(exam.code, name);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      expect(ids.every((id) => id >= exam.puzzleIds[0]!)).toBe(true);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      seen.add(ids.join(','));
    }
    expect(seen.size).toBeGreaterThan(1); // not the same three for everybody
  });

  it('keeps a student on the same puzzles when they reload', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 6, puzzlesPerStudent: 2 });
    const { student, ids } = await startedPuzzleIds(exam.code, 'Anna');
    const again = await json(await student.call('GET', '/api/student/attempt'));
    expect(again.puzzles.map((p: { id: number }) => p.id)).toEqual(ids);
    expect(again.exam.puzzleCount).toBe(2);
  });

  it('shows the assigned count before starting and on the lookup', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 3, puzzlesPerStudent: 2 });
    const lookup = await json(await (await import('../src/app.js')).app.request('/api/student/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: exam.code }),
    }));
    expect(lookup.puzzleCount).toBe(2);
    const s = await joinedStudent(exam.code, 'Anna');
    expect((await json(await s.call('GET', '/api/student/attempt'))).exam.puzzleCount).toBe(2);
  });

  it('rejects state saves for puzzles the student was not given', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 4, puzzlesPerStudent: 1 });
    const { student, ids } = await startedPuzzleIds(exam.code, 'Anna');
    const other = exam.puzzleIds.find((id) => !ids.includes(id))!;
    expect((await student.call('PUT', `/api/student/puzzles/${other}/state`, { placed: [] })).status).toBe(404);
    expect((await student.call('PUT', `/api/student/puzzles/${ids[0]}/state`, { placed: [] })).status).toBe(200);
  });

  it('scores only the assigned puzzles', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 4, puzzlesPerStudent: 2 });
    const { student } = await startedPuzzleIds(exam.code, 'Anna');
    const submitted = await json(await student.call('POST', '/api/student/submit', {}));
    // Nothing placed: 0% of the two assigned puzzles, and the review lists just those two.
    expect(submitted.scorePercent).toBe(0);
    const results = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/results`));
    const row = results.attempts[0];
    expect(row.puzzles).toHaveLength(6);
    expect(row.puzzles.filter((p: { assigned: boolean }) => p.assigned)).toHaveLength(2);
    expect(row.puzzles.filter((p: { scorePercent: number | null }) => p.scorePercent === null)).toHaveLength(4);

    const detail = await json(await anna.call('GET', `/api/teacher/attempts/${row.id}`));
    expect(detail.attempt?.puzzles ?? detail.puzzles).toHaveLength(2);
    const exported = await json(await anna.call('GET', `/api/teacher/exams/${exam.examId}/export`));
    expect(exported.exam.puzzles).toHaveLength(6);
    expect(exported.results[0].puzzles).toHaveLength(2);
  });

  it('cannot be published asking for more puzzles than exist', async () => {
    const exam = await seedExam(anna, classId, { puzzlesPerStudent: 5, publish: false });
    const res = await anna.call('POST', `/api/teacher/exams/${exam.examId}/publish`, {});
    expect(res.status).toBe(409);
    expect(JSON.stringify(await json(res))).toContain('only 2');
  });

  it('can be changed until students start, then it is locked', async () => {
    const exam = await seedExam(anna, classId, { extraPuzzles: 2, puzzlesPerStudent: 2 });
    const patch = (v: number | null) => anna.call('PATCH', `/api/teacher/exams/${exam.examId}`, { puzzlesPerStudent: v });
    expect((await patch(3)).status).toBe(200);
    expect((await patch(null)).status).toBe(200);
    expect((await patch(0)).status).toBe(400);
    await startedPuzzleIds(exam.code, 'Anna');
    expect((await patch(1)).status).toBe(409);
  });
});
