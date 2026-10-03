import { describe, expect, it } from 'vitest';
import { parsePastedCode } from './code_paste.js';

describe('parsePastedCode', () => {
	it('reads four-space indentation', () => {
		const text = 'for i in range(3):\n    if i:\n        print(i)\nprint("done")';
		expect(parsePastedCode(text)).toEqual([
			{ code: 'for i in range(3):', indent: 0 },
			{ code: 'if i:', indent: 1 },
			{ code: 'print(i)', indent: 2 },
			{ code: 'print("done")', indent: 0 }
		]);
	});

	it('detects a two-space unit', () => {
		expect(parsePastedCode('if x:\n  y = 1\n    z = 2').map((l) => l.indent)).toEqual([0, 1, 2]);
	});

	it('reads tabs', () => {
		expect(parsePastedCode('if x:\n\ty = 1\n\t\tz = 2').map((l) => l.indent)).toEqual([0, 1, 2]);
	});

	it('drops blank lines and trailing whitespace, handles Windows line endings', () => {
		expect(parsePastedCode('a = 1  \r\n\r\n   \r\nb = 2\r\n')).toEqual([
			{ code: 'a = 1', indent: 0 },
			{ code: 'b = 2', indent: 0 }
		]);
	});

	it('caps the indent level', () => {
		const deep = Array.from({ length: 9 }, (_, i) => '\t'.repeat(i) + 'x').join('\n');
		expect(Math.max(...parsePastedCode(deep).map((l) => l.indent))).toBe(6);
	});

	it('returns nothing for empty input', () => {
		expect(parsePastedCode('  \n\n')).toEqual([]);
	});
});
