import type { SQLInstance } from '../db/sql.js';
import { findExamById, type AttemptRow } from './attempts.js';
import { examPhase } from './exam_phase.js';
import { puzzleSeed, shuffled } from './shuffle.js';

// The ONLY place that turns puzzle data into something a student receives.
// It never reads solution_position, so correct order and red herrings cannot leak from here.

export interface Placed {
  pieceId: string;
  indent: number;
}

export function parseState(raw: unknown): Placed[] {
  // MariaDB hands LONGTEXT back as a string, MySQL's JSON type as an object.
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(value) ? (value as Placed[]) : [];
}

export async function buildAttemptView(db: SQLInstance, attempt: AttemptRow, now: Date) {
  const exam = await findExamById(db, attempt.examId);
  const puzzleRows = await db<{ id: number; title: string; description: string }[]>`
    SELECT id, title, description FROM puzzles WHERE exam_id = ${exam.id} ORDER BY position
  `;

  const base = {
    serverNow: now.toISOString(),
    studentName: attempt.studentName,
    exam: {
      title: exam.title,
      className: exam.className,
      instructions: exam.instructions,
      puzzleCount: puzzleRows.length,
      timeLimitSeconds: exam.timeLimitSeconds,
      studentsIndent: exam.studentsIndent,
      opensAt: exam.opensAt?.toISOString() ?? null,
      closesAt: exam.closesAt?.toISOString() ?? null,
      phase: examPhase(exam, now),
    },
  };

  if (!attempt.startedAt) return { status: 'joined' as const, ...base };

  if (attempt.submittedAt) {
    throw new Error('submitted view is built in buildSubmittedView');
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
