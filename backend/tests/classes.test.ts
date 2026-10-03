import { describe, it, expect, beforeAll } from 'vitest';
import { signedInTeacher, useTestDb, type TestTeacher } from './helpers.js';

const t = useTestDb();
let anna: TestTeacher; // owner in most tests
let ben: TestTeacher; // colleague
let cara: TestTeacher; // outsider

beforeAll(async () => {
  anna = await signedInTeacher(t.current().db, 'anna@school.edu', 'Anna Berger');
  ben = await signedInTeacher(t.current().db, 'ben@school.edu', 'Ben Kern');
  cara = await signedInTeacher(t.current().db, 'cara@school.edu', 'Cara Lang');
});

async function newClass(owner: TestTeacher, name = '4AHIF · Programming'): Promise<number> {
  const res = await owner.call('POST', '/api/teacher/classes', { name, term: 'Winter term 2026' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { class: { id: number } }).class.id;
}

describe('auth', () => {
  it('requires a signed-in teacher', async () => {
    const { app } = await import('../src/app.js');
    expect((await app.request('/api/teacher/classes')).status).toBe(401);
  });
});

describe('create and list', () => {
  it('makes the creator the owner and lists the class with its members', async () => {
    const id = await newClass(anna, 'Create-A');
    const res = await anna.call('GET', '/api/teacher/classes');
    const body = (await res.json()) as { classes: { id: number; name: string; myRole: string; members: { role: string; displayName: string }[] }[] };
    const mine = body.classes.find((c) => c.id === id)!;
    expect(mine.myRole).toBe('owner');
    expect(mine.members).toEqual([expect.objectContaining({ role: 'owner', displayName: 'Anna Berger' })]);
  });

  it('validates the name', async () => {
    expect((await anna.call('POST', '/api/teacher/classes', { name: '   ' })).status).toBe(400);
    expect((await anna.call('POST', '/api/teacher/classes', { name: 'x'.repeat(81) })).status).toBe(400);
    expect((await anna.call('POST', '/api/teacher/classes', {})).status).toBe(400);
  });

  it('shows only the classes a teacher belongs to', async () => {
    const id = await newClass(anna, 'Private-A');
    const res = await cara.call('GET', '/api/teacher/classes');
    const ids = ((await res.json()) as { classes: { id: number }[] }).classes.map((c) => c.id);
    expect(ids).not.toContain(id);
  });
});

describe('outsiders', () => {
  it('get 404 on everything, not 403', async () => {
    const id = await newClass(anna, 'Outsider-A');
    const base = `/api/teacher/classes/${id}`;
    for (const [method, path, body] of [
      ['GET', base, undefined],
      ['PATCH', base, { name: 'Hijack' }],
      ['DELETE', base, undefined],
      ['GET', `${base}/members`, undefined],
      ['POST', `${base}/members`, { email: 'cara@school.edu' }],
      ['DELETE', `${base}/members/${anna.id}`, undefined],
    ] as const) {
      const res = await cara.call(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it('get 404 for ids that are not numbers', async () => {
    expect((await anna.call('GET', '/api/teacher/classes/abc')).status).toBe(404);
  });
});

describe('sharing', () => {
  it('lets the owner add a colleague by email, who then has access', async () => {
    const id = await newClass(anna, 'Share-A');
    const add = await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: ' BEN@school.edu ' });
    expect(add.status).toBe(201);
    const members = ((await add.json()) as { members: { displayName: string; role: string }[] }).members;
    expect(members.map((m) => [m.displayName, m.role])).toEqual([
      ['Anna Berger', 'owner'],
      ['Ben Kern', 'member'],
    ]);

    const seen = await ben.call('GET', `/api/teacher/classes/${id}`);
    expect(seen.status).toBe(200);
    expect(await seen.json()).toMatchObject({ class: { myRole: 'member' } });
  });

  it('reports unknown emails and duplicates', async () => {
    const id = await newClass(anna, 'Share-B');
    const unknown = await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'nobody@school.edu' });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: 'TEACHER_NOT_FOUND' });

    await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    const dup = await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: 'ALREADY_MEMBER' });
    const self = await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'anna@school.edu' });
    expect(self.status).toBe(409);
  });

  it('keeps owner-only actions away from members', async () => {
    const id = await newClass(anna, 'Share-C');
    await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    const base = `/api/teacher/classes/${id}`;
    for (const [method, path, body] of [
      ['PATCH', base, { name: 'Renamed' }],
      ['DELETE', base, undefined],
      ['POST', `${base}/members`, { email: 'cara@school.edu' }],
      ['DELETE', `${base}/members/${anna.id}`, undefined],
    ] as const) {
      const res = await ben.call(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'OWNER_ONLY' });
    }
    // The class is untouched.
    const still = await anna.call('GET', base);
    expect(await still.json()).toMatchObject({ class: { name: 'Share-C' } });
  });

  it('lets a member leave and ends their access', async () => {
    const id = await newClass(anna, 'Leave-A');
    await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    expect((await ben.call('DELETE', `/api/teacher/classes/${id}/members/${ben.id}`)).status).toBe(200);
    expect((await ben.call('GET', `/api/teacher/classes/${id}`)).status).toBe(404);
  });

  it('lets the owner remove a member, effective immediately', async () => {
    const id = await newClass(anna, 'Remove-A');
    await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    expect((await ben.call('GET', `/api/teacher/classes/${id}`)).status).toBe(200);
    const res = await anna.call('DELETE', `/api/teacher/classes/${id}/members/${ben.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { members: unknown[] }).members).toHaveLength(1);
    expect((await ben.call('GET', `/api/teacher/classes/${id}`)).status).toBe(404);
  });

  it('never lets the owner leave', async () => {
    const id = await newClass(anna, 'Owner-A');
    const res = await anna.call('DELETE', `/api/teacher/classes/${id}/members/${anna.id}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'OWNER_CANNOT_LEAVE' });
  });

  it('answers 404 when removing someone who is not in the class', async () => {
    const id = await newClass(anna, 'Remove-B');
    expect((await anna.call('DELETE', `/api/teacher/classes/${id}/members/${cara.id}`)).status).toBe(404);
  });
});

describe('rename and delete', () => {
  it('lets the owner rename and delete', async () => {
    const id = await newClass(anna, 'Rename-A');
    const patch = await anna.call('PATCH', `/api/teacher/classes/${id}`, { name: 'Rename-B', term: 'Spring 2027' });
    expect(await patch.json()).toMatchObject({ class: { name: 'Rename-B', term: 'Spring 2027' } });
    expect((await anna.call('PATCH', `/api/teacher/classes/${id}`, {})).status).toBe(400);

    await anna.call('POST', `/api/teacher/classes/${id}/members`, { email: 'ben@school.edu' });
    expect((await anna.call('DELETE', `/api/teacher/classes/${id}`)).status).toBe(200);
    expect((await anna.call('GET', `/api/teacher/classes/${id}`)).status).toBe(404);
    const left = await t.current().db<{ n: number }[]>`SELECT COUNT(*) AS n FROM class_members WHERE class_id = ${id}`;
    expect(Number(left[0]!.n)).toBe(0);
  });
});
