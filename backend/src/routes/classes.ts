import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { AppError } from '../errors.js';
import { classesForTeacher, classForTeacher, listMembers } from '../lib/classes.js';
import { parseJson } from '../lib/http.js';
import { parseId, requireMember, requireOwner } from '../lib/membership.js';
import { normaliseEmail } from '../lib/teachers.js';
import { teacherAuth, type TeacherVariables } from '../middleware/teacher_auth.js';

export const classes = new Hono<{ Variables: TeacherVariables }>();
classes.use('*', teacherAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  term: z.string().trim().max(40).default(''),
});
const patchSchema = createSchema.partial().refine((v) => v.name !== undefined || v.term !== undefined, {
  message: 'nothing to change',
});
const addMemberSchema = z.object({ email: z.string().trim().toLowerCase().email().max(255) });

classes.get('/', async (c) => {
  return c.json({ classes: await classesForTeacher(getDb(), c.get('teacher').id) });
});

classes.post('/', async (c) => {
  const body = await parseJson(c, createSchema);
  const db = getDb();
  const teacherId = c.get('teacher').id;
  const now = new Date();
  const classId = await db.begin(async (tx) => {
    const res = await tx`INSERT INTO classes (name, term, created_at) VALUES (${body.name}, ${body.term}, ${now})`;
    await tx`
      INSERT INTO class_members (class_id, teacher_id, role, added_at)
      VALUES (${res.lastInsertRowid}, ${teacherId}, 'owner', ${now})
    `;
    return res.lastInsertRowid;
  });
  return c.json({ class: await classForTeacher(db, teacherId, classId) }, 201);
});

classes.get('/:id', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  await requireMember(db, c.get('teacher').id, id);
  return c.json({ class: await classForTeacher(db, c.get('teacher').id, id) });
});

classes.patch('/:id', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  await requireOwner(db, c.get('teacher').id, id);
  const body = await parseJson(c, patchSchema);
  if (body.name !== undefined) await db`UPDATE classes SET name = ${body.name} WHERE id = ${id}`;
  if (body.term !== undefined) await db`UPDATE classes SET term = ${body.term} WHERE id = ${id}`;
  return c.json({ class: await classForTeacher(db, c.get('teacher').id, id) });
});

classes.delete('/:id', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  await requireOwner(db, c.get('teacher').id, id);
  const exams = await db<{ n: number }[]>`SELECT COUNT(*) AS n FROM exams WHERE class_id = ${id}`;
  if (Number(exams[0]?.n) > 0) {
    throw new AppError(409, 'CLASS_NOT_EMPTY', 'Delete the exams of this class first.');
  }
  await db`DELETE FROM classes WHERE id = ${id}`;
  return c.json({ ok: true });
});

classes.get('/:id/members', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  await requireMember(db, c.get('teacher').id, id);
  return c.json({ members: await listMembers(db, id) });
});

classes.post('/:id/members', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  await requireOwner(db, c.get('teacher').id, id);
  const { email } = await parseJson(c, addMemberSchema);

  const found = await db<{ id: number }[]>`SELECT id FROM teachers WHERE email = ${normaliseEmail(email)}`;
  const teacher = found[0];
  if (!teacher) {
    throw new AppError(404, 'TEACHER_NOT_FOUND', 'No teacher account with this email. Ask the administrator to create one.');
  }
  const existing = await db`SELECT 1 FROM class_members WHERE class_id = ${id} AND teacher_id = ${teacher.id}`;
  if ((existing as unknown as unknown[]).length > 0) {
    throw new AppError(409, 'ALREADY_MEMBER', 'This teacher is already in the class.');
  }
  await db`
    INSERT INTO class_members (class_id, teacher_id, role, added_at)
    VALUES (${id}, ${teacher.id}, 'member', ${new Date()})
  `;
  return c.json({ members: await listMembers(db, id) }, 201);
});

classes.delete('/:id/members/:teacherId', async (c) => {
  const db = getDb();
  const id = parseId(c.req.param('id'));
  const targetId = parseId(c.req.param('teacherId'));
  const me = c.get('teacher').id;
  const myRole = await requireMember(db, me, id);

  // A member may remove only themselves (leave); the owner may remove anyone but themselves.
  if (targetId !== me && myRole !== 'owner') {
    throw new AppError(403, 'OWNER_ONLY', 'Only the owner of the class can remove other teachers.');
  }
  const target = await db<{ role: string }[]>`
    SELECT role FROM class_members WHERE class_id = ${id} AND teacher_id = ${targetId}
  `;
  if (!target[0]) throw new AppError(404, 'NOT_FOUND', 'This teacher is not in the class.');
  if (target[0].role === 'owner') {
    throw new AppError(409, 'OWNER_CANNOT_LEAVE', 'The owner cannot leave the class. Delete the class instead.');
  }
  await db`DELETE FROM class_members WHERE class_id = ${id} AND teacher_id = ${targetId}`;
  if (targetId === me) return c.json({ ok: true });
  return c.json({ members: await listMembers(db, id) });
});
