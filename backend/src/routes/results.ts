import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { requireExamAccess } from '../lib/exams.js';
import { finaliseOverdue, settleIfOverdue } from '../lib/finalise.js';
import { parseId } from '../lib/membership.js';
import { buildAttemptDetail, buildExport, buildResults, findAttempt } from '../lib/results.js';
import { teacherAuth, type TeacherVariables } from '../middleware/teacher_auth.js';

// ---- /api/teacher/exams/:examId/results and /export
export const examResults = new Hono<{ Variables: TeacherVariables }>();
examResults.use('*', teacherAuth);

examResults.get('/:examId/results', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  await requireExamAccess(db, c.get('teacher').id, examId);
  await finaliseOverdue(db, new Date(), examId);
  return c.json(await buildResults(db, examId));
});

examResults.get('/:examId/export', async (c) => {
  const db = getDb();
  const examId = parseId(c.req.param('examId'));
  const exam = await requireExamAccess(db, c.get('teacher').id, examId);
  const now = new Date();
  await finaliseOverdue(db, now, examId);
  const cls = await db<{ name: string }[]>`SELECT name FROM classes WHERE id = ${exam.classId}`;
  const body = await buildExport(db, exam, cls[0]?.name ?? '', now);
  const slug = exam.title.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'exam';
  c.header('Content-Disposition', `attachment; filename=${slug}.json`);
  return c.json(body);
});

// ---- /api/teacher/attempts/:attemptId
export const attempts = new Hono<{ Variables: TeacherVariables }>();
attempts.use('*', teacherAuth);

attempts.get('/:attemptId', async (c) => {
  const db = getDb();
  const found = await findAttempt(db, parseId(c.req.param('attemptId')));
  const exam = await requireExamAccess(db, c.get('teacher').id, found.examId);
  const attempt = await settleIfOverdue(db, found, new Date());
  return c.json({ attempt: await buildAttemptDetail(db, attempt, exam.studentsIndent) });
});

attempts.delete('/:attemptId', async (c) => {
  const db = getDb();
  const found = await findAttempt(db, parseId(c.req.param('attemptId')));
  await requireExamAccess(db, c.get('teacher').id, found.examId);
  await db`DELETE FROM attempts WHERE id = ${found.id}`;
  return c.json({ ok: true });
});
