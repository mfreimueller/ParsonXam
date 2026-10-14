import type { SQLInstance, TransactionSQL } from '../db/sql.js';
import { AppError } from '../errors.js';
import type { AttemptRow } from './attempts.js';
import { parseTemplate } from './template.js';

export interface PlacedInput {
  pieceId: string;
  indent: number;
}

/** What a client may send: `placed` for line puzzles, `gaps` (gap index -> piece ids) for templates. */
export interface StateInput {
  placed?: PlacedInput[] | undefined;
  gaps?: Record<string, string[]> | undefined;
}

export const MAX_PIECES_PER_GAP = 20;

const invalid = (message: string) => new AppError(400, 'VALIDATION', message);

// Stores the arrangement of one puzzle. Locks the attempt row so an autosave can never land
// after the attempt was scored.
export async function saveState(
  db: SQLInstance,
  attempt: AttemptRow,
  puzzleId: number,
  input: StateInput,
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

    const mine = await tx<{ kind: 'lines' | 'template'; template: string | null }[]>`
      SELECT p.kind, p.template FROM attempt_puzzles ap JOIN puzzles p ON p.id = ap.puzzle_id
      WHERE ap.attempt_id = ${attempt.id} AND ap.puzzle_id = ${puzzleId}
    `;
    if (!mine[0]) throw new AppError(404, 'NOT_FOUND', 'No such puzzle in this exam.');

    const state =
      mine[0].kind === 'template'
        ? await templateState(tx, puzzleId, mine[0].template ?? '', input.gaps)
        : await linesState(tx, puzzleId, row.studentsIndent, input.placed);
    await tx`
      UPDATE attempt_puzzles SET state = ${JSON.stringify(state)}, updated_at = ${now}
      WHERE attempt_id = ${attempt.id} AND puzzle_id = ${puzzleId}
    `;
    return now;
  });
}

async function linesState(tx: TransactionSQL, puzzleId: number, studentsIndent: number, placed: PlacedInput[] | undefined) {
  if (!placed) throw invalid('This puzzle takes { placed: [...] }.');
  const lines = await tx<{ publicId: string; indent: number }[]>`
    SELECT public_id AS publicId, indent FROM puzzle_lines WHERE puzzle_id = ${puzzleId}
  `;
  const known = new Map(lines.map((l) => [l.publicId, Number(l.indent)]));
  const seen = new Set<string>();
  for (const p of placed) {
    if (!known.has(p.pieceId) || seen.has(p.pieceId)) {
      throw invalid('The arrangement contains an unknown or repeated piece.');
    }
    seen.add(p.pieceId);
  }

  // With pre-set indentation the piece's own indent is kept, whatever the client sent.
  return placed.map((p) => ({ pieceId: p.pieceId, indent: studentsIndent ? p.indent : known.get(p.pieceId)! }));
}

// Known gap indexes, pieces of this puzzle, a non-reusable piece at most once, bounded gap size.
async function templateState(tx: TransactionSQL, puzzleId: number, template: string, gaps: Record<string, string[]> | undefined) {
  if (!gaps) throw invalid('This puzzle takes { gaps: {...} }.');
  const gapCount = parseTemplate(template).gaps.length;
  const pieces = await tx<{ publicId: string; reusable: number }[]>`
    SELECT public_id AS publicId, reusable FROM puzzle_pieces WHERE puzzle_id = ${puzzleId}
  `;
  const reusable = new Map(pieces.map((p) => [p.publicId, Boolean(p.reusable)]));
  const used = new Set<string>();
  const clean: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(gaps)) {
    if (!/^\d+$/.test(key) || Number(key) >= gapCount) throw invalid(`Unknown gap ${key}.`);
    if (ids.length > MAX_PIECES_PER_GAP) throw invalid(`A gap holds at most ${MAX_PIECES_PER_GAP} pieces.`);
    for (const id of ids) {
      if (!reusable.has(id)) throw invalid('The arrangement contains an unknown piece.');
      if (!reusable.get(id)) {
        if (used.has(id)) throw invalid('A piece that is not reusable can be placed only once.');
        used.add(id);
      }
    }
    if (ids.length > 0) clean[String(Number(key))] = ids;
  }
  return { gaps: clean };
}

function submitted(attempt: AttemptRow): AppError {
  return new AppError(409, 'ATTEMPT_SUBMITTED', 'Your answers were already submitted.', {
    reason: attempt.submitReason ?? 'manual',
  });
}
