import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver, type SaveStatus } from './autosave.js';
import type { Placed } from './attempt.js';

const arr = (...ids: string[]): Placed[] => ids.map((pieceId) => ({ pieceId, indent: 0 }));

function setup(send: (id: number, p: Placed[]) => Promise<void>, fatal = (_: unknown) => false) {
	const statuses: SaveStatus[] = [];
	const onFatal = vi.fn();
	const saver = new Autosaver({ send, isFatal: fatal, onFatal, onStatus: (s) => statuses.push(s), retryDelaysMs: [1000, 2000] });
	return { saver, statuses, onFatal };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Autosaver', () => {
	it('waits until the student stops moving pieces, then sends only the latest arrangement', async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { saver } = setup(send);
		saver.queue(1, arr('a'));
		saver.queue(1, arr('a', 'b'));
		saver.queue(1, arr('b', 'a'));
		await vi.advanceTimersByTimeAsync(399);
		expect(send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(1, arr('b', 'a'));
	});

	it('reports saving, then saved', async () => {
		const { saver, statuses } = setup(vi.fn().mockResolvedValue(undefined));
		saver.queue(1, arr('a'));
		expect(statuses.at(-1)).toBe('saving');
		await vi.advanceTimersByTimeAsync(500);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('flush sends immediately and resolves when done', async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { saver } = setup(send);
		saver.queue(1, arr('a'));
		saver.queue(2, arr('x'));
		await saver.flush();
		expect(send.mock.calls.map((c) => c[0])).toEqual([1, 2]);
	});

	it('never sends two requests at once, and keeps a change made while one is in flight', async () => {
		let release: () => void = () => {};
		const send = vi
			.fn()
			.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
			.mockResolvedValue(undefined);
		const { saver } = setup(send);
		saver.queue(1, arr('a'));
		await vi.advanceTimersByTimeAsync(500); // first request is now in flight
		saver.queue(1, arr('a', 'b'));
		await vi.advanceTimersByTimeAsync(500);
		expect(send).toHaveBeenCalledTimes(1); // second must wait for the first
		release();
		await vi.advanceTimersByTimeAsync(10);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith(1, arr('a', 'b'));
	});

	it('retries with growing pauses while offline, then catches up', async () => {
		const send = vi
			.fn()
			.mockRejectedValueOnce(new Error('network'))
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValue(undefined);
		const { saver, statuses } = setup(send);
		saver.queue(1, arr('a'));
		await vi.advanceTimersByTimeAsync(450);
		expect(send).toHaveBeenCalledTimes(1);
		expect(statuses.at(-1)).toBe('offline');
		await vi.advanceTimersByTimeAsync(1000); // first retry delay
		expect(send).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(2000); // second, longer delay
		expect(send).toHaveBeenCalledTimes(3);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('sends the newest arrangement after an outage, not the one that failed', async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
		const { saver } = setup(send);
		saver.queue(1, arr('a'));
		await vi.advanceTimersByTimeAsync(450);
		saver.queue(1, arr('a', 'b', 'c'));
		await vi.advanceTimersByTimeAsync(5000);
		expect(send).toHaveBeenLastCalledWith(1, arr('a', 'b', 'c'));
	});

	it('stops and reports fatal errors instead of retrying forever', async () => {
		const err = new Error('already submitted');
		const send = vi.fn().mockRejectedValue(err);
		const { saver, onFatal } = setup(send, () => true);
		saver.queue(1, arr('a'));
		await vi.advanceTimersByTimeAsync(450);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(onFatal).toHaveBeenCalledWith(err);
	});

	it('does nothing after stop', async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { saver } = setup(send);
		saver.queue(1, arr('a'));
		saver.stop();
		await vi.advanceTimersByTimeAsync(1000);
		expect(send).not.toHaveBeenCalled();
	});
});
