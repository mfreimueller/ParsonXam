import type { Migration } from './index.js';

export const MIGRATION_0003_EXAMS_AND_PUZZLES: Migration = {
  version: 3,
  name: 'exams_and_puzzles',
  statements: [
    // opens_at / closes_at may be NULL while the exam is a draft; publishing requires both.
    `CREATE TABLE exams (
      id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      class_id           INT UNSIGNED NOT NULL,
      title              VARCHAR(120) NOT NULL,
      instructions       TEXT NOT NULL,
      time_limit_seconds INT UNSIGNED NOT NULL,
      opens_at           DATETIME NULL,
      closes_at          DATETIME NULL,
      access_code        CHAR(6) NOT NULL,
      students_indent    TINYINT(1) NOT NULL DEFAULT 0,
      published_at       DATETIME NULL,
      created_by         INT UNSIGNED NULL,
      created_at         DATETIME NOT NULL,
      UNIQUE KEY uq_exams_code (access_code),
      KEY idx_exams_class (class_id),
      CONSTRAINT fk_exams_class FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE,
      CONSTRAINT fk_exams_creator FOREIGN KEY (created_by) REFERENCES teachers (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE puzzles (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      exam_id     INT UNSIGNED NOT NULL,
      position    INT UNSIGNED NOT NULL,
      title       VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      KEY idx_puzzles_exam (exam_id, position),
      CONSTRAINT fk_puzzles_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // solution_position NULL marks a red herring. public_id is random: safe to show students.
    `CREATE TABLE puzzle_lines (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      puzzle_id         INT UNSIGNED NOT NULL,
      public_id         CHAR(12) NOT NULL,
      solution_position INT UNSIGNED NULL,
      code              VARCHAR(500) NOT NULL,
      indent            TINYINT UNSIGNED NOT NULL DEFAULT 0,
      UNIQUE KEY uq_lines_public (public_id),
      UNIQUE KEY uq_lines_position (puzzle_id, solution_position),
      CONSTRAINT fk_lines_puzzle FOREIGN KEY (puzzle_id) REFERENCES puzzles (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
};
