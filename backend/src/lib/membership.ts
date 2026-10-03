import type { SQLInstance } from '../db/sql.js';
import { AppError } from '../errors.js';

export type Role = 'owner' | 'member';

export function parseId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  return n;
}

// A teacher outside the class gets 404 (not 403) so ids cannot be probed.
export async function requireMember(db: SQLInstance, teacherId: number, classId: number): Promise<Role> {
  const rows = await db<{ role: Role }[]>`
    SELECT role FROM class_members WHERE class_id = ${classId} AND teacher_id = ${teacherId}
  `;
  const role = rows[0]?.role;
  if (!role) throw new AppError(404, 'NOT_FOUND', 'Class not found.');
  return role;
}

export async function requireOwner(db: SQLInstance, teacherId: number, classId: number): Promise<void> {
  const role = await requireMember(db, teacherId, classId);
  if (role !== 'owner') throw new AppError(403, 'OWNER_ONLY', 'Only the owner of the class can do this.');
}
