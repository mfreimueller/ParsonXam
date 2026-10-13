import type { Migration } from './index.js';

// Existing puzzles become kind 'lines'. A template puzzle keeps its teacher source (markers
// included) in puzzles.template; puzzle_pieces holds the pool tiles derived from it.
export const MIGRATION_0006_TEMPLATE_PUZZLES: Migration = {
  version: 6,
  name: 'template_puzzles',
  statements: [
    `ALTER TABLE puzzles
       ADD COLUMN kind ENUM('lines','template') NOT NULL DEFAULT 'lines' AFTER description,
       ADD COLUMN template MEDIUMTEXT NULL AFTER kind`,
    // public_id is random: safe to show students. herring marks decoy tiles and must never reach them.
    `CREATE TABLE puzzle_pieces (
      id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      puzzle_id INT UNSIGNED NOT NULL,
      public_id CHAR(12) NOT NULL,
      text      VARCHAR(500) NOT NULL,
      reusable  TINYINT(1) NOT NULL DEFAULT 0,
      herring   TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uq_pieces_public (public_id),
      KEY idx_pieces_puzzle (puzzle_id),
      CONSTRAINT fk_pieces_puzzle FOREIGN KEY (puzzle_id) REFERENCES puzzles (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
};
