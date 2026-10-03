import { randomInt } from 'node:crypto';
import { raw, type SQLInstance } from '../db/sql.js';
import { AppError } from '../errors.js';
import { hashToken } from './hash.js';
import { generateToken } from './token.js';

export interface AttemptRow {
  id: number;
  examId: number;
  studentName: string;
  shuffleSeed: number;
  joinedAt: Date;
  startedAt: Date | null;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  submitReason: 'manual' | 'timeout' | null;
  scorePercent: number | null;
}

export const ATTEMPT_COLUMNS = `
  id, exam_id AS examId, student_name AS studentName, shuffle_seed AS shuffleSeed, joined_at AS joinedAt,
  started_at AS startedAt, deadline_at AS deadlineAt, submitted_at AS submittedAt,
  submit_reason AS submitReason, score_percent AS scorePercent`;

/** "  Anna   HUBER " -> "anna huber": the key that makes names unique per exam. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export async function createAttempt(db: SQLInstance, examId: number, name: string): Promise<string> {
  const token = generateToken();
  try {
    await db`
      INSERT INTO attempts (exam_id, student_name, name_key, token_hash, shuffle_seed, joined_at)
      VALUES (${examId}, ${cleanName(name)}, ${nameKey(name)}, ${hashToken(token)}, ${randomInt(1, 2 ** 31)}, ${new Date()})
    `;
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'NAME_TAKEN', 'Someone with this name has already joined. Ask your teacher if that was you.');
    }
    throw err;
  }
  return token;
}

export interface StudentExam {
  id: number;
  title: string;
  instructions: string;
  className: string;
  timeLimitSeconds: number;
  opensAt: Date | null;
  closesAt: Date | null;
  publishedAt: Date | null;
  studentsIndent: boolean;
}

export async function findExamByCode(db: SQLInstance, code: string): Promise<StudentExam | null> {
  const rows = await db<(Omit<StudentExam, 'studentsIndent'> & { studentsIndent: number })[]>`
    SELECT e.id, e.title, e.instructions, c.name AS className, e.time_limit_seconds AS timeLimitSeconds,
           e.opens_at AS opensAt, e.closes_at AS closesAt, e.published_at AS publishedAt,
           e.students_indent AS studentsIndent
    FROM exams e JOIN classes c ON c.id = e.class_id
    WHERE e.access_code = ${code}
  `;
  const r = rows[0];
  return r ? { ...r, studentsIndent: Boolean(r.studentsIndent) } : null;
}

export async function findExamById(db: SQLInstance, examId: number): Promise<StudentExam> {
  const rows = await db<(Omit<StudentExam, 'studentsIndent'> & { studentsIndent: number })[]>`
    SELECT e.id, e.title, e.instructions, c.name AS className, e.time_limit_seconds AS timeLimitSeconds,
           e.opens_at AS opensAt, e.closes_at AS closesAt, e.published_at AS publishedAt,
           e.students_indent AS studentsIndent
    FROM exams e JOIN classes c ON c.id = e.class_id
    WHERE e.id = ${examId}
  `;
  const r = rows[0]!;
  return { ...r, studentsIndent: Boolean(r.studentsIndent) };
}

export async function findAttemptByToken(db: SQLInstance, token: string): Promise<AttemptRow | null> {
  const rows = await db<AttemptRow[]>`${raw(`SELECT ${ATTEMPT_COLUMNS} FROM attempts`)} WHERE token_hash = ${hashToken(token)}`;
  return rows[0] ?? null;
}

export async function getAttempt(db: SQLInstance, attemptId: number): Promise<AttemptRow> {
  const rows = await db<AttemptRow[]>`${raw(`SELECT ${ATTEMPT_COLUMNS} FROM attempts`)} WHERE id = ${attemptId}`;
  return rows[0]!;
}

// Starts the clock once. A second call changes nothing and returns the same deadline.
export async function startAttempt(db: SQLInstance, attempt: AttemptRow, exam: StudentExam, now: Date): Promise<void> {
  if (attempt.startedAt) return;
  const deadline = new Date(now.getTime() + exam.timeLimitSeconds * 1000);
  await db.begin(async (tx) => {
    const res = await tx`
      UPDATE attempts SET started_at = ${now}, deadline_at = ${deadline}
      WHERE id = ${attempt.id} AND started_at IS NULL
    `;
    if (res.affectedRows !== 1) return; // a parallel request already started it
    const puzzles = await tx<{ id: number }[]>`SELECT id FROM puzzles WHERE exam_id = ${exam.id} ORDER BY position`;
    for (const p of puzzles) {
      await tx`INSERT INTO attempt_puzzles (attempt_id, puzzle_id, state, updated_at) VALUES (${attempt.id}, ${p.id}, '[]', ${now})`;
    }
  });
}

// Joining alone changes nothing for a student; starting is what freezes the exam.
export async function examHasStartedAttempts(db: SQLInstance, examId: number): Promise<boolean> {
  const rows = await db<{ n: number }[]>`SELECT COUNT(*) AS n FROM attempts WHERE exam_id = ${examId} AND started_at IS NOT NULL`;
  return Number(rows[0]?.n) > 0;
}

/** Once students have started, what they were given must not change under them. */
export async function assertStructureEditable(db: SQLInstance, examId: number): Promise<void> {
  if (await examHasStartedAttempts(db, examId)) {
    throw new AppError(409, 'EXAM_LOCKED', 'Students have already started this exam, so its puzzles can no longer change.');
  }
}
