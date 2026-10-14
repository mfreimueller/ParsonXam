import { describe, expect, it } from 'vitest';
import {
	addToGap,
	initBoard,
	isShadow,
	moveInGap,
	refillPool,
	removeFromGap,
	tidyPool,
	toGaps,
	type Board,
	type Chip,
	type Tile
} from './template_state.js';

const tiles: Tile[] = [
	{ pieceId: 'a', text: 'a', reusable: false },
	{ pieceId: 'b', text: 'b', reusable: false },
	{ pieceId: 'sel', text: 'SELECT', reusable: true },
	{ pieceId: 'p1', text: ')', reusable: false },
	{ pieceId: 'p2', text: ')', reusable: false }
];
const chipFor = (b: Board, pieceId: string) => b.pool.find((c) => c.pieceId === pieceId)!;
const ids = (chips: Chip[]) => chips.map((c) => c.pieceId);

describe('initBoard', () => {
	it('puts every tile in the pool when nothing is saved', () => {
		const b = initBoard(tiles, 3, {});
		expect(ids(b.pool)).toEqual(['a', 'b', 'sel', 'p1', 'p2']);
		expect(b.gaps).toEqual([[], [], []]);
		expect(new Set(b.pool.map((c) => c.id)).size).toBe(5);
	});

	it('restores saved gaps; used pieces leave the pool but reusable ones stay', () => {
		const b = initBoard(tiles, 3, { '0': ['b', 'sel'], '2': ['sel', 'sel'] });
		expect(ids(b.gaps[0]!)).toEqual(['b', 'sel']);
		expect(ids(b.gaps[2]!)).toEqual(['sel', 'sel']);
		expect(ids(b.pool)).toEqual(['a', 'sel', 'p1', 'p2']);
	});

	it('gives every placed copy of a reusable piece its own id', () => {
		const b = initBoard(tiles, 2, { '0': ['sel', 'sel'], '1': ['sel'] });
		const all = [...b.gaps.flat(), ...b.pool];
		expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
	});

	it('ignores unknown ids, repeats of non-reusable pieces and gaps out of range', () => {
		const b = initBoard(tiles, 2, { '0': ['zzz', 'a', 'a'], '1': ['a'], '7': ['b'] });
		expect(ids(b.gaps[0]!)).toEqual(['a']);
		expect(b.gaps[1]).toEqual([]);
		expect(ids(b.pool)).toContain('b');
	});
});

describe('addToGap / removeFromGap', () => {
	it('moves a non-reusable chip from the pool into a gap and back', () => {
		let b = initBoard(tiles, 2, {});
		b = addToGap(b, chipFor(b, 'a').id, 1);
		expect(ids(b.gaps[1]!)).toEqual(['a']);
		expect(ids(b.pool)).not.toContain('a');
		b = removeFromGap(b, 1, b.gaps[1]![0]!.id);
		expect(b.gaps[1]).toEqual([]);
		expect(ids(b.pool)).toContain('a');
	});

	it('places copies of a reusable chip and leaves it in the pool', () => {
		let b = initBoard(tiles, 2, {});
		b = addToGap(b, chipFor(b, 'sel').id, 0);
		b = addToGap(b, chipFor(b, 'sel').id, 0);
		b = addToGap(b, chipFor(b, 'sel').id, 1);
		expect(ids(b.gaps[0]!)).toEqual(['sel', 'sel']);
		expect(ids(b.pool).filter((p) => p === 'sel')).toHaveLength(1);
		expect(new Set(b.gaps.flat().map((c) => c.id)).size).toBe(3);
	});

	it('removing a placed copy of a reusable chip just makes it disappear', () => {
		let b = initBoard(tiles, 1, {});
		b = addToGap(b, chipFor(b, 'sel').id, 0);
		const poolBefore = b.pool.length;
		b = removeFromGap(b, 0, b.gaps[0]![0]!.id);
		expect(b.gaps[0]).toEqual([]);
		expect(b.pool).toHaveLength(poolBefore);
	});

	it('ignores unknown chips and gaps', () => {
		const b = initBoard(tiles, 1, {});
		expect(addToGap(b, 'nope', 0)).toBe(b);
		expect(addToGap(b, chipFor(b, 'a').id, 5)).toBe(b);
		expect(removeFromGap(b, 0, 'nope')).toBe(b);
	});
});

