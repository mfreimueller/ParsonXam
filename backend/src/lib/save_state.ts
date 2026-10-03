import type { SQLInstance } from '../db/sql.js';
import { AppError } from '../errors.js';
import type { AttemptRow } from './attempts.js';

export interface PlacedInput {
  pieceId: string;
  indent: number;
}

// Stores the arrangement of one puzzle. Locks the attempt row so an autosave can never land
// after the attempt was scored.
export async function saveState(
  db: SQLInstance,
  attempt: AttemptRow,
  puzzleId: number,
  placed: PlacedInput[],
  now: Date
): Promise<Date> {
  if (!attempt.startedAt) throw new AppError(409, 'NOT_STARTED', 'Start the exam first.');
  if (attempt.submittedAt) throw submitted(attempt);

  return db.begin(async (tx) => {
    const locked = await tx<{ submittedAt: Date | null; deadlineAt: Date | null; studentsIndent: number }[]>`
      SELECT a.submitted_at AS submittedAt, a.deadline_at AS deadlineAt, e.students_indent AS studentsIndent
      FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = ${attempt.id} FOR UPDATE
    `;
    const row = locked[0]!;
    if (row.submittedAt || (row.deadlineAt && now >= row.deadlineAt)) {
      throw new AppError(409, 'ATTEMPT_SUBMITTED', 'Your answers were already submitted.', {
        reason: row.submittedAt ? attempt.submitReason ?? 'manual' : 'timeout',
      });
    }

    const mine = await tx<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM attempt_puzzles WHERE attempt_id = ${attempt.id} AND puzzle_id = ${puzzleId}
    `;
    if (Number(mine[0]!.n) === 0) throw new AppError(404, 'NOT_FOUND', 'No such puzzle in this exam.');

    const lines = await tx<{ publicId: string; indent: number }[]>`
      SELECT public_id AS publicId, indent FROM puzzle_lines WHERE puzzle_id = ${puzzleId}
    `;
    const known = new Map(lines.map((l) => [l.publicId, Number(l.indent)]));
    const seen = new Set<string>();
    for (const p of placed) {
      if (!known.has(p.pieceId) || seen.has(p.pieceId)) {
        throw new AppError(400, 'VALIDATION', 'The arrangement contains an unknown or repeated piece.');
      }
      seen.add(p.pieceId);
    }

    // With pre-set indentation the piece's own indent is kept, whatever the client sent.
    const state = placed.map((p) => ({
      pieceId: p.pieceId,
      indent: row.studentsIndent ? p.indent : known.get(p.pieceId)!,
    }));
    await tx`
      UPDATE attempt_puzzles SET state = ${JSON.stringify(state)}, updated_at = ${now}
      WHERE attempt_id = ${attempt.id} AND puzzle_id = ${puzzleId}
    `;
    return now;
  });
}

function submitted(attempt: AttemptRow): AppError {
  return new AppError(409, 'ATTEMPT_SUBMITTED', 'Your answers were already submitted.', {
    reason: attempt.submitReason ?? 'manual',
  });
}
