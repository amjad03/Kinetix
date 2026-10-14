import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, writeWorkbook } from '../src/common/xlsx.js';
import * as depth from '../src/db/schema-depth.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * HR depth on the record kit: the staff master (details, qualifications, experience, publications, documents),
 * designations and leave types, leave with rules, on-behalf applications, delegation, documents, withdrawal and
 * substitutes, compensatory off, attendance rules and regularisation, recruitment interviews and hiring, appraisal
 * committee, DA revisions, LWF, supplementary and reversed payroll runs, statutory files, loans, increments and
 * reports — with permissions and another institution seeing nothing.
 */
describe('HR depth on the record kit', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const bulk = (who: string, entity: string, ids_: string[], action: string, params?: object) => post(who, `/v1/records/${entity}/bulk`, { op: 'action', target: { ids: ids_ }, action, ...(params ? { params } : {}) });
  const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@dk.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const hod = await addUser('Hari Hod', 'hod');
    const acc = await addUser('Anu Accounts', 'accountant');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      hod: await login(t.slug, hod.email!),
      accountant: await login(t.slug, acc.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, teacher: t.teacher.id, teacher2: t.teacher2.id, principal: t.principal.id });
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    ids.dept = dept.id;
    await db.update(s.subjects).set({ departmentId: dept.id }).where(eq(s.subjects.id, t.subject.id));
    await db.insert(s.staffProfiles).values([
      { tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'E100', departmentId: dept.id, dateOfJoining: '2020-06-01', gender: 'female', dateOfBirth: '1985-03-15' },
      { tenantId: t.tenantId, userId: t.teacher2.id, employeeCode: 'E101', departmentId: dept.id, dateOfJoining: '2021-06-01', gender: 'male' },
      { tenantId: t.tenantId, userId: hod.id, employeeCode: 'E102', departmentId: dept.id, dateOfJoining: '2015-06-01', gender: 'male' },
      { tenantId: t.tenantId, userId: hr.id, employeeCode: 'E103', dateOfJoining: '2019-01-01', gender: 'female' },
    ]);
    await db.insert(s.departmentStaff).values({ tenantId: t.tenantId, departmentId: dept.id, userId: t.teacher2.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  // ---- staff master -----------------------------------------------------------------------------------------

  it('keeps personal, statutory and faculty details with Aadhaar encrypted and the retirement date worked out', async () => {
    const body = { staffCategory: 'teaching', cadre: 'assistant_professor', postType: 'sanctioned', socialCategory: 'obc', bloodGroup: 'B+', differentlyAbled: false, aadhaar: '2345 6789 0123', phdStatus: 'awarded', phdYear: 2018, netSet: 'net', netSetYear: 2010, payLevel: 10, retirementAge: 60, lwfEnabled: true };
    await put('teacher', `/v1/hr/staff/${ids.teacher}/details`, body).expect(403);
    await put('hr', `/v1/hr/staff/${ids.teacher}/details`, { ...body, phdYear: null }).expect(400);
    await put('hr', `/v1/hr/staff/${ids.teacher}/details`, { ...body, aadhaar: '1234' }).expect(400);
    const d = (await put('hr', `/v1/hr/staff/${ids.teacher}/details`, body).expect(200)).body;
    expect(d).toMatchObject({ cadre: 'assistant_professor', aadhaarLast4: '0123', phdStatus: 'awarded', retiresOn: '2045-03-31', experience: { serviceYears: expect.any(Number) } });
    expect(d).not.toHaveProperty('aadhaarEnc');
    const [row] = await db.select({ enc: s.staffProfiles.aadhaarEnc }).from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher));
    expect(row.enc).toBeTruthy();
    expect(row.enc).not.toContain('234567890123');
    // The person sees their own; a colleague does not; another institution does not.
    expect((await get('teacher', `/v1/hr/staff/${ids.teacher}/details`).expect(200)).body.aadhaarLast4).toBe('0123');
    await get('teacher2', `/v1/hr/staff/${ids.teacher}/details`).expect(404);
    await get('outsider', `/v1/hr/staff/${ids.teacher}/details`).expect(404);
    // The staff list filters on the new details.
    const list = (await get('hr', '/v1/records/staff?f.cadre=assistant_professor&f.phd=awarded').expect(200)).body;
    expect(list.rows.map((r: { id: string }) => r.id)).toEqual([ids.teacher]);
    const h = (await get('hr', `/v1/records/staff/${ids.teacher}/history`).expect(200)).body;
    expect(h.items.some((i: { action: string; changes: { field: string }[] }) => i.action === 'hr.staff_details_updated' && i.changes.some((c) => c.field === 'cadre'))).toBe(true);
  });

  let pubId: string;
  it('lets staff keep their own publications and experience, HR verify them, and nobody else see them', async () => {
    const pub = (await post('teacher', '/v1/records/staff-publications', { kind: 'journal', title: 'GST and small retailers', authors: 'A. Rao', venue: 'Indian Journal of Commerce', year: 2025, indexing: 'ugc_care', authorRole: 'first', status: 'published' }).expect(201)).body;
    pubId = pub.id;
    expect(pub).toMatchObject({ userId: ids.teacher, verified: false, staffName: expect.any(String) });
    // A colleague cannot see or change it; another institution sees nothing.
    expect((await get('teacher2', '/v1/records/staff-publications').expect(200)).body.total).toBe(0);
    await patch('teacher2', `/v1/records/staff-publications/${pubId}`, { title: 'x' }).expect(404);
    expect((await get('outsider', '/v1/records/staff-publications').expect(200)).body.total).toBe(0);
    // Staff cannot put an entry on someone else's record; HR can and theirs come verified.
    await post('teacher', '/v1/records/staff-publications', { userId: ids.teacher2, kind: 'book', title: 'Not mine', year: 2024, indexing: 'none', authorRole: 'sole', status: 'published' }).expect(400);
    const forOther = (await post('teacher', '/v1/records/staff-publications', { kind: 'book', title: 'Mine', year: 2024, indexing: 'none', authorRole: 'sole', status: 'published' }).expect(201)).body;
    const byHr = (await post('hr', '/v1/records/staff-publications', { userId: ids.teacher2, kind: 'chapter', title: 'Audit in the age of AI', year: 2026, indexing: 'scopus', authorRole: 'co_author', status: 'published' }).expect(201)).body;
    expect(byHr).toMatchObject({ userId: ids.teacher2, verified: true });
    // The teacher cannot verify; HR verifies in bulk; editing a verified entry sends it back.
    expect((await get('teacher', '/v1/records/staff-publications/meta').expect(200)).body.actions).toEqual([]);
    await bulk('teacher', 'staff-publications', [pubId], 'verify').expect(403);
    const rep = (await bulk('hr', 'staff-publications', [pubId, forOther.id], 'verify').expect(200)).body;
    expect(rep).toMatchObject({ succeeded: 2, failed: 0 });
    await http().delete(`/v1/records/staff-publications/${pubId}`).set(auth("teacher")).expect(403);
    await patch('teacher', `/v1/records/staff-publications/${pubId}`, { venue: 'Indian Journal of Commerce and Management' }).expect(200);
    expect((await get('teacher', `/v1/records/staff-publications/${pubId}`).expect(200)).body.verified).toBe(false);
    // HR filters and exports the institution's indexed papers.
    const indexed = (await get('hr', '/v1/records/staff-publications?f.indexing=scopus').expect(200)).body;
    expect(indexed.total).toBe(1);
    const csv = (await get('hr', '/v1/records/staff-publications/export?format=csv').expect(200)).text;
    expect(csv).toContain('Audit in the age of AI');
    expect(csv).toContain('UGC-CARE');

    await post('teacher', '/v1/records/staff-experience', { organisation: 'St. Anne College', kind: 'teaching', fromDate: '2016-06-01', toDate: '2015-05-31' }).expect(400);
    const ex = (await post('teacher', '/v1/records/staff-experience', { organisation: 'St. Anne College', designation: 'Lecturer', kind: 'teaching', fromDate: '2015-06-01', toDate: '2020-05-31', lastPayPaise: 42000 }).expect(201)).body;
    expect(ex).toMatchObject({ lastPay: 42000, years: 5 });
    const [stored] = await db.select({ p: s.staffProfiles.userId }).from(s.staffProfiles).limit(1);
    expect(stored).toBeTruthy();
    const d = (await get('hr', `/v1/hr/staff/${ids.teacher}/details`).expect(200)).body;
    expect(d.experience.priorTeachingYears).toBe(5);
    expect(d.publications).toEqual({ total: 2, indexed: 1 });
  });

  it('imports qualifications by employee code and keeps documents with scans', async () => {
    const tpl = await get('hr', '/v1/records/staff-qualifications/import/template').buffer(true).parse(binary).expect(200);
    const sheet = readXlsx(tpl.body as Buffer);
    expect(sheet[0][0]).toBe('Employee code *');
    const file = writeWorkbook([{ name: 'Data', header: true, rows: [['Employee code', 'Kind', 'Qualification', 'Level', 'Year of passing'], ['E101', 'degree', 'M.Com.', 'PG', '2012'], ['NOPE', 'degree', 'B.Com.', 'UG', '2009'], ['E101', 'bogus', 'Ph.D.', 'Ph.D.', '2020']] }]);
    const check = (await http().post('/v1/records/staff-qualifications/import?mode=insert').set(auth('hr')).attach('file', file, 'q.xlsx').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 3, created: 1, error: 2 });
    const done = (await post('hr', `/v1/records/staff-qualifications/import/${check.id}/commit`, { skipErrors: true }).expect(200)).body;
    expect(done.totals.created).toBe(1);
    const q = (await get('hr', `/v1/records/staff-qualifications?f.user=${ids.teacher2}`).expect(200)).body;
    expect(q.rows).toEqual([expect.objectContaining({ title: 'M.Com.', level: 'PG', verified: true })]);
    // A teacher's import is refused row by row.
    const mine = (await http().post('/v1/records/staff-qualifications/import?mode=insert').set(auth('teacher')).attach('file', file, 'q.xlsx').expect(200)).body;
    expect(mine.totals).toMatchObject({ created: 0, error: 3 });

    await post('teacher', '/v1/records/staff-documents', { kind: 'aadhaar', title: 'Aadhaar', number: '234567890123' }).expect(400);
    const doc = (await post('teacher', '/v1/records/staff-documents', { kind: 'degree', title: 'M.Com. certificate', issuedOn: '2012-07-01' }).expect(201)).body;
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    await http().post(`/v1/hr/staff-documents/${doc.id}/file`).set(auth('teacher2')).attach('file', pdf, 'cert.pdf').expect(404);
    await http().post(`/v1/hr/staff-documents/${doc.id}/file`).set(auth('teacher')).attach('file', pdf, 'cert.pdf').expect(201);
    expect((await get('teacher', `/v1/records/staff-documents/${doc.id}`).expect(200)).body).toMatchObject({ hasFile: true, fileName: 'cert.pdf' });
    const back = await get('hr', `/v1/hr/staff-documents/${doc.id}/file`).buffer(true).parse(binary).expect(200);
    expect((back.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher2', `/v1/hr/staff-documents/${doc.id}/file`).expect(404);
    // To the recycle bin and back with HR.
    const del = (await http().delete(`/v1/records/staff-documents/${doc.id}`).set(auth('hr')).expect(200)).body;
    await post('hr', `/v1/recycle-bin/${del.binId}/restore`).expect(200);
    expect((await get('hr', `/v1/records/staff-documents/${doc.id}`).expect(200)).body.title).toBe('M.Com. certificate');
  });

  it('orders and duplicates designations with their cadre', async () => {
    const a = (await post('hr', '/v1/records/designations', { name: 'Assistant professor', cadre: 'assistant_professor', staffCategory: 'teaching' }).expect(201)).body;
    const b = (await post('hr', '/v1/records/designations', { name: 'Associate professor', cadre: 'associate_professor', staffCategory: 'teaching' }).expect(201)).body;
    await post('teacher', '/v1/records/designations', { name: 'X', staffCategory: 'teaching' }).expect(403);
    await post('hr', '/v1/records/designations/reorder', { ids: [b.id, a.id] }).expect(200);
    const list = (await get('hr', '/v1/records/designations').expect(200)).body.rows.map((r: { name: string }) => r.name);
    expect(list.indexOf('Associate professor')).toBeLessThan(list.indexOf('Assistant professor'));
    const copy = (await post('hr', `/v1/records/designations/${a.id}/duplicate`).expect(201)).body;
    expect(copy).toMatchObject({ name: 'Assistant professor (copy)', cadre: 'assistant_professor' });
    ids.designation = a.id;
  });

  // ---- leave --------------------------------------------------------------------------------------------------

  it('applies leave rules, takes applications on behalf, needs documents and hands approvals to a delegate', async () => {
    await get('teacher', '/v1/hr/leave-types').expect(200); // the standard types are made on first use
    const types = (await get('hr', '/v1/records/leave-types?pageSize=50').expect(200)).body.rows as { id: string; code: string }[];
    const id = (code: string) => types.find((x) => x.code === code)!.id;
    expect(types.map((x) => x.code)).toEqual(expect.arrayContaining(['CL', 'SL', 'EL', 'LOP', 'DL', 'CO', 'ML']));
    // Maternity leave is for women; casual leave at most 3 days at a time and 1 day's notice.
    await patch('hr', `/v1/records/leave-types/${id('CL')}`, { maxPerRequest: 3, minNoticeDays: 1 }).expect(200);
    await patch('hr', `/v1/records/leave-types/${id('SL')}`, { requiresDocument: true }).expect(200);
    await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: id('ML'), fromDate: '2026-11-02', toDate: '2026-11-03' }).expect(400);
    await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: id('CL'), fromDate: '2026-11-02', toDate: '2026-11-06' }).expect(400);
    await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: id('CL'), fromDate: '2026-10-20', toDate: '2026-10-20' }).expect(400);
    // Duty leave needs no balance.
    const duty = (await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: id('DL'), fromDate: '2026-10-28', toDate: '2026-10-30', reason: 'Exam duty at the university' }).expect(201)).body;
    expect(duty).toMatchObject({ days: 3, status: 'pending', typeCode: 'DL' });

    // HR applies sick leave for the teacher, who hands approvals to a colleague.
    const sl = (await post('hr', '/v1/records/leave-requests', { userId: ids.teacher, leaveTypeId: id('SL'), fromDate: '2026-10-26', toDate: '2026-10-29', reason: 'Surgery', delegateId: ids.teacher2 }).expect(201)).body;
    expect(sl).toMatchObject({ userId: ids.teacher, days: 4, appliedBy: ids.hr, delegateId: ids.teacher2 });
    await bulk('hod', 'leave-requests', [sl.id], 'approve').expect(200).expect((r) => expect(r.body.rows[0]).toMatchObject({ ok: false, message: expect.stringContaining('supporting document') }));
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    await http().post(`/v1/hr/leave/requests/${sl.id}/document`).set(auth('teacher')).attach('file', pdf, 'medical.pdf').expect(201);
    const ok = (await bulk('hod', 'leave-requests', [sl.id], 'approve', { note: 'Get well soon' }).expect(200)).body;
    expect(ok.rows[0]).toMatchObject({ ok: true });
    const [d] = await db.select().from(s.approvalDelegations).where(eq(s.approvalDelegations.delegatorId, ids.teacher));
    expect(d).toMatchObject({ delegateId: ids.teacher2, startsOn: '2026-10-26', endsOn: '2026-10-29', revokedAt: null });
    // Scope: the head of department sees the department; a teacher only their own; another institution nothing.
    expect((await get('hod', '/v1/records/leave-requests').expect(200)).body.total).toBe(2);
    expect((await get('teacher', '/v1/records/leave-requests').expect(200)).body.total).toBe(1);
    expect((await get('outsider', '/v1/records/leave-requests').expect(200)).body.total).toBe(0);
    expect((await get('hr', '/v1/records/leave-requests?f.status=open').expect(200)).body.total).toBe(1);
    // Approved leave cannot be deleted; HR withdraws it and the delegation ends.
    await http().delete(`/v1/records/leave-requests/${sl.id}`).set(auth("hr")).expect(403);
    await bulk('teacher', 'leave-requests', [sl.id], 'revoke', { reason: 'Back early' }).expect(403);
    const rv = (await bulk('hr', 'leave-requests', [sl.id], 'revoke', { reason: 'Back early' }).expect(200)).body;
    expect(rv.rows[0].ok).toBe(true);
    expect((await get('hr', `/v1/records/leave-requests/${sl.id}`).expect(200)).body).toMatchObject({ status: 'cancelled', revokedReason: 'Back early' });
    const [after] = await db.select().from(s.approvalDelegations).where(eq(s.approvalDelegations.id, d.id));
    expect(after.revokedAt).not.toBeNull();
    const hist = (await get('hr', `/v1/records/leave-requests/${sl.id}/history`).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(hist).toEqual(expect.arrayContaining(['leave.applied', 'leave.approved', 'leave.revoked']));
  });

  it('arranges substitutes for the periods of approved leave', async () => {
    const types = (await get('hr', '/v1/records/leave-types?pageSize=50').expect(200)).body.rows as { id: string; code: string }[];
    // The teacher teaches Monday 10:00; Monday 26 October is covered by a colleague of the department.
    await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.slot.academicYearId, sectionId: t.otherSection.id, subjectId: t.subject.id, teacherId: t.teacher2.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '09:55' });
    const cl = types.find((x) => x.code === 'CL')!.id;
    const req = (await post('teacher', '/v1/records/leave-requests', { leaveTypeId: cl, fromDate: '2026-10-26', toDate: '2026-10-26', reason: 'Wedding' }).expect(201)).body;
    await bulk('hod', 'leave-requests', [req.id], 'approve').expect(200);
    await bulk('teacher', 'leave-requests', [req.id], 'arrange').expect(403);
    const res = (await post('hod', `/v1/hr/leave/requests/${req.id}/arrange-substitutes`).expect(200)).body;
    expect(res.assigned).toEqual([expect.objectContaining({ date: '2026-10-26', substitute: expect.any(String) })]);
    expect(res.uncovered).toEqual([]);
    const subs = await db.select().from(s.teacherSubstitutions).where(eq(s.teacherSubstitutions.leaveRequestId, req.id));
    expect(subs).toHaveLength(1);
    expect(subs[0].substituteTeacherId).toBe(ids.teacher2);
    // Again: nothing left to cover.
    expect((await post('hr', `/v1/hr/leave/requests/${req.id}/arrange-substitutes`).expect(200)).body.assigned).toEqual([]);
  });

  it('credits compensatory off for a holiday worked and lets it be taken', async () => {
    // Sunday 18 October was a weekly off.
    await post('teacher2', '/v1/records/comp-off-credits', { workedOn: '2026-10-19', days: 1, reason: 'Admissions desk' }).expect(400);
    const cr = (await post('teacher2', '/v1/records/comp-off-credits', { workedOn: '2026-10-18', days: 1, reason: 'Admissions desk' }).expect(201)).body;
    await post('teacher2', '/v1/records/comp-off-credits', { workedOn: '2026-10-18', days: 1, reason: 'Again' }).expect(409);
    expect(cr).toMatchObject({ status: 'pending', expiresOn: '2027-01-16' });
    await bulk('teacher2', 'comp-off-credits', [cr.id], 'approve').expect(403);
    await bulk('hod', 'comp-off-credits', [cr.id], 'reject').expect(200).expect((r) => expect(r.body.rows[0].ok).toBe(false));
    expect((await bulk('hod', 'comp-off-credits', [cr.id], 'approve').expect(200)).body.rows[0].ok).toBe(true);
    await patch('teacher2', `/v1/records/comp-off-credits/${cr.id}`, { reason: 'Changed' }).expect(409);
    const bal = (await get('teacher2', '/v1/hr/leave/balances/me').expect(200)).body as { leaveType: { code: string }; available: number }[];
    expect(bal.find((b) => b.leaveType.code === 'CO')?.available).toBe(1);
    expect(bal.some((b) => b.leaveType.code === 'DL')).toBe(false);
    const types = (await get('hr', '/v1/records/leave-types?pageSize=50').expect(200)).body.rows as { id: string; code: string }[];
    await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: types.find((x) => x.code === 'CO')!.id, fromDate: '2026-11-03', toDate: '2026-11-03' }).expect(201);
    await post('teacher2', '/v1/records/leave-requests', { leaveTypeId: types.find((x) => x.code === 'CO')!.id, fromDate: '2026-11-04', toDate: '2026-11-04' }).expect(409);
  });

  it('marks late arrivals and half days from punches, charges late marks and accepts regularisations', async () => {
    const set0 = (await get('hr', '/v1/hr/module-settings').expect(200)).body;
    expect(set0.attendance).toMatchObject({ officeEnd: '17:00', lateMarksPerHalfDay: 3 });
    const csv = ['employee_code,date,in_time,out_time', 'E101,2026-10-05,09:05,17:10', 'E101,2026-10-06,09:30,17:00', 'E101,2026-10-07,09:25,17:00', 'E101,2026-10-08,09:40,17:00', 'E101,2026-10-09,11:30,17:00', 'E101,2026-10-12,09:00,13:00'].join('\n');
    const imp = (await post('hr', '/v1/hr/attendance/import', { csv }).expect(200)).body;
    expect(imp.imported).toBe(6);
    const rows = await db.select().from(s.staffAttendance).where(eq(s.staffAttendance.userId, ids.teacher2));
    const by = (d: string) => rows.find((r) => r.date === d)!;
    expect(by('2026-10-05')).toMatchObject({ status: 'present', lateMinutes: 0, earlyMinutes: 0 });
    expect(by('2026-10-06')).toMatchObject({ status: 'present', lateMinutes: 30 });
    expect(by('2026-10-09')).toMatchObject({ status: 'half_day', lateMinutes: 150 });
    expect(by('2026-10-12')).toMatchObject({ status: 'half_day', earlyMinutes: 240 });
    // Three late marks cost half a day, on top of two half days.
    const sum = (await get('hr', '/v1/hr/attendance/summary?month=2026-10').expect(200)).body as { userId: string; lopDays: number }[];
    expect(sum.find((x) => x.userId === ids.teacher2)?.lopDays).toBe(1.5);

    // A regularisation of one late day takes a late mark away.
    const reg = (await post('teacher2', '/v1/records/attendance-regularisations', { date: '2026-10-08', kind: 'late_arrival', inTime: '09:00', requestedStatus: 'present', reason: 'Called to the university office' }).expect(201)).body;
    await post('teacher2', '/v1/records/attendance-regularisations', { date: '2026-10-08', kind: 'late_arrival', requestedStatus: 'present', reason: 'Twice' }).expect(409);
    await post('teacher2', '/v1/records/attendance-regularisations', { date: '2026-10-30', kind: 'missed_punch', requestedStatus: 'present', reason: 'Future' }).expect(400);
    await bulk('teacher2', 'attendance-regularisations', [reg.id], 'approve').expect(403);
    expect((await bulk('hod', 'attendance-regularisations', [reg.id], 'approve').expect(200)).body.rows[0].ok).toBe(true);
    const [fixed] = await db.select().from(s.staffAttendance).where(eq(s.staffAttendance.date, '2026-10-08'));
    expect(fixed).toMatchObject({ regularised: true, lateMinutes: 0, status: 'present' });
    const sum2 = (await get('hr', '/v1/hr/attendance/summary?month=2026-10').expect(200)).body as { userId: string; lopDays: number }[];
    expect(sum2.find((x) => x.userId === ids.teacher2)?.lopDays).toBe(1);
    expect((await get('outsider', '/v1/records/attendance-regularisations').expect(200)).body.total).toBe(0);
  });

  // ---- recruitment --------------------------------------------------------------------------------------------

  it('screens applicants, schedules panel interviews, scores them and hires into the staff record', async () => {
    const op = (await post('hr', '/v1/records/job-openings', { title: 'Assistant professor, Commerce', departmentId: ids.dept, designationId: ids.designation, positions: 1 }).expect(201)).body;
    expect(op).toMatchObject({ status: 'open', applicants: 0 });
    await post('teacher', '/v1/records/job-openings', { title: 'X', positions: 1 }).expect(403);
    const a1 = (await post('hr', '/v1/records/job-applicants', { openingId: op.id, fullName: 'Kavya Shetty', email: 'kavya@cand.in', phone: '9845012345', qualification: 'M.Com., NET', experienceYears: 4, netSet: true, source: 'portal', expectedCtcPaise: 600000 }).expect(201)).body;
    await post('hr', '/v1/records/job-applicants', { openingId: op.id, fullName: 'Kavya Again', email: 'KAVYA@cand.in' }).expect(409);
    const a2 = (await post('hr', '/v1/records/job-applicants', { openingId: op.id, fullName: 'Ravi Kumar', email: 'ravi@cand.in', phd: true }).expect(201)).body;
    expect(a1).toMatchObject({ stage: 'applied', expectedCtc: 600000, openingTitle: 'Assistant professor, Commerce' });
    expect((await get('hr', `/v1/records/job-applicants?f.opening=${op.id}&f.eligibility=either`).expect(200)).body.total).toBe(2);
    expect((await bulk('hr', 'job-applicants', [a1.id], 'shortlist', { note: 'Strong profile' }).expect(200)).body.succeeded).toBe(1);
    await bulk('hr', 'job-applicants', [a2.id], 'reject', { note: 'Not eligible' }).expect(200);
    expect((await bulk('hr', 'job-applicants', [a2.id], 'shortlist').expect(200)).body.failed).toBe(1);
    // The interview today with the head of department on the panel moves the applicant to "interview".
    await post('hr', '/v1/records/job-interviews', { applicantId: a1.id, round: 1, kind: 'demo_class', date: '2026-10-20', time: '11:00', mode: 'in_person', venue: 'Room 12' }).expect(400);
    const iv = (await post('hr', '/v1/records/job-interviews', { applicantId: a1.id, round: 1, kind: 'demo_class', date: '2026-10-20', time: '11:00', mode: 'in_person', venue: 'Room 12', panel1: ids.hod, panel2: ids.principal }).expect(201)).body;
    expect(iv).toMatchObject({ date: '2026-10-20', time: '11:00', status: 'scheduled', panel1: ids.hod });
    expect((await get('hr', `/v1/records/job-applicants/${a1.id}`).expect(200)).body.stage).toBe('interview');
    const mine = (await get('hod', '/v1/hr/interviews/mine').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: iv.id, scoredByMe: false })]);
    const scores = { subject_knowledge: 8, teaching_ability: 9, communication: 8, research: 6, attitude: 9 };
    await put('teacher', `/v1/hr/interviews/${iv.id}/scores`, { scores, recommendation: 'select' }).expect(403);
    await put('hod', `/v1/hr/interviews/${iv.id}/scores`, { scores: { subject_knowledge: 8 }, recommendation: 'select' }).expect(400);
    expect((await put('hod', `/v1/hr/interviews/${iv.id}/scores`, { scores, recommendation: 'select', remarks: 'Clear demonstration' }).expect(200)).body).toEqual({ total: 80, completed: false });
    expect((await put('principal', `/v1/hr/interviews/${iv.id}/scores`, { scores: { ...scores, research: 8 }, recommendation: 'select' }).expect(200)).body).toEqual({ total: 84, completed: true });
    const file = (await get('hr', `/v1/hr/applicants/${a1.id}/file`).expect(200)).body;
    expect(file).toMatchObject({ average: 82, interviews: [expect.objectContaining({ status: 'completed', scores: expect.arrayContaining([expect.objectContaining({ total: 80 })]) })] });
    expect((await get('hr', `/v1/records/job-applicants?sort=interview:desc`).expect(200)).body.rows[0]).toMatchObject({ id: a1.id, interviewScore: 82 });

    // Offer, acceptance and hiring.
    await post('hr', `/v1/hr/applicants/${a1.id}/hire`, { joiningOn: '2026-11-02' }).expect(409); // no accepted offer
    const offer = (await post('hr', `/v1/hr/applicants/${a1.id}/offer`, { annualCtcPaise: 720000_00, joiningOn: '2026-11-02', validUntil: '2026-10-31' }).expect(201)).body;
    await put('hr', `/v1/hr/offers/${offer.id}/status`, { status: 'accepted' }).expect(200);
    const hired = (await post('hr', `/v1/hr/applicants/${a1.id}/hire`, { joiningOn: '2026-11-02', role: 'teacher' }).expect(201)).body;
    expect(hired).toMatchObject({ userId: expect.any(String), employeeCode: expect.any(String) });
    await post('hr', `/v1/hr/applicants/${a1.id}/hire`, { joiningOn: '2026-11-02' }).expect(409);
    const prof = (await get('hr', `/v1/hr/staff/${hired.userId}`).expect(200)).body;
    expect(prof).toMatchObject({ dateOfJoining: '2026-11-02', department: { id: ids.dept }, designation: { id: ids.designation }, employmentType: 'probation' });
    expect((await get('hr', `/v1/hr/staff/${hired.userId}/onboarding`).expect(200)).body.length).toBeGreaterThan(3);
    const book = (await get('hr', `/v1/hr/staff/${hired.userId}/service-book`).expect(200)).body as { kind: string; title: string }[];
    expect(book.some((b) => b.kind === 'appointment' && b.title.startsWith('Appointed as'))).toBe(true);
    // The one position is filled, so the opening closes; the appointment order is a PDF.
    expect((await get('hr', `/v1/records/job-openings/${op.id}`).expect(200)).body).toMatchObject({ status: 'closed', hired: 1 });
    const pdf = await get('hr', `/v1/hr/applicants/${a1.id}/appointment-letter`).buffer(true).parse(binary).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await http().delete(`/v1/records/job-applicants/${a1.id}`).set(auth('hr')).expect(403);
    expect((await get('outsider', '/v1/records/job-applicants').expect(200)).body.total).toBe(0);
  });

  it('adds the appraisal committee and student feedback before the principal finalises', async () => {
    const cycle = (await post('hr', '/v1/hr/appraisal-cycles', { period: '2026-27', opensOn: '2026-10-01', closesOn: '2026-12-31' }).expect(201)).body;
    const [year] = await db.select({ id: s.academicYears.id }).from(s.academicYears).where(eq(s.academicYears.tenantId, t.tenantId));
    await db.insert(depth.teachingEvaluations).values([
      { tenantId: t.tenantId, staffUserId: ids.teacher2, academicYearId: year.id, raterKind: 'student', raterUserId: t.studentUser.id, scores: {}, average: 4 },
      { tenantId: t.tenantId, staffUserId: ids.teacher2, academicYearId: year.id, raterKind: 'student', raterUserId: t.teacher.id, scores: {}, average: 4.5 },
    ]);
    const full = { teaching_learning: { score: 80 }, research: { score: 50 }, student_activities: { score: 30 }, administration: { score: 20 }, professional_development: { score: 10 } };
    const own = (await put('teacher2', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: full, submit: true }).expect(200)).body;
    await put('hr', `/v1/hr/appraisals/${own.id}/committee`, { score: 70 }).expect(409); // not reviewed yet
    const rev = (await put('hod', `/v1/hr/appraisals/${own.id}/hod-review`, { scores: full, remarks: 'Good year' }).expect(200)).body;
    expect(rev.studentFeedbackScore).toBe(85);
    await put('teacher', `/v1/hr/appraisals/${own.id}/committee`, { score: 70 }).expect(403);
    const com = (await put('hr', `/v1/hr/appraisals/${own.id}/committee`, { score: 72.5, remarks: 'Research to improve' }).expect(200)).body;
    expect(com).toMatchObject({ status: 'committee_reviewed', committeeScore: 72.5 });
    const fin = (await put('principal', `/v1/hr/appraisals/${own.id}/finalise`, { remarks: 'Agreed' }).expect(200)).body;
    expect(fin).toMatchObject({ status: 'finalised', finalScore: 72.5, grade: 'Very good' });
  });

  // ---- payroll ------------------------------------------------------------------------------------------------

  let sepRun: { id: string; version: number };
  let daId: string;
  it('works out DA as a percentage of basic and pays arrears for a revision of locked months', async () => {
    const comps = (await get('accountant', '/v1/payroll/components').expect(200)).body as { id: string; code: string }[];
    const c = Object.fromEntries(comps.map((x) => [x.code, x.id]));
    await post('accountant', '/v1/records/salary-components', { code: 'DA', name: 'Dearness allowance', kind: 'earning', calc: 'percent', baseCode: 'BASIC', pfWage: true, taxable: true }).expect(400);
    const da = (await post('accountant', '/v1/records/salary-components', { code: 'DA', name: 'Dearness allowance', kind: 'earning', calc: 'percent', startPercent: 50, baseCode: 'BASIC', pfWage: true, taxable: true }).expect(201)).body;
    daId = da.id;
    expect(da).toMatchObject({ percent: 50, calc: 'percent' });
    await db.update(s.staffProfiles).set({ uan: '100200300400' }).where(eq(s.staffProfiles.userId, ids.teacher2));
    const st = (await put('accountant', `/v1/payroll/structures/${ids.teacher2}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.BASIC, monthlyPaise: 20_000_00 }, { componentId: da.id, monthlyPaise: 1 }, { componentId: c.HRA, monthlyPaise: 8_000_00 }] }).expect(200)).body;
    expect(st.lines.find((l: { code: string }) => l.code === 'DA').monthlyPaise).toBe(10_000_00);
    // September at 50%, approved and locked.
    let run = (await post('accountant', '/v1/payroll/runs', { month: '2026-09' }).expect(201)).body;
    const slip = run.payslips.find((x: { user: { id: string } }) => x.user.id === ids.teacher2);
    expect(slip.earnings).toEqual(expect.arrayContaining([{ code: 'DA', name: 'Dearness allowance', amountPaise: 10_000_00 }]));
    expect(slip.deductions.some((d: { code: string }) => d.code === 'LWF')).toBe(false);
    run = (await post('hr', `/v1/payroll/runs/${run.id}/verify`, { expectedVersion: run.version }).expect(200)).body;
    run = (await post('principal', `/v1/payroll/runs/${run.id}/approve`, { expectedVersion: run.version }).expect(200)).body;
    run = (await post('principal', `/v1/payroll/runs/${run.id}/lock`, { expectedVersion: run.version }).expect(200)).body;
    sepRun = run;
    // DA rises to 55% from September: one month of arrears, waiting for approval, paid in October.
    await post('accountant', `/v1/payroll/components/${c.BASIC}/rates`, { effectiveMonth: '2026-09', percent: 55 }).expect(409);
    const rev = (await post('accountant', `/v1/payroll/components/${daId}/rates`, { effectiveMonth: '2026-09', percent: 55, note: 'Govt order 12/2026', arrearsMonth: '2026-10' }).expect(201)).body;
    expect(rev.arrears).toEqual({ staff: 1, totalPaise: 1_000_00, payMonth: '2026-10' });
    await post('accountant', `/v1/payroll/components/${daId}/rates`, { effectiveMonth: '2026-09', percent: 56 }).expect(409);
    expect((await get('accountant', `/v1/payroll/components/${daId}/rates`).expect(200)).body.rates).toEqual([expect.objectContaining({ effectiveMonth: '2026-09', percent: 55 })]);
    const adj = (await get('accountant', '/v1/records/payroll-adjustments?f.kind=arrear&f.status=pending').expect(200)).body.rows;
    expect(adj).toEqual([expect.objectContaining({ userId: ids.teacher2, amount: 1000, payMonth: '2026-10' })]);
    await bulk('accountant', 'payroll-adjustments', [adj[0].id], 'approve').expect(403);
    expect((await bulk('principal', 'payroll-adjustments', [adj[0].id], 'approve').expect(200)).body.succeeded).toBe(1);
  });

  let octRun: { id: string; version: number };
  it('pays October with the new DA, the arrears and Labour Welfare Fund, then a supplementary run for a late bonus', async () => {
    const settings = (await get('accountant', '/v1/payroll/settings').expect(200)).body;
    expect(settings.lwf).toEqual({ enabled: true, employeePaise: 5000, employerPaise: 10000, months: [12] });
    await put('principal', '/v1/payroll/settings', { ...settings, lwf: { ...settings.lwf, months: [10] } }).expect(200);
    let run = (await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(201)).body;
    const slip = run.payslips.find((x: { user: { id: string } }) => x.user.id === ids.teacher2);
    // One day of loss of pay in October (31 days): DA 55% of the prorated basic.
    const basic = slip.earnings.find((e: { code: string }) => e.code === 'BASIC').amountPaise;
    expect(slip.earnings.find((e: { code: string }) => e.code === 'DA').amountPaise).toBe(Math.round((basic * 0.55) / 100) * 100);
    expect(slip.earnings).toEqual(expect.arrayContaining([{ code: 'ARR', name: 'Arrears', amountPaise: 1_000_00 }]));
    expect(slip.deductions).toEqual(expect.arrayContaining([{ code: 'LWF', name: 'Labour Welfare Fund', amountPaise: 50_00 }]));
    expect(slip.employer.lwfPaise).toBe(100_00);
    run = (await post('hr', `/v1/payroll/runs/${run.id}/verify`, { expectedVersion: run.version }).expect(200)).body;
    run = (await post('principal', `/v1/payroll/runs/${run.id}/approve`, { expectedVersion: run.version }).expect(200)).body;
    const lwfCsv = (await get('accountant', `/v1/payroll/runs/${run.id}/statutory.csv?kind=lwf`).expect(200)).text;
    expect(lwfCsv).toContain('50.00,100.00,150.00');
    const tally = (await get('accountant', `/v1/payroll/runs/${run.id}/tally.xml`).expect(200)).text;
    expect(tally).toContain('Labour Welfare Fund Payable');
    run = (await post('principal', `/v1/payroll/runs/${run.id}/lock`, { expectedVersion: run.version }).expect(200)).body;
    octRun = run;

    // A bonus for October after the lock waits for a supplementary run.
    await post('accountant', '/v1/records/payroll-adjustments', { userId: ids.teacher2, kind: 'bonus', payMonth: '2026-10', amountPaise: 5000, reason: 'Festival bonus' }).expect(409);
    await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(409);
    let supp = (await post('accountant', '/v1/payroll/runs', { month: '2026-10', kind: 'supplementary', note: 'Festival bonus' }).expect(201)).body;
    expect(supp).toMatchObject({ kind: 'supplementary', seq: 2, staffCount: 0 });
    await post('accountant', '/v1/payroll/runs', { month: '2026-10', kind: 'supplementary' }).expect(409);
    const bonus = (await post('accountant', '/v1/records/payroll-adjustments', { userId: ids.teacher2, kind: 'bonus', payMonth: '2026-10', amountPaise: 5000, reason: 'Festival bonus' }).expect(201)).body;
    await bulk('principal', 'payroll-adjustments', [bonus.id], 'approve').expect(200);
    supp = (await post('accountant', `/v1/payroll/runs/${supp.id}/recompute`, { expectedVersion: supp.version }).expect(200)).body;
    expect(supp.payslips).toHaveLength(1);
    const bs = supp.payslips[0];
    expect(bs.earnings).toEqual([{ code: 'BONUS', name: 'Bonus', amountPaise: 5_000_00 }]);
    expect(bs.deductions.map((d: { code: string }) => d.code)).not.toContain('PT');
    expect(bs.deductions.map((d: { code: string }) => d.code)).not.toContain('LWF');
    supp = (await post('hr', `/v1/payroll/runs/${supp.id}/verify`, { expectedVersion: supp.version }).expect(200)).body;
    supp = (await post('principal', `/v1/payroll/runs/${supp.id}/approve`, { expectedVersion: supp.version }).expect(200)).body;
    supp = (await post('principal', `/v1/payroll/runs/${supp.id}/lock`, { expectedVersion: supp.version }).expect(200)).body;

    // Reversal: the later run first; the released bonus waits for the next run of the month.
    await post('principal', `/v1/payroll/runs/${octRun.id}/reverse`, { expectedVersion: octRun.version, reason: 'Wrong attendance' }).expect(409);
    await post('hr', `/v1/payroll/runs/${supp.id}/reverse`, { expectedVersion: supp.version, reason: 'Paid twice' }).expect(403);
    const rv = (await post('principal', `/v1/payroll/runs/${supp.id}/reverse`, { expectedVersion: supp.version, reason: 'Paid twice by mistake' }).expect(200)).body;
    expect(rv).toMatchObject({ status: 'reversed', reversalReason: 'Paid twice by mistake' });
    expect((await get('accountant', `/v1/records/payroll-adjustments/${bonus.id}`).expect(200)).body.runId).toBeNull();
    await get('accountant', `/v1/payroll/runs/${supp.id}/bank-transfer.csv`).expect(409);
    const again = (await post('accountant', '/v1/payroll/runs', { month: '2026-10', kind: 'supplementary' }).expect(201)).body;
    expect(again).toMatchObject({ seq: 2, staffCount: 1 });
  });

  it('writes the PF ECR file and Form 24Q from locked runs', async () => {
    const ecr = (await get('accountant', `/v1/payroll/runs/${sepRun.id}/ecr.txt`).expect(200)).text;
    const fields = ecr.split('#~#');
    expect(fields[0]).toBe('100200300400');
    expect(fields).toHaveLength(11);
    expect(fields[3]).toBe('15000'); // EPF wage capped at the ceiling (basic 20,000 + DA 10,000)
    await get('teacher', `/v1/payroll/runs/${sepRun.id}/ecr.txt`).expect(403);
    await post('accountant', '/v1/records/tds-challans', { payMonth: '2026-09', bsrCode: '0510308', challanSerial: '00042', depositedOn: '2026-10-07', tdsPaise: 1000 }).expect(201);
    const q2 = (await get('accountant', '/v1/payroll/24q.csv?fy=2026&quarter=2').expect(200)).text;
    expect(q2.split('\r\n')[0]).toContain('PAN of the Employee');
    expect(q2).toContain('0510308');
    expect(q2).toContain('2026-09-30');
    await get('accountant', '/v1/payroll/24q.csv?fy=2026&quarter=2&annexure=2').expect(400);
    const a2 = (await get('accountant', '/v1/payroll/24q.csv?fy=2026&quarter=4&annexure=2').expect(200)).text;
    expect(a2).toContain('Gross Salary');
    expect((await get('accountant', '/v1/records/tds-challans').expect(200)).body.rows[0]).toMatchObject({ financialYear: '2026-27', tds: 1000 });
  });

  it('runs loans, increments and promotions through the record kit', async () => {
    const loan = (await post('teacher2', '/v1/records/staff-loans', { kind: 'loan', amountPaise: 12000, installments: 3, startMonth: '2026-11', purpose: 'Medical expenses' }).expect(201)).body;
    expect(loan).toMatchObject({ userId: ids.teacher2, status: 'pending', emi: 4000 });
    expect((await get('teacher', '/v1/records/staff-loans').expect(200)).body.total).toBe(0);
    await bulk('teacher2', 'staff-loans', [loan.id], 'approve').expect(403);
    expect((await bulk('principal', 'staff-loans', [loan.id], 'approve').expect(200)).body.succeeded).toBe(1);
    expect((await get('accountant', `/v1/records/payroll-adjustments?f.loans=only&f.user=${ids.teacher2}`).expect(200)).body.total).toBe(3);
    await http().delete(`/v1/records/staff-loans/${loan.id}`).set(auth('principal')).expect(403);
    expect((await bulk('principal', 'staff-loans', [loan.id], 'close', { note: 'Repaid in cash' }).expect(200)).body.succeeded).toBe(1);
    expect((await get('accountant', `/v1/records/staff-loans/${loan.id}`).expect(200)).body).toMatchObject({ status: 'closed', closeNote: 'Repaid in cash' });
    expect((await get('accountant', `/v1/records/payroll-adjustments?f.loans=only&f.user=${ids.teacher2}`).expect(200)).body.total).toBe(0);

    await bulk('hr', 'staff', [ids.teacher2], 'increment', { effectiveFrom: '2026-11-01', percent: 3 }).expect(403);
    await bulk('principal', 'staff', [ids.teacher2], 'increment', { effectiveFrom: '2026-11-01', percent: 3, amountRupees: 500 }).expect(400);
    const inc = (await bulk('principal', 'staff', [ids.teacher2, ids.teacher], 'increment', { effectiveFrom: '2026-11-01', percent: 3 }).expect(200)).body;
    expect(inc).toMatchObject({ succeeded: 1, failed: 1 });
    const str = (await get('accountant', `/v1/payroll/structures/${ids.teacher2}`).expect(200)).body;
    expect(str.history[0]).toMatchObject({ effectiveFrom: '2026-11-01' });
    expect(str.history[0].lines.find((l: { code: string }) => l.code === 'BASIC').monthlyPaise).toBe(20_600_00);
    const prom = (await bulk('hr', 'staff', [ids.teacher2], 'promote', { designationId: ids.designation, effectiveOn: '2026-10-20', orderNo: 'HR/PRO/7', note: 'Ph.D. awarded' }).expect(200)).body;
    expect(prom.succeeded).toBe(1);
    expect((await get('hr', `/v1/hr/staff/${ids.teacher2}`).expect(200)).body.designation).toMatchObject({ id: ids.designation });
    const book = (await get('hr', `/v1/hr/staff/${ids.teacher2}/service-book`).expect(200)).body as { kind: string; orderNo: string | null }[];
    expect(book.filter((b) => ['increment', 'promotion'].includes(b.kind)).length).toBeGreaterThanOrEqual(2);
  });

  it('takes leave encashment requests on the record kit and pays approved ones through payroll', async () => {
    const types = (await get('hr', '/v1/records/leave-types?f.kind=regular').expect(200)).body.rows as { id: string; code: string }[];
    const el = types.find((x) => x.code === 'EL')!;
    await patch('hr', `/v1/records/leave-types/${el.id}`, { encashable: true }).expect(200);
    const meta = (await get('teacher2', '/v1/records/leave-encashments/meta').expect(200)).body;
    expect(meta.can.create).toBe(true);
    expect(meta.fields.find((f: { key: string }) => f.key === 'leaveTypeId').options.map((o: { value: string }) => o.value)).toEqual([el.id]);
    await post('teacher2', '/v1/records/leave-encashments', { userId: ids.teacher, leaveTypeId: el.id, days: 1, payMonth: '2026-11' }).expect(400);
    await post('teacher2', '/v1/records/leave-encashments', { leaveTypeId: el.id, days: 40, payMonth: '2026-11' }).expect(400);
    const req = (await post('teacher2', '/v1/records/leave-encashments', { leaveTypeId: el.id, days: 2, payMonth: '2026-11' }).expect(201)).body;
    expect(req).toMatchObject({ userId: ids.teacher2, status: 'pending', days: 2 });
    expect(req.amount).toBeGreaterThan(0);
    expect((await get('teacher', '/v1/records/leave-encashments').expect(200)).body.total).toBe(0);
    await bulk('teacher2', 'leave-encashments', [req.id], 'approve').expect(403);
    await bulk('principal', 'leave-encashments', [req.id], 'reject', { note: '' }).expect(400);
    expect((await bulk('principal', 'leave-encashments', [req.id], 'approve', { note: 'Approved' }).expect(200)).body.succeeded).toBe(1);
    const adj = (await get('accountant', `/v1/records/payroll-adjustments?f.kind=encashment&f.user=${ids.teacher2}`).expect(200)).body;
    expect(adj.rows).toEqual([expect.objectContaining({ payMonth: '2026-11', status: 'approved', amount: req.amount })]);
    expect((await http().delete(`/v1/records/leave-encashments/${req.id}`).set(auth('teacher2'))).status).toBe(403);
  });

  it('reports staff by category and cadre, the NAAC faculty list, SFR, publications, PT return and LWF', async () => {
    await db.update(s.staffProfiles).set({ staffCategory: 'teaching', cadre: 'assistant_professor' }).where(eq(s.staffProfiles.userId, ids.teacher2));
    const cadre = (await get('hr', '/v1/hr/reports/faculty-cadre').expect(200)).body;
    expect(cadre.rows).toEqual(expect.arrayContaining([expect.objectContaining({ department: 'Commerce', assistant: 3, meetsRatio: 'No' })]));
    const cat = (await get('hr', '/v1/hr/reports/staff-category').expect(200)).body;
    expect(cat.columns).toContain('obc');
    expect(cat.rows.reduce((n: number, r: { obc: number }) => n + r.obc, 0)).toBe(1);
    const naac = (await get('hr', '/v1/hr/reports/naac-faculty?fy=2026').expect(200)).body;
    expect(naac.rows.find((r: { code: string }) => r.code === 'E100')).toMatchObject({ phd: 'Yes', netSet: 'NET', publications: 2, highestQualification: '' });
    const sfr = (await get('hr', '/v1/hr/reports/sfr').expect(200)).body;
    expect(sfr.rows.at(-1)).toMatchObject({ programme: 'Institution', students: 3 });
    const pubs = (await get('hr', '/v1/hr/reports/publications?fy=2025').expect(200)).body;
    expect(pubs.rows.length).toBe(2);
    const pt = (await get('accountant', '/v1/hr/reports/pt-return?month=2026-09').expect(200)).body;
    expect(pt.rows.reduce((n: number, r: { employees: number }) => n + r.employees, 0)).toBe(1);
    const lwf = (await get('accountant', '/v1/hr/reports/lwf?month=2026-10').expect(200)).body;
    expect(lwf.rows).toEqual([expect.objectContaining({ lwfPaise: 5000, lwfEmployerPaise: 10000 })]);
    await get('teacher', '/v1/hr/reports/naac-faculty').expect(403);
  });

  it('keeps training, the service book, onboarding, delegations, transfers and payroll runs on the record kit', async () => {
    const tr = (await post('teacher', '/v1/records/training-records', { title: 'FDP on outcome-based education', kind: 'fdp', startsOn: '2026-06-01', endsOn: '2026-06-05', hours: 30 }).expect(201)).body;
    expect(tr).toMatchObject({ userId: ids.teacher, verified: false });
    expect((await bulk('hr', 'training-records', [tr.id], 'verify').expect(200)).body.succeeded).toBe(1);
    expect((await get('teacher2', '/v1/records/training-records').expect(200)).body.total).toBe(0);
    expect((await get('hr', '/v1/records/training-records?f.fy=2026').expect(200)).body.total).toBe(1);

    const entry = (await post('hr', '/v1/records/service-book', { userId: ids.teacher2, kind: 'award', onDate: '2026-09-05', title: 'Best teacher award', orderNo: 'AW/2026/3' }).expect(201)).body;
    await patch('hr', `/v1/records/service-book/${entry.id}`, { title: 'Best teacher award 2026' }).expect(200);
    expect((await get('hr', `/v1/records/service-book/${entry.id}/history`).expect(200)).body.items[0].changes).toEqual([expect.objectContaining({ field: 'title', after: 'Best teacher award 2026' })]);
    await post('teacher', '/v1/records/service-book', { userId: ids.teacher2, kind: 'award', onDate: '2026-09-05', title: 'Me' }).expect(403);

    const items = (await get('hr', '/v1/records/onboarding-items?f.done=no').expect(200)).body;
    expect(items.total).toBeGreaterThan(0);
    expect((await bulk('hr', 'onboarding-items', [items.rows[0].id], 'done').expect(200)).body.succeeded).toBe(1);

    const del = (await post('teacher', '/v1/records/delegations', { delegateId: ids.teacher2, scope: 'leave', startsOn: '2026-10-21', endsOn: '2026-10-25', reason: 'Conference' }).expect(201)).body;
    expect(del).toMatchObject({ delegatorId: ids.teacher, state: 'upcoming' });
    expect((await get('teacher2', '/v1/records/delegations?f.mine=received').expect(200)).body.total).toBeGreaterThan(0);
    await http().delete(`/v1/records/delegations/${del.id}`).set(auth('teacher')).expect(403);
    await bulk('teacher', 'delegations', [del.id], 'revoke').expect(200);
    await http().delete(`/v1/records/delegations/${del.id}`).set(auth('teacher')).expect(200);

    const tf = (await get('hr', '/v1/records/staff-transfers?f.kind=promotion').expect(200)).body;
    expect(tf.rows[0]).toMatchObject({ userId: ids.teacher2, status: 'applied' });
    await http().delete(`/v1/records/staff-transfers/${tf.rows[0].id}`).set(auth('hr')).expect(403);

    const runs = (await get('accountant', '/v1/records/payroll-runs?f.fy=2026').expect(200)).body;
    expect(runs.rows.map((r: { month: string; kind: string; status: string }) => `${r.month} ${r.kind} ${r.status}`)).toEqual(expect.arrayContaining(['2026-10 regular locked', '2026-10 supplementary reversed', '2026-09 regular locked']));
    const locked = runs.rows.find((r: { status: string }) => r.status === 'locked');
    await http().delete(`/v1/records/payroll-runs/${locked.id}`).set(auth('accountant')).expect(403);
    const draft = runs.rows.find((r: { status: string }) => r.status === 'draft');
    await http().delete(`/v1/records/payroll-runs/${draft.id}`).set(auth('accountant')).expect(200);
    expect((await get('outsider', '/v1/records/payroll-runs').expect(200)).body.total).toBe(0);
    expect((await get('hr', '/v1/records/appraisal-cycles').expect(200)).body.rows[0]).toMatchObject({ period: '2026-27', finalised: 1 });
  });

  it('issues the experience certificate once the employee is relieved', async () => {
    const [sep] = await db.insert(s.separations).values({ tenantId: t.tenantId, userId: ids.hod, resignedOn: '2026-08-01', lastWorkingDay: '2026-08-31', reason: 'Moving abroad', status: 'accepted' }).returning();
    await get('hr', `/v1/hr/separations/${sep.id}/experience-certificate`).expect(409);
    await db.update(s.separations).set({ status: 'relieved', relievedOn: '2026-08-31' }).where(eq(s.separations.id, sep.id));
    const pdf = await get('hr', `/v1/hr/separations/${sep.id}/experience-certificate?duties=taught Commerce to undergraduate classes`).buffer(true).parse(binary).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher', `/v1/hr/separations/${sep.id}/experience-certificate`).expect(403);
  });
});
