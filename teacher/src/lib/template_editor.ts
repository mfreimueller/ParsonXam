// Text helpers behind the template editor's buttons. Pure: they take the source and a selection
// and return the new source and selection.

export interface Edit {
	text: string;
	/** Selection (or caret, when equal) after the edit. */
	start: number;
	end: number;
}

const blank = (c: string | undefined) => c === ' ' || c === '\t';

/** Wraps the selected text in {{ }}. Does nothing for an empty selection or one spanning several lines. */
export function wrapSelection(text: string, start: number, end: number): Edit | null {
	while (start < end && /\s/.test(text[start]!)) start++;
	while (end > start && /\s/.test(text[end - 1]!)) end--;
	const selected = text.slice(start, end);
	if (selected === '' || selected.includes('\n')) return null;
	const inner = selected.replace(/\}\}/g, '\\}}').replace(/^~/, '\\~');
	const marked = `{{${inner}}}`;
	return { text: text.slice(0, start) + marked + text.slice(end), start, end: start + marked.length };
}

interface Span {
	start: number;
	end: number;
}

// Markers of one line as [start, end) spans, honouring \{{ and \}}.
function markersOf(line: string): Span[] {
	const out: Span[] = [];
	let i = 0;
	while (i < line.length) {
		if (line.startsWith('\\{{', i)) i += 3;
		else if (line.startsWith('{{', i)) {
			let j = i + 2;
			while (j < line.length && !(line.startsWith('}}', j) && line[j - 1] !== '\\')) j++;
			if (j >= line.length) break;
			out.push({ start: i, end: j + 2 });
			i = j + 2;
		} else i++;
	}
	return out;
}

/**
 * Turns the gap at the caret into an any-order gap, or back, by toggling `~` on its first marker.
 * Falls back to the first gap on the caret's line. Returns null when there is nothing to toggle.
 */
export function toggleAnyOrder(text: string, caret: number): Edit | null {
	const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
	const nl = text.indexOf('\n', caret);
	const line = text.slice(lineStart, nl === -1 ? text.length : nl);

	const runs: Span[][] = [];
	for (const m of markersOf(line)) {
		const last = runs.at(-1);
		const gapText = last ? line.slice(last.at(-1)!.end, m.start) : '';
		if (last && [...gapText].every(blank)) last.push(m);
		else runs.push([m]);
	}
	const rel = caret - lineStart;
	const run = runs.find((r) => r[0]!.start <= rel && rel <= r.at(-1)!.end) ?? runs[0];
	if (!run) return null;

	let at = lineStart + run[0]!.start + 2;
	const closing = lineStart + run[0]!.end - 2;
	while (at < closing && blank(text[at])) at++;
	if (at >= closing) return null; // an empty marker has nothing to reorder
	const hasTilde = text[at] === '~';
	const next = hasTilde ? text.slice(0, at) + text.slice(at + 1) : text.slice(0, at) + '~' + text.slice(at);
	const shift = hasTilde ? -1 : 1;
	const moved = caret > at ? caret + shift : caret;
	return { text: next, start: moved, end: moved };
}

export interface PieceRow {
	text: string;
	herring: boolean;
	/** How often it occurs in the solution (0 for a pure red herring). */
	count: number;
}

/** One row per distinct piece text: the solution's first, then red herrings that are not in the solution. */
export function pieceRows(solution: string[], herrings: string[]): PieceRow[] {
	const rows = new Map<string, PieceRow>();
	for (const text of solution) {
		const row = rows.get(text);
		if (row) row.count++;
		else rows.set(text, { text, herring: false, count: 1 });
	}
	for (const text of herrings) if (!rows.has(text)) rows.set(text, { text, herring: true, count: 0 });
	return [...rows.values()];
}
