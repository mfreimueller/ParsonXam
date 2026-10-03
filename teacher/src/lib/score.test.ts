import { describe, expect, it } from 'vitest';
import { formatPercent, scoreTone } from './score.js';
import { formatDuration } from './time.js';

describe('scores', () => {
	it('picks the colour band at its boundaries', () => {
		expect([100, 70, 69.99, 50, 49.99, 0].map(scoreTone)).toEqual(['good', 'good', 'ok', 'ok', 'bad', 'bad']);
	});

	it('formats percentages', () => {
		expect([92, 66.67, 83.33, 0, null].map(formatPercent)).toEqual(['92%', '66.7%', '83.3%', '0%', '–']);
	});
});

describe('durations', () => {
	it('reads minutes and seconds', () => {
		expect(formatDuration('2026-10-17T09:38:00Z', '2026-10-17T09:46:12Z')).toBe('8 min 12 s');
		expect(formatDuration('2026-10-17T09:38:00Z', '2026-10-17T09:38:45Z')).toBe('45 s');
		expect(formatDuration(null, '2026-10-17T09:38:45Z')).toBe('–');
	});
});
