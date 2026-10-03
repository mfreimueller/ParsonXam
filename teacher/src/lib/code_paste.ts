export interface ParsedLine {
	code: string;
	indent: number;
}

const MAX_INDENT = 6;

/**
 * Turns pasted code into lines with an indent level. Tabs count as one level; for spaces the
 * smallest leading run (usually 2 or 4) is taken as one level. Blank lines are dropped.
 */
export function parsePastedCode(text: string): ParsedLine[] {
	const rows = text
		.split(/\r?\n/)
		.map((r) => r.replace(/\s+$/, ''))
		.filter((r) => r.trim() !== '')
		.map((r) => {
			const lead = /^[ \t]*/.exec(r)![0];
			return { code: r.slice(lead.length), tabs: (lead.match(/\t/g) ?? []).length, spaces: (lead.match(/ /g) ?? []).length };
		});
	const runs = rows.map((r) => r.spaces).filter((n) => n > 0);
	const unit = runs.length ? Math.min(...runs) : 4;
	return rows.map((r) => ({
		code: r.code,
		indent: Math.min(MAX_INDENT, r.tabs + Math.round(r.spaces / unit))
	}));
}
