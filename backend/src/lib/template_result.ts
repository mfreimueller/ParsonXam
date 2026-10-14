import { sql, type TransactionSQL } from '../db/sql.js';
import { correctFlags, templatePercent } from './scoring.js';
import { parseTemplate } from './template.js';

export type ReviewSegment =
  | { text: string }
  | { gap: number; expected: string[]; submitted: { text: string; correct: boolean }[]; anyOrder: boolean };

export interface TemplateOutcome {
  /** Unrounded, 0..100. */
  percent: number;
  lines: ReviewSegment[][];
}

/** Pool tile texts by public id, per puzzle. */
export async function loadTileTexts(db: TransactionSQL, puzzleIds: number[]): Promise<Map<number, Map<string, string>>> {
  const out = new Map<number, Map<string, string>>();
  if (puzzleIds.length === 0) return out;
  const rows = await db<{ puzzleId: number; publicId: string; pieceText: string }[]>`
    SELECT puzzle_id AS puzzleId, public_id AS publicId, text AS pieceText FROM puzzle_pieces
    WHERE puzzle_id IN ${sql(puzzleIds)}
  `;
  for (const r of rows) {
    const m = out.get(r.puzzleId) ?? new Map<string, string>();
    m.set(r.publicId, r.pieceText);
    out.set(r.puzzleId, m);
  }
  return out;
}

/**
 * Scores a template puzzle and builds its review lines from the saved `gaps` state. Piece ids that
 * no longer exist are ignored.
 */
export function evaluateTemplate(template: string, tileText: Map<string, string>, gaps: Record<string, string[]>): TemplateOutcome {
  const parsed = parseTemplate(template);
  const placed = parsed.gaps.map((g) => (gaps[String(g.index)] ?? []).flatMap((id) => tileText.get(id) ?? []));
  const lines = parsed.lines.map((line) =>
    line.map((seg): ReviewSegment => {
      if ('text' in seg) return seg;
      const gap = parsed.gaps[seg.gap]!;
      const mine = placed[seg.gap]!;
      const flags = correctFlags(gap, mine);
      return {
        gap: gap.index,
        expected: gap.expected,
        submitted: mine.map((text, i) => ({ text, correct: flags[i]! })),
        anyOrder: gap.anyOrder,
      };
    })
  );
  return { percent: templatePercent(parsed.gaps, placed), lines };
}
