import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proposalFlags, ContentSchema } from '../src/curriculum/curriculum-logic.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const content = { subjects: [{ code: 'BCOM101', name: 'Financial Accounting', term: 1, credits: 4, hours: 60, units: [{ title: 'Journal', hours: 15, topics: ['Journal', 'Ledger'] }], cos: [{ code: 'CO1', statement: 'Record transactions' }] }] };

describe('academic structure extras: faculties, governance rules, importer flags, course fees, categories, custom allocation', () => {
  const owner = ownerPool();
  const start = new Date('2026-10-20T04:30:00Z');
  const clock = new FixedClock(start);
  const day = (n: number) => new Date(start.getTime() + n * 86_400_000).toISOString();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const u = await q("insert into users (tenant_id, full_name, email, password_hash) values ($1,'Registrar',$2,$3) returning id", [t.tenantId, `univ@${t.slug}.in`, hash]);
    await owner.query("insert into user_roles (tenant_id, user_id, role) values ($1,$2,'university_admin')", [t.tenantId, u[0].id]);
    app = await createApp(clock);
    tokens = { principal: await login(t.principal.email!), teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!), univ: await login(`univ@${t.slug}.in`) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps a university hierarchy of institutions, faculties and departments', async () => {
    const body = { code: 'SDC', name: 'Soundarya Degree College', model: 'affiliated' };
    await post('teacher', '/v1/university/institutions', body).expect(403);
    const inst = (await post('univ', '/v1/university/institutions', body).expect(201)).body;
    const fac = (await post('univ', '/v1/university/faculties', { code: 'COM', name: 'Faculty of Commerce', institutionId: inst.id }).expect(201)).body;
    await post('univ', '/v1/university/faculties', { code: 'COM', name: 'Duplicate' }).expect(409);
    const school = (await post('principal', '/v1/university/faculties', { code: 'SOE', name: 'School of Engineering', kind: 'school' }).expect(201)).body;
    const dep = (await q("insert into departments (tenant_id, name) values ($1,'Commerce') returning id", [t.tenantId]))[0].id;
    await q("insert into departments (tenant_id, name) values ($1,'Physics') returning id", [t.tenantId]);
    await put('univ', `/v1/university/departments/${dep}/faculty`, { facultyId: fac.id }).expect(200);
    await put('univ', `/v1/university/departments/${dep}/faculty`, { facultyId: '11111111-1111-4111-8111-111111111111' }).expect(404);
    await put('teacher', `/v1/university/departments/${dep}/faculty`, { facultyId: fac.id }).expect(403);
    const tree = (await get('univ', '/v1/university/hierarchy').expect(200)).body;
    expect(tree.institutions[0]).toMatchObject({ code: 'SDC' });
    expect(tree.institutions[0].faculties[0]).toMatchObject({ code: 'COM', departments: [{ name: 'Commerce' }] });
    expect(tree.central.map((f: { code: string }) => f.code)).toEqual([school.code]);
    expect(tree.unassignedDepartments.map((d: { name: string }) => d.name)).toEqual(['Physics']);
    await put('principal', `/v1/university/faculties/${school.id}`, { name: 'School of Engineering and Technology' }).expect(200);
    await get('teacher', '/v1/university/hierarchy').expect(403);
  });

  it('records the framework a regulation follows', async () => {
    const f = (await post('principal', '/v1/curriculum/frameworks', { code: 'NEP2020', name: 'National Education Policy 2020', kind: 'national', authority: 'Ministry of Education' }).expect(201)).body;
    await post('principal', '/v1/curriculum/frameworks', { code: 'NEP2020', name: 'Again' }).expect(409);
    await post('teacher', '/v1/curriculum/frameworks', { code: 'X1', name: 'No' }).expect(403);
    const reg = (await post('principal', '/v1/curriculum/regulations', { name: 'NEP 2023', year: 2023, effectiveFrom: '2023-06-01' }).expect(201)).body;
    await put('principal', `/v1/curriculum/frameworks/regulations/${reg.id}`, { frameworkId: f.id }).expect(200);
    await put('principal', `/v1/curriculum/frameworks/regulations/${reg.id}`, { frameworkId: '11111111-1111-4111-8111-111111111111' }).expect(404);
    const list = (await get('univ', '/v1/curriculum/frameworks').expect(200)).body as { code: string; regulations: number }[];
    expect(list).toEqual([expect.objectContaining({ code: 'NEP2020', regulations: 1 })]);
    await put('principal', `/v1/curriculum/frameworks/${f.id}`, { description: 'Credit-based, multidisciplinary' }).expect(200);
  });

  it('makes an affiliated college cite the university, and stops it awarding degrees', async () => {
    await put('principal', '/v1/admin/institution/setup', { governanceModel: 'affiliated' }).expect(200);
    const rules = (await get('principal', '/v1/university/governance').expect(200)).body;
    expect(rules).toMatchObject({ model: 'affiliated', rules: { ownExams: false, ownDegree: false, requiresUniversityBosRef: true } });
    const reg = (await post('principal', '/v1/curriculum/regulations', { name: 'NEP 2024', year: 2024, effectiveFrom: '2024-06-01' }).expect(201)).body;
    const v = (await post('principal', '/v1/curriculum/versions', { programId: t.program.id, regulationYear: 2024, label: 'NEP 2024 BCom', regulationId: reg.id }).expect(201)).body;
    await put('principal', `/v1/curriculum/versions/${v.id}/content`, content).expect(200);
    const refused = await post('principal', `/v1/curriculum/versions/${v.id}/approve`, { bosRef: 'BoS/2024/07' }).expect(400);
    expect(refused.body.message).toContain('Board of Studies reference');
    const ok = (await post('principal', `/v1/curriculum/versions/${v.id}/approve`, { bosRef: 'BoS/2024/07', universityRef: 'BU/AC/2024/118' }).expect(200)).body;
    expect(ok.universityRef).toBe('BU/AC/2024/118');
    const conv = (await post('principal', '/v1/university/convocations', { name: '2026 Convocation', heldOn: '2026-12-10', graduationYear: 2026, programId: t.program.id }).expect(201)).body;
    const issue = await post('principal', `/v1/university/convocations/${conv.id}/issue`).expect(403);
    expect(issue.body.message).toContain('affiliating university');
    // An autonomous college does not need the university\'s reference.
    await put('principal', '/v1/admin/institution/setup', { governanceModel: 'autonomous' }).expect(200);
    const v2 = (await post('principal', '/v1/curriculum/versions', { programId: t.program.id, regulationYear: 2025, label: 'NEP 2025 BCom' }).expect(201)).body;
    await put('principal', `/v1/curriculum/versions/${v2.id}/content`, content).expect(200);
    await post('principal', `/v1/curriculum/versions/${v2.id}/approve`, { bosRef: 'BoS/2025/02' }).expect(200);
  });

  it('flags what an imported syllabus leaves unclear', () => {
    const parsed = ContentSchema.parse({
      subjects: [
        { code: 'A1', name: 'No detail', credits: 0, units: [], cos: [] },
        { code: 'a1', name: 'Same code', credits: 3.3, hours: 40, units: [{ title: 'Unit 1', hours: 10, topics: [] }, { title: 'Unit 2', hours: 10, topics: ['x'] }], cos: [{ code: 'CO1', statement: 'Do something' }] },
        { code: 'B2', name: 'Clean', credits: 4, hours: 20, units: [{ title: 'Unit 1', hours: 20, topics: ['x'] }], cos: [{ code: 'CO1', statement: 'Do it' }] },
      ],
    });
    const codes = proposalFlags(parsed).map((f) => `${f.where}:${f.code}`);
    expect(codes).toEqual(expect.arrayContaining(['Subject A1:duplicate_code', 'Subject a1:duplicate_code', 'Subject A1:credits_missing', 'Subject A1:no_units', 'Subject A1:no_outcomes', 'Subject a1:credits_unusual', 'Subject a1:unit_without_topics', 'Subject a1:hours_mismatch']));
    expect(codes.filter((c) => c.startsWith('Subject B2'))).toEqual([]);
  });

  describe('course registration', () => {
    let termId: string;
    let subjectIds: string[];
    let offerings: Record<string, string> = {};
    beforeAll(async () => {
      termId = (await q("insert into academic_terms (tenant_id, academic_year_id, name, starts_on, ends_on) values ($1,$2,'Odd 2026','2026-08-01','2026-12-31') returning id", [t.tenantId, t.section.academicYearId]))[0].id;
      subjectIds = [];
      for (const c of ['MIN1', 'AUD1', 'VAC1']) subjectIds.push((await q("insert into subjects (tenant_id, program_id, term, code, name) values ($1,$2,3,$3,$3) returning id", [t.tenantId, t.program.id, c]))[0].id);
    });

    it('offers minor, audit and value-added courses, and rejects a category that does not exist', async () => {
      const offer = (i: number, over: object) => post('principal', '/v1/course-registration/offerings', { termId, subjectId: subjectIds[i], credits: 3, seatCap: 5, ...over });
      await offer(0, { category: 'astrology' }).expect(400);
      offerings.minor = (await offer(0, { category: 'minor', feePaise: 250_000 }).expect(201)).body.id;
      offerings.audit = (await offer(1, { category: 'audit', credits: 4 }).expect(201)).body.id;
      offerings.vac = (await offer(2, { category: 'vac', credits: 2 }).expect(201)).body.id;
      const list = (await get('principal', `/v1/course-registration/offerings?termId=${termId}`).expect(200)).body as { category: string; feePaise: number }[];
      expect(list.map((o) => o.category).sort()).toEqual(['audit', 'minor', 'vac']);
      expect(list.find((o) => o.category === 'minor')?.feePaise).toBe(250_000);
    });

    it('validates a custom allocation window', async () => {
      const w = { termId, opensAt: day(-1), closesAt: day(7), addDropUntil: day(14), minCredits: 0, maxCredits: 6, allocationRule: 'custom' };
      await put('principal', '/v1/course-registration/windows', w).expect(400); // weights are required
      await put('principal', '/v1/course-registration/windows', { ...w, ruleConfig: { cgpa: 0, attendance: 0 } }).expect(400);
      const saved = (await put('principal', '/v1/course-registration/windows', { ...w, ruleConfig: { cgpa: 30, attendance: 60, priority: 10 } }).expect(200)).body;
      expect(saved).toMatchObject({ allocationRule: 'custom', ruleConfig: { cgpa: 30, attendance: 60, priority: 10 } });
    });

    it('lets an audit course sit outside the credit limit and charges the course fee on approval, once', async () => {
      const reg = (offeringId: string) => post('student', '/v1/course-registration/me/register', { offeringId });
      // Window maximum is 6: minor 3 + vac 2 = 5; the audit course (4 credits) would break it if it counted.
      await reg(offerings.minor).expect(200);
      await reg(offerings.vac).expect(200);
      await reg(offerings.audit).expect(200);
      const pending = (await get('principal', `/v1/course-registration/approvals?termId=${termId}`).expect(200)).body as { id: string; subjectCode: string }[];
      expect(pending.map((p) => p.subjectCode).sort()).toEqual(['AUD1', 'MIN1', 'VAC1']);
      expect(await q('select count(*)::int as n from fee_invoices where tenant_id = $1', [t.tenantId])).toEqual([{ n: 0 }]);
      await post('principal', '/v1/course-registration/approvals/decide', { registrationIds: pending.map((p) => p.id), decision: 'approved' }).expect(200);
      const inv = await q("select title, amount_paise::int as amount, student_id from fee_invoices where tenant_id = $1", [t.tenantId]);
      expect(inv).toHaveLength(1);
      expect(inv[0]).toMatchObject({ title: 'Course fee: MIN1 MIN1', amount: 250_000, student_id: t.students[2].id });
      const linked = await q('select count(*)::int as n from course_registrations where tenant_id = $1 and fee_invoice_id is not null', [t.tenantId]);
      expect(linked).toEqual([{ n: 1 }]);
      await post('principal', '/v1/course-registration/approvals/decide', { registrationIds: [pending[0].id], decision: 'approved' }).expect(409);
      expect(await q('select count(*)::int as n from fee_invoices where tenant_id = $1', [t.tenantId])).toEqual([{ n: 1 }]);
    });

    it('allocates by the custom weights', async () => {
      // Two students want one seat; attendance outweighs CGPA under this window.
      const termB = (await q("insert into academic_terms (tenant_id, academic_year_id, name, starts_on, ends_on) values ($1,$2,'Even 2027','2027-01-01','2027-05-31') returning id", [t.tenantId, t.section.academicYearId]))[0].id;
      const sub = (await q("insert into subjects (tenant_id, program_id, term, code, name) values ($1,$2,3,'OPEN1','OPEN1') returning id", [t.tenantId, t.program.id]))[0].id;
      const off = (await post('principal', '/v1/course-registration/offerings', { termId: termB, subjectId: sub, category: 'open_elective', credits: 3, seatCap: 1 }).expect(201)).body.id;
      await put('principal', '/v1/course-registration/windows', { termId: termB, opensAt: day(-1), closesAt: day(7), addDropUntil: day(14), minCredits: 0, maxCredits: 6, allocationRule: 'custom', ruleConfig: { attendance: 100 } }).expect(200);
      // Student C (own login) has 100% attendance; student A 50%. No CGPA on file for either.
      const slot = t.slot.id;
      for (let i = 1; i <= 4; i++) {
        for (const [idx, status] of [[2, 'present'], [0, i <= 2 ? 'present' : 'absent']] as const) {
          await owner.query('insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1,$2,$3,$4,$5,$6,$7,now())', [t.tenantId, t.students[idx].id, t.section.id, `2026-09-0${i}`, slot, status, t.teacher.id]);
        }
      }
      const hash = await argon2.hash('pw');
      const ua = (await q("insert into users (tenant_id, full_name, email, password_hash) values ($1,'Student A',$2,$3) returning id", [t.tenantId, `sa@${t.slug}.in`, hash]))[0].id;
      await owner.query("insert into user_roles (tenant_id, user_id, role) values ($1,$2,'student')", [t.tenantId, ua]);
      await owner.query('update students set user_id = $1 where id = $2', [ua, t.students[0].id]);
      tokens.studentA = await login(`sa@${t.slug}.in`);
      // Student A asks first; time order alone would favour them.
      await put('studentA', '/v1/course-registration/me/preferences', { termId: termB, offeringIds: [off] }).expect(200);
      await put('student', '/v1/course-registration/me/preferences', { termId: termB, offeringIds: [off] }).expect(200);
      const out = (await post('principal', '/v1/course-registration/allocate', { termId: termB }).expect(200)).body;
      expect(out).toMatchObject({ allocated: 1, waitlisted: 1 });
      const got = await q("select student_id, status from course_registrations where tenant_id = $1 and offering_id = $2 order by status", [t.tenantId, off]);
      expect(got.find((r) => r.status === 'registered')?.student_id).toBe(t.students[2].id);
    });
  });
});
