import type { SQLInstance } from '../db/sql.js';
import { getAttempt, type AttemptRow } from './attempts.js';
import { puzzlePercent, round2, scoreExam } from './scoring.js';
import { parseState } from './student_view.js';

export type SubmitReason = 'manual' | 'timeout';

interface LineRow {
  puzzleId: number;
  publicId: string;
  solutionPosition: number | null;
  code: string;
  indent: number;
}

/**
 * Scores every puzzle from the last saved state and closes the attempt. Safe to call any number
 * of times and from several places at once: the attempt row is locked, and only the first call
 * writes. A timeout is recorded at the moment time ran out, not when someone noticed.
 */
export async function finaliseAttempt(
  db: SQLInstance,
  attemptId: number,
  reason: SubmitReason,
  now: Date
): Promise<AttemptRow> {
  await db.begin(async (tx) => {
    const locked = await tx<{ examId: number; submittedAt: Date | null; deadlineAt: Date | null; studentsIndent: number }[]>`
      SELECT a.exam_id AS examId, a.submitted_at AS submittedAt, a.deadline_at AS deadlineAt,
             e.students_indent AS studentsIndent
      FROM attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.id = ${attemptId} FOR UPDATE
    `;
    const row = locked[0];
    if (!row || row.submittedAt) return;

    const puzzles = await tx<{ id: number }[]>`SELECT id FROM puzzles WHERE exam_id = ${row.examId} ORDER BY position`;
    const lines = await tx<LineRow[]>`
      SELECT l.puzzle_id AS puzzleId, l.public_id AS publicId, l.solution_position AS solutionPosition,
             l.code, l.indent
      FROM puzzle_lines l JOIN puzzles p ON p.id = l.puzzle_id WHERE p.exam_id = ${row.examId}
    `;
    const saved = await tx<{ puzzleId: number; state: unknown }[]>`
      SELECT puzzle_id AS puzzleId, state FROM attempt_puzzles WHERE attempt_id = ${attemptId}
    `;
    const stateByPuzzle = new Map(saved.map((s) => [s.puzzleId, parseState(s.state)]));
    const studentsIndent = Boolean(row.studentsIndent);

    const scores: number[] = [];
    for (const p of puzzles) {
      const mine = lines.filter((l) => l.puzzleId === p.id);
      const byId = new Map(mine.map((l) => [l.publicId, l]));
      const solution = mine
        .filter((l) => l.solutionPosition !== null)
        .sort((a, b) => a.solutionPosition! - b.solutionPosition!)
        .map((l) => ({ code: l.code, indent: Number(l.indent) }));
      const placed = (stateByPuzzle.get(p.id) ?? []).flatMap((s) => {
        const line = byId.get(s.pieceId);
        if (!line) return [];
        // With pre-set indentation the piece's own indent counts, whatever the client sent.
        return [{ code: line.code, indent: studentsIndent ? s.indent : Number(line.indent) }];
      });
      const exact = puzzlePercent(solution, placed);
      scores.push(exact);
      await tx`UPDATE attempt_puzzles SET score_percent = ${round2(exact)} WHERE attempt_id = ${attemptId} AND puzzle_id = ${p.id}`;
    }

    const at = reason === 'timeout' && row.deadlineAt ? row.deadlineAt : now;
    await tx`
      UPDATE attempts SET submitted_at = ${at}, submit_reason = ${reason}, score_percent = ${scoreExam(scores)}
      WHERE id = ${attemptId}
    `;
  });
  return getAttempt(db, attemptId);
}

/** Applies a passed deadline to one attempt, if it has one. */
export async function settleIfOverdue(db: SQLInstance, attempt: AttemptRow, now: Date): Promise<AttemptRow> {
  if (attempt.startedAt && !attempt.submittedAt && attempt.deadlineAt && now >= attempt.deadlineAt) {
    return finaliseAttempt(db, attempt.id, 'timeout', now);
  }
  return attempt;
}

/** Finalises every attempt whose time has run out (optionally only for one exam). Returns how many. */
export async function finaliseOverdue(db: SQLInstance, now: Date, examId?: number): Promise<number> {
  const due = examId
    ? await db<{ id: number }[]>`
        SELECT id FROM attempts WHERE submitted_at IS NULL AND deadline_at IS NOT NULL AND deadline_at <= ${now} AND exam_id = ${examId}`
    : await db<{ id: number }[]>`
        SELECT id FROM attempts WHERE submitted_at IS NULL AND deadline_at IS NOT NULL AND deadline_at <= ${now}`;
  for (const { id } of due) await finaliseAttempt(db, id, 'timeout', now);
  return due.length;
}