describe('moveInGap', () => {
	it('swaps with the neighbour and stops at the ends', () => {
		let b = initBoard(tiles, 1, { '0': ['a', 'b', 'p1'] });
		const idOf = (p: string) => b.gaps[0]!.find((c) => c.pieceId === p)!.id;
		b = moveInGap(b, 0, idOf('a'), 1);
		expect(ids(b.gaps[0]!)).toEqual(['b', 'a', 'p1']);
		b = moveInGap(b, 0, idOf('p1'), 1);
		expect(ids(b.gaps[0]!)).toEqual(['b', 'a', 'p1']);
		b = moveInGap(b, 0, idOf('b'), -1);
		expect(ids(b.gaps[0]!)).toEqual(['b', 'a', 'p1']);
		b = moveInGap(b, 0, idOf('p1'), -1);
		expect(ids(b.gaps[0]!)).toEqual(['b', 'p1', 'a']);
	});
});

describe('toGaps', () => {
	it('serialises in gap order, leaves empty gaps out and skips drag placeholders', () => {
		const b = initBoard(tiles, 4, { '1': ['b', 'sel'], '3': ['a'] });
		b.gaps[3] = [...b.gaps[3]!, { ...chipFor(b, 'p1'), isDndShadowItem: true } as Chip];
		expect(toGaps(b)).toEqual({ '1': ['b', 'sel'], '3': ['a'] });
	});

	it('round-trips through initBoard', () => {
		const saved = { '0': ['sel', 'a', 'sel'], '2': ['p2'] };
		expect(toGaps(initBoard(tiles, 3, saved))).toEqual(saved);
	});
});

describe('pool during and after a drag', () => {
	it('refillPool gives the pool a fresh chip when a reusable one is dragged out', () => {
		const b = initBoard(tiles, 1, {});
		const dragged = chipFor(b, 'sel');
		const next = refillPool(b.pool, b.pool.filter((c) => c.id !== dragged.id));
		expect(ids(next)).toEqual(['a', 'b', 'sel', 'p1', 'p2']);
		expect(next[2]!.id).not.toBe(dragged.id);
	});

	it('refillPool makes the fresh chip a real one even when the dragged chip was a placeholder', () => {
		const b = initBoard(tiles, 1, {});
		const prev = b.pool.map((c) => (c.pieceId === 'sel' ? ({ ...c, isDndShadowItem: true } as Chip) : c));
		const next = refillPool(prev, prev.filter((c) => c.pieceId !== 'sel'));
		expect(isShadow(next.find((c) => c.pieceId === 'sel')!)).toBe(false);
	});

	it('refillPool does not duplicate while the placeholder is still in the pool, nor refill non-reusable chips', () => {
		const b = initBoard(tiles, 1, {});
		const withShadow = b.pool.map((c) => (c.pieceId === 'sel' ? ({ ...c, isDndShadowItem: true } as Chip) : c));
		expect(refillPool(b.pool, withShadow)).toHaveLength(5);
		expect(ids(refillPool(b.pool, b.pool.filter((c) => c.pieceId !== 'a')))).toEqual(['b', 'sel', 'p1', 'p2']);
	});

	it('tidyPool keeps one chip per reusable piece after a dropped copy comes back', () => {
		const b = initBoard(tiles, 1, {});
		const back: Chip = { ...chipFor(b, 'sel'), id: 'sel:dropped' };
		expect(ids(tidyPool([...b.pool, back]))).toEqual(['a', 'b', 'sel', 'p1', 'p2']);
	});
});
