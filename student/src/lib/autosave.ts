import type { Placed } from './attempt.js';

export type SaveStatus = 'saved' | 'saving' | 'offline';

export interface AutosaverOptions {
	send: (puzzleId: number, placed: Placed[]) => Promise<void>;
	/** True for errors that retrying cannot fix (already submitted, token gone). */
	isFatal: (err: unknown) => boolean;
	onFatal: (err: unknown) => void;
	onStatus: (status: SaveStatus) => void;
	debounceMs?: number;
	retryDelaysMs?: number[];
}

// Keeps the latest arrangement of each puzzle and gets it to the server: debounced, one request at
// a time, retrying with growing pauses when the network drops. The last write always wins.
export class Autosaver {
	private pending = new Map<number, Placed[]>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running: Promise<void> | null = null;
	private failures = 0;
	private stopped = false;
	private readonly debounceMs: number;
	private readonly retryDelays: number[];

	constructor(private readonly opts: AutosaverOptions) {
		this.debounceMs = opts.debounceMs ?? 400;
		this.retryDelays = opts.retryDelaysMs ?? [1000, 2000, 4000, 8000];
	}

	/** Remember a new arrangement; it is sent shortly after the student stops moving pieces. */
	queue(puzzleId: number, placed: Placed[]): void {
		if (this.stopped) return;
		this.pending.set(puzzleId, placed);
		this.opts.onStatus('saving');
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.run(), this.debounceMs);
	}

	/** Send everything now. Resolves when nothing is waiting (or saving became impossible). */
	async flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		await this.run();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.pending.clear();
	}

	private run(): Promise<void> {
		this.running ??= this.loop().finally(() => (this.running = null));
		return this.running;
	}

	private async loop(): Promise<void> {
		while (this.pending.size > 0 && !this.stopped) {
			const [puzzleId, placed] = this.pending.entries().next().value!;
			try {
				await this.opts.send(puzzleId, placed);
				this.failures = 0;
				// Only forget it if the student did not move something in the meantime.
				if (this.pending.get(puzzleId) === placed) this.pending.delete(puzzleId);
				else {
					// A newer arrangement is waiting; it goes next.
				}
			} catch (err) {
				if (this.opts.isFatal(err)) {
					this.stopped = true;
					this.pending.clear();
					this.opts.onFatal(err);
					return;
				}
				this.opts.onStatus('offline');
				const delay = this.retryDelays[Math.min(this.failures, this.retryDelays.length - 1)]!;
				this.failures++;
				await new Promise((r) => setTimeout(r, delay));
			}
		}
		if (!this.stopped) this.opts.onStatus(this.pending.size === 0 ? 'saved' : 'saving');
	}
}
