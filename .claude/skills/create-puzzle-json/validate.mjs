#!/usr/bin/env node
// Checks a ParsonXam puzzle import file against the same rules as the server
// (backend/src/routes/puzzles.ts and backend/src/lib/template.ts).
// Usage: node validate.mjs <file.json>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate.mjs <file.json>');
  process.exit(2);
}

const problems = [];
const warnings = [];
const bad = (path, msg) => problems.push(`${path}: ${msg}`);

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`Not valid JSON: ${err.message}`);
  process.exit(1);
}

// ---- Template parser: a port of backend/src/lib/template.ts (keep in sync) ----
const LIMITS = { chars: 6000, lines: 80, gaps: 30, pieces: 60, pieceChars: 200, herrings: 15 };
const normalisePiece = (s) => s.trim().replace(/\s+/g, ' ');

// Splits one line into fixed text and markers; returns an error string when a marker is open.
function tokenise(line) {
  const items = [];
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
        if (j >= line.length) return 'Marker \u201C{{\u201D is never closed with \u201C}}\u201D.';
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

function toMarker(raw) {
  const trimmed = raw.trim();
  const anyOrder = trimmed.startsWith('~');
  const body = (anyOrder ? trimmed.slice(1) : trimmed).trim().replace(/^\\~/, '~').replace(/\\\}\}/g, '}}');
  return { text: normalisePiece(body), anyOrder, empty: raw === '' };
}

function parseTemplate(source) {
  const errors = [];
  const out = { lines: [], gaps: [], pieces: [], errors };
  if (source.length > LIMITS.chars) errors.push({ line: 1, message: `The template is longer than ${LIMITS.chars} characters.` });
  const rawLines = source.split(/\r?\n/);
  if (rawLines.length > LIMITS.lines) errors.push({ line: LIMITS.lines + 1, message: `The template has more than ${LIMITS.lines} lines.` });

  for (const [n, rawLine] of rawLines.entries()) {
    const lineNo = n + 1;
    const line = rawLine.trimEnd().replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
    const items = tokenise(line);
    if (typeof items === 'string') {
      errors.push({ line: lineNo, message: items });
      out.lines.push([]);
      continue;
    }
    const segments = [];
    let run = null;
    const closeRun = () => {
      if (run) segments.push({ gap: addGap(run, lineNo, out) });
      run = null;
    };
    for (const item of items) {
      if ('marker' in item) {
        if (run) run.push(item.marker);
        else run = [item.marker];
      } else if (run && /^[ \t]+$/.test(item.fixed)) {
        // Blanks between two markers are part of the same gap.
      } else {
        closeRun();
        segments.push({ text: item.fixed });
      }
    }
    closeRun();
    out.lines.push(segments);
  }
  if (out.gaps.length > LIMITS.gaps) {
    errors.push({
      line: out.lines.findIndex((l) => l.some((s) => 'gap' in s && s.gap === LIMITS.gaps)) + 1,
      message: `The template has more than ${LIMITS.gaps} gaps.`,
    });
  }
  return out;
}

function addGap(run, line, out) {
  const fail = (message) => out.errors.push({ line, message });
  const index = out.gaps.length;
  const empty = run.some((m) => m.empty);
  if (empty && run.length > 1) fail('An empty gap \u201C{{}}\u201D must stand alone, not next to other markers.');
  if (run.slice(1).some((m) => m.anyOrder)) fail('Only the first marker of a gap may start with \u201C~\u201D.');
  const expected = [];
  for (const m of run) {
    if (m.empty) continue;
    if (!m.text) fail(m.anyOrder ? '\u201C{{~}}\u201D is not valid: a piece needs text.' : 'A marker must contain text (or be exactly \u201C{{}}\u201D).');
    else if (m.text.length > LIMITS.pieceChars) fail(`A piece is longer than ${LIMITS.pieceChars} characters.`);
    else expected.push(m.text);
  }
  out.pieces.push(...expected);
  if (out.pieces.length > LIMITS.pieces && out.pieces.length - expected.length <= LIMITS.pieces) {
    fail(`The template has more than ${LIMITS.pieces} pieces.`);
  }
  out.gaps.push({ index, expected, anyOrder: run[0].anyOrder && !empty });
  return index;
}

// Port of buildPool's checks (red herring and reusable lists).
function poolErrors(parsed, redHerrings, reusable) {
  const errors = [];
  const herrings = redHerrings.map(normalisePiece);
  if (herrings.length > LIMITS.herrings) errors.push(`At most ${LIMITS.herrings} red herrings are allowed.`);
  for (const h of herrings) {
    if (!h) errors.push('A red herring must not be empty.');
    else if (h.length > LIMITS.pieceChars) errors.push(`A red herring is longer than ${LIMITS.pieceChars} characters.`);
  }
  const known = new Set([...parsed.pieces, ...herrings]);
  for (const r of new Set(reusable.map(normalisePiece))) {
    if (!known.has(r)) errors.push(`Reusable \u201C${r}\u201D occurs neither in the solution nor in the red herrings.`);
  }
  return { errors, herrings };
}

