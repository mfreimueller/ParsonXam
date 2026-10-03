import type { SQLInstance } from '../db/sql.js';
import { AppError } from '../errors.js';
import { ATTEMPT_COLUMNS, getAttempt, type AttemptRow } from './attempts.js';
import { raw } from '../db/sql.js';
import { round2 } from './scoring.js';
import { buildReview } from './student_view.js';

type PuzzleRow = { id: number; title: string; description: string };
type AttemptStatus = 'joined' | 'in_progress' | 'submitted';

const statusOf = (a: AttemptRow): AttemptStatus => (a.submittedAt ? 'submitted' : a.startedAt ? 'in_progress' : 'joined');

async function examPuzzleRows(db: SQLInstance, examId: number): Promise<PuzzleRow[]> {
  return db<PuzzleRow[]>`SELECT id, title, description FROM puzzles WHERE exam_id = ${examId} ORDER BY position`;
}

async function attemptsOf(db: SQLInstance, examId: number): Promise<AttemptRow[]> {
  return db<AttemptRow[]>`${raw(`SELECT ${ATTEMPT_COLUMNS} FROM attempts`)} WHERE exam_id = ${examId} ORDER BY student_name, id`;
}

/** Stats and one row per attempt. Call finaliseOverdue first so timed-out attempts have scores. */
export async function buildResults(db: SQLInstance, examId: number) {
  const puzzles = await examPuzzleRows(db, examId);
  const attempts = await attemptsOf(db, examId);
  const scores = await db<{ attemptId: number; puzzleId: number; scorePercent: number | null }[]>`
    SELECT ap.attempt_id AS attemptId, ap.puzzle_id AS puzzleId, ap.score_percent AS scorePercent
    FROM attempt_puzzles ap JOIN attempts a ON a.id = ap.attempt_id WHERE a.exam_id = ${examId}`;
  const byAttempt = new Map<number, Map<number, number>>();
  for (const s of scores) {
    const m = byAttempt.get(s.attemptId) ?? new Map<number, number>();
    m.set(s.puzzleId, Number(s.scorePercent ?? 0));
    byAttempt.set(s.attemptId, m);
  }

  const rows = attempts.map((a) => ({
    id: a.id,
    studentName: a.studentName,
    status: statusOf(a),
    joinedAt: a.joinedAt.toISOString(),
    startedAt: a.startedAt?.toISOString() ?? null,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    submitReason: a.submitReason,
    scorePercent: a.submittedAt ? Number(a.scorePercent) : null,
    puzzles: puzzles.map((p) => ({
      puzzleId: p.id,
      scorePercent: a.submittedAt ? (byAttempt.get(a.id)?.get(p.id) ?? 0) : null,
    })),
  }));

  const done = rows.filter((r) => r.status === 'submitted').map((r) => r.scorePercent!);
  return {
    puzzles: puzzles.map((p) => ({ id: p.id, title: p.title })),
    stats: {
      joined: rows.length,
      inProgress: rows.filter((r) => r.status === 'in_progress').length,
      submitted: done.length,
      timedOut: rows.filter((r) => r.submitReason === 'timeout').length,
      averagePercent: done.length ? round2(done.reduce((a, b) => a + b, 0) / done.length) : null,
      highestPercent: done.length ? Math.max(...done) : null,
      lowestPercent: done.length ? Math.min(...done) : null,
    },
    attempts: rows,
  };
}

export async function findAttempt(db: SQLInstance, attemptId: number): Promise<AttemptRow> {
  const exists = await db<{ id: number }[]>`SELECT id FROM attempts WHERE id = ${attemptId}`;
  if (!exists[0]) throw new AppError(404, 'NOT_FOUND', 'Attempt not found.');
  return getAttempt(db, attemptId);
}

export async function buildAttemptDetail(db: SQLInstance, attempt: AttemptRow, studentsIndent: boolean) {
  const puzzles = await examPuzzleRows(db, attempt.examId);
  const { puzzles: review } = await buildReview(db, attempt, studentsIndent, puzzles);
  return {
    id: attempt.id,
    examId: attempt.examId,
    studentName: attempt.studentName,
    status: statusOf(attempt),
    joinedAt: attempt.joinedAt.toISOString(),
    startedAt: attempt.startedAt?.toISOString() ?? null,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    submitReason: attempt.submitReason,
    scorePercent: attempt.submittedAt ? Number(attempt.scorePercent) : null,
    puzzles: review,
  };
}

interface ExportExam {
  id: number;
  title: string;
  timeLimitSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  studentsIndent: boolean;
}

/** The versioned export from SPEC.md: submitted attempts only. */
export async function buildExport(db: SQLInstance, exam: ExportExam, className: string, now: Date) {
  const puzzles = await examPuzzleRows(db, exam.id);
  const attempts = (await attemptsOf(db, exam.id)).filter((a) => a.submittedAt);

  const exportedPuzzles = [];
  for (const p of puzzles) {
    const lines = await db<{ code: string; indent: number; solutionPosition: number | null }[]>`
      SELECT code, indent, solution_position AS solutionPosition FROM puzzle_lines WHERE puzzle_id = ${p.id}
      ORDER BY solution_position IS NULL, solution_position, id`;
    exportedPuzzles.push({
      id: p.id,
      title: p.title,
      solution: lines.filter((l) => l.solutionPosition !== null).map((l) => ({ code: l.code, indent: Number(l.indent) })),
      redHerrings: lines.filter((l) => l.solutionPosition === null).map((l) => l.code),
    });
  }

  const results = [];
  for (const a of attempts) {
    const { puzzles: review } = await buildReview(db, a, exam.studentsIndent, puzzles);
    results.push({
      studentName: a.studentName,
      startedAt: a.startedAt?.toISOString() ?? null,
      submittedAt: a.submittedAt!.toISOString(),
      submitReason: a.submitReason,
      scorePercent: Number(a.scorePercent),
      puzzles: review.map((p) => ({ puzzleId: p.id, scorePercent: p.scorePercent, submitted: p.submission })),
    });
  }

  return {
    version: 1,
    exportedAt: now.toISOString(),
    exam: {
      title: exam.title,
      class: className,
      timeLimitSeconds: exam.timeLimitSeconds,
      opensAt: exam.opensAt,
      closesAt: exam.closesAt,
      studentsIndent: exam.studentsIndent,
      puzzles: exportedPuzzles,
    },
    results,
  };
}
