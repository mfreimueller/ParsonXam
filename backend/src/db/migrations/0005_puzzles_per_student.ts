import type { Migration } from './index.js';

// NULL means every student gets every puzzle; a number means each student gets that many, picked at random.
export const MIGRATION_0005_PUZZLES_PER_STUDENT: Migration = {
  version: 5,
  name: 'puzzles_per_student',
  statements: [`ALTER TABLE exams ADD COLUMN puzzles_per_student INT UNSIGNED NULL AFTER students_indent`],
};
