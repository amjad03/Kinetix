import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readZip } from '../src/integrations/zip.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { readXlsx, writeWorkbook } from '../src/common/xlsx.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Governance and settings: users and access (record kit, roles, disable, sessions), the role access matrix enforced on
 * every API call, academic years and terms (rollover), campuses and the multi-campus overview, notification switches,
 * full data exports, and the sign-in, usage and pending-approval reports. Another institution sees none of it.
 */
describe('governance: users, access, settings and reports', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let adminId: string;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const admin = await owner.query(
      `insert into users (tenant_id, full_name, email, password_hash) select $1, 'Office Admin', $2, password_hash from users where id = $3 returning id`,
      [t.tenantId, `admin-${t.slug}@x.in`, t.principal.id],
    );
    adminId = admin.rows[0].id;
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'tenant_admin')`, [t.tenantId, adminId]);
    tokens.admin = await login(t.slug, `admin-${t.slug}@x.in`);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  // ---- users and access ------------------------------------------------------------------------------------------------

  let newUserId: string;
  it('lists every account with roles, status and activity, and filters by kind, role and status', async () => {
    const meta = (await http().get('/v1/records/users/meta').set(as('principal')).expect(200)).body;
    expect(meta).toMatchObject({ key: 'users', module: 'access', can: { write: true, import: true, create: true } });
    expect(meta.actions.map((a: { key: string }) => a.key)).toEqual(['signOut', 'resetMfa', 'addRole', 'removeRole']);

    const all = (await http().get('/v1/records/users?pageSize=50').set(as('principal')).expect(200)).body;
    expect(all.total).toBe(7);
    const me = all.rows.find((r: { id: string }) => r.id === t.principal.id);
    expect(me).toMatchObject({ roles: ['principal'], kind: 'staff', status: 'active', openSessions: 1, mfaOn: false });
    expect(me.lastActiveAt).not.toBeNull();
    expect((await http().get('/v1/records/users?f.kind=guardian').set(as('principal')).expect(200)).body.total).toBe(2);
    expect((await http().get('/v1/records/users?f.role=teacher').set(as('principal')).expect(200)).body.total).toBe(2);
    expect((await http().get('/v1/records/users?f.activity=never').set(as('principal')).expect(200)).body.rows.map((r: { fullName: string }) => r.fullName)).not.toContain('Office Admin');

    // Only leaders; another institution sees its own people only.
    await http().get('/v1/records/users').set(as('teacher')).expect(403);
    expect((await http().get('/v1/records/users').set(as('outsider')).expect(200)).body.total).toBe(6);
    await http().get(`/v1/records/users/${t.teacher.id}`).set(as('outsider')).expect(404);
  });

  it('adds an account with a role, edits it with history, and protects administrators', async () => {
    await http().post('/v1/records/users').set(as('principal')).send({ fullName: 'Ravi Clerk', role: 'accountant' }).expect(400); // no email or phone
    await http().post('/v1/records/users').set(as('principal')).send({ fullName: 'Boss', email: 'boss@x.in', role: 'tenant_admin' }).expect(403);
    await http().post('/v1/records/users').set(as('principal')).send({ fullName: 'Ravi Clerk', email: 'ravi@x.in', role: 'student' }).expect(400);
    const u = (await http().post('/v1/records/users').set(as('principal')).send({ fullName: 'Ravi Clerk', email: 'Ravi@X.in', phone: '98450 12345', role: 'accountant' }).expect(201)).body;
    newUserId = u.id;
    expect(u).toMatchObject({ email: 'ravi@x.in', phone: '+919845012345', roles: ['accountant'], status: 'active', openSessions: 0 });
    await http().post('/v1/records/users').set(as('principal')).send({ fullName: 'Dup', email: 'ravi@x.in', role: 'librarian' }).expect(409);

    await http().patch(`/v1/records/users/${newUserId}`).set(as('principal')).send({ fullName: 'Ravi Kumar' }).expect(200);
    const h = (await http().get(`/v1/records/users/${newUserId}/history`).set(as('principal')).expect(200)).body;
    expect(h.items[0]).toMatchObject({ action: 'user.updated', changes: [{ field: 'fullName', before: 'Ravi Clerk', after: 'Ravi Kumar' }] });

    // A principal cannot touch the administrator's account.
    await http().patch(`/v1/records/users/${adminId}`).set(as('principal')).send({ status: 'disabled' }).expect(403);
    await http().put(`/v1/admin/access/users/${adminId}/roles`).set(as('principal')).send({ roles: ['teacher'] }).expect(403);
    // Nobody changes their own roles; the last administrator keeps the role.
    await http().put(`/v1/admin/access/users/${t.principal.id}/roles`).set(as('principal')).send({ roles: ['principal', 'hod'] }).expect(403);
    await http().put(`/v1/admin/access/users/${adminId}/roles`).set(as('admin')).send({ roles: ['teacher'] }).expect(403);
    expect((await http().delete(`/v1/records/users/${t.principal.id}`).set(as('principal')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
  });

  it('changes roles and signs the person out so the change applies at once', async () => {
    const teacherToken = tokens.teacher;
    await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${teacherToken}` }).expect(200);
    const r = (await http().put(`/v1/admin/access/users/${t.teacher.id}/roles`).set(as('principal')).send({ roles: ['teacher', 'hod'] }).expect(200)).body;
    expect(r).toMatchObject({ before: ['teacher'], after: ['hod', 'teacher'], signedOut: 1 });
    await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${teacherToken}` }).expect(401);
    tokens.teacher = await login(t.slug, t.teacher.email!);

    const detail = (await http().get(`/v1/admin/access/users/${t.teacher.id}`).set(as('principal')).expect(200)).body;
    expect(detail).toMatchObject({ roles: ['hod', 'teacher'], mfaOn: false, sessions: [expect.objectContaining({ id: expect.any(String) })] });
    expect(detail.signIns.map((s: { action: string }) => s.action)).toContain('auth.sign_in');
    const h = (await http().get(`/v1/records/users/${t.teacher.id}/history`).set(as('principal')).expect(200)).body;
    expect(h.items.find((i: { action: string }) => i.action === 'user.roles_changed')).toMatchObject({ changes: [{ field: 'roles', before: 'teacher', after: 'hod, teacher' }] });

    // Bulk: give a role to several people, then take it away; a row that cannot change is reported, the rest go through.
    const add = (await http().post('/v1/records/users/bulk').set(as('principal')).send({ op: 'action', action: 'addRole', params: { role: 'librarian' }, target: { ids: [t.teacher2.id, newUserId, t.principal.id] } }).expect(200)).body;
    expect(add).toMatchObject({ succeeded: 2, failed: 1 });
    expect(add.rows.find((x: { id: string }) => x.id === t.principal.id)).toMatchObject({ ok: false, message: 'You cannot change your own roles. Ask another administrator.' });
    const rm = (await http().post('/v1/records/users/bulk').set(as('principal')).send({ op: 'action', action: 'removeRole', params: { role: 'librarian' }, target: { ids: [t.teacher2.id, newUserId] } }).expect(200)).body;
    expect(rm).toMatchObject({ succeeded: 2, failed: 0 });
    expect((await owner.query(`select count(*)::int as n from user_roles where user_id = any($1) and role = 'librarian'`, [[t.teacher2.id, newUserId]])).rows[0].n).toBe(0);
  });

  it('disables an account (signed out at once, cannot sign in, the attempt is reported) and enables it again', async () => {
    const t2 = await login(t.slug, t.teacher2.email!);
    await http().patch(`/v1/records/users/${t.teacher2.id}`).set(as('principal')).send({ status: 'disabled' }).expect(200);
    await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${t2}` }).expect(401);
    await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher2.email, password: 'pw' }).expect(401);
    await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher.email, password: 'wrong' }).expect(401);
    await http().patch(`/v1/records/users/${t.principal.id}`).set(as('principal')).send({ status: 'disabled' }).expect(403); // not yourself

    const report = (await http().get('/v1/admin/access/reports/sign-ins').set(as('principal')).expect(200)).body;
    expect(report.totals).toMatchObject({ failed: 2 });
    expect(report.totals.ok).toBeGreaterThanOrEqual(5);
    expect(report.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['auth.sign_in_blocked', 'auth.sign_in_failed', 'auth.sign_in']));
    const failedOnly = (await http().get('/v1/admin/access/reports/sign-ins?result=failed').set(as('principal')).expect(200)).body;
    expect(failedOnly.items).toHaveLength(2);
    await http().get('/v1/admin/access/reports/sign-ins?from=2026-10-10&to=2026-10-01').set(as('principal')).expect(400);
    await http().get('/v1/admin/access/reports/sign-ins').set(as('teacher')).expect(403);

    await http().patch(`/v1/records/users/${t.teacher2.id}`).set(as('principal')).send({ status: 'active' }).expect(200);
    await login(t.slug, t.teacher2.email!);
    const out = (await http().post(`/v1/admin/access/users/${t.teacher2.id}/sign-out`).set(as('principal')).expect(200)).body;
    expect(out.signedOut).toBe(1);
  });

  it('deletes an account to the bin and restores it; imports and exports accounts', async () => {
    const del = (await http().delete(`/v1/records/users/${newUserId}`).set(as('principal')).expect(200)).body;
    expect(del.label).toBe('Ravi Kumar');
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    expect((await owner.query(`select role from user_roles where user_id = $1`, [newUserId])).rows).toEqual([{ role: 'accountant' }]);
    await http().delete(`/v1/records/users/${t.guardian.id}`).set(as('principal')).expect(403); // a parent's account goes with the student

    const tpl = (await http().get('/v1/records/users/import/template').set(as('principal')).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect(readXlsx(tpl)[0]).toEqual(['Full name *', 'Email', 'Mobile', 'Roles *', 'Language']);
    const file = writeWorkbook([{ name: 'Data', rows: [['Full name', 'Email', 'Mobile', 'Roles', 'Language'], ['Meena Librarian', 'meena@x.in', '', 'librarian', 'kn'], ['Ravi Kumar', 'ravi@x.in', '', 'accountant; store_keeper', ''], ['Bad', 'bad@x.in', '', 'wizard', '']] }]);
    const check = (await http().post('/v1/records/users/import').set(as('principal')).attach('file', file, 'users.xlsx').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 3, created: 1, updated: 1, error: 1 });
    const done = (await http().post(`/v1/records/users/import/${check.id}/commit`).set(as('principal')).send({ skipErrors: true }).expect(200)).body;
    expect(done.status).toBe('committed');
    expect((await owner.query(`select role from user_roles where user_id = $1 order by role`, [newUserId])).rows.map((r: { role: string }) => r.role)).toEqual(['accountant', 'store_keeper']);

    const csv = (await http().get('/v1/records/users/export?format=csv&f.role=librarian').set(as('principal')).expect(200)).text;
    expect(csv).toContain('Meena Librarian');
    expect(csv).not.toContain('Student A');
  });

  // ---- roles and permissions ---------------------------------------------------------------------------------------

  it('narrows a role to view-only or no access, enforced on every API call, and back to the default', async () => {
    const m = (await http().get('/v1/admin/access/matrix').set(as('principal')).expect(200)).body;
    expect(m.modules.find((x: { key: string }) => x.key === 'tasks')).toMatchObject({ label: 'Tasks', group: 'work' });
    expect(m.roles.find((r: { key: string }) => r.key === 'teacher')).toMatchObject({ people: 2 });
    expect(m.roles.map((r: { key: string }) => r.key)).not.toContain('tenant_admin');
    expect(m.rules).toEqual([]);

    const t2 = await login(t.slug, t.teacher2.email!);
    await http().post('/v1/tasks').set({ authorization: `Bearer ${t2}` }).send({ title: 'Check lab register', assigneeId: t.teacher.id }).expect(201);
    await http().put('/v1/admin/access/matrix').set(as('principal')).send({ role: 'teacher', changes: [{ module: 'tasks', access: 'read' }, { module: 'library', access: 'none' }] }).expect(200);
    await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${t2}` }).expect(200);
    const ro = await http().post('/v1/tasks').set({ authorization: `Bearer ${t2}` }).send({ title: 'Another', assigneeId: t.teacher.id }).expect(403);
    expect(ro.body.code).toBe('ROLE_READ_ONLY');
    // The other teacher is also a head of department now, whose access is untouched: the best of a person's roles applies.
    await http().post('/v1/tasks').set(as('teacher')).send({ title: 'Allowed as HOD', assigneeId: t.teacher2.id }).expect(201);

    await http().put('/v1/admin/access/matrix').set(as('principal')).send({ role: 'teacher', changes: [{ module: 'tasks', access: 'none' }] }).expect(200);
    const none = await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${t2}` }).expect(403);
    expect(none.body.code).toBe('ROLE_ACCESS_DENIED');
    const caps = (await http().get('/v1/institution/capabilities').set({ authorization: `Bearer ${t2}` }).expect(200)).body;
    expect(caps.access).toEqual({ none: expect.arrayContaining(['library', 'tasks']), read: [] });
    expect((await http().get('/v1/institution/capabilities').set(as('principal')).expect(200)).body.access).toEqual({ none: [], read: [] });
    // Another institution is not affected.
    expect((await http().get('/v1/admin/access/matrix').set(as('outsider')).expect(200)).body.rules).toEqual([]);

    await http().put('/v1/admin/access/matrix').set(as('principal')).send({ role: 'teacher', changes: [{ module: 'nope', access: 'none' }] }).expect(400);
    await http().put('/v1/admin/access/matrix').set(as('principal')).send({ role: 'principal', changes: [{ module: 'fees', access: 'read' }] }).expect(400);
    await http().put('/v1/admin/access/matrix').set(as('admin')).send({ role: 'principal', changes: [{ module: 'fees', access: 'read' }] }).expect(200);
    await http().put('/v1/admin/access/matrix').set(as('teacher')).send({ role: 'teacher', changes: [{ module: 'tasks', access: 'full' }] }).expect(403);

    const copy = (await http().post('/v1/admin/access/matrix/copy').set(as('principal')).send({ from: 'teacher', to: 'librarian' }).expect(200)).body;
    expect(copy).toMatchObject({ role: 'librarian', changed: 2 });
    const hist = (await http().get('/v1/admin/access/matrix/history').set(as('principal')).expect(200)).body;
    expect(hist[0].data).toMatchObject({ role: 'librarian', copiedFrom: 'teacher', changes: { tasks: { before: 'full', after: 'none' } } });

    const reset = (await http().post('/v1/admin/access/matrix/reset').set(as('principal')).send({}).expect(200)).body;
    expect(reset).toMatchObject({ changed: 4 }); // teacher x2, librarian x2; the principal's own rule is the administrator's
    expect((await http().get('/v1/admin/access/matrix').set(as('principal')).expect(200)).body.rules).toEqual([expect.objectContaining({ role: 'principal', module: 'fees', access: 'read' })]);
    await http().post('/v1/admin/access/matrix/reset').set(as('admin')).send({ role: 'principal' }).expect(200);
    await http().get('/v1/tasks/mine').set({ authorization: `Bearer ${t2}` }).expect(200);
  });

  it('keeps delegated approvals as a list: own and received for staff, all for leaders; overlaps refused; revoke', async () => {
    const t2 = await login(t.slug, t.teacher2.email!);
    const meta = (await http().get('/v1/records/delegations/meta').set({ authorization: `Bearer ${t2}` }).expect(200)).body;
    expect(meta).toMatchObject({ key: 'delegations', can: { write: true, create: true } });
    await http().post('/v1/records/delegations').set(as('teacher')).send({ delegateId: t.teacher.id, scope: 'all', startsOn: '2026-11-01', endsOn: '2026-11-10' }).expect(400); // to yourself
    await http().post('/v1/records/delegations').set(as('teacher')).send({ delegateId: t.teacher2.id, scope: 'leave', startsOn: '2026-11-10', endsOn: '2026-11-01' }).expect(400);
    await http().post('/v1/records/delegations').set(as('teacher')).send({ delegateId: t.teacher2.id, scope: 'leave', startsOn: '2026-11-01', endsOn: '2026-11-10', delegatorId: t.principal.id }).expect(403);
    const d = (await http().post('/v1/records/delegations').set(as('teacher')).send({ delegateId: t.teacher2.id, scope: 'leave', startsOn: '2026-11-01', endsOn: '2026-11-10', reason: 'Conference' }).expect(201)).body;
    expect(d).toMatchObject({ delegatorId: t.teacher.id, delegateName: expect.any(String), state: 'upcoming' });
    await http().post('/v1/records/delegations').set(as('teacher')).send({ delegateId: t.teacher2.id, scope: 'all', startsOn: '2026-11-05', endsOn: '2026-11-20' }).expect(409);
    await http().post('/v1/records/delegations').set(as('principal')).send({ delegateId: t.teacher.id, scope: 'workflows', startsOn: '2026-12-01', endsOn: '2026-12-05', delegatorId: t.teacher2.id }).expect(201); // on someone's behalf

    expect((await http().get('/v1/records/delegations?f.mine=received').set({ authorization: `Bearer ${t2}` }).expect(200)).body.total).toBe(1);
    expect((await http().get('/v1/records/delegations').set(as('principal')).expect(200)).body.total).toBe(2);
    expect((await http().get('/v1/records/delegations').set(as('outsider')).expect(200)).body.total).toBe(0);
    await http().patch(`/v1/records/delegations/${d.id}`).set({ authorization: `Bearer ${t2}` }).send({ endsOn: '2026-11-30' }).expect(403); // only the giver
    await http().patch(`/v1/records/delegations/${d.id}`).set(as('teacher')).send({ endsOn: '2026-11-12' }).expect(200);
    const rev = (await http().post('/v1/records/delegations/bulk').set(as('teacher')).send({ op: 'action', action: 'revoke', target: { ids: [d.id] } }).expect(200)).body;
    expect(rev).toMatchObject({ succeeded: 1 });
    expect((await http().get('/v1/records/delegations?f.state=revoked').set(as('principal')).expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([d.id]);
    const h = (await http().get(`/v1/records/delegations/${d.id}/history`).set(as('teacher')).expect(200)).body;
    expect(h.items.map((i: { action: string }) => i.action)).toEqual(['delegation.revoked', 'approval_delegation.updated', 'approval_delegation.created']);
  });

  // ---- academic years, terms and campuses ------------------------------------------------------------------------

  let nextYearId: string;
  it('keeps academic years: no overlaps, one current year, rollover copies the terms, the current year cannot be deleted', async () => {
    const yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    const term = (await http().post('/v1/records/terms').set(as('principal')).send({ academicYearId: yearId, name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-15' }).expect(201)).body;
    expect(term).toMatchObject({ yearLabel: '2026-27', programNames: null, days: 137 });
    await http().post('/v1/records/terms').set(as('principal')).send({ academicYearId: yearId, name: 'Overlap', startsOn: '2026-12-01', endsOn: '2027-01-15' }).expect(400);
    await http().post('/v1/records/terms').set(as('principal')).send({ academicYearId: yearId, name: 'Outside', startsOn: '2027-05-01', endsOn: '2027-07-15' }).expect(400);
    await http().post('/v1/records/terms').set(as('principal')).send({ academicYearId: yearId, name: 'Even semester 2027', startsOn: '2027-01-02', endsOn: '2027-05-15', programId: t.program.id }).expect(201);
    expect((await http().get(`/v1/records/terms?f.program=${t.program.id}`).set(as('principal')).expect(200)).body.total).toBe(2);
    await http().patch(`/v1/records/terms/${term.id}`).set(as('principal')).send({ endsOn: '2027-01-10' }).expect(400); // would overlap the even semester

    await http().post('/v1/records/academic-years').set(as('principal')).send({ label: '2025-26', startsOn: '2025-08-01', endsOn: '2026-08-15' }).expect(400); // overlaps 2026-27
    await http().post('/v1/records/academic-years').set(as('principal')).send({ label: '2026-27', startsOn: '2030-06-01', endsOn: '2031-05-31' }).expect(400); // same name
    await http().patch(`/v1/records/academic-years/${yearId}`).set(as('principal')).send({ endsOn: '2027-03-31' }).expect(400); // a term would fall outside

    const roll = (await http().post('/v1/records/academic-years/bulk').set(as('principal')).send({ op: 'action', action: 'rollOver', target: { ids: [yearId] } }).expect(200)).body;
    expect(roll.rows[0]).toMatchObject({ ok: true, message: '2027-28 with 2 terms' });
    const years = (await http().get('/v1/records/academic-years').set(as('principal')).expect(200)).body;
    expect(years.rows.map((y: { label: string; isCurrent: boolean }) => [y.label, y.isCurrent])).toEqual([['2027-28', false], ['2026-27', true]]);
    nextYearId = years.rows[0].id;
    expect(years.rows[1]).toMatchObject({ termCount: 2, classCount: 2, studentCount: 3, state: 'current' });
    const copied = (await http().get(`/v1/records/terms?f.year=${nextYearId}`).set(as('principal')).expect(200)).body.rows;
    expect(copied.map((x: { name: string; startsOn: string }) => [x.name, x.startsOn])).toEqual([['Odd semester 2027', '2027-08-01'], ['Even semester 2027', '2028-01-02']]);
    const again = (await http().post('/v1/records/academic-years/bulk').set(as('principal')).send({ op: 'action', action: 'rollOver', target: { ids: [yearId] } }).expect(200)).body;
    expect(again.rows[0]).toMatchObject({ ok: false, message: 'The academic year 2027-28 already exists' });

    await http().delete(`/v1/records/academic-years/${yearId}`).set(as('principal')).expect(403); // the current year
    await http().post('/v1/records/academic-years/bulk').set(as('principal')).send({ op: 'action', action: 'makeCurrent', target: { ids: [nextYearId] } }).expect(200);
    expect((await owner.query(`select label from academic_years where tenant_id = $1 and is_current`, [t.tenantId])).rows).toEqual([{ label: '2027-28' }]);
    // The old year still has classes and terms: in use, so it stays.
    const inUse = await http().delete(`/v1/records/academic-years/${yearId}`).set(as('principal')).expect(409);
    expect(inUse.body.code).toBe('RECORD_IN_USE');
    await http().post('/v1/records/academic-years/bulk').set(as('principal')).send({ op: 'action', action: 'makeCurrent', target: { ids: [yearId] } }).expect(200);
    await http().get('/v1/records/academic-years').set({ authorization: `Bearer ${await login(t.slug, t.teacher2.email!)}` }).expect(403);
    expect((await http().get('/v1/records/academic-years').set(as('outsider')).expect(200)).body.total).toBe(1);
  });

  it('keeps campuses with details, order and a head; the last campus stays; the overview adds them up', async () => {
    await http().post('/v1/records/campuses').set(as('principal')).send({ name: 'City campus', code: 'city 1' }).expect(400);
    const c = (await http().post('/v1/records/campuses').set(as('principal')).send({ name: 'City campus', code: 'city', city: 'Mysuru', phone: '0821 2345678', headUserId: t.principal.id }).expect(201)).body;
    expect(c).toMatchObject({ code: 'CITY', headName: expect.any(String), active: true, programCount: 0 });
    await http().post('/v1/records/campuses').set(as('principal')).send({ name: 'Other', code: 'City' }).expect(409);
    await http().post('/v1/records/reorder').set(as('principal')).send({ ids: [] }).expect(404);
    await http().post('/v1/records/campuses/reorder').set(as('principal')).send({ ids: [c.id, t.campus.id] }).expect(200);
    expect((await http().get('/v1/records/campuses').set(as('principal')).expect(200)).body.rows.map((r: { name: string }) => r.name)).toEqual(['City campus', 'Main']);
    const dup = (await http().post(`/v1/records/campuses/${c.id}/duplicate`).set(as('principal')).expect(201)).body;
    expect(dup).toMatchObject({ name: 'City campus (copy)', code: null });
    await http().delete(`/v1/records/campuses/${dup.id}`).set(as('principal')).expect(200);
    await http().delete(`/v1/records/campuses/${t.campus.id}`).set(as('principal')).expect(409); // programmes and rooms are there

    const ov = (await http().get('/v1/admin/institution/campus-overview').set(as('principal')).expect(200)).body;
    expect(ov.campuses.map((x: { name: string }) => x.name)).toEqual(['City campus', 'Main']);
    expect(ov.campuses[1]).toMatchObject({ programmes: 1, classes: 2, students: 3, rooms: 1 });
    expect(ov.totals).toMatchObject({ campuses: 2, students: 3 });
    await http().get('/v1/admin/institution/campus-overview').set(as('teacher')).expect(403);
  });

  // ---- notifications, exports and reports -------------------------------------------------------------------------

  it('turns kinds of notification off, or their push off', async () => {
    const s = (await http().get('/v1/admin/notification-settings').set(as('principal')).expect(200)).body;
    expect(s).toMatchObject({ off: [], pushOff: [] });
    expect(s.kinds.find((k: { key: string }) => k.key === 'message')).toMatchObject({ locked: true });
    await http().put('/v1/admin/notification-settings').set(as('principal')).send({ off: ['calendar', 'message'], pushOff: ['calendar', 'fee'] }).expect(200);
    expect((await http().get('/v1/admin/notification-settings').set(as('principal')).expect(200)).body).toMatchObject({ off: ['calendar'], pushOff: ['fee'] });
    await http().post('/v1/admin/calendar').set(as('principal')).send({ kind: 'holiday', title: 'Founders day', startsOn: '2026-11-20', endsOn: '2026-11-20' }).expect(201);
    expect((await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and kind = 'calendar'`, [t.tenantId])).rows[0].n).toBe(0);
    await http().put('/v1/admin/notification-settings').set(as('principal')).send({ off: [], pushOff: [] }).expect(200);
    await http().post('/v1/admin/calendar').set(as('principal')).send({ kind: 'holiday', title: 'Rajyotsava', startsOn: '2026-11-01', endsOn: '2026-11-01' }).expect(201);
    expect((await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and kind = 'calendar'`, [t.tenantId])).rows[0].n).toBeGreaterThan(0);
    await http().put('/v1/admin/notification-settings').set(as('teacher')).send({ off: [], pushOff: [] }).expect(403);
  });

  it('exports all the institution data as a ZIP without secrets, then lets it be deleted', async () => {
    const req = (await http().post('/v1/admin/data-exports').set(as('principal')).send({ note: 'Before the audit' }).expect(201)).body;
    expect(req.status).toBe('queued');
    await http().post('/v1/admin/data-exports').set(as('principal')).send({}).expect(409); // one at a time
    await http().get(`/v1/admin/data-exports/${req.id}/download`).set(as('principal')).expect(409);
    await app.get(JobsService).drain();
    const list = (await http().get('/v1/admin/data-exports').set(as('principal')).expect(200)).body;
    expect(list[0]).toMatchObject({ id: req.id, status: 'ready', note: 'Before the audit', requestedBy: expect.any(String) });
    expect(list[0].rowCount).toBeGreaterThan(20);

    const zip = (await http().get(`/v1/admin/data-exports/${req.id}/download`).set(as('principal')).buffer(true).parse(binary).expect(200)).body as Buffer;
    const files = readZip(zip);
    const manifest = JSON.parse(files.find((f) => f.path === 'manifest.json')!.data.toString());
    expect(manifest).toMatchObject({ format: 'kinetix-tenant-export', tables: expect.objectContaining({ students: 3, campuses: 2 }), redacted: expect.objectContaining({ users: ['password_hash'] }) });
    const people = JSON.parse(files.find((f) => f.path === 'tables/users.json')!.data.toString()) as { email: string; password_hash: string | null }[];
    expect(people.every((u) => u.password_hash === null)).toBe(true);
    expect(people.map((u) => u.email)).not.toContain(other.principal.email);
    expect(zip.toString('latin1')).not.toContain('$argon2');

    expect((await http().get('/v1/admin/data-exports').set(as('outsider')).expect(200)).body).toEqual([]);
    await http().get(`/v1/admin/data-exports/${req.id}/download`).set(as('outsider')).expect(404);
    await http().get('/v1/admin/data-exports').set(as('teacher')).expect(403);
    await http().delete(`/v1/admin/data-exports/${req.id}`).set(as('principal')).expect(204);
    expect((await http().get('/v1/admin/data-exports').set(as('principal')).expect(200)).body).toEqual([]);
  });

  it('reports module usage and pending approvals by age', async () => {
    const usage = (await http().get('/v1/admin/access/reports/usage').set(as('principal')).expect(200)).body;
    expect(usage.byArea.map((a: { area: string }) => a.area)).toEqual(expect.arrayContaining(['user', 'access', 'academic_year']));
    expect(usage.byRole.find((r: { role: string }) => r.role === 'principal').actions).toBeGreaterThan(5);
    expect(usage.totals.activePeople).toBeGreaterThan(2);

    await owner.query(`update tasks set created_at = now() - interval '10 days' where tenant_id = $1`, [t.tenantId]);
    const ap = (await http().get('/v1/admin/access/reports/approvals').set(as('principal')).expect(200)).body;
    expect(ap.summary.find((s: { source: string }) => s.source === 'task')).toMatchObject({ total: 2, d0_2: 0, d8_30: 2, oldestDays: 10 });
    expect(ap.summary.find((s: { source: string }) => s.source === 'workflow')).toMatchObject({ total: 0, oldestDays: null });
    expect(ap.oldest.map((o: { title: string }) => o.title)).toEqual(expect.arrayContaining(['Check lab register', 'Allowed as HOD']));
    expect(ap.byPerson).toEqual(expect.arrayContaining([expect.objectContaining({ total: 1, overWeek: 1 })]));
    expect((await http().get('/v1/admin/access/reports/approvals').set(as('outsider')).expect(200)).body.oldest).toEqual([]);
  });
});
