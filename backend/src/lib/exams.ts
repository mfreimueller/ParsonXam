import { raw, type SQLInstance } from '../db/sql.js';
import { AppError } from '../errors.js';
import { formatCode } from './access_code.js';
import { examPhase, type ExamPhase } from './exam_phase.js';
import { requireMember } from './membership.js';

interface ExamRow {
  id: number;
  classId: number;
  title: string;
  instructions: string;
  timeLimitSeconds: number;
  opensAt: Date | null;
  closesAt: Date | null;
  accessCode: string;
  studentsIndent: number;
  puzzlesPerStudent: number | null;
  publishedAt: Date | null;
  createdById: number | null;
  createdByName: string | null;
  puzzleCount: number;
  attemptCount: number;
  submissionCount: number;
}

export interface ExamView {
  id: number;
  classId: number;
  title: string;
  instructions: string;
  timeLimitSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  studentsIndent: boolean;
  /** null: every student gets all puzzles. */
  puzzlesPerStudent: number | null;
  accessCode: string;
  status: ExamPhase;
  publishedAt: string | null;
  puzzleCount: number;
  attemptCount: number;
  submissionCount: number;
  createdBy: { id: number; displayName: string } | null;
}

const SELECT_EXAM = `
  SELECT e.id, e.class_id AS classId, e.title, e.instructions, e.time_limit_seconds AS timeLimitSeconds,
         e.opens_at AS opensAt, e.closes_at AS closesAt, e.access_code AS accessCode,
         e.students_indent AS studentsIndent, e.puzzles_per_student AS puzzlesPerStudent, e.published_at AS publishedAt,
         t.id AS createdById, t.display_name AS createdByName,
         (SELECT COUNT(*) FROM puzzles p WHERE p.exam_id = e.id) AS puzzleCount,
         (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id) AS attemptCount,
         (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.submitted_at IS NOT NULL) AS submissionCount
  FROM exams e LEFT JOIN teachers t ON t.id = e.created_by`;

function toView(r: ExamRow, now = new Date()): ExamView {
  return {
    id: r.id,
    classId: r.classId,
    title: r.title,
    instructions: r.instructions,
    timeLimitSeconds: r.timeLimitSeconds,
    opensAt: r.opensAt?.toISOString() ?? null,
    closesAt: r.closesAt?.toISOString() ?? null,
    studentsIndent: Boolean(r.studentsIndent),
    puzzlesPerStudent: r.puzzlesPerStudent === null ? null : Number(r.puzzlesPerStudent),
    accessCode: formatCode(r.accessCode),
    status: examPhase(r, now),
    publishedAt: r.publishedAt?.toISOString() ?? null,
    puzzleCount: Number(r.puzzleCount),
    attemptCount: Number(r.attemptCount),
    submissionCount: Number(r.submissionCount),
    createdBy: r.createdById ? { id: r.createdById, displayName: r.createdByName ?? '' } : null,
  };
}

export async function listExams(db: SQLInstance, classId: number): Promise<ExamView[]> {
  const rows = await db<ExamRow[]>`${raw(SELECT_EXAM)} WHERE e.class_id = ${classId} ORDER BY e.created_at DESC, e.id DESC`;
  return rows.map((r) => toView(r));
}

export async function getExam(db: SQLInstance, examId: number): Promise<ExamView | null> {
  const rows = await db<ExamRow[]>`${raw(SELECT_EXAM)} WHERE e.id = ${examId}`;
  return rows[0] ? toView(rows[0]) : null;
}

/** Loads the exam and checks the teacher belongs to its class. Outsiders get 404. */
export async function requireExamAccess(db: SQLInstance, teacherId: number, examId: number): Promise<ExamView> {
  const exam = await getExam(db, examId);
  if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found.');
  await requireMember(db, teacherId, exam.classId);
  return exam;
}

// Reasons an exam cannot be published yet; empty means ready.
export async function publishProblems(db: SQLInstance, exam: ExamView): Promise<string[]> {
  const problems: string[] = [];
  if (!exam.opensAt || !exam.closesAt) problems.push('Set when the exam opens and when it is over.');
  else if (new Date(exam.opensAt) >= new Date(exam.closesAt)) problems.push('The exam must open before it is over.');
  if (exam.timeLimitSeconds <= 0) problems.push('Set a time limit.');

  const puzzles = await db<{ id: number; title: string; solutionLines: number }[]>`
    SELECT p.id, p.title,
           (SELECT COUNT(*) FROM puzzle_lines l WHERE l.puzzle_id = p.id AND l.solution_position IS NOT NULL) AS solutionLines
    FROM puzzles p WHERE p.exam_id = ${exam.id} ORDER BY p.position
  `;
  if (puzzles.length === 0) problems.push('Add at least one puzzle.');
  else if (exam.puzzlesPerStudent !== null && exam.puzzlesPerStudent > puzzles.length) {
    problems.push(`Each student should get ${exam.puzzlesPerStudent} puzzles, but the exam has only ${puzzles.length}.`);
  }
  for (const p of puzzles) {
    if (Number(p.solutionLines) < 2) problems.push(`Puzzle “${p.title}” needs at least two solution lines.`);
  }
  return problems;
}
