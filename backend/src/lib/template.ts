// Parser for template puzzles (SPEC.md "Template puzzles"). Pure functions, no imports: the teacher
// app keeps a byte-identical copy at teacher/src/lib/template.ts, guarded by a backend test.

export type Segment = { text: string } | { gap: number };

export interface Gap {
  index: number;
  /** Expected piece texts, whitespace-normalised. Empty for an empty gap. */
  expected: string[];
  anyOrder: boolean;
}

export interface TemplateError {
  /** 1-based line number in the template source. */
  line: number;
  message: string;
}

export interface ParsedTemplate {
  lines: Segment[][];
  gaps: Gap[];
  /** Solution pieces in reading order. */
  pieces: string[];
  errors: TemplateError[];
}

export interface PoolTile {
  text: string;
  reusable: boolean;
  herring: boolean;
}

export const LIMITS = { chars: 6000, lines: 80, gaps: 30, pieces: 60, pieceChars: 200, herrings: 15 };

/** Whitespace runs inside a piece count as one space. */
export const normalisePiece = (s: string): string => s.trim().replace(/\s+/g, ' ');

interface Marker {
  text: string;
  anyOrder: boolean;
  empty: boolean;
}
type Item = { fixed: string } | { marker: Marker };

// Splits one line into fixed text and markers. Returns an error message instead when a marker is open.
function tokenise(line: string): Item[] | string {
  const items: Item[] = [];
  let fixed = '';
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('\\{{', i)) {
      fixed += '{{';
      i += 3;
    } else if (line.startsWith('{{', i)) {
      let raw = '';
      let j = i + 2;
      for (;;) {
        if (j >= line.length) return 'Marker “{{” is never closed with “}}”.';
        if (line.startsWith('\\}}', j)) {
          raw += '\\}}';
          j += 3;
        } else if (line.startsWith('}}', j)) break;
        else raw += line[j++];
      }
      if (fixed) items.push({ fixed });
      fixed = '';
      items.push({ marker: toMarker(raw) });
      i = j + 2;
    } else fixed += line[i++];
  }
  if (fixed) items.push({ fixed });
  return items;
}

function toMarker(raw: string): Marker {
  const trimmed = raw.trim();
  const anyOrder = trimmed.startsWith('~');
  const body = (anyOrder ? trimmed.slice(1) : trimmed).trim().replace(/^\\~/, '~').replace(/\\\}\}/g, '}}');
  return { text: normalisePiece(body), anyOrder, empty: raw === '' };
}

export function parseTemplate(source: string): ParsedTemplate {
  const errors: TemplateError[] = [];
  const out: ParsedTemplate = { lines: [], gaps: [], pieces: [], errors };
  if (source.length > LIMITS.chars) errors.push({ line: 1, message: `The template is longer than ${LIMITS.chars} characters.` });

  const rawLines = source.split(/\r?\n/);
  if (rawLines.length > LIMITS.lines) {
    errors.push({ line: LIMITS.lines + 1, message: `The template has more than ${LIMITS.lines} lines.` });
  }

  for (const [n, rawLine] of rawLines.entries()) {
    const lineNo = n + 1;
    const line = rawLine.trimEnd().replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
    const items = tokenise(line);
    if (typeof items === 'string') {
      errors.push({ line: lineNo, message: items });
      out.lines.push([]);
      continue;
    }

    const segments: Segment[] = [];
    let run: Marker[] | null = null;
    const closeRun = () => {
      if (run) segments.push({ gap: addGap(run, lineNo, out) });
      run = null;
    };
    for (const item of items) {
      if ('marker' in item) {
        if (run) run.push(item.marker);
        else run = [item.marker];
      } else if (run && /^[ \t]+$/.test(item.fixed)) {
        // Blanks between two markers belong to neither: they are part of the same gap.
      } else {
        closeRun();
        segments.push({ text: item.fixed });
      }
    }
    closeRun();
    out.lines.push(segments);
  }

  if (out.gaps.length > LIMITS.gaps) {
    errors.push({ line: out.lines.findIndex((l) => l.some((s) => 'gap' in s && s.gap === LIMITS.gaps)) + 1, message: `The template has more than ${LIMITS.gaps} gaps.` });
  }
  return out;
}

// Turns a run of markers into a gap, checking the empty-gap and ~ rules.
function addGap(run: Marker[], line: number, out: ParsedTemplate): number {
  const fail = (message: string) => out.errors.push({ line, message });
  const index = out.gaps.length;
  const empty = run.some((m) => m.empty);
  if (empty && run.length > 1) fail('An empty gap “{{}}” must stand alone, not next to other markers.');
  if (run.slice(1).some((m) => m.anyOrder)) fail('Only the first marker of a gap may start with “~”.');
  const expected: string[] = [];
  for (const m of run) {
    if (m.empty) continue;
    if (!m.text) fail(m.anyOrder ? '“{{~}}” is not valid: a piece needs text.' : 'A marker must contain text (or be exactly “{{}}”).');
    else if (m.text.length > LIMITS.pieceChars) fail(`A piece is longer than ${LIMITS.pieceChars} characters.`);
    else expected.push(m.text);
  }
  out.pieces.push(...expected);
  if (out.pieces.length > LIMITS.pieces && out.pieces.length - expected.length <= LIMITS.pieces) {
    fail(`The template has more than ${LIMITS.pieces} pieces.`);
  }
  out.gaps.push({ index, expected, anyOrder: run[0]!.anyOrder && !empty });
  return index;
}

/**
 * The pool tiles for a puzzle: one tile per reusable text, one per occurrence of any other text,
 * then the red herrings. Also checks the red herring and reusable lists.
 */
export function buildPool(
  parsed: ParsedTemplate,
  redHerrings: string[],
  reusable: string[]
): { tiles: PoolTile[]; errors: string[] } {
  const errors: string[] = [];
  const herrings = redHerrings.map(normalisePiece);
  if (herrings.length > LIMITS.herrings) errors.push(`At most ${LIMITS.herrings} red herrings are allowed.`);
  for (const h of herrings) {
    if (!h) errors.push('A red herring must not be empty.');
    else if (h.length > LIMITS.pieceChars) errors.push(`A red herring is longer than ${LIMITS.pieceChars} characters.`);
  }

  const known = new Set([...parsed.pieces, ...herrings]);
  const reusableSet = new Set(reusable.map(normalisePiece));
  for (const r of reusableSet) {
    if (!known.has(r)) errors.push(`Reusable “${r}” occurs neither in the solution nor in the red herrings.`);
  }

  const tiles: PoolTile[] = [];
  const seenReusable = new Set<string>();
  const add = (text: string, herring: boolean) => {
    const isReusable = reusableSet.has(text);
    if (isReusable && seenReusable.has(text)) return;
    seenReusable.add(text);
    tiles.push({ text, reusable: isReusable, herring });
  };
  for (const text of parsed.pieces) add(text, false);
  for (const text of herrings.filter(Boolean)) add(text, true);
  return { tiles, errors };
}
