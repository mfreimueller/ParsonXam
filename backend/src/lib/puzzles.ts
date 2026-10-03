import { randomBytes } from 'node:crypto';
import { sql, type SQLInstance, type TransactionSQL } from '../db/sql.js';
import { AppError } from '../errors.js';
import { requireExamAccess } from './exams.js';

export interface LineInput {
  id?: string | undefined;
  code: string;
  indent: number;
}

export interface LineView {
  id: string;
  code: string;
  indent: number;
}

export interface PuzzleView {
  id: number;
  examId: number;
  position: number;
  title: string;
  description: string;
  solution: LineView[];
  redHerrings: LineView[];
}

export interface PuzzleSummary {
  id: number;
  position: number;
  title: string;
  solutionLineCount: number;
  redHerringCount: number;
}

// 12 URL-safe characters, random: carries no information about order or correctness.
export function newPublicId(): string {
  return randomBytes(9).toString('base64url');
}

export async function getPuzzle(db: SQLInstance, puzzleId: number): Promise<PuzzleView | null> {
  const rows = await db<{ id: number; examId: number; position: number; title: string; description: string }[]>`
    SELECT id, exam_id AS examId, position, title, description FROM puzzles WHERE id = ${puzzleId}
  `;
  const p = rows[0];
  if (!p) return null;
  const lines = await db<(LineView & { solutionPosition: number | null })[]>`
    SELECT public_id AS id, code, indent, solution_position AS solutionPosition
    FROM puzzle_lines WHERE puzzle_id = ${puzzleId}
    ORDER BY solution_position IS NULL, solution_position, id
  `;
  const view = (l: LineView & { solutionPosition: number | null }): LineView => ({ id: l.id, code: l.code, indent: Number(l.indent) });
  return {
    ...p,
    solution: lines.filter((l) => l.solutionPosition !== null).map(view),
    redHerrings: lines.filter((l) => l.solutionPosition === null).map(view),
  };
}

export async function listPuzzles(db: SQLInstance, examId: number): Promise<PuzzleSummary[]> {
  const rows = await db<PuzzleSummary[]>`
    SELECT p.id, p.position, p.title,
           COUNT(l.id) - COALESCE(SUM(l.solution_position IS NULL), 0) AS solutionLineCount,
           COALESCE(SUM(l.solution_position IS NULL), 0) AS redHerringCount
    FROM puzzles p LEFT JOIN puzzle_lines l ON l.puzzle_id = p.id
    WHERE p.exam_id = ${examId}
    GROUP BY p.id, p.position, p.title
    ORDER BY p.position
  `;
  return rows.map((r) => ({
    ...r,
    solutionLineCount: Number(r.solutionLineCount),
    redHerringCount: Number(r.redHerringCount),
  }));
}

/** Loads a puzzle and checks the teacher belongs to the class of its exam. Outsiders get 404. */
export async function requirePuzzleAccess(db: SQLInstance, teacherId: number, puzzleId: number): Promise<PuzzleView> {
  const puzzle = await getPuzzle(db, puzzleId);
  if (!puzzle) throw new AppError(404, 'NOT_FOUND', 'Puzzle not found.');
  await requireExamAccess(db, teacherId, puzzle.examId);
  return puzzle;
}

// Writes the full set of lines. Lines whose id already belongs to this puzzle keep their id;
// anything else is new. Lines that are no longer listed are deleted.
export async function replaceLines(
  tx: TransactionSQL,
  puzzleId: number,
  solution: LineInput[],
  redHerrings: LineInput[]
): Promise<void> {
  const existing = await tx<{ id: string }[]>`SELECT public_id AS id FROM puzzle_lines WHERE puzzle_id = ${puzzleId}`;
  const known = new Set(existing.map((e) => e.id));
  const keep = [...solution, ...redHerrings].map((l) => l.id).filter((id): id is string => !!id && known.has(id));

  if (keep.length === 0) {
    await tx`DELETE FROM puzzle_lines WHERE puzzle_id = ${puzzleId}`;
  } else {
    await tx`DELETE FROM puzzle_lines WHERE puzzle_id = ${puzzleId} AND public_id NOT IN ${sql(keep)}`;
  }
  // Free all positions first so reordering never trips the unique (puzzle_id, position) key.
  await tx`UPDATE puzzle_lines SET solution_position = NULL WHERE puzzle_id = ${puzzleId}`;

  const write = async (line: LineInput, position: number | null) => {
    if (line.id && known.has(line.id)) {
      await tx`
        UPDATE puzzle_lines SET code = ${line.code}, indent = ${line.indent}, solution_position = ${position}
        WHERE puzzle_id = ${puzzleId} AND public_id = ${line.id}
      `;
    } else {
      await tx`
        INSERT INTO puzzle_lines (puzzle_id, public_id, solution_position, code, indent)
        VALUES (${puzzleId}, ${newPublicId()}, ${position}, ${line.code}, ${line.indent})
      `;
    }
  };
  for (const [i, line] of solution.entries()) await write(line, i + 1);
  for (const line of redHerrings) await write(line, null);
}
