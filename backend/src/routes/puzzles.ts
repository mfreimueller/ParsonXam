import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { assertStructureEditable } from '../lib/attempts.js';
import { requireExamAccess } from '../lib/exams.js';
import { parseJson } from '../lib/http.js';
import { parseId } from '../lib/membership.js';
import { getPuzzle, listPuzzles, replaceLines, requirePuzzleAccess } from '../lib/puzzles.js';
import { teacherAuth, type TeacherVariables } from '../middleware/teacher_auth.js';

const line = z.object({
  id: z.string().max(40).optional(),
  // One line of code: no line breaks, trailing spaces dropped, leading spaces are not allowed
  // because indentation is its own field.
  code: z
    .string()
    .transform((s) => s.trimEnd())
    .pipe(
      z
        .string()
        .min(1)
        .max(200)
        .refine((s) => !/[\r\n]/.test(s), 'must be a single line')
        .refine((s) => s === s.trimStart(), 'use the indent field instead of leading spaces')
    ),
  indent: z.number().int().min(0).max(6).default(0),
});

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    solution: z.array(line).max(30),
    redHerrings: z.array(line).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    const ids = [...v.solution, ...v.redHerrings].map((l) => l.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'line ids must be unique' });
  });

export const examPuzzles = new Hono<{ Variables: TeacherVariables }>();
examPuzzles.use('*', teacherAuth);

examPuzzles.get('/:examId/puzzles', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  return c.json({ puzzles: await listPuzzles(db, examId) });
});

examPuzzles.post('/:examId/puzzles', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  await assertStructureEditable(db, examId);
  const body = await parseJson(c, bodySchema);

  const puzzleId = await db.begin(async (tx) => {
    const next = await tx<{ n: number }[]>`SELECT COALESCE(MAX(position), 0) + 1 AS n FROM puzzles WHERE exam_id = ${examId}`;
    const res = await tx`
      INSERT INTO puzzles (exam_id, position, title, description)
      VALUES (${examId}, ${next[0]!.n}, ${body.title}, ${body.description})
    `;
    await replaceLines(tx, res.lastInsertRowid, body.solution, body.redHerrings);
    return res.lastInsertRowid;
  });
  return c.json({ puzzle: await getPuzzle(db, puzzleId) }, 201);
});

const orderSchema = z.object({ puzzleIds: z.array(z.number().int().positive()).min(1).max(50) });

examPuzzles.put('/:examId/puzzles/order', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  await assertStructureEditable(db, examId);
  const { puzzleIds } = await parseJson(c, orderSchema);

  const current = (await listPuzzles(db, examId)).map((p) => p.id).sort((a, b) => a - b);
  const wanted = [...puzzleIds].sort((a, b) => a - b);
  if (current.length !== wanted.length || current.some((id, i) => id !== wanted[i])) {
    throw new AppError(400, 'VALIDATION', 'puzzleIds must list every puzzle of the exam exactly once.');
  }
  await db.begin(async (tx) => {
    for (const [i, id] of puzzleIds.entries()) {
      await tx`UPDATE puzzles SET position = ${i + 1} WHERE id = ${id} AND exam_id = ${examId}`;
    }
  });
  return c.json({ puzzles: await listPuzzles(db, examId) });
});

export const puzzles = new Hono<{ Variables: TeacherVariables }>();
puzzles.use('*', teacherAuth);

puzzles.get('/:id', async (c) => {
  const puzzle = await requirePuzzleAccess(getDb(), c.get('teacher').id, parseId(c.req.param('id')));
  return c.json({ puzzle });
});

puzzles.put('/:id', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  const existing = await requirePuzzleAccess(db, c.get('teacher').id, id);
  await assertStructureEditable(db, existing.examId);
  const body = await parseJson(c, bodySchema);
  await db.begin(async (tx) => {
    await tx`UPDATE puzzles SET title = ${body.title}, description = ${body.description} WHERE id = ${id}`;
    await replaceLines(tx, id, body.solution, body.redHerrings);
  });
  return c.json({ puzzle: await getPuzzle(db, id) });
});

puzzles.delete('/:id', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  const puzzle = await requirePuzzleAccess(db, c.get('teacher').id, id);
  await assertStructureEditable(db, puzzle.examId);
  await db.begin(async (tx) => {
    await tx`DELETE FROM puzzles WHERE id = ${id}`;
    // Close the gap so positions stay 1..n.
    const rest = await tx<{ id: number }[]>`SELECT id FROM puzzles WHERE exam_id = ${puzzle.examId} ORDER BY position`;
    for (const [i, p] of rest.entries()) await tx`UPDATE puzzles SET position = ${i + 1} WHERE id = ${p.id}`;
  });
  return c.json({ ok: true });
});
