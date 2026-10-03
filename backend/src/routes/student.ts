import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { normaliseCode } from '../lib/access_code.js';
import { cleanName, createAttempt, findExamById, findExamByCode, getAttempt, startAttempt } from '../lib/attempts.js';
import { examPhase } from '../lib/exam_phase.js';
import { parseJson } from '../lib/http.js';
import { rateLimit } from '../lib/rate_limit.js';
import { buildAttemptView } from '../lib/student_view.js';
import { studentAuth, type StudentVariables } from '../middleware/student_auth.js';

export const student = new Hono<{ Variables: StudentVariables }>();

const joinSchema = z.object({
  code: z.string().max(40),
  name: z.string().transform(cleanName).pipe(z.string().min(1).max(60)),
});

student.post('/join', rateLimit('join', 10, 60_000), async (c) => {
  const body = await parseJson(c, joinSchema);
  const db = getDb();
  const code = normaliseCode(body.code);
  const exam = code ? await findExamByCode(db, code) : null;
  // Unpublished exams look exactly like unknown codes.
  if (!exam || !exam.publishedAt) throw new AppError(404, 'CODE_NOT_FOUND', 'We couldn’t find an exam with this code.');

  const phase = examPhase(exam, new Date());
  if (phase === 'scheduled') {
    throw new AppError(409, 'EXAM_NOT_OPEN', 'This exam has not started yet.', {
      examTitle: exam.title,
      opensAt: exam.opensAt!.toISOString(),
    });
  }
  if (phase === 'over') {
    throw new AppError(410, 'EXAM_CLOSED', 'This exam is over.', {
      examTitle: exam.title,
      closesAt: exam.closesAt!.toISOString(),
    });
  }
  const token = await createAttempt(db, exam.id, body.name);
  return c.json({ token }, 201);
});

student.get('/attempt', studentAuth, async (c) => {
  return c.json(await buildAttemptView(getDb(), c.get('attempt'), new Date()));
});

student.post('/start', studentAuth, async (c) => {
  const db = getDb();
  const attempt = c.get('attempt');
  const exam = await findExamById(db, attempt.examId);
  const now = new Date();

  if (!attempt.startedAt) {
    const phase = examPhase(exam, now);
    if (phase === 'over') {
      throw new AppError(410, 'EXAM_CLOSED', 'This exam is over.', { examTitle: exam.title, closesAt: exam.closesAt!.toISOString() });
    }
    if (phase !== 'live') {
      throw new AppError(409, 'EXAM_NOT_OPEN', 'This exam has not started yet.', {
        examTitle: exam.title,
        opensAt: exam.opensAt?.toISOString() ?? null,
      });
    }
    await startAttempt(db, attempt, exam, now);
  }
  return c.json(await buildAttemptView(db, await getAttempt(db, attempt.id), now));
});
