import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Examinations flagship (migrations 0186-0188): applications by subject with eligibility (attendance, prerequisites,
 * backlogs) and the exam fee as an invoice on the fee account; hall tickets held for an unpaid fee; backlog and
 * improvement applications in a supplementary session; revaluation fees through the fee account; question paper
 * setting (appointments, sets against a blueprint, scrutiny by the appointed moderator, the draw and the sealed
 * release); unlocking marks with approval; the printed registers and the marks ledger; another institution's view.
 *
 * Fees worked by hand (exam office defaults): a regular paper Rs 150, a backlog or improvement paper Rs 250, a minimum
 * of Rs 500 and a late fee of Rs 200. Two regular papers: 2 x 150 = 300, raised to 500 (top-up 200). Late: 500 + 200 =
 * 700. One backlog paper: 250, raised to 500. One backlog and one improvement: 2 x 250 = 500, no top-up.
 */
describe('examinations flagship', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-11-01T05:00:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await owner.query(text, params)).rows as T[];
  const [A, B, C] = [0, 1, 2];
  const pdfOf = (who: string, url: string) =>
    get(who, url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  async function addUser(name: string, role: string) {
    const hash = await argon2.hash('pw');
    const [u] = await q<{ id: string; email: string }>(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id, email`, [t.tenantId, name, `${name.toLowerCase().replace(/ /g, '')}-${t.slug}@x.in`, hash]);
    await q(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, $3)`, [t.tenantId, u.id, role]);
    return u;
  }

  /** A session with one paper per subject for section A, 10:00 to 13:00 from the given day. */
  async function session(name: string, kind: string, startsOn: string, status = 'draft') {
    const [s] = await q<{ id: string }>(
      `insert into exam_sessions (tenant_id, academic_year_id, program_id, term, name, kind, starts_on, ends_on, status, created_by) values ($1, $2, $3, 3, $4, $5, $6, ($6::date + 10), $7, $8) returning id`,
      [t.tenantId, t.section.academicYearId, t.program.id, name, kind, startsOn, status, t.principal.id],
    );
    for (const [i, sub] of [ids.sub1, ids.sub2].entries()) {
      await post('principal', `/v1/exam-sessions/${s.id}/papers`, { subjectId: sub, sectionId: t.section.id, examDate: new Date(Date.parse(startsOn) + i * 86_400_000).toISOString().slice(0, 10), startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201);
    }
    return s.id;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    ids.sub1 = t.subject.id;
    ids.sub2 = (await q<{ id: string }>(`insert into subjects (tenant_id, program_id, term, code, name, credits) values ($1, $2, 3, 'BCOM-3.2', 'Cost Accounting', 4) returning id`, [t.tenantId, t.program.id]))[0].id;
    ids.sub0 = (await q<{ id: string }>(`insert into subjects (tenant_id, program_id, term, code, name, credits) values ($1, $2, 2, 'BCOM-2.1', 'Financial Accounting', 4) returning id`, [t.tenantId, t.program.id]))[0].id;
    const hod = await addUser('Hema Hod', 'hod');
    const ctl = await addUser('Ravi Controller', 'exam_controller');
    const acc = await addUser('Asha Accounts', 'accountant');
    ids.hod = hod.id;
    ids.controller = ctl.id;
    // The head of department heads the subjects' department.
    const [dept] = await q<{ id: string }>(`insert into departments (tenant_id, name, head_user_id) values ($1, 'Commerce', $2) returning id`, [t.tenantId, hod.id]);
    await q(`update subjects set department_id = $1 where id in ($2, $3)`, [dept.id, ids.sub1, ids.sub2]);

    for (const [who, email] of [['principal', t.principal.email], ['teacher', t.teacher.email], ['teacher2', t.teacher2.email], ['student', t.studentUser.email], ['parentA', t.guardian.email], ['parentB', t.guardian2.email], ['hod', hod.email], ['controller', ctl.email], ['accountant', acc.email]] as const) tokens[who] = await login(t.slug, email!);
    tokens.outsider = await login(other.slug, other.principal.email!);

    // An earlier, published sitting of both subjects: A failed Corporate Accounting, B and C passed both.
    const [past] = await q<{ id: string }>(
      `insert into exam_sessions (tenant_id, academic_year_id, program_id, term, name, kind, starts_on, ends_on, status, processed_at, published_at, created_by)
       values ($1, $2, $3, 3, 'Sem 3 Model Examination, October 2026', 'regular', '2026-10-05', '2026-10-12', 'published', now(), now(), $4) returning id`,
      [t.tenantId, t.section.academicYearId, t.program.id, t.principal.id],
    );
    ids.past = past.id;
    const lines: Record<number, [number, number]> = { [A]: [31, 58], [B]: [55, 62], [C]: [72, 80] };
    for (const i of [A, B, C]) {
      const failed = i === A;
      const [r] = await q<{ id: string }>(
        `insert into exam_results (tenant_id, session_id, student_id, sgpa, cgpa, credits_attempted, credits_earned, credit_points, outcome) values ($1, $2, $3, $4, $4, 8, $5, $6, $7) returning id`,
        [t.tenantId, past.id, t.students[i].id, failed ? 2.9 : 6.5, failed ? 4 : 8, failed ? 23.2 : 52, failed ? 'fail' : 'pass'],
      );
      const [p1, p2] = lines[i];
      await q(
        `insert into exam_result_lines (tenant_id, result_id, subject_id, credits, percent, grade, grade_point, passed, components) values
         ($1, $2, $3, 4, $4, $5, $6, $7, '[{"kind":"internal","weighted":12},{"kind":"external","weighted":19}]'), ($1, $2, $8, 4, $9, 'B', 6.2, true, '[{"kind":"internal","weighted":25},{"kind":"external","weighted":33}]')`,
        [t.tenantId, r.id, ids.sub1, p1, failed ? 'F' : 'C', failed ? 0 : 5.5, !failed, ids.sub2, p2],
      );
    }
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('checks each subject of an application, raises the exam fee on the fee account and holds tickets until it is paid', async () => {
    ids.regular = await session('Sem 3 Semester End Examination, November 2026', 'regular', '2026-11-20');
    // Before the window opens nothing can be submitted.
    expect((await get('student', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}`).expect(200)).body).toMatchObject({ window: null, canSubmit: false });
    await post('student', `/v1/exam-sessions/${ids.regular}/application`, { studentId: t.students[C].id }).expect(409);
    await http().put(`/v1/exam-sessions/${ids.regular}/registration-window`).set(as('controller')).send({ opensOn: '2026-10-25', closesOn: '2026-11-05', lateUntil: '2026-11-10' }).expect(200);

    // B: 4 of 10 classes of Corporate Accounting (40%, under 75%), and Cost Accounting needs Financial Accounting first.
    for (let d = 1; d <= 10; d++) await q(`insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1, $2, $3, $4, $5, $6, $7, now())`, [t.tenantId, t.students[B].id, t.section.id, `2026-10-${String(d).padStart(2, '0')}`, t.slot.id, d <= 4 ? 'present' : 'absent', t.teacher.id]);
    await q(`insert into subject_requisites (tenant_id, subject_id, requires_subject_id, kind) values ($1, $2, $3, 'prerequisite')`, [t.tenantId, ids.sub2, ids.sub0]);
    // A and C have Financial Accounting (approved credit transfers), so only B misses the prerequisite.
    for (const i of [A, C]) await q(`insert into credit_transfers (tenant_id, student_id, source, course_title, credits, status, mapped_subject_id) values ($1, $2, 'institution', 'Financial Accounting (earlier college)', 4, 'approved', $3)`, [t.tenantId, t.students[i].id, ids.sub0]);

    const v = (await get('student', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}`).expect(200)).body;
    expect(v.window.state).toBe('open');
    expect(v.subjects.map((x: { code: string; kind: string; eligible: boolean }) => [x.code, x.kind, x.eligible])).toEqual([['BCOM-3.1', 'regular', true], ['BCOM-3.2', 'regular', true]]);
    expect(v.fee).toMatchObject({ papersPaise: 30_000, topUpPaise: 20_000, lateFeePaise: 0, totalPaise: 50_000, papers: 2 });
    expect(v.canSubmit).toBe(true);

    // A parent of another child cannot apply for C; another institution cannot see it.
    await post('parentA', `/v1/exam-sessions/${ids.regular}/application`, { studentId: t.students[C].id }).expect(404);
    await get('outsider', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}`).expect(404);

    const done = (await post('student', `/v1/exam-sessions/${ids.regular}/application`, { studentId: t.students[C].id }).expect(200)).body;
    expect(done.application).toMatchObject({ applicationNo: 'EXA/26/00001', status: 'registered', fee: { amountPaise: 50_000, status: 'due', invoiceId: expect.any(String) } });
    ids.invoiceC = done.application.fee.invoiceId;
    const [inv] = await q<{ amount_paise: string; status: string; title: string }>(`select amount_paise, status, title from fee_invoices where id = $1`, [ids.invoiceC]);
    expect(inv).toMatchObject({ amount_paise: '50000', status: 'due', title: 'Examination fee: Sem 3 Semester End Examination, November 2026' });
    expect((await q(`select 1 from notifications where tenant_id = $1 and dedupe_key = $2`, [t.tenantId, `exam-application:${ids.regular}:${t.students[C].id}`])).length).toBeGreaterThan(0);

    // B: each subject held back with the reason; no fee is raised for an application that cannot be written.
    const vb = (await post('controller', `/v1/exam-sessions/${ids.regular}/application`, { studentId: t.students[B].id }).expect(200)).body;
    expect(vb.subjects.find((x: { code: string }) => x.code === 'BCOM-3.1').reasons).toEqual(['Attendance 40.0% is below 75%']);
    expect(vb.subjects.find((x: { code: string }) => x.code === 'BCOM-3.2').reasons).toEqual(['Prerequisite not cleared: BCOM-2.1']);
    expect(vb.application).toMatchObject({ applicationNo: 'EXA/26/00002', status: 'ineligible', reasons: ['No subject can be written: see the reasons against each subject'], fee: null });

    const list = (await get('controller', `/v1/exam-sessions/${ids.regular}/applications`).expect(200)).body;
    expect(list.map((r: { rollNo: string; status: string; regular: number; ineligible: number; feeStatus: string | null }) => [r.rollNo, r.status, r.regular, r.ineligible, r.feeStatus])).toEqual([['R2', 'ineligible', 2, 2, null], ['R3', 'registered', 2, 0, 'due']]);
    await get('teacher', `/v1/exam-sessions/${ids.regular}/applications`).expect(403);

    // Hall tickets: A did not apply, B is not eligible, C has not paid.
    await post('principal', `/v1/exam-sessions/${ids.regular}/schedule`).expect(200);
    expect((await post('principal', `/v1/exam-sessions/${ids.regular}/hall-tickets`, {}).expect(200)).body).toEqual({ issued: 0, blocked: 3 });
    const tickets = await q<{ roll_no: string; blocked_reason: string }>(`select st.roll_no, h.blocked_reason from hall_tickets h join students st on st.id = h.student_id where h.session_id = $1 order by st.roll_no`, [ids.regular]);
    expect(tickets.map((x) => x.blocked_reason)).toEqual(['Not registered for this examination', 'Not eligible: No subject can be written: see the reasons against each subject', 'Exam fee of Rs 500.00 is not paid']);

    // Paid at the counter: the exam fee settles and the ticket is issued.
    await post('accountant', `/v1/fees/invoices/${ids.invoiceC}/payments`, { amountPaise: 50_000, method: 'cash' }).expect(201);
    const paid = (await get('student', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}`).expect(200)).body;
    expect(paid.application.fee).toMatchObject({ status: 'paid', receiptNo: expect.any(String) });
    expect(paid.canSubmit).toBe(false);
    expect((await post('principal', `/v1/exam-sessions/${ids.regular}/hall-tickets`, {}).expect(200)).body).toEqual({ issued: 1, blocked: 2 });
    await post('student', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}/withdraw`, { reason: 'Changed my mind' }).expect(409); // paid
    await post('controller', `/v1/exam-sessions/${ids.regular}/application/${t.students[C].id}/withdraw`, { reason: 'Changed my mind' }).expect(409);
  });

  it('adds the late fee after the window closes and withdraws an unpaid application, cancelling its invoice', async () => {
    clock.at = new Date('2026-11-07T05:00:00Z'); // two days after the window closed, inside late registration
    const v = (await get('parentA', `/v1/exam-sessions/${ids.regular}/application/${t.students[A].id}`).expect(200)).body;
    expect(v.window.state).toBe('late');
    // A failed Corporate Accounting earlier; in a regular session this term's papers are written again as regular papers.
    expect(v.fee).toMatchObject({ papersPaise: 30_000, topUpPaise: 20_000, lateFeePaise: 20_000, totalPaise: 70_000 });
    const done = (await post('controller', `/v1/exam-sessions/${ids.regular}/application`, { studentId: t.students[A].id }).expect(200)).body;
    expect(done.application).toMatchObject({ status: 'registered', fee: { amountPaise: 70_000, status: 'due' } });
    const invoice = done.application.fee.invoiceId;

    await post('controller', `/v1/exam-sessions/${ids.regular}/application/${t.students[A].id}/withdraw`, { reason: 'x' }).expect(400);
    expect((await post('controller', `/v1/exam-sessions/${ids.regular}/application/${t.students[A].id}/withdraw`, { reason: 'Student will write the supplementary' }).expect(200)).body).toEqual({ withdrawn: true });
    expect((await q<{ status: string }>(`select status from fee_invoices where id = $1`, [invoice]))[0].status).toBe('cancelled');
    expect((await get('controller', `/v1/exam-sessions/${ids.regular}/applications`).expect(200)).body.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R2', 'R3']);
    expect(await q(`select action from audit_log where tenant_id = $1 and action like 'exam.application.%' order by id`, [t.tenantId])).toEqual([
      { action: 'exam.application.submitted' },
      { action: 'exam.application.submitted' },
      { action: 'exam.application.submitted' },
      { action: 'exam.application.withdrawn' },
    ]);
    clock.at = new Date('2026-11-01T05:00:00Z');
  });

  it('takes backlog and improvement papers in a supplementary session at the supplementary rate', async () => {
    ids.supp = await session('Sem 3 Supplementary Examination, January 2027', 'supplementary', '2027-01-18');
    await http().put(`/v1/exam-sessions/${ids.supp}/registration-window`).set(as('controller')).send({ opensOn: '2026-10-28', closesOn: '2026-11-15', maxBacklogs: 3 }).expect(200);

    const v = (await get('parentA', `/v1/exam-sessions/${ids.supp}/application/${t.students[A].id}`).expect(200)).body;
    expect(v.subjects.map((x: { code: string; kind: string; chosen: boolean; feePaise: number }) => [x.code, x.kind, x.chosen, x.feePaise])).toEqual([['BCOM-3.1', 'backlog', false, 25_000], ['BCOM-3.2', 'improvement', false, 25_000]]);
    expect(v.fee.totalPaise).toBe(0);
    await post('parentA', `/v1/exam-sessions/${ids.supp}/application`, { studentId: t.students[A].id, subjectIds: [] }).expect(400);
    await post('parentA', `/v1/exam-sessions/${ids.supp}/application`, { studentId: t.students[A].id, subjectIds: [ids.sub0] }).expect(400);

    // One backlog paper: Rs 250, raised to the Rs 500 minimum.
    const one = (await post('parentA', `/v1/exam-sessions/${ids.supp}/application`, { studentId: t.students[A].id, subjectIds: [ids.sub1] }).expect(200)).body;
    expect(one.fee).toMatchObject({ papersPaise: 25_000, topUpPaise: 25_000, totalPaise: 50_000 });
    expect(one.application).toMatchObject({ status: 'registered', fee: { amountPaise: 50_000 } });
    const first = one.application.fee.invoiceId;
    expect(await q(`select subject_id from supplementary_registrations where session_id = $1 and student_id = $2`, [ids.supp, t.students[A].id])).toEqual([{ subject_id: ids.sub1 }]);

    // Adding the improvement paper: 2 x 250 = 500, the same amount, so the same invoice stands.
    const two = (await post('parentA', `/v1/exam-sessions/${ids.supp}/application`, { studentId: t.students[A].id, subjectIds: [ids.sub1, ids.sub2] }).expect(200)).body;
    expect(two.fee).toMatchObject({ papersPaise: 50_000, topUpPaise: 0, totalPaise: 50_000 });
    expect(two.application.fee.invoiceId).toBe(first);
    expect((await q(`select subject_id from supplementary_registrations where session_id = $1 and student_id = $2 order by subject_id`, [ids.supp, t.students[A].id])).length).toBe(2);

    // C passed both, so only improvement is offered; the apps list the open application.
    const c = (await get('student', `/v1/exam-sessions/${ids.supp}/application/${t.students[C].id}`).expect(200)).body;
    expect(c.subjects.every((x: { kind: string }) => x.kind === 'improvement')).toBe(true);
    const mine = (await get('parentA', `/v1/students/${t.students[A].id}/exam-applications`).expect(200)).body;
    expect(mine.map((x: { session: { id: string } }) => x.session.id)).toContain(ids.supp);

    // The hall ticket of a repeater lists the papers registered (once the fee is paid).
    await post('principal', `/v1/exam-sessions/${ids.supp}/schedule`).expect(200);
    await post('accountant', `/v1/fees/invoices/${first}/payments`, { amountPaise: 50_000, method: 'upi', reference: 'UTR77' }).expect(201);
    const issued = (await post('principal', `/v1/exam-sessions/${ids.supp}/hall-tickets`, {}).expect(200)).body;
    expect(issued).toEqual({ issued: 1, blocked: 0 });
  });

  it('puts the revaluation fee on the fee account and decides the request only once it is paid', async () => {
    const r = (await post('student', `/v1/results/students/${t.students[C].id}/revaluations`, { sessionId: ids.past, subjectId: ids.sub1, reason: 'Expected more in question 4', kind: 'photocopy' }).expect(201)).body;
    expect(r).toMatchObject({ feePaise: 30_000, feeInvoiceId: expect.any(String) });
    expect((await q<{ title: string; amount_paise: string }>(`select title, amount_paise from fee_invoices where id = $1`, [r.feeInvoiceId]))[0]).toEqual({ title: 'Answer script photocopy fee: BCOM-3.1, Sem 3 Model Examination, October 2026', amount_paise: '30000' });
    expect((await post('controller', `/v1/revaluations/${r.id}/decide`, { accept: true }).expect(409)).body.message).toMatch(/not paid/);
    await post('accountant', `/v1/fees/invoices/${r.feeInvoiceId}/payments`, { amountPaise: 30_000, method: 'cash' }).expect(201);
    await post('controller', `/v1/revaluations/${r.id}/decide`, { accept: true }).expect(200);

    // Turning down a request whose fee is unpaid cancels the invoice.
    const r2 = (await post('student', `/v1/results/students/${t.students[C].id}/revaluations`, { sessionId: ids.past, subjectId: ids.sub2, reason: 'Totals look wrong', kind: 'retotalling' }).expect(201)).body;
    expect(r2.feePaise).toBe(20_000);
    await post('controller', `/v1/revaluations/${r2.id}/decide`, { accept: false, note: 'Totals verified' }).expect(200);
    expect((await q<{ status: string }>(`select status from fee_invoices where id = $1`, [r2.feeInvoiceId]))[0].status).toBe('cancelled');
  });

  it('sets the question paper: appointments, sets against the blueprint, the appointed moderator, the draw and the sealed release', async () => {
    // Outcomes and an approved bank for Corporate Accounting: 16 short (2 marks) and 8 long (5 marks) questions.
    const [set] = await q<{ id: string }>(`insert into co_sets (tenant_id, subject_id, version, status, created_by) values ($1, $2, 1, 'active', $3) returning id`, [t.tenantId, ids.sub1, t.principal.id]);
    const cos: string[] = [];
    for (const [i, code] of ['CO1', 'CO2', 'CO3'].entries()) cos.push((await q<{ id: string }>(`insert into course_outcomes (tenant_id, co_set_id, code, statement, ord) values ($1, $2, $3, $4, $5) returning id`, [t.tenantId, set.id, code, `Outcome ${code}`, i]))[0].id);
    const bloom = ['remember', 'understand', 'apply', 'analyze'];
    const diff = ['easy', 'medium', 'hard'];
    for (let i = 0; i < 24; i++) {
      await q(`insert into qb_questions (tenant_id, subject_id, topic, unit, co_id, bloom, difficulty, marks, type, text, answer, status, author_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Answer', 'approved', $11)`, [t.tenantId, ids.sub1, `Topic ${i % 4}`, `Unit ${(i % 3) + 1}`, cos[i % 3], bloom[i % 4], diff[i % 3], i < 16 ? 2 : 5, i < 16 ? 'short' : 'long', `Explain idea ${i} of corporate accounting with the walrus${i} ledger`, t.teacher.id]);
    }
    const bp = (await post('principal', '/v1/question-bank/blueprints', { subjectId: ids.sub1, title: 'SEE blueprint', totalMarks: 18, durationMinutes: 90, sections: [{ name: 'Section A', count: 4, questionMarks: 2, type: 'short', coverage: [cos[0], cos[1]] }, { name: 'Section B', count: 2, questionMarks: 5, coverage: [cos[2]] }] }).expect(201)).body;

    const appoint = (who: string, body: object) => post(who, `/v1/exam-sessions/${ids.supp}/qp-appointments`, { subjectId: ids.sub1, dueOn: '2026-11-10', ...body });
    await appoint('teacher', { role: 'setter', userId: t.teacher.id }).expect(403);
    await appoint('controller', { role: 'setter', userId: t.studentUser.id }).expect(400);
    const setter = (await appoint('controller', { role: 'setter', userId: t.teacher.id, setsRequired: 2, remunerationPaise: 150_000 }).expect(201)).body;
    await appoint('controller', { role: 'setter', userId: t.teacher.id }).expect(409);
    await appoint('controller', { role: 'moderator', userId: t.teacher.id }).expect(400); // setter and moderator differ
    const mod = (await appoint('controller', { role: 'moderator', userId: ids.hod }).expect(201)).body;
    await appoint('controller', { role: 'moderator', userId: t.teacher2.id }).expect(409);
    expect(await q(`select assignee_id, source_module from tasks where source_id = $1`, [setter.id])).toEqual([{ assignee_id: t.teacher.id, source_module: 'qp_setting' }]);

    // Only the appointed setter, once they accept, makes sets of the examination.
    const makeSet = (who: string, extra: object = {}) => post(who, '/v1/question-bank/papers', { blueprintId: bp.id, title: 'BCOM-3.1 Supplementary', sessionId: ids.supp, ...extra });
    await makeSet('teacher').expect(403);
    await post('teacher2', `/v1/qp-appointments/${setter.id}/respond`, { accept: true }).expect(403);
    await post('teacher', `/v1/qp-appointments/${setter.id}/respond`, { accept: true }).expect(200);
    await post('hod', `/v1/qp-appointments/${mod.id}/respond`, { accept: true }).expect(200);
    await makeSet('teacher2').expect(403);
    const setA = (await makeSet('teacher').expect(201)).body;
    const setB = (await makeSet('teacher').expect(201)).body;
    expect([setA.setLabel, setB.setLabel, setA.title]).toEqual(['A', 'B', 'BCOM-3.1 Supplementary (Set A)']);
    await makeSet('teacher', { setLabel: 'A' }).expect(409);
    expect((await get('teacher', '/v1/qp-appointments/mine').expect(200)).body[0]).toMatchObject({ role: 'setter', setsMade: 2, code: 'BCOM-3.1' });

    // What each set covers against the blueprint and the outcomes.
    const cov = (await get('controller', `/v1/exam-sessions/${ids.supp}/subjects/${ids.sub1}/qp-coverage`).expect(200)).body;
    expect(cov.outcomes).toEqual(['CO1', 'CO2', 'CO3']);
    expect(cov.sets[0]).toMatchObject({ setLabel: 'A', coverage: { totalMarks: 18, questions: 6 } });
    expect(Object.values(cov.sets[0].coverage.byCo as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(18);
    await get('teacher2', `/v1/exam-sessions/${ids.supp}/subjects/${ids.sub1}/qp-coverage`).expect(404);

    // Scrutiny goes to the appointed moderator only; the office locks.
    await post('teacher', `/v1/question-bank/papers/${setA.id}/submit`, { moderatorId: t.teacher2.id }).expect(400);
    for (const s of [setA, setB]) {
      await post('teacher', `/v1/question-bank/papers/${s.id}/submit`, { moderatorId: ids.hod }).expect(200);
      await post('hod', `/v1/question-bank/papers/${s.id}/scrutiny`, { decision: 'approve' }).expect(200);
    }
    const releaseAt = new Date('2027-01-18T04:00:00Z').toISOString();
    await post('controller', `/v1/question-bank/papers/${setA.id}/release`, { releaseAt, controllerId: ids.controller }).expect(409); // not locked
    for (const s of [setA, setB]) await post('principal', `/v1/question-bank/papers/${s.id}/lock`).expect(200);
    expect((await post('controller', `/v1/question-bank/papers/${setA.id}/release`, { releaseAt, controllerId: ids.controller }).expect(409)).body.message).toMatch(/Draw the set/);

    const ov = (await get('controller', `/v1/exam-sessions/${ids.supp}/qp-setting`).expect(200)).body;
    expect(ov.summary).toMatchObject({ subjects: 2, withSetter: 1, setsLocked: 2, drawn: 0 });
    const row = ov.subjects.find((x: { code: string }) => x.code === 'BCOM-3.1');
    expect(row.appointments.map((a: { role: string; progress: string }) => [a.role, a.progress])).toEqual([['setter', 'completed'], ['moderator', 'accepted']]);
    expect(row.canDraw).toBe(true);

    // The draw: one of the locked sets, sealed for release 30 minutes before 10:00 IST on 18 January 2027.
    await post('teacher', `/v1/exam-sessions/${ids.supp}/subjects/${ids.sub1}/draw`).expect(403);
    const draw = (await post('controller', `/v1/exam-sessions/${ids.supp}/subjects/${ids.sub1}/draw`).expect(200)).body;
    expect(['A', 'B']).toContain(draw.setLabel);
    expect(draw).toMatchObject({ from: 2, releaseAt: '2027-01-18T04:00:00.000Z' });
    await post('controller', `/v1/exam-sessions/${ids.supp}/subjects/${ids.sub1}/draw`).expect(409);
    const reserve = draw.paperId === setA.id ? setB : setA;
    expect((await post('controller', `/v1/question-bank/papers/${reserve.id}/release`, { releaseAt, controllerId: ids.controller }).expect(409)).body.message).toMatch(/reserve/);
    expect((await get('controller', `/v1/exam-sessions/${ids.supp}/qp-setting`).expect(200)).body.summary.drawn).toBe(1);

    // A decline needs a reason and goes back to the office.
    const other2 = (await post('controller', `/v1/exam-sessions/${ids.supp}/qp-appointments`, { subjectId: ids.sub2, role: 'setter', userId: t.teacher2.id, dueOn: '2026-11-12' }).expect(201)).body;
    await post('teacher2', `/v1/qp-appointments/${other2.id}/respond`, { accept: false }).expect(400);
    await post('teacher2', `/v1/qp-appointments/${other2.id}/respond`, { accept: false, note: 'On leave that week' }).expect(200);
    expect((await q(`select 1 from notifications where user_id = $1 and dedupe_key = $2`, [ids.controller, `qp:declined:${other2.id}`])).length).toBe(1);
    await post('controller', `/v1/qp-appointments/${other2.id}/cancel`, { reason: 'Declined' }).expect(409);
    await get('outsider', `/v1/exam-sessions/${ids.supp}/qp-setting`).expect(404);
  });

  it('unlocks submitted marks only on the approval of the head of department', async () => {
    const a = (await post('teacher', '/v1/assessments', { sectionId: t.section.id, subjectId: ids.sub1, title: 'Internal test 2', kind: 'test', maxMarks: 20, heldOn: '2026-10-28' }).expect(201)).body.id;
    await http().put(`/v1/assessments/${a}/marks`).set(as('teacher')).send({ entries: [12, 15, 18].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'Still open for editing' }).expect(409); // a draft is open already
    await post('teacher', `/v1/assessments/${a}/submit`).expect(200);
    await http().put(`/v1/assessments/${a}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[A].id, marks: 13 }] }).expect(409);

    await post('teacher2', `/v1/assessments/${a}/unlock-requests`, { reason: 'Not my class at all' }).expect(403);
    await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'no' }).expect(400);
    const r = (await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'Student A was marked 12 instead of 13 after recounting' }).expect(201)).body;
    await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'Asking a second time' }).expect(409);
    expect((await q(`select 1 from notifications where user_id = $1 and dedupe_key = $2`, [ids.hod, `marks-unlock:${r.id}`])).length).toBe(1);

    expect((await get('teacher2', '/v1/marks-unlock-requests').expect(200)).body).toEqual([]);
    expect((await get('hod', '/v1/marks-unlock-requests?status=pending').expect(200)).body[0]).toMatchObject({ id: r.id, code: 'BCOM-3.1', canDecide: true, mine: false });
    await post('teacher', `/v1/marks-unlock-requests/${r.id}/decide`, { approve: true }).expect(403);
    await post('hod', `/v1/marks-unlock-requests/${r.id}/decide`, { approve: false }).expect(400);
    await post('hod', `/v1/marks-unlock-requests/${r.id}/decide`, { approve: true, note: 'Correct it today' }).expect(200);
    await post('hod', `/v1/marks-unlock-requests/${r.id}/decide`, { approve: true }).expect(409);
    expect((await q<{ mark_status: string }>(`select mark_status from assessments where id = $1`, [a]))[0].mark_status).toBe('draft');
    await http().put(`/v1/assessments/${a}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[A].id, marks: 13 }] }).expect(200);
    expect((await q(`select action from audit_log where tenant_id = $1 and subject_id = $2 and action = 'marks.unlocked'`, [t.tenantId, a])).length).toBe(1);

    // A request can be withdrawn by the person who asked.
    await post('teacher', `/v1/assessments/${a}/submit`).expect(200);
    const r2 = (await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'One more correction for student B' }).expect(201)).body;
    await post('hod', `/v1/marks-unlock-requests/${r2.id}/cancel`).expect(403);
    expect((await post('teacher', `/v1/marks-unlock-requests/${r2.id}/cancel`).expect(200)).body.status).toBe('cancelled');
    expect((await get('teacher', `/v1/assessments/${a}/unlock-requests`).expect(200)).body.map((x: { status: string }) => x.status)).toEqual(['cancelled', 'approved']);
    expect((await get('outsider', '/v1/marks-unlock-requests').expect(200)).body).toEqual([]);
    await get('student', '/v1/marks-unlock-requests').expect(403);
  });

  it('prints the attendance sheet, D-form and tabulation register, and keeps a marks ledger of every attempt', async () => {
    const [paper] = await q<{ id: string }>(`select id from exam_papers where session_id = $1 and subject_id = $2`, [ids.supp, ids.sub1]);
    const sheet = await pdfOf('teacher', `/v1/exam-sessions/${ids.supp}/registers/attendance-sheet.pdf?paperId=${paper.id}`).expect(200);
    expect(sheet.headers['content-type']).toBe('application/pdf');
    expect((sheet.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher', `/v1/exam-sessions/${ids.supp}/registers/attendance-sheet.pdf`).expect(400);
    expect(((await pdfOf('controller', `/v1/exam-sessions/${ids.supp}/registers/d-form.pdf?paperId=${paper.id}`).expect(200)).body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher', `/v1/exam-sessions/${ids.supp}/registers/d-form.pdf?paperId=${paper.id}`).expect(403);
    await get('controller', `/v1/exam-sessions/${ids.supp}/registers/tabulation.pdf`).expect(400); // not processed
    expect(((await pdfOf('controller', `/v1/exam-sessions/${ids.past}/registers/tabulation.pdf`).expect(200)).body as Buffer).length).toBeGreaterThan(500);

    const ledger = (await get('parentA', `/v1/students/${t.students[A].id}/marks-ledger`).expect(200)).body;
    expect(ledger.summary).toMatchObject({ subjects: 2, cleared: 1, backlogs: 1, creditsEarned: 4, attempts: 2 });
    expect(ledger.attempts.find((x: { code: string }) => x.code === 'BCOM-3.1')).toMatchObject({ passed: false, counts: true, percent: 31 });
    await get('parentB', `/v1/students/${t.students[A].id}/marks-ledger`).expect(404);
  });

  it('analyses results by class, grade and year (worked by hand)', async () => {
    // The October sitting: Corporate Accounting F 31, C 55, C 72 (2 of 3 pass); Cost Accounting B 58, B 62, B 80.
    const sec = (await get('hod', `/v1/exam-cell/reports/pass_by_section?sessionId=${ids.past}`).expect(200)).body;
    expect(sec.rows.map((r: { section: string; code: string; passed: number; passPercent: number; mean: number }) => [r.section, r.code, r.passed, r.passPercent, r.mean])).toEqual([
      ['BCom Sem 3 A', 'BCOM-3.1', 2, 66.67, 52.67],
      ['BCom Sem 3 A', 'BCOM-3.2', 3, 100, 66.67],
    ]);
    expect(sec.totals).toMatchObject({ appeared: 6, passed: 5, passPercent: 83.33 });

    // Grades ordered by their mean percent: B (66.67), C (63.5), F (31).
    const dist = (await get('hod', `/v1/exam-cell/reports/grade_distribution?sessionId=${ids.past}`).expect(200)).body;
    expect(dist.columns.map((c: { label: string }) => c.label)).toEqual(['Code', 'Subject', 'Appeared', 'B', 'C', 'F']);
    expect(dist.rows.map((r: Record<string, unknown>) => [r.code, r['g:B'], r['g:C'], r['g:F']])).toEqual([['BCOM-3.1', 0, 2, 1], ['BCOM-3.2', 3, 0, 0]]);
    expect(dist.totals).toMatchObject({ appeared: 6, 'g:B': 3, 'g:C': 2, 'g:F': 1 });

    // A year earlier 1 of 2 passed (50%); this year 2 of 3 (66.67%): up 16.67 points.
    const [y] = await q<{ id: string }>(`insert into academic_years (tenant_id, label, starts_on, ends_on, is_current) values ($1, '2025-26', '2025-08-01', '2026-05-31', false) returning id`, [t.tenantId]);
    const [old] = await q<{ id: string }>(`insert into exam_sessions (tenant_id, academic_year_id, program_id, term, name, kind, starts_on, ends_on, status, created_by) values ($1, $2, $3, 3, 'Sem 3 Model Examination, October 2025', 'regular', '2025-10-06', '2025-10-13', 'published', $4) returning id`, [t.tenantId, y.id, t.program.id, t.principal.id]);
    for (const [i, outcome, sgpa] of [[A, 'pass', 6.1], [B, 'fail', 3.2]] as const) await q(`insert into exam_results (tenant_id, session_id, student_id, sgpa, cgpa, credits_attempted, credits_earned, credit_points, outcome) values ($1, $2, $3, $4, $4, 8, 8, 40, $5)`, [t.tenantId, old.id, t.students[i].id, sgpa, outcome]);
    const yc = (await get('hod', `/v1/exam-cell/reports/year_comparison?sessionId=${ids.past}`).expect(200)).body;
    expect(yc.rows.map((r: { year: string; appeared: number; passPercent: number; change: number | string; topSgpa: number }) => [r.year, r.appeared, r.passPercent, r.change, r.topSgpa])).toEqual([
      ['2025-26', 2, 50, '', 6.1],
      ['2026-27', 3, 66.67, 16.67, 6.5],
    ]);
    const csv = await get('hod', `/v1/exam-cell/reports/year_comparison?sessionId=${ids.past}&format=csv`).expect(200);
    expect(csv.text.split('\n')[0]).toBe('Academic year,Examination,Appeared,Passed,Pass %,Change in pass %,Mean SGPA,Top SGPA');
    await get('teacher', `/v1/exam-cell/reports/year_comparison?sessionId=${ids.past}`).expect(403);
  });

  it('keeps appointments and unlock requests as record kit lists', async () => {
    const list = (await get('controller', `/v1/records/qp-appointments?f.session=${ids.supp}&sort=due:asc`).expect(200)).body;
    expect(list.rows.map((r: { code: string; role: string; status: string }) => [r.code, r.role, r.status])).toEqual([['BCOM-3.1', 'setter', 'accepted'], ['BCOM-3.1', 'moderator', 'accepted'], ['BCOM-3.2', 'setter', 'declined']]);
    const meta = (await get('controller', '/v1/records/qp-appointments/meta').expect(200)).body;
    expect(meta.can).toMatchObject({ write: true, create: false });
    const setter = list.rows[0];
    await http().patch(`/v1/records/qp-appointments/${setter.id}`).set(as('controller')).send({ dueOn: '2026-11-14' }).expect(200);
    const h = (await get('controller', `/v1/records/qp-appointments/${setter.id}/history`).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(h).toEqual(expect.arrayContaining(['qp.appointed', 'qp.accepted']));
    await http().delete(`/v1/records/qp-appointments/${setter.id}`).set(as('controller')).expect(403);
    const declined = list.rows[2];
    await http().patch(`/v1/records/qp-appointments/${declined.id}`).set(as('controller')).send({ note: 'x' }).expect(409);
    const cancelled = (await post('controller', '/v1/records/qp-appointments/bulk', { op: 'action', action: 'cancel', target: { ids: [list.rows[1].id] }, params: { reason: 'Moderator changed' } }).expect(200)).body;
    expect(cancelled.succeeded).toBe(1);
    const csv = await get('controller', `/v1/records/qp-appointments/export?format=csv&f.session=${ids.supp}`).expect(200);
    expect(csv.text.split('\n')[0]).toContain('Exam session,Code,Subject,Role,Appointed');
    expect((await get('outsider', '/v1/records/qp-appointments').expect(200)).body.total).toBe(0);
    await get('teacher', '/v1/records/qp-appointments').expect(403);

    // Unlock requests: the teacher sees their own, the head of department theirs, another teacher nothing.
    expect((await get('teacher', '/v1/records/marks-unlock-requests').expect(200)).body.total).toBe(2);
    expect((await get('teacher2', '/v1/records/marks-unlock-requests').expect(200)).body.total).toBe(0);
    expect((await get('hod', '/v1/records/marks-unlock-requests?f.status=approved').expect(200)).body.total).toBe(1);
    const a = (await q<{ id: string }>(`select id from assessments where title = 'Internal test 2' and tenant_id = $1`, [t.tenantId]))[0].id;
    const r = (await post('teacher', `/v1/assessments/${a}/unlock-requests`, { reason: 'Student C total needs a fix' }).expect(201)).body;
    await post('teacher', '/v1/records/marks-unlock-requests/bulk', { op: 'action', action: 'approve', target: { ids: [r.id] }, params: {} }).expect(403);
    const turned = (await post('hod', '/v1/records/marks-unlock-requests/bulk', { op: 'action', action: 'reject', target: { ids: [r.id] }, params: { note: 'Totals are correct' } }).expect(200)).body;
    expect(turned.succeeded).toBe(1);
    expect((await get('hod', `/v1/records/marks-unlock-requests/${r.id}`).expect(200)).body).toMatchObject({ status: 'rejected', decisionNote: 'Totals are correct' });
    await http().delete(`/v1/records/marks-unlock-requests/${r.id}`).set(as('hod')).expect(403);
  });
});
