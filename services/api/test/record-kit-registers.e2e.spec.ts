import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { dlDocuments, scormPackages } from '../src/db/schema-integrations.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * The record kit on the registers that were still hand-made lists: governance (business rules, incidents, retention),
 * SSO providers, integrations (LTI tools, devices, SCORM packages, DigiLocker documents, API tokens), course offerings,
 * curriculum versions and the school diary. Each: add or module create, edit with history, module actions, delete to
 * the recycle bin and restore, permissions and another institution seeing nothing.
 */
describe('record kit on the remaining registers', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const list = async (who: string, e: string, q = '') => (await http().get(`/v1/records/${e}${q}`).set(as(who)).expect(200)).body as { rows: Record<string, unknown>[]; total: number };
  const add = (who: string, e: string, body: object) => http().post(`/v1/records/${e}`).set(as(who)).send(body);
  const edit = (who: string, e: string, id: string, body: object) => http().patch(`/v1/records/${e}/${id}`).set(as(who)).send(body);
  const act = async (who: string, e: string, action: string, ids: string[], params: object = {}) => (await http().post(`/v1/records/${e}/bulk`).set(as(who)).send({ op: 'action', action, target: { ids }, params }).expect(200)).body as { succeeded: number; failed: number; rows: { ok: boolean; message?: string }[] };
  const binAndBack = async (e: string, id: string) => {
    const del = (await http().delete(`/v1/records/${e}/${id}`).set(as('principal')).expect(200)).body;
    await http().get(`/v1/records/${e}/${id}`).set(as('principal')).expect(404);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    await http().get(`/v1/records/${e}/${id}`).set(as('principal')).expect(200);
  };
  const history = async (e: string, id: string) => ((await http().get(`/v1/records/${e}/${id}/history`).set(as('principal')).expect(200)).body.items as { action: string; changes: { field: string }[] }[]);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [q] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Quinn Quality', email: 'quinn@kit.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: q.id, role: 'quality_officer' });
    const [h] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Hari Head', email: 'hari@kit.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: h.id, role: 'hod' });
    app = await createApp(clock);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.quality = await login(t.slug, 'quinn@kit.in');
    tok.hod = await login(t.slug, 'hari@kit.in');
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps business rules as versions: drafts are edited, a second person approves, a new version starts from the old', async () => {
    await add('principal', 'business-rules', { domain: 'grading', key: 'Pass Mark', title: 'Pass mark', effectiveFrom: '2026-06-01' }).expect(400);
    await add('principal', 'business-rules', { domain: 'grading', key: 'pass_mark', title: 'Pass mark', effectiveFrom: '2026-06-01', params: '{oops' }).expect(400);
    const r = (await add('principal', 'business-rules', { domain: 'grading', key: 'pass_mark', title: 'Pass mark', effectiveFrom: '2026-06-01', params: '{"passMark": 35}' }).expect(201)).body;
    expect(r).toMatchObject({ version: 1, status: 'draft', params: '{"passMark": 35}' });
    expect((await edit('principal', 'business-rules', r.id, { title: 'Pass mark (theory)', params: '{"passMark": 40}' }).expect(200)).body).toMatchObject({ title: 'Pass mark (theory)', params: '{"passMark": 40}' });
    expect((await history('business-rules', r.id)).map((x) => x.action)).toEqual(expect.arrayContaining(['rule.drafted', 'business_rule.updated']));
    expect((await act('principal', 'business-rules', 'review', [r.id])).succeeded).toBe(1);
    await edit('principal', 'business-rules', r.id, { title: 'Late change' }).expect(400); // only a draft is edited
    const own = await act('principal', 'business-rules', 'approve', [r.id]);
    expect(own.rows[0]).toMatchObject({ ok: false, message: expect.stringMatching(/someone other than its author/) });
    expect((await act('quality', 'business-rules', 'approve', [r.id])).succeeded).toBe(1);
    expect((await list('principal', 'business-rules', '?f.inForce=yes')).rows.map((x) => x.id)).toEqual([r.id]);
    await http().delete(`/v1/records/business-rules/${r.id}`).set(as('principal')).expect(403); // retire instead
    expect((await act('principal', 'business-rules', 'newVersion', [r.id])).succeeded).toBe(1);
    const v2 = (await list('principal', 'business-rules', '?f.status=draft')).rows[0];
    expect(v2).toMatchObject({ version: 2, key: 'pass_mark', params: '{"passMark": 40}' });
    await binAndBack('business-rules', String(v2.id));
    await http().get('/v1/records/business-rules').set(as('teacher')).expect(403);
    expect((await list('outsider', 'business-rules')).total).toBe(0);
  });

  it('runs the incident register: reported through Add, moved by actions, closed with its root cause', async () => {
    const i = (await add('quality', 'incidents', { title: 'Marks sheet emailed to the wrong class', severity: 'sev2', category: 'data_breach', personalDataInvolved: true, impact: '40 students' }).expect(201)).body;
    expect(i).toMatchObject({ status: 'open', personalDataInvolved: true, regulatorDeadline: expect.any(String), regulatorNotifiedAt: null });
    expect(await owner.query('select count(*)::int as n from tasks where tenant_id = $1 and source_id = $2', [t.tenantId, i.id]).then((r) => r.rows[0].n)).toBe(1);
    expect((await act('quality', 'incidents', 'investigating', [i.id], { note: 'Mail logs pulled' })).succeeded).toBe(1);
    const closing = await act('quality', 'incidents', 'closed', [i.id], { note: 'Done' });
    expect(closing.rows[0]).toMatchObject({ ok: false, message: expect.stringMatching(/root cause/) });
    await edit('quality', 'incidents', i.id, { rootCause: 'Wrong distribution list', correctiveActions: 'Lists are checked by two people' }).expect(200);
    expect((await act('quality', 'incidents', 'regulatorNotified', [i.id])).succeeded).toBe(1);
    expect((await act('quality', 'incidents', 'closed', [i.id], { note: 'Closed after review' })).succeeded).toBe(1);
    const row = (await http().get(`/v1/records/incidents/${i.id}`).set(as('quality')).expect(200)).body;
    expect(row).toMatchObject({ status: 'closed', regulatorNotifiedAt: expect.any(String) });
    const timeline = (await http().get(`/v1/governance/incidents/${i.id}`).set(as('quality')).expect(200)).body.timeline.map((u: { body: string }) => u.body);
    expect(timeline).toEqual(['Incident reported', 'Mail logs pulled', 'Data Protection Board notified', 'Closed after review']);
    await http().delete(`/v1/records/incidents/${i.id}`).set(as('principal')).expect(403); // stays on the register
    const typo = (await add('principal', 'incidents', { title: 'Reported twice', severity: 'sev4', category: 'other' }).expect(201)).body;
    await binAndBack('incidents', typo.id);
    await http().get('/v1/records/incidents').set(as('teacher')).expect(403);
  });

  it('sets retention per file category', async () => {
    await add('principal', 'retention-policies', { category: 'Admission Forms', retainMonths: 84 }).expect(400);
    const p = (await add('principal', 'retention-policies', { category: 'admission_forms', retainMonths: 84 }).expect(201)).body;
    await add('principal', 'retention-policies', { category: 'admission_forms', retainMonths: 12 }).expect((r) => expect([400, 409]).toContain(r.status));
    await http().post('/v1/records/retention-policies/bulk').set(as('principal')).send({ op: 'update', target: { ids: [p.id] }, fields: { retainMonths: 120 } }).expect(200);
    expect((await http().get('/v1/governance/retention').set(as('principal')).expect(200)).body).toEqual([expect.objectContaining({ category: 'admission_forms', retainMonths: 120 })]);
    const csv = await http().get('/v1/records/retention-policies/export?format=csv').set(as('principal')).expect(200);
    expect(csv.text).toContain('admission_forms');
    await binAndBack('retention-policies', p.id);
  });

  it('keeps single sign-on providers with their secret encrypted, switched off in bulk, deleted and restored', async () => {
    const base = { kind: 'google', name: 'College Google', clientId: 'abc.apps.googleusercontent.com', allowedDomains: 'kitcollege.edu\nstaff.kitcollege.edu', redirectAllowlist: 'zynetix://sso' };
    await add('principal', 'sso-providers', base).expect(400); // no secret
    await add('principal', 'sso-providers', { ...base, clientSecret: 's3cret', allowedDomains: 'not a domain' }).expect(400);
    const sp = (await add('principal', 'sso-providers', { ...base, clientSecret: 's3cret' }).expect(201)).body;
    expect(sp).toMatchObject({ kind: 'google', hasSecret: true, enabled: true, allowedDomains: 'kitcollege.edu, staff.kitcollege.edu' });
    expect(JSON.stringify(sp)).not.toContain('s3cret');
    const stored = (await owner.query('select client_secret_enc from sso_providers where id = $1', [sp.id])).rows[0].client_secret_enc;
    await edit('principal', 'sso-providers', sp.id, { clientSecret: 'n3w-secret' }).expect(200);
    expect((await owner.query('select client_secret_enc from sso_providers where id = $1', [sp.id])).rows[0].client_secret_enc).not.toBe(stored);
    await http().post('/v1/records/sso-providers/bulk').set(as('principal')).send({ op: 'update', target: { ids: [sp.id] }, fields: { enabled: false } }).expect(200);
    expect((await http().get('/v1/admin/sso/providers').set(as('principal')).expect(200)).body[0]).toMatchObject({ enabled: false });
    expect((await history('sso-providers', sp.id)).map((x) => x.action)).toEqual(expect.arrayContaining(['sso_provider.created', 'sso_provider.updated']));
    await binAndBack('sso-providers', sp.id);
    // Another institution cannot claim the same domain.
    await add('outsider', 'sso-providers', { ...base, clientSecret: 'x1y2z3' }).expect(409);
    await http().get('/v1/records/sso-providers').set(as('teacher')).expect(403);
  });

  it('lists the integrations: LTI tools, devices, SCORM packages, DigiLocker documents and API tokens', async () => {
    const tool = (await add('principal', 'lti-tools', { name: 'Turnitin', clientId: 'kx-tii', loginUrl: 'https://tii.example.com/login', launchUrl: 'https://tii.example.com/launch', deploymentId: '1' }).expect(201)).body;
    await add('principal', 'lti-tools', { name: 'Again', clientId: 'kx-tii', loginUrl: 'https://tii.example.com/login', launchUrl: 'https://tii.example.com/launch', deploymentId: '1' }).expect((r) => expect([400, 409]).toContain(r.status));
    await add('principal', 'lti-tools', { name: 'Bad', clientId: 'kx-bad', loginUrl: 'ftp://x', launchUrl: 'https://x.example.com', deploymentId: '1' }).expect(400);
    const copy = (await http().post(`/v1/records/lti-tools/${tool.id}/duplicate`).set(as('principal')).expect(201)).body;
    expect(copy).toMatchObject({ clientId: 'kx-tii-copy', name: 'Turnitin (copy)' });
    await binAndBack('lti-tools', tool.id);

    const dev = (await http().post('/v1/access-devices').set(as('principal')).send({ kind: 'biometric', serial: 'BIO-77', name: 'Gate reader', purpose: 'attendance' }).expect(201)).body;
    await edit('principal', 'access-devices', dev.id, { location: 'Main gate' }).expect(200);
    await http().post('/v1/records/access-devices/bulk').set(as('principal')).send({ op: 'update', target: { ids: [dev.id] }, fields: { active: false } }).expect(200);
    expect((await list('principal', 'access-devices', '?q=gate')).rows.find((r) => r.id === dev.id)).toMatchObject({ location: 'Main gate', active: false });
    await add('principal', 'access-devices', { name: 'x' }).expect(403); // registered from the page, which shows the key

    const [pkg] = await db.insert(scormPackages).values({ tenantId: t.tenantId, title: 'Fire safety', version: '1.2', launchHref: 'index.html', createdBy: t.principal.id }).returning();
    await edit('teacher', 'scorm-packages', pkg.id, { title: 'Fire safety basics' }).expect(200);
    expect((await list('teacher', 'scorm-packages')).rows[0]).toMatchObject({ title: 'Fire safety basics', attempts: 0 });

    const [doc] = await db.insert(dlDocuments).values({ tenantId: t.tenantId, studentId: t.students[0].id, docType: 'marksheet', title: 'Student A - marksheet', docRef: 'MARKSHEET-1' }).returning();
    const push = await act('principal', 'digilocker-documents', 'push', [doc.id]);
    expect(push.rows[0]).toMatchObject({ ok: false, message: expect.stringMatching(/not configured/) });
    expect((await list('principal', 'digilocker-documents', '?f.status=pending')).rows[0]).toMatchObject({ studentName: 'Student A', docRef: 'MARKSHEET-1' });
    await binAndBack('digilocker-documents', doc.id);

    const token = (await http().post('/v1/api-tokens').set(as('principal')).send({ name: 'Power BI', scopes: ['odata:students'] }).expect(201)).body;
    expect((await act('principal', 'api-tokens', 'revoke', [token.id])).succeeded).toBe(1);
    expect((await list('principal', 'api-tokens', '?f.state=revoked')).rows).toEqual([expect.objectContaining({ id: token.id, name: 'Power BI', scopes: 'odata:students' })]);
    expect((await list('outsider', 'lti-tools')).total).toBe(0);
    await http().get('/v1/records/api-tokens').set(as('teacher')).expect(403);
  });

  it('keeps a term’s course offerings: added, scoped to the head’s department, closed in bulk, seat limit kept', async () => {
    const [ay] = await db.select().from(s.academicYears).where(eqTenant(t.tenantId));
    const [term] = await db.insert(s.academicTerms).values({ tenantId: t.tenantId, academicYearId: ay.id, name: 'Odd 2026', startsOn: '2026-06-01', endsOn: '2026-11-30' }).returning();
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce' }).returning();
    const [hodUser] = await db.select().from(s.users).where(eqEmail('hari@kit.in'));
    await owner.query('update departments set head_user_id = $1 where id = $2', [hodUser.id, dept.id]);
    const [mine] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 3, code: 'COM-301', name: 'Auditing', departmentId: dept.id }).returning();
    const [theirs] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Science', headUserId: t.principal.id }).returning();
    const [sci] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 3, code: 'SCI-301', name: 'Physics', departmentId: theirs.id }).returning();

    const o = (await add('hod', 'course-offerings', { termId: term.id, subjectId: mine.id, category: 'elective', credits: 3, seatCap: 2, feePaise: 500, eligibleSemesters: '3, 5', slotIds: t.slot.id }).expect(201)).body;
    expect(o).toMatchObject({ subjectCode: 'COM-301', term: 'Odd 2026', feePaise: 500, status: 'open', registered: 0, eligibleSemesters: '3, 5', slotIds: t.slot.id });
    await edit('hod', 'course-offerings', o.id, { eligibleSemesters: '3, 99' }).expect(400);
    await add('hod', 'course-offerings', { termId: term.id, subjectId: sci.id, category: 'elective', credits: 3, seatCap: 30 }).expect(403);
    await add('hod', 'course-offerings', { termId: term.id, subjectId: mine.id, category: 'core', credits: 3, seatCap: 30 }).expect((r) => expect([400, 409]).toContain(r.status));
    await add('hod', 'course-offerings', { termId: term.id, subjectId: mine.id, category: 'elective', credits: 3, seatCap: 30, prerequisiteSubjectId: mine.id }).expect((r) => expect([400, 409]).toContain(r.status));
    const p = (await add('principal', 'course-offerings', { termId: term.id, subjectId: sci.id, category: 'core', credits: 4, seatCap: 30 }).expect(201)).body;
    expect((await list('hod', 'course-offerings', `?f.termId=${term.id}`)).rows.map((r) => r.subjectCode)).toEqual(['COM-301']);
    expect((await list('principal', 'course-offerings', `?f.termId=${term.id}`)).total).toBe(2);

    await db.insert(s.courseRegistrations).values([t.students[0], t.students[1]].map((st) => ({ tenantId: t.tenantId, offeringId: o.id, studentId: st.id, termId: term.id, status: 'registered' as const })));
    await edit('hod', 'course-offerings', o.id, { seatCap: 1 }).expect(409);
    expect((await act('hod', 'course-offerings', 'close', [o.id])).succeeded).toBe(1);
    expect((await http().get(`/v1/course-registration/offerings?termId=${term.id}`).set(as('principal')).expect(200)).body.find((x: { id: string }) => x.id === o.id)).toMatchObject({ status: 'closed', registered: 2 });
    await http().delete(`/v1/records/course-offerings/${o.id}`).set(as('principal')).expect(403); // students registered
    await binAndBack('course-offerings', p.id);
    await http().get('/v1/records/course-offerings').set(as('teacher')).expect(403);
  });

  it('keeps curriculum versions: drafted, approved by the Board of Studies, activated, revised; only drafts deleted', async () => {
    const v = (await add('hod', 'curriculum-versions', { programId: t.program.id, regulationYear: 2026, label: 'NEP scheme' }).expect(201)).body;
    expect(v).toMatchObject({ versionNo: 1, status: 'draft', programName: 'BCom', subjectCount: 0 });
    const early = await act('principal', 'curriculum-versions', 'approve', [v.id], { bosRef: 'BOS/2026/4' });
    expect(early.rows[0]).toMatchObject({ ok: false, message: expect.stringMatching(/at least one subject/) });
    await http().put(`/v1/curriculum/versions/${v.id}/content`).set(as('hod')).send({ subjects: [{ code: 'BC101', name: 'Financial Accounting', term: 1, credits: 4, hours: 60, units: [], cos: [] }] }).expect(200);
    await http().post('/v1/records/curriculum-versions/bulk').set(as('hod')).send({ op: 'action', action: 'approve', target: { ids: [v.id] }, params: { bosRef: 'BOS/2026/4' } }).expect(403); // approvers only
    expect((await act('principal', 'curriculum-versions', 'approve', [v.id], { bosRef: 'BOS/2026/4' })).succeeded).toBe(1);
    expect((await act('principal', 'curriculum-versions', 'activate', [v.id], { effectiveFrom: '2026-06-01' })).succeeded).toBe(1);
    await http().delete(`/v1/records/curriculum-versions/${v.id}`).set(as('principal')).expect(403);
    expect((await act('hod', 'curriculum-versions', 'revise', [v.id], { label: 'NEP scheme (2027 revision)' })).succeeded).toBe(1);
    const v2 = (await list('hod', 'curriculum-versions', '?f.status=draft')).rows[0];
    expect(v2).toMatchObject({ versionNo: 2, status: 'draft', subjectCount: 1, label: 'NEP scheme (2027 revision)' });
    await edit('hod', 'curriculum-versions', String(v2.id), { label: 'NEP scheme rev 2' }).expect(200);
    await binAndBack('curriculum-versions', String(v2.id));
    expect((await list('teacher', 'curriculum-versions')).total).toBe(2); // teachers read
    await add('teacher', 'curriculum-versions', { programId: t.program.id, regulationYear: 2027, label: 'x' }).expect(403);
    expect((await list('outsider', 'curriculum-versions')).total).toBe(0);
  });

  it('keeps the school diary per class: teachers write for their classes, families are told, authors delete', async () => {
    await add('teacher', 'diary-entries', { sectionId: t.section.id, entryDate: '2026-10-20' }).expect(400); // nothing written
    const e = (await add('teacher', 'diary-entries', { sectionId: t.section.id, entryDate: '2026-10-20', homeworkNote: 'Exercise 4.2' }).expect(201)).body;
    expect(e).toMatchObject({ section: 'BCom Sem 3 A', acknowledged: 0, students: 3 });
    expect(await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and data->>'entryId' = $2", [t.tenantId, e.id]).then((r) => r.rows[0].n)).toBeGreaterThan(0);
    await add('teacher', 'diary-entries', { sectionId: t.otherSection.id, entryDate: '2026-10-20', notice: 'Not my class' }).expect(403);
    await add('principal', 'diary-entries', { sectionId: t.otherSection.id, entryDate: '2026-10-20', notice: 'Sports day on Friday' }).expect(201);
    expect((await list('teacher', 'diary-entries')).total).toBe(1); // only the class they teach
    expect((await list('teacher2', 'diary-entries')).total).toBe(0);
    expect((await list('principal', 'diary-entries', `?f.sectionId=${t.section.id}&f.from=2026-10-01`)).total).toBe(1);
    await edit('teacher', 'diary-entries', e.id, { homeworkNote: 'Exercise 4.2 and 4.3' }).expect(200);
    await edit('teacher', 'diary-entries', e.id, { homeworkNote: '' }).expect(400);
    expect((await history('diary-entries', e.id)).some((h) => h.changes.some((c) => c.field === 'homeworkNote'))).toBe(true);
    await binAndBack('diary-entries', e.id);
    expect((await list('outsider', 'diary-entries')).total).toBe(0);
  });
});

const eqTenant = (tenantId: string) => eq(s.academicYears.tenantId, tenantId);
const eqEmail = (email: string) => eq(s.users.email, email);
