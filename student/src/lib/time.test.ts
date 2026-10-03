import { describe, expect, it } from 'vitest';
import { formatCountdown, formatDateTime, fromLocalInput, toLocalInput } from './time.js';

describe('school time conversion', () => {
	it('reads Vienna summer time (UTC+2)', () => {
		expect(fromLocalInput('2026-10-17T12:00')).toBe('2026-10-17T10:00:00.000Z');
		expect(toLocalInput('2026-10-17T10:00:00.000Z')).toBe('2026-10-17T12:00');
	});

	it('reads Vienna winter time (UTC+1)', () => {
		expect(fromLocalInput('2026-12-01T09:30')).toBe('2026-12-01T08:30:00.000Z');
		expect(toLocalInput('2026-12-01T08:30:00.000Z')).toBe('2026-12-01T09:30');
	});

	it('round-trips on both sides of the daylight-saving switches', () => {
		for (const v of ['2026-03-29T01:59', '2026-03-29T03:00', '2026-10-25T01:59', '2026-10-25T03:00', '2026-12-31T23:59']) {
			expect(toLocalInput(fromLocalInput(v))).toBe(v);
		}
	});

	it('does not depend on the machine time zone', () => {
		// The expected values above are fixed instants; the test run itself may be in any zone.
		expect(fromLocalInput('2026-07-01T00:00')).toBe('2026-06-30T22:00:00.000Z');
	});

	it('handles empty and invalid input', () => {
		expect(fromLocalInput('')).toBeNull();
		expect(fromLocalInput('tomorrow')).toBeNull();
		expect(toLocalInput(null)).toBe('');
	});

	it('formats for display', () => {
		expect(formatDateTime('2026-10-17T10:00:00.000Z')).toBe('Sat 17 Oct, 12:00');
		expect(formatDateTime(null)).toBe('Not set');
	});
});

describe('formatCountdown', () => {
	it('formats minutes and seconds, rounding up', () => {
		expect(formatCountdown(462_000)).toBe('07:42');
		expect(formatCountdown(461_001)).toBe('07:42');
		expect(formatCountdown(59_000)).toBe('00:59');
		expect(formatCountdown(1)).toBe('00:01');
	});

	it('never goes negative', () => {
		expect(formatCountdown(0)).toBe('00:00');
		expect(formatCountdown(-5000)).toBe('00:00');
	});

	it('handles long exams', () => {
		expect(formatCountdown(125 * 60_000)).toBe('125:00');
	});
});
