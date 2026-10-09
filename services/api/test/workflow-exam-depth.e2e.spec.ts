import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { hallTicketCode } from '../src/exams/hall-ticket-code.js';
import { TasksService } from '../src/tasks/tasks.service.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

/** Parallel / conditional / SLA workflow steps, task escalation, exam registration, hall ticket QR and anti-collusion seating. */
describe('workflow depth and exam registration / seating', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
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
  const q = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows;
  const submit = async (who: string, requestType: string, over: object = {}) => (await post(who, '/v1/workflows/requests', { requestType, title: `Request ${requestType}`, ...over }).expect(201)).body as { id: string; status: string; currentStep: number; steps: { name: string }[] };
  const decide = (who: string, id: string, decision: string, comment = '') => post(who, `/v1/workflows/requests/${id}/decide`, { decision, comment });
  const inbox = async (who: string) => ((await get(who, '/v1/workflows/requests/inbox').expect(200)).body as { id: string }[]).map((x) => x.id);
  const detail = async (who: string, id: string) => (await get(who, `/v1/workflows/requests/${id}`).expect(200)).body;
  const tasksOf = (requestId: string) => q('select * from tasks where tenant_id = $1 and source_module = $2 and source_id = $3 order by created_at', [t.tenantId, 'workflows', requestId]);
  const ago = (hours: number) => new Date(clock.at.getTime() - hours * 3_600_000);

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@wfx.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const accountant = await addUser('Asha Accounts', 'accountant');
    const hr = await addUser('Hema HR', 'hr_manager');
    const librarian = await addUser('Leela Library', 'librarian');
    Object.assign(ids, { accountant: accountant.id, hr: hr.id, librarian: librarian.id });
    app = await createApp(clock);
    tokens = {
      accountant: await login(t.slug, accountant.email!),
      hr: await login(t.slug, hr.email!),
      librarian: await login(t.slug, librarian.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      student: await login(t.slug, t.studentUser.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
    };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('workflow engine', () => {
    it('validates parallel, conditional and SLA steps in a definition', async () => {
      const base = { requestType: 'bad', name: 'Bad definition' };
      await post('principal', '/v1/workflows/definitions', { ...base, steps: [{ name: 'S', approvers: [{ kind: 'role', role: 'accountant' }, { kind: 'role', role: 'hr_manager' }] }] }).expect(400); // no mode
      await post('principal', '/v1/workflows/definitions', { ...base, steps: [{ name: 'S', approver: { kind: 'role', role: 'accountant' }, approvers: [{ kind: 'role', role: 'accountant' }, { kind: 'role', role: 'hr_manager' }], mode: 'all' }] }).expect(400); // both
      await post('principal', '/v1/workflows/definitions', { ...base, steps: [{ name: 'S', approver: { kind: 'role', role: 'accountant' }, escalateTo: { kind: 'role', role: 'principal' } }] }).expect(400); // escalation without SLA
      await post('principal', '/v1/workflows/definitions', { ...base, steps: [{ name: 'S', approver: { kind: 'role', role: 'accountant' }, slaHours: 10, reminderHours: 10 }] }).expect(400); // reminder not before SLA
      await post('principal', '/v1/workflows/definitions', { ...base, steps: [{ name: 'S', approver: { kind: 'role', role: 'accountant' }, conditions: [{ field: 'amount', op: '~', value: 1 }] }] }).expect(400);
    });

    it('asks parallel approvers at once: all of them, or any one', async () => {
      await post('principal', '/v1/workflows/definitions', {
        requestType: 'purchase_all',
        name: 'Purchase, budget and HR sign-off',
        fields: [{ key: 'kind', label: 'Kind', type: 'select', required: true, options: ['books', 'equipment'] }],
        steps: [
          { name: 'Budget and HR', approvers: [{ kind: 'role', role: 'accountant' }, { kind: 'role', role: 'hr_manager' }], mode: 'all', slaHours: 48, reminderHours: 24, escalateTo: { kind: 'role', role: 'principal' } },
          { name: 'Principal', approver: { kind: 'role', role: 'principal' }, conditions: [{ field: 'amount', op: '>', value: 100000 }] },
          { name: 'Library check', approver: { kind: 'role', role: 'librarian' }, conditions: [{ field: 'kind', op: '==', value: 'books' }] },
        ],
      }).expect(201);
      await post('principal', '/v1/workflows/definitions', {
        requestType: 'quote_any',
        name: 'Quote check (either)',
        steps: [{ name: 'Either desk', approvers: [{ kind: 'role', role: 'accountant' }, { kind: 'role', role: 'hr_manager' }], mode: 'any' }],
      }).expect(201);

      // Small equipment purchase: the amount and kind conditions drop the other two steps.
      const small = await submit('teacher', 'purchase_all', { amount: 5000, payload: { kind: 'equipment' } });
      expect(small.steps.map((x) => x.name)).toEqual(['Budget and HR']);
      expect(await tasksOf(small.id)).toHaveLength(2);
      expect(await inbox('accountant')).toContain(small.id);
      expect(await inbox('hr')).toContain(small.id);
      expect(await inbox('librarian')).not.toContain(small.id);
      expect((await detail('accountant', small.id)).canDecide).toBe(true);
      await decide('teacher2', small.id, 'approve').expect(403);

      const first = (await decide('accountant', small.id, 'approve').expect(200)).body;
      expect(first.status).toBe('pending'); // HR has not decided yet
      expect(await inbox('accountant')).not.toContain(small.id);
      await decide('accountant', small.id, 'approve').expect(403); // already decided
      expect(await inbox('hr')).toContain(small.id);
      expect((await decide('hr', small.id, 'approve').expect(200)).body.status).toBe('approved');
      expect((await tasksOf(small.id)).map((x) => x.status)).toEqual(['done', 'done']);

      // Large book purchase: all three steps apply, in order.
      const big = await submit('teacher', 'purchase_all', { amount: 250000, payload: { kind: 'books' } });
      expect(big.steps.map((x) => x.name)).toEqual(['Budget and HR', 'Principal', 'Library check']);

      // A rejection from either parallel approver ends the step.
      const rej = await submit('teacher', 'purchase_all', { amount: 100, payload: { kind: 'equipment' } });
      await decide('hr', rej.id, 'reject').expect(422);
      expect((await decide('hr', rej.id, 'reject', 'Not budgeted').expect(200)).body.status).toBe('rejected');
      expect((await tasksOf(rej.id)).map((x) => x.status).sort()).toEqual(['cancelled', 'done']);

      // Any one is enough; the other task is cancelled.
      const any = await submit('teacher', 'quote_any');
      expect(await tasksOf(any.id)).toHaveLength(2);
      expect((await decide('hr', any.id, 'approve').expect(200)).body.status).toBe('approved');
      expect((await tasksOf(any.id)).map((x) => x.status).sort()).toEqual(['cancelled', 'done']);
      expect(await inbox('accountant')).not.toContain(any.id);
    });

    it('reminds, then escalates an overdue step to the named role once, and the target can decide alone', async () => {
      const r = await submit('teacher', 'purchase_all', { amount: 100, payload: { kind: 'equipment' } });
      await post('teacher', '/v1/workflows/sla/run').expect(403);
      expect((await post('principal', '/v1/workflows/sla/run').expect(200)).body).toEqual({ reminded: [], escalated: [] });

      await owner.query('update workflow_requests set step_entered_at = $2 where id = $1', [r.id, ago(30)]);
      const reminded = (await post('principal', '/v1/workflows/sla/run').expect(200)).body;
      expect(reminded.reminded).toEqual([r.id]);
      expect(reminded.escalated).toEqual([]);
      expect((await post('principal', '/v1/workflows/sla/run').expect(200)).body.reminded).toEqual([]); // once
      expect(await q('select 1 from notifications where tenant_id = $1 and user_id = $2 and data->>\'requestId\' = $3', [t.tenantId, ids.accountant, r.id])).not.toHaveLength(0);
      expect(await inbox('principal')).not.toContain(r.id);

      await owner.query('update workflow_requests set step_entered_at = $2 where id = $1', [r.id, ago(50)]);
      expect((await post('principal', '/v1/workflows/sla/run').expect(200)).body.escalated).toEqual([r.id]);
      expect((await post('principal', '/v1/workflows/sla/run').expect(200)).body.escalated).toEqual([]); // once
      const d = await detail('principal', r.id);
      expect(d.timeline.map((x: { action: string }) => x.action)).toEqual(['submitted', 'reminded', 'escalated']);
      expect(d.canDecide).toBe(true);
      expect(await inbox('principal')).toContain(r.id);
      expect((await tasksOf(r.id)).some((x) => x.assignee_id === t.principal.id && x.priority === 'urgent')).toBe(true);
      expect((await q('select action from audit_log where tenant_id = $1 and subject_id = $2', [t.tenantId, r.id])).map((x) => x.action)).toContain('workflow.escalated');

      // The escalation target's approval completes the step although neither desk approved.
      expect((await decide('principal', r.id, 'approve').expect(200)).body.status).toBe('approved');
      expect((await tasksOf(r.id)).every((x) => x.status === 'done' || x.status === 'cancelled')).toBe(true);
    });

    it('escalates a task to a named role or user after its deadline, and reminds once before that', async () => {
      const svc = app.get(TasksService);
      await post('teacher', '/v1/tasks', { title: 'Escalate to role', assigneeId: t.teacher2.id, escalateRole: 'principal' }).expect(422); // needs a deadline
      const byRole = (await post('teacher', '/v1/tasks', { title: 'Collect the lab keys', assigneeId: t.teacher2.id, slaHours: 4, escalateRole: 'principal', reminderHours: 2 }).expect(201)).body;
      const byUser = (await post('teacher', '/v1/tasks', { title: 'File the stock return', assigneeId: t.teacher2.id, slaHours: 4, escalateUserId: ids.accountant }).expect(201)).body;
      await post('teacher', '/v1/tasks', { title: 'Ghost', assigneeId: t.teacher2.id, slaHours: 4, escalateUserId: '00000000-0000-4000-8000-000000000000' }).expect(404);

      await owner.query('update tasks set created_at = $2 where id = $1', [byRole.id, ago(3)]);
      expect((await svc.sweep(t.tenantId)).reminded).toEqual([byRole.id]);
      expect((await svc.sweep(t.tenantId)).reminded).toEqual([]);
      expect((await q('select reminded_at from tasks where id = $1', [byRole.id]))[0].reminded_at).not.toBeNull();

      await owner.query('update tasks set due_at = $2 where id in ($1, $3)', [byRole.id, ago(1), byUser.id]);
      expect((await svc.sweep(t.tenantId)).escalated.sort()).toEqual([byRole.id, byUser.id].sort());
      expect((await svc.sweep(t.tenantId)).escalated).toEqual([]);
      const who = async (taskId: string) => (await q('select user_id from notifications where tenant_id = $1 and data->>\'taskId\' = $2 and title ilike $3', [t.tenantId, taskId, '%overdue%'])).map((x) => x.user_id);
      expect(await who(byRole.id)).toEqual([t.principal.id]);
      expect(await who(byUser.id)).toEqual([ids.accountant]);
    });
  });

  describe('exam registration, hall ticket QR and seating', () => {
    let sessionId: string;
    let program2: typeof s.programs.$inferSelect;
    let subject2: typeof s.subjects.$inferSelect;
    let section2: typeof s.sections.$inferSelect;
    let students2: (typeof s.students.$inferSelect)[];
    const [R1, R2, R3] = [0, 1, 2];

    beforeAll(async () => {
      const [prog] = await db.insert(s.programs).values({ tenantId: t.tenantId, campusId: t.campus.id, name: 'BBA', level: 'ug', termCount: 6 }).returning();
      program2 = prog;
      [section2] = await db.insert(s.sections).values({ tenantId: t.tenantId, programId: prog.id, academicYearId: t.section.academicYearId, term: 3, name: 'A', displayName: 'BBA Sem 3 A' }).returning();
      [subject2] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: prog.id, term: 3, code: 'BBA-3.1', name: 'Marketing' }).returning();
      students2 = await db.insert(s.students).values(['X', 'Y', 'Z'].map((x, i) => ({ tenantId: t.tenantId, sectionId: section2.id, rollNo: `B${i + 1}`, fullName: `BBA ${x}` }))).returning();
      const [session] = await db
        .insert(s.examSessions)
        .values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 end exam Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20', status: 'scheduled', createdBy: t.principal.id })
        .returning();
      sessionId = session.id;
      await db.insert(s.examPapers).values([
        { tenantId: t.tenantId, sessionId, subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 },
        { tenantId: t.tenantId, sessionId, subjectId: subject2.id, sectionId: section2.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 },
      ]);
      // R1 attended 6 of 10 days; R2 owes an overdue fee; R3 has neither record.
      const days = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
      await db.insert(s.attendanceRecords).values(days.map((date, i) => ({ tenantId: t.tenantId, studentId: t.students[R1].id, sectionId: t.section.id, date, status: i < 6 ? ('present' as const) : ('absent' as const), markedBy: t.teacher.id, occurredAt: new Date(`${date}T04:00:00Z`) })));
      await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[R2].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Tuition', amountPaise: 500000, paidPaise: 100000, dueOn: '2026-10-01', createdBy: t.principal.id });
    });

    it('sets a registration window (administrators only, dates checked)', async () => {
      const body = { opensOn: '2026-10-15', closesOn: '2026-10-25', minAttendancePercent: 75, blockOnFeeDues: true, maxBacklogs: 1 };
      await put('teacher', `/v1/exam-sessions/${sessionId}/registration-window`, body).expect(403);
      await put('principal', `/v1/exam-sessions/${sessionId}/registration-window`, { ...body, closesOn: '2026-10-01' }).expect(400);
      expect((await put('principal', `/v1/exam-sessions/${sessionId}/registration-window`, body).expect(200)).body.minAttendancePercent).toBe(75);
      expect((await get('student', `/v1/exam-sessions/${sessionId}/registration-window`).expect(200)).body.state).toBe('open');
    });

    it('registers eligible students and holds back those with an attendance shortage or fee dues', async () => {
      const url = `/v1/exam-sessions/${sessionId}/register`;
      const peek = (await get('parentA', `/v1/exam-sessions/${sessionId}/eligibility/${t.students[R1].id}`).expect(200)).body;
      expect(peek.facts.attendancePercent).toBe(60);
      expect(peek.eligible).toBe(false);

      await post('parentA', url, { studentId: t.students[R2].id }).expect(404); // not their child
      const r1 = (await post('parentA', url, { studentId: t.students[R1].id }).expect(200)).body;
      expect(r1.status).toBe('ineligible');
      expect(r1.reasons[0]).toMatch(/Attendance shortage: 60\.0%/);
      const r2 = (await post('parentB', url, { studentId: t.students[R2].id }).expect(200)).body;
      expect(r2.status).toBe('ineligible');
      expect(r2.reasons[0]).toMatch(/Fee dues of Rs 4000\.00/);
      const r3 = (await post('student', url, { studentId: t.students[R3].id }).expect(200)).body;
      expect(r3).toMatchObject({ status: 'registered', reasons: [] }); // no attendance recorded: not held against them
      await post('student', url, { studentId: students2[0].id }).expect(404);
      await post('principal', url, { studentId: students2[0].id }).expect(400); // a BBA student is not in this programme
    });

    it('lets the controller override an ineligible student with a reason, and refuses outside the window', async () => {
      const url = (sid: string) => `/v1/exam-sessions/${sessionId}/registrations/${sid}/override`;
      await post('teacher', url(t.students[R1].id), { reason: 'Medical leave approved' }).expect(403);
      await post('principal', url(t.students[R1].id), { reason: 'no' }).expect(400);
      const o = (await post('principal', url(t.students[R1].id), { reason: 'Medical leave approved by the principal' }).expect(200)).body;
      expect(o).toMatchObject({ status: 'registered', overrideReason: 'Medical leave approved by the principal' });
      expect(o.reasons[0]).toMatch(/Attendance shortage/);
      const list = (await get('principal', `/v1/exam-sessions/${sessionId}/registrations`).expect(200)).body as { rollNo: string; status: string; overridden: boolean }[];
      expect(list.find((x) => x.rollNo === 'R1')).toMatchObject({ status: 'registered', overridden: true });
      expect(list.find((x) => x.rollNo === 'R2')).toMatchObject({ status: 'ineligible', overridden: false });
      expect((await q('select action from audit_log where tenant_id = $1', [t.tenantId])).map((x) => x.action)).toContain('exam.registration.overridden');

      await put('principal', `/v1/exam-sessions/${sessionId}/registration-window`, { opensOn: '2026-10-01', closesOn: '2026-10-19', minAttendancePercent: 75 }).expect(200);
      await post('parentB', `/v1/exam-sessions/${sessionId}/register`, { studentId: t.students[R2].id }).expect(409); // closed
      await post('principal', url(t.students[R2].id), { reason: 'Fee instalment agreed with accounts' }).expect(200); // the controller still can
    });

    it('withholds tickets from students who are not registered', async () => {
      expect((await post('principal', `/v1/exam-sessions/${sessionId}/hall-tickets`).expect(200)).body).toMatchObject({ issued: 3, blocked: 3 });
      const tickets = (await get('principal', `/v1/exam-sessions/${sessionId}/hall-tickets`).expect(200)).body as { rollNo: string; blocked: boolean; blockedReason: string | null }[];
      expect(tickets.filter((x) => !x.blocked).map((x) => x.rollNo).sort()).toEqual(['R1', 'R2', 'R3']); // registered, or overridden by the controller
      const blocked = tickets.filter((x) => x.blocked);
      expect(blocked.map((x) => x.rollNo).sort()).toEqual(['B1', 'B2', 'B3']);
      expect(blocked[0].blockedReason).toBe('Not registered for this examination');
    });

    it('prints a QR with a signed verify link on the hall ticket, and verifies it publicly with minimal information', async () => {
      const [{ ticket_no: ticketNo }] = await q('select ticket_no from hall_tickets where tenant_id = $1 and student_id = $2', [t.tenantId, t.students[R3].id]);
      const res = await http().get(`/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[R3].id}/pdf`).set(auth('student')).buffer().parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const text = (res.body as Buffer).toString('latin1');
      expect(text).toContain('Scan the code to check that this hall ticket is genuine.');
      expect((text.match(/ re f/g) ?? []).length).toBeGreaterThan(100); // the QR modules

      const code = hallTicketCode(env.JWT_SECRET, t.tenantId, ticketNo);
      const ok = (await http().get(`/v1/public/verify-hallticket/${t.slug}/${encodeURIComponent(code)}`).expect(200)).body;
      expect(ok).toEqual({ status: 'valid', institution: expect.any(String), session: 'Semester 3 end exam Nov 2026', name: 'Student C' });
      expect((await http().get(`/v1/public/verify-hallticket/${t.slug}/${encodeURIComponent(code.replace('R3', 'R2'))}`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify-hallticket/${other.slug}/${encodeURIComponent(code)}`).expect(200)).body).toEqual({ status: 'not_found' });
      const [{ ticket_no: blockedNo }] = await q('select ticket_no from hall_tickets where tenant_id = $1 and blocked limit 1', [t.tenantId]);
      expect((await http().get(`/v1/public/verify-hallticket/${t.slug}/${encodeURIComponent(hallTicketCode(env.JWT_SECRET, t.tenantId, blockedNo))}`).expect(200)).body).toMatchObject({ status: 'withheld' });
    });

    it('generates an anti-collusion seating plan across programmes, with a chart PDF per hall', async () => {
      const plan = { rooms: [{ roomId: t.room.id, rows: 3, benchesPerRow: 2, seatsPerBench: 2 }] };
      await post('teacher', `/v1/exam-sessions/${sessionId}/seating-plan`, plan).expect(403);
      await post('principal', `/v1/exam-sessions/${sessionId}/seating-plan`, { rooms: [{ roomId: other.room.id, rows: 3, benchesPerRow: 2 }] }).expect(400);
      const res = (await post('principal', `/v1/exam-sessions/${sessionId}/seating-plan`, plan).expect(200)).body;
      expect(res).toMatchObject({ seated: 6, sittings: 1 });

      // No two neighbours (side by side, or one behind the other; 4 seats a row) write the same subject.
      const seats = await q('select s.seat_no, p.subject_id from exam_seats s join exam_papers p on p.id = s.paper_id where s.tenant_id = $1 and s.room_id = $2 order by s.seat_no', [t.tenantId, t.room.id]);
      expect(seats).toHaveLength(6);
      const bySeat = new Map(seats.map((x) => [x.seat_no as number, x.subject_id as string]));
      for (const [n, subject] of bySeat) {
        if ((n - 1) % 4 > 0) expect(bySeat.get(n - 1)).not.toBe(subject);
        expect(bySeat.get(n - 4)).not.toBe(subject);
      }

      const overview = (await get('principal', `/v1/exam-sessions/${sessionId}/seating-plan`).expect(200)).body;
      expect(overview.sittings).toHaveLength(1);
      expect(overview.sittings[0]).toMatchObject({ slot: 0, seated: 6, examDate: '2026-11-05' });
      expect(overview.sittings[0].halls[0]).toMatchObject({ room: 'Room 1', seated: 6 });

      const pdf = await http().get(`/v1/exam-sessions/${sessionId}/seating-plan/sittings/0/rooms/${t.room.id}/pdf`).set(auth('principal')).buffer().parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      const text = (pdf.body as Buffer).toString('latin1');
      expect(text).toContain('Seating chart: Room 1');
      expect(text).toContain('Bench 2');
      expect(text).toContain('B1 BBA-3.1');
      await get('principal', `/v1/exam-sessions/${sessionId}/seating-plan/sittings/5/rooms/${t.room.id}/pdf`).expect(404);

      // A hall that cannot take everyone is refused, and the earlier plan stays.
      const tooSmall = await post('principal', `/v1/exam-sessions/${sessionId}/seating-plan`, { rooms: [{ roomId: t.room.id, rows: 1, benchesPerRow: 1, seatsPerBench: 2 }] }).expect(400);
      expect(tooSmall.body.message).toMatch(/Add halls or benches/);
      expect(await q('select 1 from exam_seats where tenant_id = $1', [t.tenantId])).toHaveLength(6);
    });
  });
});
