import type { SQLInstance } from '../src/db/sql.js';
import { app } from '../src/app.js';
import type { TestTeacher } from './helpers.js';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export interface SeededExam {
  examId: number;
  /** Code as students type it, e.g. "K7M-2QX" */
  code: string;
  puzzleIds: number[];
}

export const SUM_PUZZLE = {
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

export const TABLE_PUZZLE = {
  title: 'Times table',
  description: '',
  solution: [
    { code: 'n = 5', indent: 0 },
    { code: 'for i in range(1, 11):', indent: 0 },
    { code: 'print(n * i)', indent: 1 },
  ],
  redHerrings: [{ code: 'print(n)', indent: 1 }, { code: 'print(i)', indent: 1 }],
};

/** A published exam with two puzzles. `state` picks live / scheduled / over. */
export async function seedExam(
  teacher: TestTeacher,
  classId: number,
  opts: { state?: 'live' | 'scheduled' | 'over'; studentsIndent?: boolean; timeLimitSeconds?: number; publish?: boolean;
    /** Random subset size; null/undefined = all puzzles. */ puzzlesPerStudent?: number | null; extraPuzzles?: number } = {}
): Promise<SeededExam> {
  const { state = 'live', studentsIndent = false, timeLimitSeconds = 600, publish = true, puzzlesPerStudent = null, extraPuzzles = 0 } = opts;
  const [opensAt, closesAt] = { live: [hours(-1), hours(1)], scheduled: [hours(1), hours(2)], over: [hours(-2), hours(-1)] }[state];
  const ex = await teacher.call('POST', `/api/teacher/classes/${classId}/exams`, {
    title: 'Loops',
    opensAt,
    closesAt,
    studentsIndent,
    timeLimitSeconds,
    puzzlesPerStudent,
  });
  const exam = ((await ex.json()) as { exam: { id: number; accessCode: string } }).exam;
  const puzzleIds: number[] = [];
  const extras = Array.from({ length: extraPuzzles }, (_, i) => ({ ...TABLE_PUZZLE, title: `Extra ${i + 1}` }));
  for (const body of [SUM_PUZZLE, TABLE_PUZZLE, ...extras]) {
    const res = await teacher.call('POST', `/api/teacher/exams/${exam.id}/puzzles`, body);
    puzzleIds.push(((await res.json()) as { puzzle: { id: number } }).puzzle.id);
  }
  if (publish) {
    const res = await teacher.call('POST', `/api/teacher/exams/${exam.id}/publish`, {});
    if (res.status !== 200) throw new Error(`publish failed: ${await res.text()}`);
  }
  return { examId: exam.id, code: exam.accessCode, puzzleIds };
}

export async function createClass(teacher: TestTeacher, name = 'Class'): Promise<number> {
  const res = await teacher.call('POST', '/api/teacher/classes', { name });
  return ((await res.json()) as { class: { id: number } }).class.id;
}

export interface TestStudent {
  token: string;
  call: (method: string, path: string, body?: unknown) => Promise<Response>;
}

export function asStudent(token: string): TestStudent {
  return {
    token,
    call: async (method, path, body) =>
      app.request(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

export async function join(code: string, name: string): Promise<Response> {
  return app.request('/api/student/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
}

export async function joinedStudent(code: string, name: string): Promise<TestStudent> {
  const res = await join(code, name);
  if (res.status !== 201) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return asStudent(((await res.json()) as { token: string }).token);
}

export async function setExamTimes(db: SQLInstance, examId: number, opensAt: Date, closesAt: Date): Promise<void> {
  await db`UPDATE exams SET opens_at = ${opensAt}, closes_at = ${closesAt} WHERE id = ${examId}`;
}
