import { describe, expect, it } from 'vitest';
import { pieceRows, toggleAnyOrder, wrapSelection } from './template_editor.js';

describe('wrapSelection', () => {
	it('wraps the selection and selects the marker', () => {
		const text = 'int x = 42;';
		const e = wrapSelection(text, 8, 10)!;
		expect(e.text).toBe('int x = {{42}};');
		expect(e.text.slice(e.start, e.end)).toBe('{{42}}');
	});

	it('leaves surrounding blanks outside the marker', () => {
		expect(wrapSelection('a  b c', 1, 5)!.text).toBe('a  {{b}} c');
	});

	it('escapes }} and a leading ~ inside the piece', () => {
		expect(wrapSelection('x}}y', 0, 4)!.text).toBe('{{x\\}}y}}');
		expect(wrapSelection('~a', 0, 2)!.text).toBe('{{\\~a}}');
	});

	it('does nothing for an empty, blank or multi-line selection', () => {
		expect(wrapSelection('abc', 1, 1)).toBeNull();
		expect(wrapSelection('a   b', 1, 4)).toBeNull();
		expect(wrapSelection('a\nb', 0, 3)).toBeNull();
	});
});

describe('toggleAnyOrder', () => {
	it('adds ~ to the first marker of the gap at the caret and removes it again', () => {
		const text = '{{@Id}} {{@Gen}}';
		const on = toggleAnyOrder(text, 12)!;
		expect(on.text).toBe('{{~@Id}} {{@Gen}}');
		expect(on.start).toBe(13);
		expect(toggleAnyOrder(on.text, 3)!.text).toBe(text);
	});

	it('picks the gap under the caret when a line has several', () => {
		const text = 'f({{a}}, {{b}} {{c}})';
		expect(toggleAnyOrder(text, 12)!.text).toBe('f({{a}}, {{~b}} {{c}})');
	});

	it('falls back to the first gap of the line, and works on other lines', () => {
		const text = 'x\nfoo {{a}} bar {{b}}\ny';
		expect(toggleAnyOrder(text, 3)!.text).toBe('x\nfoo {{~a}} bar {{b}}\ny');
	});

	it('skips escaped markers and returns null when there is nothing to toggle', () => {
		expect(toggleAnyOrder('a \\{{ b }} c', 2)).toBeNull();
		expect(toggleAnyOrder('plain line', 3)).toBeNull();
		expect(toggleAnyOrder('{{}}', 2)).toBeNull();
	});

	it('handles a marker with escaped closing braces', () => {
		expect(toggleAnyOrder('{{a \\}} b}} {{c}}', 1)!.text).toBe('{{~a \\}} b}} {{c}}');
	});
});

describe('pieceRows', () => {
	it('lists distinct texts with counts, then pure red herrings', () => {
		expect(pieceRows(['a', ')', ')', 'b'], ['x', 'a'])).toEqual([
			{ text: 'a', herring: false, count: 1 },
			{ text: ')', herring: false, count: 2 },
			{ text: 'b', herring: false, count: 1 },
			{ text: 'x', herring: true, count: 0 }
		]);
	});
});
