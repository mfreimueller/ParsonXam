import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { normaliseCode } from '../lib/access_code.js';
import { cleanName, createAttempt, findExamById, findExamByCode, getAttempt, startAttempt } from '../lib/attempts.js';
import { examPhase } from '../lib/exam_phase.js';
import { finaliseAttempt } from '../lib/finalise.js';
import { parseJson } from '../lib/http.js';
import { clientIp } from '../lib/http.js';
import { recordFailure, tooManyFailures } from '../lib/rate_limit.js';
import { buildAttemptView } from '../lib/student_view.js';
import { saveState } from '../lib/save_state.js';
import { studentAuth, type StudentVariables } from '../middleware/student_auth.js';

export const student = new Hono<{ Variables: StudentVariables }>();

const lookupSchema = z.object({ code: z.string().max(40) });

const joinSchema = z.object({
  code: z.string().max(40),
  name: z.string().transform(cleanName).pipe(z.string().min(1).max(60)),
});

// Wrong codes are counted per client address; 300 in ten minutes is far beyond any typo storm
// in a classroom but makes guessing codes pointless.
const GUESS_LIMIT = 300;
const GUESS_WINDOW_MS = 10 * 60_000;

// Finds the exam behind a code and says why it cannot be joined right now.
async function joinableExam(c: Context, code: string) {
  const db = getDb();
  const key = `guess:${clientIp(c)}`;
  if (tooManyFailures(key, GUESS_LIMIT, GUESS_WINDOW_MS)) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many wrong codes. Please wait a few minutes.');
  }
  const normalised = normaliseCode(code);
  const exam = normalised ? await findExamByCode(db, normalised) : null;
  // Unpublished exams look exactly like unknown codes.
  if (!exam || !exam.publishedAt) {
    recordFailure(key);
    throw new AppError(404, 'CODE_NOT_FOUND', 'We couldn’t find an exam with this code.');
  }
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
  return exam;
}

// Step 1 of joining: "is this code good?" Shown to the student as the "exam found" card.
student.post('/lookup', async (c) => {
  const { code } = await parseJson(c, lookupSchema);
  const exam = await joinableExam(c, code);
  const puzzles = await getDb()<{ n: number }[]>`SELECT COUNT(*) AS n FROM puzzles WHERE exam_id = ${exam.id}`;
  return c.json({
    examTitle: exam.title,
    className: exam.className,
    timeLimitSeconds: exam.timeLimitSeconds,
    puzzleCount: Number(puzzles[0]!.n),
    closesAt: exam.closesAt!.toISOString(),
  });
});

student.post('/join', async (c) => {
  const body = await parseJson(c, joinSchema);
  const exam = await joinableExam(c, body.code);
  const token = await createAttempt(getDb(), exam.id, body.name);
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

const stateSchema = z.object({
  placed: z
    .array(z.object({ pieceId: z.string().max(40), indent: z.number().int().min(0).max(6).default(0) }))
    .max(60),
});

student.put('/puzzles/:id/state', studentAuth, async (c) => {
  const body = await parseJson(c, stateSchema);
  const savedAt = await saveState(getDb(), c.get('attempt'), Number(c.req.param('id')), body.placed, new Date());
  return c.json({ ok: true, savedAt: savedAt.toISOString() });
});

student.post('/submit', studentAuth, async (c) => {
  const db = getDb();
  let attempt = c.get('attempt');
  if (!attempt.startedAt) throw new AppError(409, 'NOT_STARTED', 'Start the exam first.');
  if (!attempt.submittedAt) attempt = await finaliseAttempt(db, attempt.id, 'manual', new Date());
  const exam = await findExamById(db, attempt.examId);
  return c.json({
    scorePercent: Number(attempt.scorePercent),
    reason: attempt.submitReason,
    closesAt: exam.closesAt?.toISOString() ?? null,
  });
});
