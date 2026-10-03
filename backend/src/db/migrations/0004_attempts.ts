import type { Migration } from './index.js';

// Deadlines and submit times keep millisecond precision: they decide who is late.
export const MIGRATION_0004_ATTEMPTS: Migration = {
  version: 4,
  name: 'attempts',
  statements: [
    `CREATE TABLE attempts (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      exam_id       INT UNSIGNED NOT NULL,
      student_name  VARCHAR(60) NOT NULL,
      name_key      VARCHAR(60) NOT NULL,
      token_hash    CHAR(64) NOT NULL,
      shuffle_seed  INT UNSIGNED NOT NULL,
      joined_at     DATETIME(3) NOT NULL,
      started_at    DATETIME(3) NULL,
      deadline_at   DATETIME(3) NULL,
      submitted_at  DATETIME(3) NULL,
      submit_reason ENUM('manual','timeout') NULL,
      score_percent DECIMAL(5,2) NULL,
      UNIQUE KEY uq_attempts_token (token_hash),
      UNIQUE KEY uq_attempts_name (exam_id, name_key),
      KEY idx_attempts_open (submitted_at, deadline_at),
      CONSTRAINT fk_attempts_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // state: JSON array of {pieceId, indent} in the order the student placed them.
    `CREATE TABLE attempt_puzzles (
      attempt_id    INT UNSIGNED NOT NULL,
      puzzle_id     INT UNSIGNED NOT NULL,
      state         LONGTEXT NOT NULL,
      score_percent DECIMAL(5,2) NULL,
      updated_at    DATETIME(3) NOT NULL,
      PRIMARY KEY (attempt_id, puzzle_id),
      CONSTRAINT fk_ap_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE CASCADE,
      CONSTRAINT fk_ap_puzzle FOREIGN KEY (puzzle_id) REFERENCES puzzles (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
};
