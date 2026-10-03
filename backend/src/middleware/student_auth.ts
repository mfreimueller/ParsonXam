import type { Context, Next } from 'hono';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { findAttemptByToken, type AttemptRow } from '../lib/attempts.js';
import { bearerToken } from './teacher_auth.js';

export interface StudentVariables {
  attempt: AttemptRow;
}

export async function studentAuth(c: Context, next: Next) {
  const token = bearerToken(c);
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Please join the exam again.');
  const attempt = await findAttemptByToken(getDb(), token);
  if (!attempt) throw new AppError(401, 'UNAUTHORIZED', 'Please join the exam again.');
  c.set('attempt', attempt);
  await next();
}
