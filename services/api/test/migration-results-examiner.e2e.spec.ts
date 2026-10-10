import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type OtpSms, SmsSender } from '../src/auth/sms-sender.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import argon2 from 'argon2';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

class FakeSms extends SmsSender {
  sent: OtpSms[] = [];
  async sendOtp(sms: OtpSms): Promise<void> {
    this.sent.push(sms);
  }
}

describe('data migration, university formats, academic documents, external examiner', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const sms = new FakeSms();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let admin: string;
  let student: string;
  let teacher: string;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const A = () => ({ authorization: `Bearer ${admin}` });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(SmsSender).useValue(sms));
    admin = await login(t.principal.email!);
    student = await login(t.studentUser.email!);
    teacher = await login(t.teacher.email!);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const csv = (text: string) => Buffer.from(text, 'utf8');
  const run = (entity: string, file: string, mapping: object, dryRun: boolean, name = 'x.csv') =>
    http().post(`/v1/admin/data-migration/${entity}/run`).set(A()).field('mapping', JSON.stringify(mapping)).field('dryRun', String(dryRun)).attach('file', csv(file), name);

  it('previews headings and suggests a mapping', async () => {
    const r = await http().post('/v1/admin/data-migration/students/preview').set(A()).attach('file', csv('Admission No,Student Name,Class\nL1,Asha,BCom Sem 3 A\n'), 'a.csv').expect(200);
    expect(r.body.suggested).toMatchObject({ roll_no: 'Admission No', full_name: 'Student Name', section: 'Class' });
    await http().post('/v1/admin/data-migration/students/preview').set({ authorization: `Bearer ${teacher}` }).attach('file', csv('a\n1\n'), 'a.csv').expect(403);
  });

  it('dry run reports row errors; commit is idempotent; rollback removes the batch', async () => {
    const file = 'Admission No,Student Name,Class,Father Mobile\nL1,Asha Rao,BCom Sem 3 A,9811100001\nL2,Bina Rao,No Such Class,9811100002\n';
    const map = { roll_no: 'Admission No', full_name: 'Student Name', section: 'Class', guardian1_phone: 'Father Mobile', guardian1_name: '=Parent' };
    const dry = await run('students', file, map, true).expect(200);
    expect(dry.body.committed).toBe(false);
    expect(dry.body.totals.error).toBe(1);
    expect((await owner.query(`select 1 from students where roll_no = 'L1' and tenant_id = $1`, [t.tenantId])).rowCount).toBe(0);

    const good = 'Admission No,Student Name,Class,Father Mobile\nL1,Asha Rao,BCom Sem 3 A,9811100001\nL3,Chitra Rao,BCom Sem 3 A,9811100003\n';
    const done = await run('students', good, map, false).expect(200);
    expect(done.body.committed).toBe(true);
    expect(done.body.totals.created).toBe(2);
    expect(done.body.reconciliation.find((l: { label: string }) => l.label === 'Students')).toMatchObject({ file: 2, stored: 2, match: true });
    await run('students', good, map, false).expect(409);
    const batchId = done.body.batchId as string;

    const rb = await http().post(`/v1/admin/data-migration/batches/${batchId}/rollback`).set(A()).expect(200);
    expect(rb.body.kept).toBe(0);
    expect((await owner.query(`select 1 from students where roll_no in ('L1','L3') and tenant_id = $1`, [t.tenantId])).rowCount).toBe(0);
    await http().post(`/v1/admin/data-migration/batches/${batchId}/rollback`).set(A()).expect(409);
  });

  it('imports marks, attendance and fee ledgers with matching totals', async () => {
    const map = { roll_no: 'Reg', academic_year: '=2024-25', term: 'Sem', subject_code: 'Code', subject_name: 'Paper', credits: '=4', internal_marks: 'IA', external_marks: 'ESE', max_internal: '=20', max_external: '=80', grade: 'G', grade_point: 'GP' };
    const m = await run('marks', 'Reg,Sem,Code,Paper,IA,ESE,G,GP\nR1,1,AC101,Accounts,18,60,A,8\nR1,1,AC102,Law,12,25,F,0\n', map, false).expect(200);
    expect(m.body.committed).toBe(true);
    expect(m.body.reconciliation.filter((l: { match: boolean }) => !l.match)).toEqual([]);
    const f = await run('fees', 'Reg,Type,Ref,Amt\nR1,charge,INV1,"12,500.50"\nR1,receipt,RC1,5000\n', { roll_no: 'Reg', academic_year: '=2024-25', entry_type: 'Type', reference: 'Ref', amount: 'Amt' }, false).expect(200);
    expect(f.body.reconciliation.find((l: { label: string }) => l.label.startsWith('Charges'))).toMatchObject({ file: 1250050, stored: 1250050 });
    const a = await run('attendance', 'Reg,Sem,Held,Att\nR1,1,90,80\nR2,1,90,95\n', { roll_no: 'Reg', academic_year: '=2024-25', term: 'Sem', classes_held: 'Held', classes_attended: 'Att' }, true).expect(200);
    expect(a.body.totals.error).toBe(1);
    const u = await owner.query(`select student_id from legacy_marks where tenant_id = $1 and roll_no = 'R1' limit 1`, [t.tenantId]);
    expect(u.rows[0].student_id).toBe(t.students[0].id);
  });

  it('university templates, grace and a register exported as CSV, XLSX and PDF', async () => {
    await http().post('/v1/university-results/templates/samples').set(A()).expect(200);
    const list = (await http().get('/v1/university-results/templates').set(A()).expect(200)).body as { id: string; code: string }[];
    expect(list.map((x) => x.code).sort()).toEqual(['kerala-cbcss-sample', 'vtu-style-sample']);
    const reg = await http().post('/v1/university-results/registers').set(A()).send({ templateId: list.find((x) => x.code === 'vtu-style-sample')!.id, label: 'Sem 1 2024-25', source: { kind: 'legacy', academicYear: '2024-25', term: 1 } }).expect(200);
    expect(reg.body.summary.students).toBe(1);
    const csvOut = await http().get(`/v1/university-results/registers/${reg.body.id}/export?format=csv`).set(A()).expect(200);
    expect(csvOut.text).toContain('Semester Result Tabulation Register');
    const x = await http().get(`/v1/university-results/registers/${reg.body.id}/export?format=xlsx`).set(A()).buffer().parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await http().get(`/v1/university-results/registers/${reg.body.id}/export?format=pdf`).set(A()).expect(200);
    expect(pdf.headers['content-type']).toContain('pdf');
  });

  it('transcript request, approval, issue, download and signed verify', async () => {
    // Link the imported history to a student the student login can see.
    await owner.query(`update legacy_marks set student_id = $2 where tenant_id = $1 and roll_no = 'R1'`, [t.tenantId, t.students[2].id]);
    await owner.query(`update legacy_marks set roll_no = 'R3' where tenant_id = $1 and roll_no = 'R1'`, [t.tenantId]);
    const st = t.students[2].id;
    const r = await http().post('/v1/academic-docs/requests').set({ authorization: `Bearer ${student}` }).send({ studentId: st, kind: 'grade_card', purpose: 'Job' }).expect(201);
    await http().post(`/v1/academic-docs/requests/${r.body.id}/issue`).set(A()).expect(409);
    await http().post(`/v1/academic-docs/requests/${r.body.id}/decide`).set({ authorization: `Bearer ${student}` }).send({ approve: true }).expect(403);
    await http().post(`/v1/academic-docs/requests/${r.body.id}/decide`).set(A()).send({ approve: true }).expect(200);
    const issued = await http().post(`/v1/academic-docs/requests/${r.body.id}/issue`).set(A()).expect(200);
    expect(issued.body.serialNo).toMatch(/^GC\/2026\/0001$/);
    const pdf = await http().get(`/v1/academic-docs/requests/${r.body.id}/document.pdf`).set({ authorization: `Bearer ${student}` }).expect(200);
    expect(pdf.headers['content-type']).toContain('pdf');
    const { docCode } = await import('../src/academic-docs/academic-docs.logic.js');
    const secret = process.env.JWT_SECRET ?? '';
    const code = docCode(secret, t.tenantId, issued.body.serialNo);
    const ok = await http().get(`/v1/public/verify-academic/${t.slug}/${encodeURIComponent(code)}`);
    if (secret) expect(ok.body.status).toBe('valid');
    const bad = await http().get(`/v1/public/verify-academic/${t.slug}/GC-2026-0001.AAAAAAAAAAAAAAAA`).expect(200);
    expect(bad.body.status).toBe('not_found');
  });

  it('external examiner: invite, OTP login, anonymised valuation, question paper, claim', async () => {
    const [ses] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: (await db.query.academicYears.findFirst({ where: (y, { eq }) => eq(y.tenantId, t.tenantId) }))!.id, programId: t.program.id, term: 3, name: 'Nov exam', startsOn: '2026-11-10', endsOn: '2026-11-20', status: 'scheduled', createdBy: t.principal.id }).returning();
    const [paper] = await db.insert(s.examPapers).values({ tenantId: t.tenantId, sessionId: ses!.id, subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-10', startsAt: '10:00', endsAt: '13:00', maxMarks: 80 }).returning();
    await db.insert(s.examSeats).values({ tenantId: t.tenantId, paperId: paper!.id, studentId: t.students[0].id, roomId: t.room.id, seatNo: 1 });
    ids.session = ses!.id;
    const ex = await http().post('/v1/external-examiners').set(A()).send({ fullName: 'Dr Visiting', phone: '+919822200001', organisation: 'Other College' }).expect(201);
    const val = await http().post(`/v1/external-examiners/${ex.body.id}/assignments`).set(A()).send({ sessionId: ses!.id, subjectId: t.subject.id, role: 'valuer', ratePaise: 5000 }).expect(201);
    const set = await http().post(`/v1/external-examiners/${ex.body.id}/assignments`).set(A()).send({ sessionId: ses!.id, subjectId: t.subject.id, role: 'qp_setter', ratePaise: 20000 }).expect(201);
    const token = val.body.inviteToken as string;
    await http().get(`/v1/public/examiner-invite/${t.slug}/bogus-token-bogus-token-xx`).expect(404);
    expect((await http().get(`/v1/public/examiner-invite/${t.slug}/${token}`).expect(200)).body.institution).toBeTruthy();
    await http().post(`/v1/public/examiner-invite/${t.slug}/${token}/otp`).expect(202);
    const code = sms.sent.at(-1)!.code;
    const session = await http().post(`/v1/public/examiner-invite/${t.slug}/${token}/verify`).send({ code }).expect(200);
    const E = { authorization: `Bearer ${session.body.accessToken}` };

    await http().get('/v1/external-examiners').set(E).expect(403);
    await http().post(`/v1/external-examiners/assignments/${val.body.id}/scripts`).set(A()).expect(200);
    const scripts = (await http().get(`/v1/examiner-portal/assignments/${val.body.id}/scripts`).set(E).expect(200)).body as Record<string, unknown>[];
    expect(scripts.length).toBe(3);
    expect(JSON.stringify(scripts)).not.toMatch(/studentId|rollNo|Student/);
    await http().put(`/v1/examiner-portal/scripts/${scripts[0].id}`).set(E).send({ marks: 99 }).expect(400);
    await http().put(`/v1/examiner-portal/scripts/${scripts[0].id}`).set(E).send({ marks: 61 }).expect(200);
    const claim = await http().post(`/v1/examiner-portal/assignments/${val.body.id}/claims`).set(E).expect(201);
    expect(claim.body).toMatchObject({ units: 1, amountPaise: 5000 });
    await http().post(`/v1/examiner-portal/assignments/${val.body.id}/claims`).set(E).expect(409);
    await http().post(`/v1/external-examiners/claims/${claim.body.id}/decide`).set(A()).send({ to: 'approved' }).expect(200);
    await http().post(`/v1/external-examiners/assignments/${val.body.id}/apply`).set(A()).expect(200);

    await http().put(`/v1/examiner-portal/assignments/${set.body.id}/question-paper`).set(E).send({ title: 'Accounts QP', content: 'Q1 ...' }).expect(200);
    const sub = await http().post(`/v1/examiner-portal/assignments/${set.body.id}/question-paper/submit`).set(E).send({}).expect(200);
    expect(sub.body.status).toBe('scrutiny');
    await http().put(`/v1/examiner-portal/assignments/${set.body.id}/question-paper`).set(E).send({ title: 'xx', content: 'y' }).expect(409);
    await http().post(`/v1/examiner-portal/assignments/${set.body.id}/question-paper/approve`).set(E).send({}).expect(409);
    const qp = (await http().get('/v1/external-examiners/question-papers').set(A()).expect(200)).body[0];
    await http().post(`/v1/external-examiners/question-papers/${qp.id}/approve`).set(A()).send({}).expect(200);
    expect((await http().post(`/v1/external-examiners/question-papers/${qp.id}/lock`).set(A()).send({}).expect(200)).body.status).toBe('locked');
    await http().post(`/v1/external-examiners/question-papers/${qp.id}/return`).set(A()).send({ note: 'no' }).expect(409);
  });

  it('an exam-room board shows seating, timetable and instructions read-only', async () => {
    await owner.query(`update devices set room_id = $2 where id = $1`, [t.device.id, t.room.id]);
    const { deviceToken } = await import('./helpers.js').then(async (h) => ({ deviceToken: (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken as string, h }));
    const r = await http().get('/v1/devices/me/exam-room/plan?date=2026-11-10&lang=hi').set({ authorization: `Bearer ${deviceToken}` }).expect(200);
    expect(r.body.room.name).toBe('Room 1');
    expect(r.body.sittings[0].seats).toEqual([{ seatNo: 1, rollNo: 'R1' }]);
    expect(r.body.timetable.length).toBe(1);
    expect(r.body.instructions.length).toBeGreaterThan(3);
    void argon2;
  });
});
