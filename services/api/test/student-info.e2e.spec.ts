import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aadhaarValid } from '../src/students/student-info.logic.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** A valid Aadhaar number (Verhoeff check digit) from an 11-digit start. */
const aadhaar = (base: string) => {
  for (let d = 0; d < 10; d++) if (aadhaarValid(`${base}${d}`)) return `${base}${d}`;
  throw new Error('no check digit');
};

/**
 * Student information beyond the roll: profile details with Aadhaar masking and duplicate checks, custom fields with
 * field-level permissions, change requests from students and parents, no-dues clearances, roll numbers and section
 * reshuffles, promotion eligibility, the registers, the guardian and student kit lists, and tenant isolation.
 */
describe('student information', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  let A: string;
  let B: string;
  let C: string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    [A, B, C] = t.students.map((s) => s.id);
    // An accountant reads profiles but does not change them.
    const acct = (await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select $1, 'Accounts', $2, password_hash from users where id = $3 returning id`, [t.tenantId, `acct-${t.slug}@x.in`, t.principal.id])).rows[0].id;
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'accountant')`, [t.tenantId, acct]);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.accountant = await login(t.slug, `acct-${t.slug}@x.in`);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps profile details with checks, masks Aadhaar, refuses a second student with the same number, and records the history', async () => {
    const first = (await http().get(`/v1/students/${A}/details`).set(as('principal')).expect(200)).body;
    expect(first).toMatchObject({ studentId: A, canEdit: true, aadhaar: null, siblings: [] });
    expect(first.fields.map((f: { key: string }) => f.key)).toContain('apaarId');

    const bad = (await http().put(`/v1/students/${A}/details`).set(as('principal')).send({ values: { penNo: '12', gender: 'robot' } }).expect(400)).body;
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(['gender', 'penNo']);
    await http().put(`/v1/students/${A}/details`).set(as('principal')).send({ aadhaar: '1234 5678 9012' }).expect(400);

    const number = aadhaar('23456789012');
    const saved = (await http().put(`/v1/students/${A}/details`).set(as('principal')).send({ values: { dateOfBirth: '2006-05-14', gender: 'Female', category: 'obc', religion: 'Hindu', admissionNo: 'ADM/2026/001', apaarId: '123456789012', pincode: '570001' }, aadhaar: number }).expect(200)).body;
    expect(saved.aadhaar).toBe(`XXXX XXXX ${number.slice(-4)}`);
    expect(saved.fields.find((f: { key: string }) => f.key === 'gender').value).toBe('female');
    expect(saved.fields.find((f: { key: string }) => f.key === 'apaarId').value).toBe('123456789012');
    expect((await owner.query(`select aadhaar_last4, aadhaar_hash from student_profiles where student_id = $1`, [A])).rows[0].aadhaar_hash).not.toContain(number);

    const dup = (await http().put(`/v1/students/${B}/details`).set(as('principal')).send({ aadhaar: number }).expect(400)).body;
    expect(dup.message).toBe('Another student already has this Aadhaar number');
    await http().put(`/v1/students/${B}/details`).set(as('principal')).send({ values: { admissionNo: 'ADM/2026/001' } }).expect(409);
    // Readers who may not change details are refused; another institution sees nothing.
    await http().put(`/v1/students/${A}/details`).set(as('accountant')).send({ values: { religion: 'x' } }).expect(403);
    await http().get(`/v1/students/${A}/details`).set(as('teacher')).expect(403);
    await http().get(`/v1/students/${A}/details`).set(as('outsider')).expect(404);

    const h = (await http().get(`/v1/records/students/${A}/history`).set(as('principal')).expect(200)).body;
    const entry = h.items.find((i: { action: string }) => i.action === 'student.details_updated');
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'gender', label: 'Gender', before: null, after: 'female' }, { field: 'aadhaar', label: 'aadhaar', before: null, after: `XXXX XXXX ${number.slice(-4)}` }]));
  });

  it('adds custom fields (record kit) with who may see and change them', async () => {
    const meta = (await http().get('/v1/records/student-custom-fields/meta').set(as('principal')).expect(200)).body;
    expect(meta.can).toMatchObject({ write: true, reorder: true, import: true });
    const house = (await http().post('/v1/records/student-custom-fields').set(as('principal')).send({ label: 'House', key: 'house', type: 'select', options: 'Red, Blue, Green' }).expect(201)).body;
    expect(house).toMatchObject({ key: 'house', optionsText: 'Red, Blue, Green', sortOrder: 10 });
    await http().post('/v1/records/student-custom-fields').set(as('principal')).send({ label: 'Secret', key: 'secret note', type: 'text' }).expect(400);
    const secret = (await http().post('/v1/records/student-custom-fields').set(as('principal')).send({ label: 'Counselling note', key: 'counselling_note', type: 'text', viewRoles: 'principal', editRoles: 'principal' }).expect(201)).body;
    await http().post('/v1/records/student-custom-fields').set(as('principal')).send({ label: 'Bad', key: 'bad', type: 'text', viewRoles: 'janitor' }).expect(400);
    await http().post('/v1/records/student-custom-fields/reorder').set(as('principal')).send({ ids: [secret.id, house.id] }).expect(200);

    await http().put(`/v1/students/${A}/details`).set(as('principal')).send({ custom: { house: 'blue', counselling_note: 'Doing well' } }).expect(200);
    const mine = (await http().get(`/v1/students/${A}/details`).set(as('principal')).expect(200)).body;
    expect(mine.custom.map((c: { key: string; value: unknown }) => [c.key, c.value])).toEqual([['counselling_note', 'Doing well'], ['house', 'Blue']]);
    const acct = (await http().get(`/v1/students/${A}/details`).set(as('accountant')).expect(200)).body;
    expect(acct.custom.map((c: { key: string }) => c.key)).toEqual(['house']);
    await http().put(`/v1/students/${A}/details`).set(as('principal')).send({ custom: { house: 'Purple' } }).expect(400);
    // Another institution's lists are its own.
    expect((await http().get('/v1/records/student-custom-fields').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('takes change requests from the student and parents, and applies the approved ones', async () => {
    // Student C asks for their date of birth; the parent of A asks for the address; a stranger cannot ask about A.
    const fromStudent = (await http().post(`/v1/students/${C}/change-requests`).set(as('student')).send({ field: 'dateOfBirth', newValue: '2006-01-31', reason: 'Matches the birth certificate' }).expect(201)).body;
    expect(fromStudent).toMatchObject({ requestedAs: 'student', status: 'pending', currentValue: null, newValue: '2006-01-31' });
    await http().post(`/v1/students/${C}/change-requests`).set(as('student')).send({ field: 'dateOfBirth', newValue: '2006-02-01', reason: 'Again' }).expect(409);
    await http().post(`/v1/students/${C}/change-requests`).set(as('student')).send({ field: 'admissionNo', newValue: 'X1', reason: 'Mine' }).expect(400);
    const fromParent = (await http().post(`/v1/students/${A}/change-requests`).set(as('parent')).send({ field: 'addressLine', newValue: '12 MG Road', reason: 'We moved' }).expect(201)).body;
    await http().post(`/v1/students/${B}/change-requests`).set(as('parent')).send({ field: 'addressLine', newValue: 'x road', reason: 'Not mine' }).expect(404);
    await http().post(`/v1/students/${A}/change-requests`).set(as('parent')).send({ field: 'gender', newValue: 'female', reason: 'Same' }).expect(400);
    expect((await http().get('/v1/student-change-requests/mine').set(as('parent')).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([fromParent.id]);

    const list = (await http().get('/v1/records/student-change-requests?f.status=pending').set(as('principal')).expect(200)).body;
    expect(list.total).toBe(2);
    const approved = (await http().post('/v1/records/student-change-requests/bulk').set(as('principal')).send({ op: 'action', action: 'approve', target: { ids: [fromStudent.id] }, params: {} }).expect(200)).body;
    expect(approved).toMatchObject({ succeeded: 1, rows: [{ ok: true, message: 'Date of birth: 2006-01-31' }] });
    expect((await owner.query(`select date_of_birth::text as d from student_profiles where student_id = $1`, [C])).rows[0].d).toBe('2006-01-31');
    const noNote = (await http().post('/v1/records/student-change-requests/bulk').set(as('principal')).send({ op: 'action', action: 'reject', target: { ids: [fromParent.id] }, params: {} }).expect(400)).body;
    expect(JSON.stringify(noNote)).toContain('Say why');
    await http().post(`/v1/student-change-requests/${fromParent.id}/decide`).set(as('principal')).send({ decision: 'reject', note: 'Send the new address proof' }).expect(200);
    const note = (await owner.query(`select title from notifications where user_id = $1 and dedupe_key = $2`, [t.guardian.id, `change-request:${fromParent.id}`])).rows[0];
    expect(note.title).toBe('Your change to Address was not approved');
    await http().post(`/v1/student-change-requests/${fromParent.id}/decide`).set(as('principal')).send({ decision: 'approve' }).expect(400);
    // The requester may withdraw a waiting request; others may not.
    const again = (await http().post(`/v1/students/${A}/change-requests`).set(as('parent')).send({ field: 'city', newValue: 'Mysuru', reason: 'We moved' }).expect(201)).body;
    await http().post(`/v1/student-change-requests/${again.id}/cancel`).set(as('student')).expect(404);
    await http().post(`/v1/student-change-requests/${again.id}/cancel`).set(as('parent')).expect(200);
  });

  it('runs a no-dues clearance: the system checks what it can, departments sign off the rest', async () => {
    await owner.query(
      `insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, paid_paise, due_on, created_by) values ($1, $2, $3, gen_random_uuid(), 'Sem 3 tuition', 2500000, 500000, '2026-09-01', $4)`,
      [t.tenantId, B, t.section.id, t.principal.id],
    );
    const c = (await http().post(`/v1/students/${B}/clearances`).set(as('principal')).send({ purpose: 'tc' }).expect(201)).body;
    const byDept = Object.fromEntries(c.items.map((i: { department: string; status: string }) => [i.department, i.status]));
    expect(byDept).toEqual({ fees: 'blocked', library: 'cleared', hostel: 'cleared', transport: 'cleared', lab: 'pending', sports: 'pending' });
    expect(c.items.find((i: { department: string }) => i.department === 'fees')).toMatchObject({ duesPaise: 2000000, finding: 'Rs 20,000 due on 1 invoice' });
    await http().post(`/v1/students/${B}/clearances`).set(as('principal')).send({ purpose: 'tc' }).expect(409);

    const lab = c.items.find((i: { department: string }) => i.department === 'lab');
    await http().post(`/v1/student-clearance-items/${lab.id}/decide`).set(as('accountant')).send({ status: 'cleared' }).expect(403);
    await http().post(`/v1/student-clearance-items/${lab.id}/decide`).set(as('principal')).send({ status: 'blocked' }).expect(400);
    for (const d of ['lab', 'sports']) await http().post(`/v1/student-clearance-items/${c.items.find((i: { department: string }) => i.department === d).id}/decide`).set(as('principal')).send({ status: 'cleared' }).expect(200);
    expect((await http().get(`/v1/student-clearances/${c.id}`).set(as('accountant')).expect(200)).body.status).toBe('open');

    await owner.query(`update fee_invoices set paid_paise = amount_paise, status = 'paid' where student_id = $1`, [B]);
    const rechecked = (await http().post('/v1/records/student-clearances/bulk').set(as('principal')).send({ op: 'action', action: 'recheck', target: { ids: [c.id] } }).expect(200)).body;
    expect(rechecked.succeeded).toBe(1);
    const done = (await http().get(`/v1/student-clearances/${c.id}`).set(as('principal')).expect(200)).body;
    expect(done).toMatchObject({ status: 'cleared', completedAt: expect.any(String) });
    const listed = (await http().get('/v1/records/student-clearances?f.status=cleared').set(as('principal')).expect(200)).body;
    expect(listed.rows[0]).toMatchObject({ studentName: 'Student B', cleared: 6, total: 6 });
    // Raised in bulk from the students list too.
    const bulk = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'action', action: 'clearance', target: { ids: [A] }, params: { purpose: 'course_completion' } }).expect(200)).body;
    expect(bulk.rows[0]).toMatchObject({ ok: true, message: 'Waiting on Laboratories, Sports and stores' });
  });

  it('renumbers a class by a rule and shares students out between sections', async () => {
    await http().put(`/v1/students/${B}/details`).set(as('principal')).send({ values: { gender: 'male' } }).expect(200);
    await http().put(`/v1/students/${C}/details`).set(as('principal')).send({ values: { gender: 'female' } }).expect(200);
    const plan = (await http().post('/v1/students/roll-numbers').set(as('principal')).send({ sectionId: t.section.id, order: 'gender', prefix: 'B3A', start: 1, width: 2 }).expect(200)).body;
    expect(plan).toMatchObject({ dryRun: true, changed: 3 });
    expect(plan.plan.map((x: { fullName: string; to: string }) => `${x.to} ${x.fullName}`)).toEqual(['B3A01 Student A', 'B3A02 Student C', 'B3A03 Student B']);
    await http().post('/v1/students/roll-numbers').set(as('teacher')).send({ sectionId: t.section.id, order: 'alphabetic' }).expect(403);
    await http().post('/v1/students/roll-numbers').set(as('principal')).send({ sectionId: t.section.id, order: 'gender', prefix: 'B3A', start: 1, width: 2, dryRun: false }).expect(200);
    expect((await owner.query(`select roll_no from students where section_id = $1 order by roll_no`, [t.section.id])).rows.map((r: { roll_no: string }) => r.roll_no)).toEqual(['B3A01', 'B3A02', 'B3A03']);
    const hist = (await http().get(`/v1/records/students/${C}/history`).set(as('principal')).expect(200)).body.items[0];
    expect(hist).toMatchObject({ action: 'student.roll_renumbered', changes: [{ field: 'rollNo', before: 'R3', after: 'B3A02' }] });

    const dry = (await http().post('/v1/students/rebalance').set(as('principal')).send({ sectionIds: [t.section.id, t.otherSection.id], mode: 'balanced' }).expect(200)).body;
    expect(dry.sizes.map((s: { after: number }) => s.after)).toEqual([2, 1]);
    const real = (await http().post('/v1/students/rebalance').set(as('principal')).send({ sectionIds: [t.section.id, t.otherSection.id], mode: 'balanced', dryRun: false, reason: 'New section opened' }).expect(200)).body;
    expect(real.moves).toHaveLength(1);
    expect((await owner.query(`select count(*)::int as n from student_lifecycle_events where kind = 'section' and reason = 'New section opened' and tenant_id = $1`, [t.tenantId])).rows[0].n).toBe(1);
    await http().post('/v1/students/rebalance').set(as('principal')).send({ sectionIds: [t.section.id], mode: 'balanced' }).expect(400);
  });

  it('lists who is held back from promotion by attendance and fees, and moves a long absentee back', async () => {
    const [sec] = (await owner.query(`select section_id from students where id = $1`, [A])).rows;
    for (const [i, status] of ['present', 'absent', 'absent', 'absent'].entries())
      await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at) values ($1, $2, $3, $4, $5, $6, now())`, [t.tenantId, A, sec.section_id, `2026-09-0${i + 1}`, status, t.teacher.id]);
    const el = (await http().get(`/v1/students/promotions/eligibility?sectionId=${sec.section_id}&minAttendancePct=75`).set(as('principal')).expect(200)).body;
    const a = el.students.find((s: { studentId: string }) => s.studentId === A);
    expect(a).toMatchObject({ attendancePct: 25, eligible: false, reasons: ['Attendance 25% is below 75%'] });

    await http().post(`/v1/students/${A}/status`).set(as('principal')).send({ status: 'long_absent' }).expect(400); // needs a reason
    await http().post(`/v1/students/${A}/status`).set(as('principal')).send({ status: 'long_absent', reason: 'Absent for six weeks, not reachable' }).expect(200);
    await http().post(`/v1/students/${A}/status`).set(as('principal')).send({ status: 'active', reason: 'Came back' }).expect(200);
  });

  it('builds the registers and statements', async () => {
    const strength = (await http().get('/v1/students/reports/strength').set(as('principal')).expect(200)).body;
    const total = strength.reduce((n: number, r: { total: number }) => n + r.total, 0);
    expect(total).toBe(3);
    expect(strength.reduce((n: number, r: { female: number }) => n + r.female, 0)).toBe(2);
    expect(strength.reduce((n: number, r: { obc: number }) => n + r.obc, 0)).toBe(1);
    const religion = (await http().get('/v1/students/reports/religion').set(as('principal')).expect(200)).body;
    expect(religion).toEqual(expect.arrayContaining([expect.objectContaining({ religion: 'Hindu', total: 1 })]));
    const ages = (await http().get('/v1/students/reports/age?on=2026-10-14').set(as('principal')).expect(200)).body;
    expect(ages).toEqual([{ band: '18-22', total: 2, male: 0, female: 2, other: 0 }, { band: 'Date of birth not given', total: 1, male: 1, female: 0, other: 0 }]);
    const missing = (await http().get('/v1/students/reports/missing').set(as('principal')).expect(200)).body;
    expect(missing.find((m: { studentId: string }) => m.studentId === A).missing).toBe('Address');
    await http().post(`/v1/students/${B}/status`).set(as('principal')).send({ status: 'dropped', reason: 'Family moved away' }).expect(200);
    const drop = (await http().get('/v1/students/reports/dropouts').set(as('principal')).expect(200)).body;
    expect(drop.map((d: { fullName: string; status: string }) => `${d.fullName} ${d.status}`)).toEqual(expect.arrayContaining(['Student B dropped', 'Student A long_absent']));
    expect((await http().get('/v1/students/reports/tc-register').set(as('principal')).expect(200)).body).toEqual([]);
    await http().get('/v1/students/reports/nope').set(as('principal')).expect(400);
    expect((await http().get('/v1/students/reports/strength').set(as('outsider')).expect(200)).body.reduce((n: number, r: { total: number }) => n + r.total, 0)).toBe(3);
  });

  it('lists guardian links with brothers and sisters, edits them and imports families', async () => {
    // The father of A is also the father of C: brothers and sisters.
    await owner.query(`insert into guardians (tenant_id, user_id, student_id, relation) values ($1, $2, $3, 'father')`, [t.tenantId, t.guardian.id, C]);
    const sib = (await http().get(`/v1/students/${A}/siblings`).set(as('principal')).expect(200)).body;
    expect(sib.map((s: { id: string }) => s.id)).toEqual([C]);
    const list = (await http().get('/v1/records/guardian-links?f.siblings=yes').set(as('principal')).expect(200)).body;
    expect(list.total).toBe(2);
    const linkC = list.rows.find((r: { studentId: string }) => r.studentId === C);
    const edited = (await http().patch(`/v1/records/guardian-links/${linkC.id}`).set(as('principal')).send({ relation: 'guardian', isPrimary: true }).expect(200)).body;
    expect(edited).toMatchObject({ relation: 'guardian', isPrimary: true });
    // The only guardian of a student cannot be deleted.
    await http().delete(`/v1/records/guardian-links/${linkC.id}`).set(as('principal')).expect(403);

    const roll = (await owner.query(`select roll_no from students where id = $1`, [A])).rows[0].roll_no;
    const csv = `Student roll number,Guardian name,Guardian phone,Relation,Primary contact\r\n${roll},Sunita Rao,9811100077,mother,no\r\nZZ9,Nobody,9811100078,father,\r\n`;
    const check = (await http().post('/v1/records/guardian-links/import').set(as('principal')).attach('file', Buffer.from(csv), 'g.csv').expect(200)).body;
    expect(check.rows.map((r: { status: string }) => r.status)).toEqual(['created', 'error']);
    await http().post(`/v1/records/guardian-links/import/${check.id}/commit`).set(as('principal')).send({ skipErrors: true }).expect(200);
    expect((await http().get('/v1/records/guardian-links?q=Sunita').set(as('principal')).expect(200)).body.rows[0]).toMatchObject({ relation: 'mother', phone: '+919811100077', studentId: A });
    // With a second guardian, the father's link can go to the bin.
    const fatherA = list.rows.find((r: { studentId: string }) => r.studentId === A);
    await http().delete(`/v1/records/guardian-links/${fatherA.id}`).set(as('principal')).expect(200);
    await http().get('/v1/records/guardian-links').set(as('teacher')).expect(403);
  });

  it('gives admission numbers from the series, filters and edits profile details from the students list, and imports them', async () => {
    const missing = (await http().get('/v1/records/students?f.admissionNo=missing').set(as('principal')).expect(200)).body;
    expect(missing.total).toBe(2);
    const given = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'action', action: 'admissionNo', target: { all: true, query: { filters: { admissionNo: 'missing' } } } }).expect(200)).body;
    expect(given.rows.map((r: { message: string }) => r.message).sort()).toEqual(['ADM-0001', 'ADM-0002']);
    const edit = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'update', target: { ids: [B, C] }, fields: { category: 'sc' } }).expect(200)).body;
    expect(edit.succeeded).toBe(2);
    expect((await http().get('/v1/records/students?f.category=sc').set(as('principal')).expect(200)).body.total).toBe(2);
    await http().patch(`/v1/records/students/${A}`).set(as('principal')).send({ registerNo: 'U19BC001' }).expect(200);
    expect((await http().get('/v1/records/students?q=U19BC001').set(as('principal')).expect(200)).body.rows[0]).toMatchObject({ id: A, registerNo: 'U19BC001' });

    const csv = 'Roll number,Full name,Class,Guardian 1 name,Guardian 1 phone,Guardian 1 relation,Admission number,Date of birth,Gender,Category\r\nR21,Neha Patil,BCom Sem 3 A,Vijay Patil,+919811100091,father,ADM/X/9,2007-03-02,Female,EWS\r\n';
    const check = (await http().post('/v1/records/students/import').set(as('principal')).attach('file', Buffer.from(csv), 's.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 1, error: 0 });
    await http().post(`/v1/records/students/import/${check.id}/commit`).set(as('principal')).send({}).expect(200);
    expect((await http().get('/v1/records/students?q=Neha').set(as('principal')).expect(200)).body.rows[0]).toMatchObject({ admissionNo: 'ADM/X/9', gender: 'female', category: 'ews', dateOfBirth: '2007-03-02' });
  });
});
