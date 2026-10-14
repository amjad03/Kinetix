import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

/**
 * The admissions desk: cycles, enquiries and applications as record kit lists; counsellor assignment rules; duplicate
 * enquiries and merging; DLT-enforced messages; counter applications; management quota, cancellation with the UGC
 * refund and the agent's commission taken back, and programme change, each approved by the principal; the custody
 * register; saved drafts; lateral entry and the NRI document set; scholarship pre-checks; reports and isolation.
 */
describe('admissions desk', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  const ids: Record<string, string> = {};
  let yearId: string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hash = await argon2.hash('pw');
    for (const who of ['officer', 'officer2']) {
      const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, who === 'officer' ? 'Officer One' : 'Officer Two', `${who}@${t.slug}.in`, hash]);
      await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'admissions_officer')`, [t.tenantId, u.rows[0].id]);
      ids[who] = u.rows[0].id;
    }
    yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    // A second programme (BSc, first term) for a programme change, and a fifth-term BCom class for a lateral entry.
    const campus = (await owner.query(`select campus_id from programs where id = $1`, [t.program.id])).rows[0].campus_id;
    ids.bsc = (await owner.query(`insert into programs (tenant_id, campus_id, name, level, term_count) values ($1, $2, 'BSc', 'ug', 6) returning id`, [t.tenantId, campus])).rows[0].id;
    ids.bscSection = (await owner.query(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 1, 'A', 'BSc Sem 1 A') returning id`, [t.tenantId, ids.bsc, yearId])).rows[0].id;
    ids.bcom5 = (await owner.query(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 5, 'A', 'BCom Sem 5 A') returning id`, [t.tenantId, t.program.id, yearId])).rows[0].id;
    app = await createApp(new FixedClock(new Date()));
    tokens.officer = await login(t.slug, `officer@${t.slug}.in`);
    tokens.officer2 = await login(t.slug, `officer2@${t.slug}.in`);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps cycles as a record kit list: edit, open, duplicate, bin', async () => {
    const meta = (await http().get('/v1/records/admission-cycles/meta').set(as('officer')).expect(200)).body;
    expect(meta.can).toMatchObject({ write: true, duplicate: true, create: false });
    const made = (await http().post('/v1/admissions/cycles').set(as('officer')).send({ name: 'BCom 2026', programId: t.program.id, academicYearId: yearId, entryTerm: 3, seats: 10, opensOn: istDay(-1), closesOn: istDay(30) }).expect(201)).body;
    const bcom = (await http().get(`/v1/records/admission-cycles/${made.id}`).set(as('officer')).expect(200)).body;
    expect(bcom).toMatchObject({ status: 'draft', seats: 10, programName: 'BCom', applications: 0 });
    await http().patch(`/v1/records/admission-cycles/${bcom.id}`).set(as('officer')).send({ closesOn: istDay(-5) }).expect(400);
    await http().patch(`/v1/records/admission-cycles/${bcom.id}`).set(as('officer')).send({ status: 'open' }).expect(200);
    ids.cycle = bcom.id;
    const bsc = (await http().post('/v1/admissions/cycles').set(as('officer')).send({ name: 'BSc 2026', programId: ids.bsc, academicYearId: yearId, entryTerm: 1, seats: 5, opensOn: istDay(-1), closesOn: istDay(30) }).expect(201)).body;
    await http().patch(`/v1/records/admission-cycles/${bsc.id}`).set(as('officer')).send({ status: 'open' }).expect(200);
    ids.bscCycle = bsc.id;
    const copy = (await http().post(`/v1/records/admission-cycles/${bcom.id}/duplicate`).set(as('officer')).expect(201)).body;
    expect(copy).toMatchObject({ name: 'BCom 2026 (copy)', status: 'draft' });
    await http().delete(`/v1/records/admission-cycles/${copy.id}`).set(as('officer')).expect(200);
    await http().get('/v1/records/admission-cycles').set(as('teacher')).expect(403);
    // NRI applicants are also asked for a passport.
    await http().patch(`/v1/admissions/cycles/${bcom.id}`).set(as('officer')).send({ documents: [{ key: 'marks', label: 'Marks card', required: false }, { key: 'passport', label: 'Passport', required: true, for: 'nri' }] }).expect(200);
  });

  it('shares new enquiries out by the assignment rules', async () => {
    await http().post('/v1/records/assignment-rules').set(as('officer')).send({ name: 'Nobody', mode: 'round_robin', counsellors: 'someone@nowhere.in' }).expect(400);
    const rule = (await http().post('/v1/records/assignment-rules').set(as('officer')).send({ name: 'Mysuru fairs', source: 'fair', region: 'Mysuru', mode: 'round_robin', counsellors: `officer2@${t.slug}.in` }).expect(201)).body;
    expect(rule).toMatchObject({ counsellorNames: 'Officer Two', sortOrder: 10 });
    const fair = (await http().post('/v1/records/enquiries').set(as('officer')).send({ name: 'Fair Lead', phone: '9800011111', source: 'fair', city: 'mysuru', programId: t.program.id }).expect(201)).body;
    expect(fair).toMatchObject({ counsellorId: ids.officer2, source: 'fair', city: 'mysuru' });
    const walk = (await http().post('/v1/records/enquiries').set(as('officer')).send({ name: 'Walk Lead', phone: '9800011112', source: 'walk_in' }).expect(201)).body;
    expect(walk.counsellorId).not.toBe(ids.officer2);
    ids.fair = fair.id;
    ids.walk = walk.id;
    // Reassigning (Move) and bulk follow-up dates.
    await http().post(`/v1/records/enquiries/${walk.id}/move`).set(as('officer')).send({ to: ids.officer2 }).expect(200);
    const bulk = (await http().post('/v1/records/enquiries/bulk').set(as('officer')).send({ op: 'update', target: { ids: [fair.id, walk.id] }, fields: { nextFollowUpOn: istDay(1) } }).expect(200)).body;
    expect(bulk.succeeded).toBe(2);
    expect((await http().get(`/v1/records/enquiries?f.counsellor=${ids.officer2}`).set(as('officer')).expect(200)).body.total).toBe(2);
  });

  it('finds duplicate enquiries and merges them into one', async () => {
    const twin = (await http().post('/v1/records/enquiries').set(as('officer')).send({ name: 'Fair Lead', phone: '9800011111', source: 'phone', email: 'lead@x.in' }).expect(201)).body;
    await http().post(`/v1/admissions/enquiries/${twin.id}/activities`).set(as('officer')).send({ kind: 'call', note: 'Called back' }).expect(201);
    const dups = (await http().get(`/v1/admissions/enquiries/${ids.fair}/duplicates`).set(as('officer')).expect(200)).body;
    expect(dups).toEqual([expect.objectContaining({ id: twin.id, reasons: ['Same phone', 'Same name'] })]);
    const merged = (await http().post(`/v1/admissions/enquiries/${ids.fair}/merge`).set(as('officer')).send({ mergeIds: [twin.id] }).expect(200)).body;
    expect(merged).toEqual({ id: ids.fair, merged: 1 });
    const gone = (await http().get(`/v1/records/enquiries/${twin.id}`).set(as('officer')).expect(200)).body;
    expect(gone).toMatchObject({ stage: 'lost', mergedIntoId: ids.fair });
    const kept = (await http().get(`/v1/records/enquiries/${ids.fair}`).set(as('officer')).expect(200)).body;
    expect(kept).toMatchObject({ email: 'lead@x.in', activities: 2 });
    await http().post(`/v1/admissions/enquiries/${ids.fair}/merge`).set(as('officer')).send({ mergeIds: [twin.id] }).expect(400);
  });

  it('sends messages to leads only through registered (DLT) SMS templates, and logs them', async () => {
    const tpl = (dlt: string | null) => owner.query(`insert into message_templates (tenant_id, key, channel, locale, body, dlt_template_id) values ($1, $2, 'sms', 'en', 'Hello {{name}}, visit {{institution}}', $3) returning id`, [t.tenantId, dlt ? 'visit' : 'raw', dlt]).then((r) => r.rows[0].id as string);
    const raw = await tpl(null);
    const ok = await tpl('1107161234567890123');
    const list = (await http().get('/v1/admissions/lead-templates').set(as('officer')).expect(200)).body;
    expect(list.find((x: { id: string }) => x.id === raw)).toMatchObject({ usable: false, problem: expect.stringContaining('DLT') });
    const refused = (await http().post('/v1/records/enquiries/bulk').set(as('officer')).send({ op: 'action', action: 'message', target: { ids: [ids.fair] }, params: { templateId: raw } }).expect(200)).body;
    expect(refused.rows[0]).toMatchObject({ ok: false, message: expect.stringContaining('DLT') });
    const sent = (await http().post('/v1/records/enquiries/bulk').set(as('officer')).send({ op: 'action', action: 'message', target: { ids: [ids.fair, ids.walk] }, params: { templateId: ok } }).expect(200)).body;
    expect(sent).toMatchObject({ succeeded: 2 });
    const acts = (await owner.query(`select kind, note from enquiry_activities where enquiry_id = $1 order by created_at desc limit 1`, [ids.walk])).rows[0];
    expect(acts).toMatchObject({ kind: 'sms', note: expect.stringContaining(`Hello Walk Lead, visit Tenant`) });
    const lost = (await http().post('/v1/records/enquiries/bulk').set(as('officer')).send({ op: 'action', action: 'lost', target: { ids: [ids.walk] }, params: {} }).expect(400)).body;
    expect(JSON.stringify(lost)).toContain('Say why the enquiry was lost');
    await http().post('/v1/records/enquiries/bulk').set(as('officer')).send({ op: 'action', action: 'lost', target: { ids: [ids.walk] }, params: { reason: 'Joined elsewhere' } }).expect(200);
    const csv = 'Name,Phone,Source,City\r\nImport One,9800022221,fair,Mandya\r\nImport Two,12,web,\r\n';
    const check = (await http().post('/v1/records/enquiries/import').set(as('officer')).attach('file', Buffer.from(csv), 'e.csv').expect(200)).body;
    expect(check.rows.map((r: { status: string }) => r.status)).toEqual(['created', 'error']);
  });

  it('takes counter applications, reviews, rejects and reopens them in bulk', async () => {
    const meta = (await http().get('/v1/records/applications/meta').set(as('officer')).expect(200)).body;
    expect(meta.actions.map((a: { key: string }) => a.key)).toEqual(['review', 'reject', 'reopen', 'withdraw']);
    const mk = (n: number, extra: object = {}) =>
      http()
        .post('/v1/records/applications')
        .set(as('officer'))
        .send({ cycleId: ids.cycle, applicantName: `Desk Applicant ${n}`, phone: `98000300${n}0`, guardianName: `Desk Parent ${n}`, guardianPhone: `98000400${n}0`, gender: 'female', dateOfBirth: '2007-07-07', ...extra })
        .expect(201)
        .then((r) => r.body);
    const a1 = await mk(1, { category: 'OBC' });
    const a2 = await mk(2);
    const a3 = await mk(3);
    const a4 = await mk(4, { admissionType: 'lateral' });
    expect(a1).toMatchObject({ status: 'submitted', feeStatus: 'none', applicationNo: expect.stringMatching(/^APP\/2026-27\/\d{5}$/) });
    Object.assign(ids, { a1: a1.id, a2: a2.id, a3: a3.id, a4: a4.id });
    const reviewed = (await http().post('/v1/records/applications/bulk').set(as('officer')).send({ op: 'action', action: 'review', target: { ids: [a1.id, a2.id, a3.id, a4.id] }, params: {} }).expect(200)).body;
    expect(reviewed.succeeded).toBe(4);
    await http().post('/v1/records/applications/bulk').set(as('officer')).send({ op: 'action', action: 'reject', target: { ids: [a3.id] }, params: { reason: 'Marks below the cut-off' } }).expect(200);
    const reopened = (await http().post('/v1/records/applications/bulk').set(as('officer')).send({ op: 'action', action: 'reopen', target: { ids: [a3.id, a2.id] }, params: { reason: 'Revaluation raised the marks' } }).expect(200)).body;
    expect(reopened.rows.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    const hist = (await http().get(`/v1/records/applications/${a3.id}/history`).set(as('officer')).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(hist.filter((x: string) => x === 'admissions.application.status_changed.v1')).toHaveLength(3);
    // An enrolled application cannot go to the bin (checked later); another institution sees none.
    expect((await http().get('/v1/records/applications').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('puts a seat on the management quota only with the declaration and the principal\'s approval', async () => {
    await http().post(`/v1/admissions/applications/${ids.a2}/requests`).set(as('officer')).send({ kind: 'management_quota', reason: 'Requested by the family' }).expect(400);
    const r = (await http().post(`/v1/admissions/applications/${ids.a2}/requests`).set(as('officer')).send({ kind: 'management_quota', reason: 'Requested by the family', declaration: true }).expect(201)).body;
    await http().post(`/v1/admissions/applications/${ids.a2}/requests`).set(as('officer')).send({ kind: 'management_quota', reason: 'Again', declaration: true }).expect(409);
    await http().post(`/v1/admissions/requests/${r.id}/decide`).set(as('officer')).send({ decision: 'approve' }).expect(403);
    const listed = (await http().get('/v1/records/admission-requests?f.status=pending').set(as('officer')).expect(200)).body;
    expect(listed.rows[0]).toMatchObject({ kind: 'management_quota', applicantName: 'Desk Applicant 2' });
    const officerMeta = (await http().get('/v1/records/admission-requests/meta').set(as('officer')).expect(200)).body;
    expect(officerMeta.actions).toEqual([]);
    const done = (await http().post('/v1/records/admission-requests/bulk').set(as('principal')).send({ op: 'action', action: 'approve', target: { ids: [r.id] }, params: {} }).expect(200)).body;
    expect(done.rows[0]).toMatchObject({ ok: true, message: 'Moved to the management quota' });
    expect((await http().get(`/v1/records/applications/${ids.a2}`).set(as('officer')).expect(200)).body.quota).toBe('management');
  });

  const toAccepted = async (id: string) => {
    await http().post(`/v1/admissions/applications/${id}/status`).set(as('officer')).send({ status: 'eligible', reason: 'Meets the rules' }).expect(200);
    await http().post(`/v1/admissions/applications/${id}/status`).set(as('officer')).send({ status: 'offered' }).expect(200);
    await http().post(`/v1/admissions/applications/${id}/status`).set(as('officer')).send({ status: 'accepted' }).expect(200);
  };

  it('enrols with a seeded profile and admission number, and joins a lateral entry in a later term', async () => {
    const agent = (await http().post('/v1/records/admission-agents').set(as('officer')).send({ name: 'Bright Future', kind: 'agent', commissionRupees: 5000 }).expect(201)).body;
    ids.agent = agent.id;
    await http().put(`/v1/admissions/applications/${ids.a1}/agent`).set(as('officer')).send({ agentId: agent.id }).expect(200);
    await toAccepted(ids.a1);
    const enr = await http().post(`/v1/admissions/applications/${ids.a1}/enroll`).set(as('officer')).send({});
    expect(enr.body.message ?? enr.status).toBe(201);
    const st = enr.body;
    ids.s1 = st.studentId;
    const prof = (await owner.query(`select admission_no, gender, category, date_of_birth::text as dob, admission_type from student_profiles where student_id = $1`, [st.studentId])).rows[0];
    expect(prof).toEqual({ admission_no: 'ADM-0001', gender: 'female', category: 'obc', dob: '2007-07-07', admission_type: 'regular' });
    await http().delete(`/v1/records/applications/${ids.a1}`).set(as('officer')).expect(403);
    await http().delete(`/v1/records/admission-agents/${agent.id}`).set(as('officer')).expect(403); // it has a commission

    await http().patch(`/v1/admissions/applications/${ids.a4}/admission-kind`).set(as('officer')).send({ entryTermOverride: 9 }).expect(400);
    await http().patch(`/v1/admissions/applications/${ids.a4}/admission-kind`).set(as('officer')).send({ admissionType: 'lateral', entryTermOverride: 5 }).expect(200);
    await toAccepted(ids.a4);
    const lateral = (await http().post(`/v1/admissions/applications/${ids.a4}/enroll`).set(as('officer')).send({}).expect(201)).body;
    expect(lateral).toMatchObject({ sectionId: ids.bcom5, className: 'BCom Sem 5 A' });
    ids.s4 = lateral.studentId;
  });

  it('cancels an admission with the UGC refund, strikes the student off and takes back the agent\'s commission', async () => {
    await owner.query(`insert into application_payments (tenant_id, application_id, amount_paise, method, status, paid_at) values ($1, $2, 100000, 'cash', 'paid', now())`, [t.tenantId, ids.a1]);
    const before = (await http().get(`/v1/admissions/applications/${ids.a1}/refund-quote`).set(as('officer')).expect(200)).body;
    expect(before).toMatchObject({ paidPaise: 100000, percent: 100, deductionPaise: 5000, refundPaise: 95000 });
    const later = (await http().get(`/v1/admissions/applications/${ids.a1}/refund-quote?on=${istDay(40)}`).set(as('officer')).expect(200)).body;
    expect(later).toMatchObject({ daysFromLastDate: 10, percent: 80, refundPaise: 80000 });
    await http().post('/v1/admissions/refund-slabs/ugc').set(as('principal')).expect(200);
    await http().post('/v1/admissions/refund-slabs/ugc').set(as('principal')).expect(409);
    expect((await http().get('/v1/records/refund-slabs').set(as('officer')).expect(200)).body.total).toBe(5);

    const r = (await http().post(`/v1/admissions/applications/${ids.a1}/requests`).set(as('officer')).send({ kind: 'cancellation', reason: 'Joined an engineering college' }).expect(201)).body;
    expect(r.data).toMatchObject({ refundPaise: 95000, slab: '15 days or more before the last date of admission' });
    const res = (await http().post(`/v1/admissions/requests/${r.id}/decide`).set(as('principal')).send({ decision: 'approve' }).expect(200)).body;
    expect(res.result).toBe('Cancelled; refund Rs 950 of Rs 1,000 paid; Commission cancelled');
    expect((await owner.query(`select status from students where id = $1`, [ids.s1])).rows[0].status).toBe('dropped');
    expect((await owner.query(`select status, status_reason from applications where id = $1`, [ids.a1])).rows[0]).toEqual({ status: 'withdrawn', status_reason: 'Admission cancelled: Joined an engineering college' });
    expect((await owner.query(`select status from agent_commissions where application_id = $1`, [ids.a1])).rows[0].status).toBe('clawed_back');
    expect((await owner.query(`select count(*)::int as n from domain_events where type = 'admissions.admission_cancelled' and aggregate_id = $1`, [ids.a1])).rows[0].n).toBe(1);
    // A rejection needs a reason; a decided request stays on record.
    await http().post(`/v1/admissions/requests/${r.id}/decide`).set(as('principal')).send({ decision: 'reject' }).expect(400);
    await http().delete(`/v1/records/admission-requests/${r.id}`).set(as('officer')).expect(403);
  });

  it('recovers a commission already paid from the next payout', async () => {
    const c = await owner.query(`insert into agent_commissions (tenant_id, agent_id, application_id, amount_paise, status, paid_on) values ($1, $2, $3, 300000, 'paid', $4) returning id`, [t.tenantId, ids.agent, ids.a3, istDay(-1)]);
    await owner.query(`update agent_commissions set status = 'clawback_due' where id = $1`, [c.rows[0].id]);
    const fresh = await owner.query(`insert into agent_commissions (tenant_id, agent_id, application_id, amount_paise) values ($1, $2, $3, 500000) returning id`, [t.tenantId, ids.agent, ids.a2]);
    const statement = (await http().get('/v1/admissions/desk/reports/agent-statement').set(as('officer')).expect(200)).body;
    expect(statement[0]).toMatchObject({ agent: 'Bright Future', duePaise: 500000, toRecoverPaise: 300000 });
    const payout = (await http().post(`/v1/admissions/agents/${ids.agent}/payouts`).set(as('officer')).send({ commissionIds: [fresh.rows[0].id], paidOn: istDay(0) }).expect(201)).body;
    expect(payout).toMatchObject({ grossPaise: 200000 });
    expect((await owner.query(`select status from agent_commissions where id = $1`, [c.rows[0].id])).rows[0].status).toBe('clawed_back');
  });

  it('changes the programme after admission: the student moves and unpaid old fees are cancelled', async () => {
    // The lateral entrant joined BCom in term 5, so moves to the fifth term of BSc.
    const bsc5 = (await owner.query(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 5, 'A', 'BSc Sem 5 A') returning id`, [t.tenantId, ids.bsc, yearId])).rows[0].id;
    await owner.query(`insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, due_on, created_by) values ($1, $2, $3, gen_random_uuid(), 'BCom Sem 5 fee', 3000000, $4, $5)`, [t.tenantId, ids.s4, ids.bcom5, istDay(10), t.principal.id]);
    const desk = (await http().get(`/v1/admissions/applications/${ids.a4}/desk`).set(as('officer')).expect(200)).body;
    expect(desk.changeTargets).toEqual([expect.objectContaining({ id: ids.bscCycle, seatsLeft: 5 })]);
    expect(desk.canDecide).toBe(false);
    await http().post(`/v1/admissions/applications/${ids.a4}/requests`).set(as('officer')).send({ kind: 'programme_change', reason: 'Prefers science' }).expect(400);
    const r = (await http().post(`/v1/admissions/applications/${ids.a4}/requests`).set(as('officer')).send({ kind: 'programme_change', reason: 'Prefers science', toCycleId: ids.bscCycle }).expect(201)).body;
    expect(r.data).toMatchObject({ fromProgramme: 'BCom', toProgramme: 'BSc' });
    const dec = await http().post(`/v1/admissions/requests/${r.id}/decide`).set(as('principal')).send({ decision: 'approve' });
    expect(dec.body.message ?? dec.status).toBe(200);
    const res = dec.body;
    expect(res.result).toBe('Moved to BSc 2026; moved to BSc Sem 5 A, 1 unpaid fee of the old programme cancelled');
    expect((await owner.query(`select section_id from students where id = $1`, [ids.s4])).rows[0].section_id).toBe(bsc5);
    expect((await owner.query(`select status from fee_invoices where student_id = $1`, [ids.s4])).rows[0].status).toBe('cancelled');
  });

  it('keeps the register of originals in custody and returns them against a signature', async () => {
    const got = (await http().post(`/v1/admissions/applications/${ids.a4}/custody`).set(as('officer')).send({ items: [{ document: '10th marks card', referenceNo: 'SSLC-1234' }, { document: 'Transfer certificate' }] }).expect(201)).body;
    expect(got).toHaveLength(2);
    const held = (await http().get('/v1/records/custody-register?f.status=held').set(as('officer')).expect(200)).body;
    expect(held.total).toBe(2);
    await http().post('/v1/records/custody-register/bulk').set(as('officer')).send({ op: 'action', action: 'return', target: { ids: [got[0].id] }, params: { returnedTo: 'Desk Parent 4' } }).expect(400);
    const ret = (await http().post('/v1/records/custody-register/bulk').set(as('officer')).send({ op: 'action', action: 'return', target: { ids: [got[0].id] }, params: { returnedTo: 'Desk Parent 4', acknowledgement: 'Signed: Desk Parent 4' } }).expect(200)).body;
    expect(ret.rows[0]).toMatchObject({ ok: true, message: 'Returned to Desk Parent 4' });
    await http().post(`/v1/admissions/custody/${got[0].id}/return`).set(as('officer')).send({ returnedTo: 'x y', acknowledgement: 'x y' }).expect(400);
    const h = (await http().get(`/v1/records/custody-register/${got[0].id}/history`).set(as('officer')).expect(200)).body.items[0];
    expect(h).toMatchObject({ action: 'custody_item.original_returned', changes: [{ field: 'status', before: 'held', after: 'returned' }] });
  });

  it('saves and resumes an application draft, and asks NRI applicants for their own documents', async () => {
    const d = (await http().post(pub(`/cycles/${ids.cycle}/drafts`)).send({ applicantName: 'Draft Person', phone: '9800055555', data: { applicantName: 'Draft Person' }, step: 1 }).expect(201)).body;
    await http().get(pub(`/drafts/${d.id}`)).set('x-draft-token', 'wrong-token-1234').expect(404);
    await http().put(pub(`/drafts/${d.id}`)).set('x-draft-token', d.token).send({ data: { applicantName: 'Draft Person', guardianName: 'Draft Parent' }, step: 2 }).expect(200);
    const back = (await http().get(pub(`/drafts/${d.id}`)).set('x-draft-token', d.token).expect(200)).body;
    expect(back).toMatchObject({ step: 2, data: { guardianName: 'Draft Parent' }, submittedApplicationId: null });
    expect((await http().get('/v1/admissions/desk/reports/drafts').set(as('officer')).expect(200)).body.map((x: { name: string }) => x.name)).toEqual(['Draft Person']);

    const applied = (await http().post(pub(`/cycles/${ids.cycle}/applications`)).send({ applicantName: 'Draft Person', phone: '9800055555', guardianName: 'Draft Parent', guardianPhone: '9800055556', nationality: 'nri', draftId: d.id }).expect(201)).body;
    expect((await http().get(pub(`/drafts/${d.id}`)).set('x-draft-token', d.token).expect(200)).body.submittedApplicationId).toBe(applied.id);
    expect((await http().get('/v1/admissions/desk/reports/drafts').set(as('officer')).expect(200)).body).toEqual([]);
    const tracked = (await http().get(pub(`/applications/${applied.id}`)).set('x-application-token', applied.token).expect(200)).body;
    expect(tracked.documents.map((x: { key: string }) => x.key)).toEqual(['marks', 'passport']);
    const indian = (await http().get(pub(`/applications/${ids.a2}`)).set('x-application-token', 'x').expect(404));
    void indian;
  });

  it('pre-checks scholarships from the application', async () => {
    await owner.query(`insert into scholarship_schemes (tenant_id, name, kind, value, min_percentage, max_income_paise) values ($1, 'Merit 60', 'percent', 25, 60, null), ($1, 'Low income', 'fixed', 1000000, null, 25000000)`, [t.tenantId]);
    await owner.query(`update applications set answers = '{"marks_12th": 72}'::jsonb where id = $1`, [ids.a2]);
    const s = (await http().get(`/v1/admissions/applications/${ids.a2}/scholarships`).set(as('officer')).expect(200)).body;
    expect(s.percentage).toBe(72);
    expect(s.schemes.map((x: { name: string; verdict: string }) => `${x.name}: ${x.verdict}`)).toEqual(['Low income: unknown', 'Merit 60: likely']);
  });

  it('builds the funnel and the admission registers and reports', async () => {
    const funnel = (await http().get('/v1/admissions/desk/funnel').set(as('officer')).expect(200)).body;
    expect(funnel.now).toMatchObject({ enrolled: 2 });
    expect(funnel.days).toHaveLength(30);
    expect(funnel.pendingRequests).toBe(0);
    const register = (await http().get('/v1/admissions/desk/reports/daily-register').set(as('officer')).expect(200)).body;
    expect(register.map((r: { name: string }) => r.name).sort()).toEqual(['Desk Applicant 1', 'Desk Applicant 4']);
    const stats = (await http().get(`/v1/admissions/desk/reports/category-stats?yearId=${yearId}`).set(as('officer')).expect(200)).body;
    expect(stats).toEqual([expect.objectContaining({ programme: 'BSc', total: 1, female: 1 })]);
    const quota = (await http().get('/v1/admissions/desk/reports/quota-fill').set(as('officer')).expect(200)).body;
    expect(quota.find((q: { cycle: string; kind: string }) => q.cycle === 'BSc 2026' && q.kind === 'Total')).toMatchObject({ seats: 5, filled: 1, vacant: 4 });
    const conv = (await http().get('/v1/admissions/desk/reports/conversion?by=source').set(as('officer')).expect(200)).body;
    expect(conv.find((c: { group: string }) => c.group === 'fair')).toMatchObject({ enquiries: 1 });
    expect((await http().get('/v1/admissions/desk/reports/fee-reconciliation').set(as('officer')).expect(200)).body).toEqual([]);
    const counsellors = (await http().get('/v1/admissions/desk/reports/counsellors').set(as('officer')).expect(200)).body;
    expect(counsellors.find((c: { counsellor: string }) => c.counsellor === 'Officer One')).toMatchObject({ calls: 1, messages: 2 });
    await http().get('/v1/admissions/desk/reports/nope').set(as('officer')).expect(400);
    await http().get('/v1/admissions/desk/funnel').set(as('teacher')).expect(403);
  });

  it('keeps the other admissions lists in the kit: campaigns, agents, interviews and entrance questions', async () => {
    const camp = (await http().post('/v1/records/admission-campaigns').set(as('officer')).send({ name: 'Mysuru fair 2026', channel: 'Fair', budgetRupees: 25000, utmCampaign: 'mys-fair' }).expect(201)).body;
    expect(camp).toMatchObject({ budgetRupees: 25000, leads: 0 });
    const copy = (await http().post(`/v1/records/admission-campaigns/${camp.id}/duplicate`).set(as('officer')).expect(201)).body;
    expect(copy).toMatchObject({ name: 'Mysuru fair 2026 (copy)', utmCampaign: null });
    const q = (await http().post('/v1/records/entrance-questions').set(as('officer')).send({ topic: 'Aptitude', question: 'What is 15% of 200?', options: '20\n30\n35', correct: 2, marks: 1 }).expect(201)).body;
    expect(q).toMatchObject({ correct: 2, optionsText: '20\n30\n35' });
    await http().post('/v1/records/entrance-questions').set(as('officer')).send({ topic: 'Aptitude', question: 'Bad', options: '1\n2', correct: 4 }).expect(400);
    const csv = 'Topic,Question,Option 1,Option 2,Correct option (number)\r\nReasoning,Odd one out: 2 3 5 9,9,3,1\r\n';
    const check = (await http().post('/v1/records/entrance-questions/import').set(as('officer')).attach('file', Buffer.from(csv), 'q.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 1 });
    const x = await http().get('/v1/records/admission-agents/export?format=csv').set(as('officer')).expect(200);
    expect(x.text.replace(/^﻿/, '').split('\r\n')[0]).toBe('Name,Kind,Referral code,Phone,Email,Commission (Rs),Referrals,Enrolled,Due (Rs),Active');
    const iv = await owner.query(`insert into admission_interviews (tenant_id, application_id, slot_at, venue) values ($1, $2, now() + interval '1 day', 'Room 4') returning id`, [t.tenantId, ids.a2]);
    const noShow = (await http().post('/v1/records/admission-interviews/bulk').set(as('officer')).send({ op: 'action', action: 'noShow', target: { ids: [iv.rows[0].id] } }).expect(200)).body;
    expect(noShow.succeeded).toBe(1);
    expect((await http().get('/v1/records/admission-interviews?f.status=no_show').set(as('officer')).expect(200)).body.rows[0]).toMatchObject({ applicantName: 'Desk Applicant 2', venue: 'Room 4' });
    for (const e of ['admission-campaigns', 'admission-agents', 'entrance-questions', 'custody-register', 'assignment-rules']) expect((await http().get(`/v1/records/${e}`).set(as('outsider')).expect(200)).body.total).toBe(0);
  });
});
