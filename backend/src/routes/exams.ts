import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { generateAccessCode } from '../lib/access_code.js';
import { examHasStartedAttempts } from '../lib/attempts.js';
import { getExam, listExams, publishProblems, requireExamAccess } from '../lib/exams.js';
import { parseJson } from '../lib/http.js';
import { parseId, requireMember } from '../lib/membership.js';
import { teacherAuth, type TeacherVariables } from '../middleware/teacher_auth.js';

export const exams = new Hono<{ Variables: TeacherVariables }>();
exams.use('*', teacherAuth);

const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2000).default(''),
  timeLimitSeconds: z.number().int().min(60).max(4 * 3600).default(600),
  opensAt: isoDate.nullable().default(null),
  closesAt: isoDate.nullable().default(null),
  studentsIndent: z.boolean().default(false),
});
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().max(2000),
    timeLimitSeconds: z.number().int().min(60).max(4 * 3600),
    opensAt: isoDate.nullable(),
    closesAt: isoDate.nullable(),
    studentsIndent: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to change' });

function checkOrder(opensAt: Date | null, closesAt: Date | null) {
  if (opensAt && closesAt && opensAt >= closesAt) {
    throw new AppError(400, 'VALIDATION', 'The exam must open before it is over.');
  }
}

async function insertWithUniqueCode(
  insert: (code: string) => Promise<number>
): Promise<{ id: number; code: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateAccessCode();
    try {
      return { id: await insert(code), code };
    } catch (err) {
      if ((err as { code?: string }).code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  throw new Error('could not generate a unique access code');
}

// ---- under a class: /api/teacher/classes/:id/exams
export const classExams = new Hono<{ Variables: TeacherVariables }>();
classExams.use('*', teacherAuth);

classExams.get('/:id/exams', async (c) => {
  const db = getDb();
  const classId = parseId(c.req.param('id'));
  await requireMember(db, c.get('teacher').id, classId);
  return c.json({ exams: await listExams(db, classId) });
});

classExams.post('/:id/exams', async (c) => {
  const db = getDb();
  const classId = parseId(c.req.param('id'));
  const teacherId = c.get('teacher').id;
  await requireMember(db, teacherId, classId);
  const body = await parseJson(c, createSchema);
  checkOrder(body.opensAt, body.closesAt);

  const { id } = await insertWithUniqueCode(async (code) => {
    const res = await db`
      INSERT INTO exams (class_id, title, instructions, time_limit_seconds, opens_at, closes_at,
                         access_code, students_indent, created_by, created_at)
      VALUES (${classId}, ${body.title}, ${body.instructions}, ${body.timeLimitSeconds}, ${body.opensAt},
              ${body.closesAt}, ${code}, ${body.studentsIndent ? 1 : 0}, ${teacherId}, ${new Date()})
    `;
    return res.lastInsertRowid;
  });
  return c.json({ exam: await getExam(db, id) }, 201);
});

// ---- /api/teacher/exams/:examId
exams.get('/:examId', async (c) => {
  const exam = await requireExamAccess(getDb(), c.get('teacher').id, parseId(c.req.param('examId')));
  return c.json({ exam });
});

exams.patch('/:examId', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  const exam = await requireExamAccess(db, c.get('teacher').id, examId);
  const body = await parseJson(c, patchSchema);

  if (body.studentsIndent !== undefined && body.studentsIndent !== exam.studentsIndent && exam.status !== 'draft') {
    throw new AppError(409, 'EXAM_LOCKED', 'The indentation setting cannot change once the exam is published.');
  }
  const opensAt = body.opensAt !== undefined ? body.opensAt : exam.opensAt ? new Date(exam.opensAt) : null;
  const closesAt = body.closesAt !== undefined ? body.closesAt : exam.closesAt ? new Date(exam.closesAt) : null;
  checkOrder(opensAt, closesAt);
  if (exam.publishedAt && (!opensAt || !closesAt)) {
    throw new AppError(400, 'VALIDATION', 'A published exam needs an opening and a closing time.');
  }

  await db`
    UPDATE exams SET
      title = ${body.title ?? exam.title},
      instructions = ${body.instructions ?? exam.instructions},
      time_limit_seconds = ${body.timeLimitSeconds ?? exam.timeLimitSeconds},
      opens_at = ${opensAt},
      closes_at = ${closesAt},
      students_indent = ${(body.studentsIndent ?? exam.studentsIndent) ? 1 : 0}
    WHERE id = ${examId}
  `;
  return c.json({ exam: await getExam(db, examId) });
});

exams.delete('/:examId', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  await db`DELETE FROM exams WHERE id = ${examId}`;
  return c.json({ ok: true });
});

exams.post('/:examId/publish', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  const exam = await requireExamAccess(db, c.get('teacher').id, examId);
  if (!exam.publishedAt) {
    const problems = await publishProblems(db, exam);
    if (problems.length > 0) {
      throw new AppError(409, 'EXAM_NOT_READY', 'The exam is not ready to publish.', { problems });
    }
    await db`UPDATE exams SET published_at = ${new Date()} WHERE id = ${examId}`;
  }
  return c.json({ exam: await getExam(db, examId) });
});

exams.post('/:examId/unpublish', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  if (await examHasStartedAttempts(db, examId)) {
    throw new AppError(409, 'EXAM_LOCKED', 'Students have already started this exam, so it can no longer be unpublished.');
  }
  await db`UPDATE exams SET published_at = NULL WHERE id = ${examId}`;
  return c.json({ exam: await getExam(db, examId) });
});

exams.post('/:examId/regenerate-code', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  await insertWithUniqueCode(async (code) => {
    await db`UPDATE exams SET access_code = ${code} WHERE id = ${examId}`;
    return examId;
  });
  return c.json({ exam: await getExam(db, examId) });
});
