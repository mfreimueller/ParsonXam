// Teachers think in school time. The server stores UTC; these helpers convert at the edge.
export const SCHOOL_TZ = 'Europe/Vienna';

function parts(date: Date, timeZone: string): Record<string, number> {
	const fmt = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
	const out: Record<string, number> = {};
	for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
	return out;
}

/** ISO instant -> "2026-10-17T12:00" as shown on a Vienna clock (value for <input type="datetime-local">). */
export function toLocalInput(iso: string | null, timeZone = SCHOOL_TZ): string {
	if (!iso) return '';
	const p = parts(new Date(iso), timeZone);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${p.year}-${pad(p.month!)}-${pad(p.day!)}T${pad(p.hour!)}:${pad(p.minute!)}`;
}

/** "2026-10-17T12:00" read as Vienna wall-clock time -> ISO instant. Empty string -> null. */
export function fromLocalInput(value: string, timeZone = SCHOOL_TZ): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!m) return null;
	const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
	const wanted = Date.UTC(y, mo - 1, d, h, mi);
	// Start by pretending the wall time is UTC, then correct by the zone's offset at that moment.
	// Two passes settle correctly around daylight-saving changes.
	let guess = wanted;
	for (let i = 0; i < 2; i++) {
		const p = parts(new Date(guess), timeZone);
		const shown = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!);
		guess -= shown - wanted;
	}
	return new Date(guess).toISOString();
}

/** "Fri 17 Oct, 12:00" */
export function formatDateTime(iso: string | null, timeZone = SCHOOL_TZ): string {
	if (!iso) return 'Not set';
	const d = new Date(iso);
	const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short' }).format(d);
	const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
	return `${day.replace(',', '')}, ${time}`;
}

export function formatMinutes(seconds: number): string {
	const m = Math.round(seconds / 60);
	return `${m} min`;
}

/** Milliseconds -> "07:42". Rounds up, so the display only reaches 00:00 when time is really up. */
export function formatCountdown(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const m = Math.floor(total / 60);
	const sec = total % 60;
	return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** "2 h 13 min", "12 min 04 s", "45 s": how long until the solutions unlock. */
export function formatRemaining(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
	if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
	return `${s} s`;
}
