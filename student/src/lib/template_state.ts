// State of a template puzzle on the student's screen: a pool of chips and one list of chips per
// gap. Plain functions that return a new board, so the component stays thin and this is testable.

export interface Tile {
	pieceId: string;
	text: string;
	reusable: boolean;
}

/** A chip on screen. `id` is unique per chip (the drag library needs that); `pieceId` is the server's id. */
export interface Chip extends Tile {
	id: string;
}

export interface Board {
	pool: Chip[];
	/** Indexed by gap index. */
	gaps: Chip[][];
}

/** What is saved: gap index -> piece ids in order. Empty gaps are left out. */
export type Gaps = Record<string, string[]>;

let counter = 0;
// Built field by field: a dragged chip carries library flags that a copy must not inherit.
const chipOf = (t: Tile): Chip => ({ pieceId: t.pieceId, text: t.text, reusable: t.reusable, id: `${t.pieceId}:${++counter}` });

/** svelte-dnd-action inserts a placeholder while dragging; it is not a real chip. */
export const isShadow = (c: Chip) => Boolean((c as Chip & { isDndShadowItem?: boolean }).isDndShadowItem);
export const real = (chips: Chip[]) => chips.filter((c) => !isShadow(c));

/** Builds the board from the server's tiles and the saved gaps. Unknown ids and repeats of non-reusable pieces are dropped. */
export function initBoard(tiles: Tile[], gapCount: number, saved: Gaps): Board {
	const byId = new Map(tiles.map((t) => [t.pieceId, t]));
	const used = new Set<string>();
	const gaps = Array.from({ length: gapCount }, (_, g) =>
		(saved[g] ?? []).flatMap((id) => {
			const tile = byId.get(id);
			if (!tile || (!tile.reusable && used.has(id))) return [];
			used.add(id);
			return [chipOf(tile)];
		})
	);
	const pool = tiles.filter((t) => t.reusable || !used.has(t.pieceId)).map(chipOf);
	return { pool, gaps };
}

export function toGaps(board: Board): Gaps {
	const out: Gaps = {};
	for (const [g, chips] of board.gaps.entries()) {
		const ids = real(chips).map((c) => c.pieceId);
		if (ids.length > 0) out[String(g)] = ids;
	}
	return out;
}

export const placedCount = (board: Board) => board.gaps.reduce((n, chips) => n + real(chips).length, 0);

const withGap = (board: Board, gap: number, chips: Chip[]): Board => ({
	...board,
	gaps: board.gaps.map((c, i) => (i === gap ? chips : c))
});

/** Replaces the chips of a gap (the drag library hands over the whole new list). */
export const setGap = withGap;

/** Appends a pool chip to a gap. A reusable chip stays in the pool; the gap gets a copy. */
export function addToGap(board: Board, chipId: string, gap: number): Board {
	const chip = board.pool.find((c) => c.id === chipId);
	if (!chip || gap < 0 || gap >= board.gaps.length) return board;
	const placed = chip.reusable ? chipOf(chip) : chip;
	const next = withGap(board, gap, [...board.gaps[gap]!, placed]);
	return chip.reusable ? next : { ...next, pool: board.pool.filter((c) => c.id !== chipId) };
}

/** Takes a chip out of a gap. A reusable chip just disappears (the pool still has it). */
export function removeFromGap(board: Board, gap: number, chipId: string): Board {
	const chip = board.gaps[gap]?.find((c) => c.id === chipId);
	if (!chip) return board;
	const next = withGap(board, gap, board.gaps[gap]!.filter((c) => c.id !== chipId));
	return chip.reusable ? next : { ...next, pool: [...board.pool, chip] };
}

/** Moves a chip one step left (-1) or right (+1) inside its gap. */
export function moveInGap(board: Board, gap: number, chipId: string, delta: -1 | 1): Board {
	const chips = [...(board.gaps[gap] ?? [])];
	const from = chips.findIndex((c) => c.id === chipId);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= chips.length) return board;
	[chips[from], chips[to]] = [chips[to]!, chips[from]!];
	return withGap(board, gap, chips);
}

/**
 * While a reusable chip is dragged out of the pool, the pool must keep one: when a reusable piece
 * is missing from `next`, a fresh chip takes the dragged one's place.
 */
export function refillPool(prev: Chip[], next: Chip[]): Chip[] {
	const out = [...next];
	for (const [i, chip] of prev.entries()) {
		if (!chip.reusable || out.some((c) => c.pieceId === chip.pieceId)) continue;
		out.splice(Math.min(i, out.length), 0, chipOf(chip));
	}
	return out;
}

/** After a drop: a reusable piece appears once in the pool, however many chips came back. */
export function tidyPool(chips: Chip[]): Chip[] {
	const seen = new Set<string>();
	return real(chips).filter((c) => {
		if (!c.reusable) return true;
		if (seen.has(c.pieceId)) return false;
		seen.add(c.pieceId);
		return true;
	});
}
