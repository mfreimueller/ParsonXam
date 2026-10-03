export type Tone = 'good' | 'ok' | 'bad';

/** Colour band for a percentage: green from 70, amber from 50, red below. */
export function scoreTone(percent: number): Tone {
	return percent >= 70 ? 'good' : percent >= 50 ? 'ok' : 'bad';
}

/** 92 -> "92%", 66.67 -> "66.7%", null -> "–" */
export function formatPercent(percent: number | null): string {
	if (percent === null) return '–';
	return `${Number.isInteger(percent) ? percent : Math.round(percent * 10) / 10}%`;
}
