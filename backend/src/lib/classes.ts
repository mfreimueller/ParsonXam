import { sql, type SQLInstance } from '../db/sql.js';
import type { Role } from './membership.js';

export interface MemberView {
  teacherId: number;
  displayName: string;
  email: string;
  role: Role;
}

export interface ClassView {
  id: number;
  name: string;
  term: string;
  myRole: Role;
  examCount: number;
  members: MemberView[];
}

async function membersByClass(db: SQLInstance, classIds: number[]): Promise<Map<number, MemberView[]>> {
  const byClass = new Map<number, MemberView[]>();
  if (classIds.length === 0) return byClass;
  const rows = await db<(MemberView & { classId: number })[]>`
    SELECT m.class_id AS classId, t.id AS teacherId, t.display_name AS displayName, t.email, m.role
    FROM class_members m JOIN teachers t ON t.id = m.teacher_id
    WHERE m.class_id IN ${sql(classIds)}
    ORDER BY m.role = 'owner' DESC, t.display_name
  `;
  for (const { classId, ...member } of rows) {
    const list = byClass.get(classId) ?? [];
    list.push(member);
    byClass.set(classId, list);
  }
  return byClass;
}

export async function listMembers(db: SQLInstance, classId: number): Promise<MemberView[]> {
  return (await membersByClass(db, [classId])).get(classId) ?? [];
}

async function attach(
  db: SQLInstance,
  rows: { id: number; name: string; term: string; myRole: Role; examCount: number }[]
): Promise<ClassView[]> {
  const members = await membersByClass(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, examCount: Number(r.examCount), members: members.get(r.id) ?? [] }));
}

export async function classesForTeacher(db: SQLInstance, teacherId: number): Promise<ClassView[]> {
  const rows = await db<{ id: number; name: string; term: string; myRole: Role; examCount: number }[]>`
    SELECT c.id, c.name, c.term, m.role AS myRole,
           (SELECT COUNT(*) FROM exams e WHERE e.class_id = c.id) AS examCount
    FROM classes c JOIN class_members m ON m.class_id = c.id
    WHERE m.teacher_id = ${teacherId}
    ORDER BY c.name
  `;
  return attach(db, rows);
}

// Caller has already checked membership.
export async function classForTeacher(db: SQLInstance, teacherId: number, classId: number): Promise<ClassView> {
  const rows = await db<{ id: number; name: string; term: string; myRole: Role; examCount: number }[]>`
    SELECT c.id, c.name, c.term, m.role AS myRole,
           (SELECT COUNT(*) FROM exams e WHERE e.class_id = c.id) AS examCount
    FROM classes c JOIN class_members m ON m.class_id = c.id
    WHERE m.teacher_id = ${teacherId} AND c.id = ${classId}
  `;
  return (await attach(db, rows))[0]!;
}
