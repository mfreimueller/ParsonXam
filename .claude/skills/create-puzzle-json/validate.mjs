#!/usr/bin/env node
// Checks a ParsonXam puzzle import file against the same rules as the server
// (backend/src/routes/puzzles.ts). Usage: node validate.mjs <file.json>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate.mjs <file.json>');
  process.exit(2);
}

const problems = [];
const bad = (path, msg) => problems.push(`${path}: ${msg}`);

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`Not valid JSON: ${err.message}`);
  process.exit(1);
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

const puzzles = data?.puzzles;
if (!Array.isArray(puzzles)) bad('puzzles', 'top level must be {"puzzles": [...]}');
else {
  if (puzzles.length < 1 || puzzles.length > 50) bad('puzzles', 'must contain 1 to 50 puzzles');
  puzzles.forEach((p, i) => {
    const at = `puzzles.${i}`;
    if (typeof p !== 'object' || p === null) return bad(at, 'must be an object');
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    if (!title || title.length > 120) bad(`${at}.title`, 'required, at most 120 characters');
    if (p.description !== undefined && (typeof p.description !== 'string' || p.description.trim().length > 2000)) {
      bad(`${at}.description`, 'must be a string of at most 2000 characters');
    }
    checkLines(`${at}.solution`, p.solution, 30);
    if (Array.isArray(p.solution) && p.solution.length < 2) bad(`${at}.solution`, 'needs at least 2 lines to be publishable');
    if (p.redHerrings !== undefined) checkLines(`${at}.redHerrings`, p.redHerrings, 10);
    const sol = new Set((p.solution ?? []).map((l) => l?.code?.trimEnd()));
    for (const [j, l] of (p.redHerrings ?? []).entries()) {
      if (sol.has(l?.code?.trimEnd())) bad(`${at}.redHerrings.${j}`, 'same code as a solution line, so it is not a red herring');
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`OK: ${puzzles.length} puzzle(s)`);