function checkLines(path, lines, max) {
  if (!Array.isArray(lines)) return bad(path, 'must be an array');
  if (lines.length > max) bad(path, `at most ${max} lines`);
  lines.forEach((line, i) => {
    const at = `${path}.${i}`;
    if (typeof line !== 'object' || line === null || Array.isArray(line)) return bad(at, 'must be an object {code, indent}');
    if ('id' in line) bad(`${at}.id`, 'remove it, ids are generated on import');
    const { code, indent = 0 } = line;
    if (typeof code !== 'string') return bad(`${at}.code`, 'must be a string');
    const trimmed = code.trimEnd();
    if (trimmed.length === 0) bad(`${at}.code`, 'must not be empty');
    if (trimmed.length > 200) bad(`${at}.code`, 'at most 200 characters');
    if (/[\r\n]/.test(trimmed)) bad(`${at}.code`, 'must be a single line');
    if (trimmed !== trimmed.trimStart()) bad(`${at}.code`, 'leading spaces not allowed, use indent');
    if (!Number.isInteger(indent) || indent < 0 || indent > 6) bad(`${at}.indent`, 'must be an integer 0 to 6');
  });
}

function checkTemplate(at, p) {
  if (typeof p.template !== 'string') return bad(`${at}.template`, 'must be a string');
  if (p.template.length > 20000) bad(`${at}.template`, 'at most 20000 characters');
  for (const key of ['redHerrings', 'reusable']) {
    const v = p[key];
    if (v === undefined) continue;
    const max = key === 'redHerrings' ? 100 : 200;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) bad(`${at}.${key}`, 'must be an array of strings');
    else {
      if (v.length > max) bad(`${at}.${key}`, `at most ${max} entries`);
      v.forEach((x, k) => x.length > 1000 && bad(`${at}.${key}.${k}`, 'at most 1000 characters'));
    }
  }
  const herringsIn = Array.isArray(p.redHerrings) && p.redHerrings.every((x) => typeof x === 'string') ? p.redHerrings : [];
  const reusableIn = Array.isArray(p.reusable) && p.reusable.every((x) => typeof x === 'string') ? p.reusable : [];
  const parsed = parseTemplate(p.template);
  for (const e of parsed.errors) bad(`${at}.template`, `line ${e.line}: ${e.message}`);
  const { errors, herrings } = poolErrors(parsed, herringsIn, reusableIn);
  for (const m of errors) bad(`${at}.redHerrings`, m);
  if (parsed.pieces.length === 0) warnings.push(`${at}.template: no pieces, students would have nothing to place`);
  for (const h of herrings) {
    if (parsed.pieces.includes(h)) warnings.push(`${at}.redHerrings: "${h}" is also a solution piece; it is only a decoy if the student cannot use it validly`);
  }
}

const puzzles = data?.puzzles;
if (!Array.isArray(puzzles)) bad('puzzles', 'top level must be {"puzzles": [...]}');
else {
  if (puzzles.length < 1 || puzzles.length > 50) bad('puzzles', 'must contain 1 to 50 puzzles');
  puzzles.forEach((p, i) => {
    const at = `puzzles.${i}`;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return bad(at, 'must be an object');
    const kind = p.kind ?? 'lines';
    if (kind !== 'lines' && kind !== 'template') bad(`${at}.kind`, 'must be "lines" or "template" (or omitted for a line puzzle)');
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    if (!title || title.length > 120) bad(`${at}.title`, 'required, at most 120 characters');
    if (p.description !== undefined && (typeof p.description !== 'string' || p.description.trim().length > 2000)) {
      bad(`${at}.description`, 'must be a string of at most 2000 characters');
    }
    if (kind === 'template') return checkTemplate(at, p);
    if (kind !== 'lines') return;
    checkLines(`${at}.solution`, p.solution, 30);
    if (Array.isArray(p.solution) && p.solution.length < 2) bad(`${at}.solution`, 'needs at least 2 lines to be publishable');
    if (p.redHerrings !== undefined) checkLines(`${at}.redHerrings`, p.redHerrings, 10);
    const sol = new Set((Array.isArray(p.solution) ? p.solution : []).map((l) => l?.code?.trimEnd()));
    for (const [j, l] of (Array.isArray(p.redHerrings) ? p.redHerrings : []).entries()) {
      if (sol.has(l?.code?.trimEnd())) bad(`${at}.redHerrings.${j}`, 'same code as a solution line, so it is not a red herring');
    }
  });
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const nTemplate = puzzles.filter((p) => p.kind === 'template').length;
console.log(`OK: ${puzzles.length} puzzle(s) (${puzzles.length - nTemplate} lines, ${nTemplate} template)`);
