import type { Migration } from './index.js';

export const MIGRATION_0002_CLASSES_AND_MEMBERS: Migration = {
  version: 2,
  name: 'classes_and_members',
  statements: [
    `CREATE TABLE classes (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(80) NOT NULL,
      term       VARCHAR(40) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    // Exactly one 'owner' per class: set when the class is created and never changed (enforced in code).
    `CREATE TABLE class_members (
      class_id   INT UNSIGNED NOT NULL,
      teacher_id INT UNSIGNED NOT NULL,
      role       ENUM('owner','member') NOT NULL,
      added_at   DATETIME NOT NULL,
      PRIMARY KEY (class_id, teacher_id),
      KEY idx_class_members_teacher (teacher_id),
      CONSTRAINT fk_class_members_class FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE,
      CONSTRAINT fk_class_members_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
};
