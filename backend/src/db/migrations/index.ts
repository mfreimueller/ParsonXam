import { MIGRATION_0001_TEACHERS_AND_AUTH } from './0001_teachers_and_auth.js';
import { MIGRATION_0002_CLASSES_AND_MEMBERS } from './0002_classes_and_members.js';
import { MIGRATION_0003_EXAMS_AND_PUZZLES } from './0003_exams_and_puzzles.js';
import { MIGRATION_0004_ATTEMPTS } from './0004_attempts.js';
import { MIGRATION_0005_PUZZLES_PER_STUDENT } from './0005_puzzles_per_student.js';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  MIGRATION_0001_TEACHERS_AND_AUTH,
  MIGRATION_0002_CLASSES_AND_MEMBERS,
  MIGRATION_0003_EXAMS_AND_PUZZLES,
  MIGRATION_0004_ATTEMPTS,
  MIGRATION_0005_PUZZLES_PER_STUDENT,
];
