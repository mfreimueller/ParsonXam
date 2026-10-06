import type { SQLInstance } from '../db/sql.js';
import { assignedCount, findExamById, type AttemptRow } from './attempts.js';
import { examPhase } from './exam_phase.js';
import { puzzleSeed, shuffled } from './shuffle.js';
import { puzzlePercent, round2 } from './scoring.js';

// The ONLY place that turns puzzle data into something a student receives.
// While an exam is running it never reads solution_position, so the correct order and the red
// herrings cannot leak. buildReview is the single exception and is used only once the exam is over.

export interface Placed {
  pieceId: string;
  indent: number;
}

export function parseState(raw: unknown): Placed[] {
  // MariaDB hands LONGTEXT back as a string, MySQL's JSON type as an object.
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(value) ? (value as Placed[]) : [];
}

export type PuzzleRow = { id: number; title: string; description: string };

/**
 * The puzzles this student was given, in exam order. Once the attempt has started that is the set
 * picked at start (attempt_puzzles); before that only the count is known.
 */
export async function attemptPuzzleRows(db: SQLInstance, attempt: AttemptRow): Promise<PuzzleRow[]> {
  return db<PuzzleRow[]>`
    SELECT p.id, p.title, p.description FROM puzzles p
    JOIN attempt_puzzles ap ON ap.puzzle_id = p.id AND ap.attempt_id = ${attempt.id}
    ORDER BY p.position
  `;
}

export async function buildAttemptView(db: SQLInstance, attempt: AttemptRow, now: Date) {
  const exam = await findExamById(db, attempt.examId);
  const puzzleRows = await attemptPuzzleRows(db, attempt);
  const puzzleCount = attempt.startedAt ? puzzleRows.length : assignedCount(exam, await countExamPuzzles(db, exam.id));

  const base = {
    serverNow: now.toISOString(),
    studentName: attempt.studentName,
    exam: {
      title: exam.title,
      className: exam.className,
      instructions: exam.instructions,
      puzzleCount,
      timeLimitSeconds: exam.timeLimitSeconds,
      studentsIndent: exam.studentsIndent,
      opensAt: exam.opensAt?.toISOString() ?? null,
      closesAt: exam.closesAt?.toISOString() ?? null,
      phase: examPhase(exam, now),
    },
  };

  if (!attempt.startedAt) return { status: 'joined' as const, ...base };

  if (attempt.submittedAt) {
    const submitted = {
      status: 'submitted' as const,
      ...base,
      submittedAt: attempt.submittedAt.toISOString(),
      submitReason: attempt.submitReason,
      scorePercent: Number(attempt.scorePercent),
    };
    // Solutions are shown only after the teacher's "exam over" time.
    if (base.exam.phase !== 'over') return submitted;
    return { ...submitted, review: await buildReview(db, attempt, exam.studentsIndent, puzzleRows) };
  }

  const saved = await db<{ puzzleId: number; state: unknown }[]>`
    SELECT puzzle_id AS puzzleId, state FROM attempt_puzzles WHERE attempt_id = ${attempt.id}
  `;
  const stateByPuzzle = new Map(saved.map((s) => [s.puzzleId, parseState(s.state)]));

  const puzzles = [];
  for (const p of puzzleRows) {
    const lines = await db<{ publicId: string; code: string; indent: number }[]>`
      SELECT public_id AS publicId, code, indent FROM puzzle_lines WHERE puzzle_id = ${p.id} ORDER BY id
    `;
    const pieces = shuffled(lines, puzzleSeed(attempt.shuffleSeed, p.id)).map((l) =>
      // When students set the indentation themselves the pieces arrive flat.
      exam.studentsIndent
        ? { pieceId: l.publicId, code: l.code }
        : { pieceId: l.publicId, code: l.code, indent: Number(l.indent) }
    );
    puzzles.push({
      id: p.id,
      title: p.title,
      description: p.description,
      pieces,
      placed: stateByPuzzle.get(p.id) ?? [],
    });
  }

  return {
    status: 'in_progress' as const,
    ...base,
    startedAt: attempt.startedAt.toISOString(),
    deadlineAt: attempt.deadlineAt!.toISOString(),
    puzzles,
  };
}

interface ReviewLine {
  code: string;
  indent: number;
}

export async function buildReview(
  db: SQLInstance,
  attempt: AttemptRow,
  studentsIndent: boolean,
  puzzleRows: PuzzleRow[]
) {
  const saved = await db<{ puzzleId: number; state: unknown }[]>`
    SELECT puzzle_id AS puzzleId, state FROM attempt_puzzles WHERE attempt_id = ${attempt.id}
  `;
  const stateByPuzzle = new Map(saved.map((s) => [s.puzzleId, parseState(s.state)]));

  const puzzles = [];
  for (const p of puzzleRows) {
    const lines = await db<{ publicId: string; code: string; indent: number; solutionPosition: number | null }[]>`
      SELECT public_id AS publicId, code, indent, solution_position AS solutionPosition
      FROM puzzle_lines WHERE puzzle_id = ${p.id} ORDER BY solution_position IS NULL, solution_position, id
    `;
    const byId = new Map(lines.map((l) => [l.publicId, l]));
    const solution: ReviewLine[] = lines
      .filter((l) => l.solutionPosition !== null)
      .map((l) => ({ code: l.code, indent: Number(l.indent) }));
    const redHerrings: ReviewLine[] = lines
      .filter((l) => l.solutionPosition === null)
      .map((l) => ({ code: l.code, indent: Number(l.indent) }));

    const placed: ReviewLine[] = (stateByPuzzle.get(p.id) ?? []).flatMap((s) => {
      const line = byId.get(s.pieceId);
      return line ? [{ code: line.code, indent: studentsIndent ? s.indent : Number(line.indent) }] : [];
    });
    puzzles.push({
      id: p.id,
      title: p.title,
      description: p.description,
      scorePercent: round2(puzzlePercent(solution, placed)),
      submission: placed.map((l, i) => ({
        ...l,
        correct: solution[i] !== undefined && solution[i]!.code === l.code && solution[i]!.indent === l.indent,
      })),
      solution,
      redHerrings,
    });
  }
  return { puzzles };
}

export async function countExamPuzzles(db: SQLInstance, examId: number): Promise<number> {
  const rows = await db<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzles WHERE exam_id = ${examId}`;
  return Number(rows[0]!.n);
}
