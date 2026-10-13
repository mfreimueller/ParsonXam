import { randomBytes } from 'node:crypto';
import { sql, type SQLInstance, type TransactionSQL } from '../db/sql.js';
import { AppError } from '../errors.js';
import { requireExamAccess } from './exams.js';
import { parseTemplate, type PoolTile } from './template.js';

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

interface PuzzleBase {
  id: number;
  examId: number;
  position: number;
  title: string;
  description: string;
}

export interface LinesPuzzleView extends PuzzleBase {
  kind: 'lines';
  solution: LineView[];
  redHerrings: LineView[];
}

export interface TemplatePuzzleView extends PuzzleBase {
  kind: 'template';
  template: string;
  redHerrings: string[];
  reusable: string[];
}

export type PuzzleView = LinesPuzzleView | TemplatePuzzleView;

interface SummaryBase {
  id: number;
  position: number;
  title: string;
}

export type PuzzleSummary =
  | (SummaryBase & { kind: 'lines'; solutionLineCount: number; redHerringCount: number })
  | (SummaryBase & { kind: 'template'; pieceCount: number; gapCount: number });

// 12 URL-safe characters, random: carries no information about order or correctness.
export function newPublicId(): string {
  return randomBytes(9).toString('base64url');
}

export async function getPuzzle(db: SQLInstance, puzzleId: number): Promise<PuzzleView | null> {
  const rows = await db<(PuzzleBase & { kind: 'lines' | 'template'; template: string | null })[]>`
    SELECT id, exam_id AS examId, position, title, description, kind, template FROM puzzles WHERE id = ${puzzleId}
  `;
  const p = rows[0];
  if (!p) return null;
  const base = { id: p.id, examId: p.examId, position: p.position, title: p.title, description: p.description };

  if (p.kind === 'template') {
    const tiles = await db<{ pieceText: string; reusable: number; herring: number }[]>`
      SELECT text AS pieceText, reusable, herring FROM puzzle_pieces WHERE puzzle_id = ${puzzleId} ORDER BY id
    `;
    return {
      ...base,
      kind: 'template',
      template: p.template ?? '',
      redHerrings: tiles.filter((t) => t.herring).map((t) => t.pieceText),
      reusable: [...new Set(tiles.filter((t) => t.reusable).map((t) => t.pieceText))],
    };
  }

  const lines = await db<(LineView & { solutionPosition: number | null })[]>`
    SELECT public_id AS id, code, indent, solution_position AS solutionPosition
    FROM puzzle_lines WHERE puzzle_id = ${puzzleId}
    ORDER BY solution_position IS NULL, solution_position, id
  `;
  const view = (l: LineView & { solutionPosition: number | null }): LineView => ({ id: l.id, code: l.code, indent: Number(l.indent) });
  return {
    ...base,
    kind: 'lines',
    solution: lines.filter((l) => l.solutionPosition !== null).map(view),
    redHerrings: lines.filter((l) => l.solutionPosition === null).map(view),
  };
}

export async function listPuzzles(db: SQLInstance, examId: number): Promise<PuzzleSummary[]> {
  const rows = await db<
    { id: number; position: number; title: string; kind: 'lines' | 'template'; template: string | null; solutionLineCount: number; redHerringCount: number }[]
  >`
    SELECT p.id, p.position, p.title, p.kind, p.template,
           COUNT(l.id) - COALESCE(SUM(l.solution_position IS NULL), 0) AS solutionLineCount,
           COALESCE(SUM(l.solution_position IS NULL), 0) AS redHerringCount
    FROM puzzles p LEFT JOIN puzzle_lines l ON l.puzzle_id = p.id
    WHERE p.exam_id = ${examId}
    GROUP BY p.id, p.position, p.title, p.kind, p.template
    ORDER BY p.position
  `;
  return rows.map((r): PuzzleSummary => {
    const base = { id: r.id, position: r.position, title: r.title };
    if (r.kind === 'lines') {
      return { ...base, kind: 'lines', solutionLineCount: Number(r.solutionLineCount), redHerringCount: Number(r.redHerringCount) };
    }
    const parsed = parseTemplate(r.template ?? '');
    return { ...base, kind: 'template', pieceCount: parsed.pieces.length, gapCount: parsed.gaps.length };
  });
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

// Writes the template source and rebuilds the pool tiles. Tile ids change on every save, which is
// fine: editing is locked once students have started.
export async function replaceTemplate(tx: TransactionSQL, puzzleId: number, template: string, tiles: PoolTile[]): Promise<void> {
  await tx`UPDATE puzzles SET kind = 'template', template = ${template} WHERE id = ${puzzleId}`;
  await tx`DELETE FROM puzzle_pieces WHERE puzzle_id = ${puzzleId}`;
  for (const t of tiles) {
    await tx`
      INSERT INTO puzzle_pieces (puzzle_id, public_id, text, reusable, herring)
      VALUES (${puzzleId}, ${newPublicId()}, ${t.text}, ${t.reusable ? 1 : 0}, ${t.herring ? 1 : 0})
    `;
  }
  await tx`DELETE FROM puzzle_lines WHERE puzzle_id = ${puzzleId}`;
}

/** Switches a puzzle to kind 'lines' and drops anything left from a template. */
export async function clearTemplate(tx: TransactionSQL, puzzleId: number): Promise<void> {
  await tx`UPDATE puzzles SET kind = 'lines', template = NULL WHERE id = ${puzzleId}`;
  await tx`DELETE FROM puzzle_pieces WHERE puzzle_id = ${puzzleId}`;
}
