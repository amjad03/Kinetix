import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceDeskService } from '../src/attendance-desk/desk.service.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * The attendance production pass: QR self-marking with anti-proxy checks and teacher review, classroom reader (face)
 * taps for confirmation, SMS and WhatsApp alerts through Communication, the published detention list feeding hall
 * tickets, cover for an absent teacher, and the reports and accreditation figures. Figures are worked by hand below.
 */
describe('attendance pass: QR guard, readers, alerts, detention list, substitution, reports', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Monday 10:05 IST: five minutes into the 10:00-10:55 period of the test tenant.
  const start = nextMondayIst('10:05');
  const clock = new FixedClock(start);
  const monday = new Date(start.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const mondayMinus = (weeks: number) => new Date(new Date(`${monday}T00:00:00Z`).getTime() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who)).on('response', (r: { status: number; body: unknown }) => r.status === 400 && process.env.DEBUG_E2E && console.log(url, JSON.stringify(r.body)));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body).on('response', (r: { status: number; body: unknown }) => r.status === 400 && process.env.DEBUG_E2E && console.log(url, JSON.stringify(r.body)));
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const mark = async (studentId: string) => (await owner.query('select status from attendance_records where student_id = $1 and date = $2 and timetable_slot_id = $3', [studentId, monday, t.slot.id])).rows[0]?.status as string | undefined;
  // Bengaluru campus, and two points 1.5 km north and 40 m east of it.
  const campus = { lat: 12.9716, lng: 77.5946 };
  const A = 0;
  const B = 1;
  const C = 2;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const user = async (email: string, role: (typeof s.roleName.enumValues)[number]) => {
      const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: email.split('@')[0], email, passwordHash: hash }).returning();
      await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role, campusId: role === 'student' ? t.campus.id : null });
      return u;
    };
    const hod = await user('hod@pass.in', 'hod');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', code: 'COM', headUserId: hod.id } as never).returning();
    await db.update(s.subjects).set({ departmentId: dept.id } as never).where(eq(s.subjects.id, t.subject.id));
    const studentA = await user('student.a@pass.in', 'student');
    const studentB = await user('student.b@pass.in', 'student');
    await db.update(s.students).set({ userId: studentA.id }).where(eq(s.students.id, t.students[A].id));
    await db.update(s.students).set({ userId: studentB.id }).where(eq(s.students.id, t.students[B].id));
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      hod: await login(t.slug, 'hod@pass.in'),
      studentA: await login(t.slug, 'student.a@pass.in'),
      studentB: await login(t.slug, 'student.b@pass.in'),
      studentC: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('QR self-mark: own phone on campus is marked, a shared phone is refused, off-campus and poor fixes are held for the teacher', async () => {
    // Turning the geofence on needs the campus location.
    await put('principal', '/v1/academics/settings/attendance', { qr: { enabled: true, requireLocation: true, lat: null, lng: null, radiusM: 200, maxAccuracyM: 100, lateMinutes: 15, bindDevice: true } }).expect(400);
    await put('teacher', '/v1/academics/settings/attendance', { alertChannels: ['app', 'sms'] }).expect(403);
    await put('principal', '/v1/academics/settings/attendance', { alertChannels: ['app', 'sms', 'whatsapp'], qr: { enabled: true, requireLocation: true, ...campus, radiusM: 200, maxAccuracyM: 100, lateMinutes: 15, bindDevice: true } }).expect(200);

    const { code } = (await post('teacher', '/v1/attendance/qr', { slotId: t.slot.id }).expect(200)).body;
    const here = { ...campus, accuracyM: 20 };
    // C, from their phone, in the college: accepted, bound to that phone.
    const c = (await post('studentC', '/v1/student/attendance/scan', { code, deviceId: 'install-phone-C', location: here }).expect(200)).body;
    expect(c).toEqual({ status: 'present', alreadyMarked: false, outcome: 'accepted', reasons: [] });
    expect(await mark(t.students[C].id)).toBe('present');
    // B signs in on C's phone: refused (the phone already marked C in this period and is bound to C); nothing recorded.
    const proxy = await post('studentB', '/v1/student/attendance/scan', { code, deviceId: 'install-phone-C', location: here }).expect(403);
    expect(proxy.body.reasons).toEqual(expect.arrayContaining(['device_used_for_another', 'device_bound_to_another']));
    expect(await mark(t.students[B].id)).toBeUndefined();
    // B from their own phone, 0.0135 degrees of latitude north (about 1.5 km): held as outside the campus.
    const off = (await post('studentB', '/v1/student/attendance/scan', { code, deviceId: 'install-phone-B', location: { lat: 12.9851, lng: campus.lng, accuracyM: 15 } }).expect(200)).body;
    expect(off).toMatchObject({ status: null, outcome: 'flagged', reasons: ['outside_campus'] });
    // A with a 500 m fix and a mocked location: held.
    const poor = (await post('studentA', '/v1/student/attendance/scan', { code, deviceId: 'install-phone-A', location: { ...campus, accuracyM: 500, mocked: true } }).expect(200)).body;
    expect(poor.reasons).toEqual(['mock_location', 'poor_accuracy']);
    // Scanning again answers from the log.
    expect((await post('studentA', '/v1/student/attendance/scan', { code, deviceId: 'install-phone-A', location: here }).expect(200)).body).toMatchObject({ alreadyMarked: true, outcome: 'flagged' });
    expect(await audited('attendance.qr_scan.refused')).toBe(1);

    // The review list: the teacher sees both held scans with the distance (1.5 km, worked from the haversine formula).
    const list = (await get('teacher', `/v1/attendance-desk/qr-scans?from=${monday}`).expect(200)).body;
    expect(list.total).toBe(2);
    const bRow = list.rows.find((r: { studentId: string }) => r.studentId === t.students[B].id);
    expect(bRow.distanceM).toBeGreaterThan(1490);
    expect(bRow.distanceM).toBeLessThan(1520);
    // The refused attempt is in the log, not in the review queue.
    expect((await get('principal', `/v1/attendance-desk/qr-scans?from=${monday}&status=refused`).expect(200)).body.total).toBe(1);
    // Scope: another teacher sees none and cannot decide; other institutions and families see nothing.
    expect((await get('teacher2', `/v1/attendance-desk/qr-scans?from=${monday}`).expect(200)).body.total).toBe(0);
    await post('teacher2', `/v1/attendance-desk/qr-scans/${bRow.id}/decision`, { decision: 'accepted' }).expect(403);
    expect((await get('otherPrincipal', `/v1/attendance-desk/qr-scans?from=${monday}`).expect(200)).body.total).toBe(0);
    await post('otherPrincipal', `/v1/attendance-desk/qr-scans/${bRow.id}/decision`, { decision: 'accepted' }).expect(404);
    await get('parent', `/v1/attendance-desk/qr-scans`).expect(403);
    await get('studentB', `/v1/attendance-desk/qr-scans`).expect(403);
    await get('teacher', `/v1/attendance-desk/qr-scans?status=wrong`).expect(400);

    // The Teacher App's sheet offers the held scans.
    const sheet = (await get('teacher', `/v1/attendance?slotId=${t.slot.id}&date=${monday}`).expect(200)).body;
    expect(sheet.hints.filter((h: { source: string }) => h.source === 'qr').map((h: { studentId: string }) => h.studentId).sort()).toEqual([t.students[A].id, t.students[B].id].sort());

    // Accept B (marks present, audited with before and after), reject A (no mark); a decided scan cannot be decided again.
    const aRow = list.rows.find((r: { studentId: string }) => r.studentId === t.students[A].id);
    expect((await post('teacher', `/v1/attendance-desk/qr-scans/${bRow.id}/decision`, { decision: 'accepted', note: 'Seen in class' }).expect(200)).body.marked).toBe(true);
    expect(await mark(t.students[B].id)).toBe('present');
    const bulk = (await post('hod', '/v1/attendance-desk/qr-scans/decide', { ids: [aRow.id, bRow.id], decision: 'rejected' }).expect(200)).body;
    expect(bulk).toMatchObject({ done: 1, failed: 1 });
    expect(await mark(t.students[A].id)).toBeUndefined();
    expect(await audited('attendance.qr_scan.accepted')).toBe(2); // C's scan and B's review
    expect(await audited('attendance.qr_scan.rejected')).toBe(1);

    // A new phone: the class teacher releases C's binding.
    expect((await get('teacher', `/v1/attendance-desk/device-bindings/${t.students[C].id}`).expect(200)).body.bound).toBe(true);
    await post('teacher2', `/v1/attendance-desk/device-bindings/${t.students[C].id}/release`, { reason: 'New phone' }).expect(403);
    await post('teacher', `/v1/attendance-desk/device-bindings/${t.students[C].id}/release`, { reason: 'Lost phone, new one bought' }).expect(200);
    expect((await get('teacher', `/v1/attendance-desk/device-bindings/${t.students[C].id}`).expect(200)).body.bound).toBe(false);
    expect(await audited('attendance.device_binding.released')).toBe(1);
  });

  it('a face terminal in the classroom suggests the period for the teacher to confirm; taps outside a period are logged only', async () => {
    const dev = (await post('principal', '/v1/access-devices', { kind: 'face_terminal', vendor: 'zkteco', serial: 'FACE-R1', name: 'Room 1 face terminal', purpose: 'attendance', config: { roomId: t.room.id, tzOffsetMinutes: 330 } }).expect(201)).body;
    await post('principal', '/v1/credential-tags', { kind: 'biometric_pin', value: '1001', subjectType: 'student', subjectId: t.students[A].id }).expect(201);
    await post('principal', '/v1/credential-tags', { kind: 'biometric_pin', value: '1002', subjectType: 'student', subjectId: t.students[B].id }).expect(201);
    const push = (events: object[]) => http().post('/v1/device-ingest/events').set('x-device-key', dev.deviceKey).send({ events }).expect(200);
    const r = (await push([{ tag: '1001', at: `${monday} 10:03:10`, verify: 'face' }, { tag: '1002', at: `${monday} 12:40:00`, verify: 'face' }])).body;
    expect(r.outcomes).toEqual({ period_tap: 1, outside_period: 1 });
    // ADMS punches carry the verify mode in the fourth column (15 = face).
    const adms = await http().post(`/v1/device-ingest/adms/${dev.deviceKey}/iclock/cdata?SN=FACE-R1&table=ATTLOG`).set('content-type', 'text/plain').send(`1001\t${monday} 10:04:00\t0\t15\n`).expect(200);
    expect(adms.text).toBe('OK: 1');
    // A tap is not a mark: A still has none (their QR scan was rejected) until the teacher saves the sheet.
    expect(await mark(t.students[A].id)).toBeUndefined();
    const sheet = (await get('teacher', `/v1/attendance-desk/sheet?slotId=${t.slot.id}&date=${monday}`).expect(200)).body;
    const tap = sheet.hints.find((h: { source: string; studentId: string }) => h.source === 'reader' && h.studentId === t.students[A].id);
    expect(tap).toMatchObject({ verify: 'face', at: new Date(`${monday}T04:33:10Z`).toISOString() });
    expect(sheet.hints.some((h: { studentId: string; source: string }) => h.source === 'reader' && h.studentId === t.students[B].id)).toBe(false);
  });

  it('absence digests and shortage alerts go out on SMS and WhatsApp through Communication templates, once each', async () => {
    // Templates: absence on SMS (DLT registered), shortage on SMS (DLT registered); no WhatsApp templates yet.
    await owner.query(`insert into message_templates (tenant_id, key, channel, locale, body, dlt_template_id) values
      ($1, 'attendance_absence', 'sms', 'en', '{{student}} was absent on {{date}} for {{absent}} of {{held}} periods. {{institution}}', '1107000000000001'),
      ($1, 'attendance_shortage', 'sms', 'en', '{{student}} attendance is {{pct}}% ({{subject}}); {{threshold}}% is needed. {{institution}}', '1107000000000002')`, [t.tenantId]);
    // The teacher saves the sheet: A absent, B and C present. Six earlier Mondays A was absent too (7 held, 0 attended).
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: monday, records: [{ studentId: t.students[A].id, status: 'absent' }, { studentId: t.students[B].id, status: 'present' }, { studentId: t.students[C].id, status: 'present' }] }).expect(201);
    for (let w = 1; w <= 6; w++) {
      await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values
        ($1, $2, $3, $4, $5, 'absent', $6, now()), ($1, $7, $3, $4, $5, 'present', $6, now()), ($1, $8, $3, $4, $5, $9, $6, now())`,
        // C: absent on the two Mondays before this one, present on the four before those (5 of 7 with today).
        [t.tenantId, t.students[A].id, t.section.id, mondayMinus(w), t.slot.id, t.teacher.id, t.students[B].id, t.students[C].id, w <= 2 ? 'absent' : 'present']);
    }
    const alerts = (await post('principal', '/v1/attendance-desk/alerts/run', {}).expect(200)).body;
    // A: 0 of 7 = 0% (short); C: 5 of 7 = 71.4% (short against 75%); B: 7 of 7.
    expect(alerts.students).toBe(2);
    expect(alerts.sms).toBe(2);
    expect(alerts.whatsapp).toBe(0);
    expect(alerts.skipped).toEqual(['No active "attendance_shortage" WhatsApp template in Communication']);
    const shortage = await owner.query(`select c.vars from message_campaigns c join message_templates t on t.id = c.template_id where c.tenant_id = $1 and t.key = 'attendance_shortage' order by c.vars->>'student'`, [t.tenantId]);
    expect(shortage.rows.map((r) => [r.vars.student, r.vars.pct, r.vars.threshold])).toEqual([['Student A', '0', '75'], ['Student C', '71.4', '75']]);
    expect((await owner.query(`select channels from attendance_alerts where tenant_id = $1 and student_id = $2`, [t.tenantId, t.students[A].id])).rows[0].channels).toEqual(['app', 'sms']);
    // Running again sends nothing new.
    expect((await post('principal', '/v1/attendance-desk/alerts/run', {}).expect(200)).body.sms).toBe(0);

    // The evening job (18:30): the absence digest goes on SMS even though the app digest is off.
    clock.at = new Date(start.getTime() + (8 * 60 + 25) * 60_000);
    const desk = app.get(AttendanceDeskService);
    expect((await desk.runAlerts(t.tenantId)).digests).toBe(1);
    await desk.runAlerts(t.tenantId);
    const digest = await owner.query(`select c.vars from message_campaigns c join message_templates t on t.id = c.template_id where c.tenant_id = $1 and t.key = 'attendance_absence'`, [t.tenantId]);
    expect(digest.rows).toHaveLength(1);
    expect(digest.rows[0].vars).toMatchObject({ student: 'Student A', date: monday, absent: '1', held: '1' });
    clock.at = start;
  });

  it('publishes a detention list that holds hall tickets: detained stays held, condonable is released by condonation', async () => {
    // Hand check (threshold 75%, up to 10 points condonable): A 0/7 = 0% detained (0 + 10 < 75); C 5/7 = 71.4%
    // condonable (71.4 + 10 >= 75); B 7/7 = 100% eligible.
    const live = (await get('principal', `/v1/attendance-desk/detention?programId=${t.program.id}`).expect(200)).body;
    expect(live.rows.map((r: { fullName: string; status: string; pct: number }) => [r.fullName, r.status, r.pct])).toEqual([['Student A', 'detained', 0], ['Student C', 'condonable', 71.4]]);

    await post('teacher', '/v1/attendance-desk/detention-lists', { programId: t.program.id }).expect(403);
    const draft = (await post('hod', '/v1/attendance-desk/detention-lists', { programId: t.program.id, term: 3 }).expect(201)).body;
    expect(draft).toMatchObject({ status: 'draft', classes: 2, eligible: 1, condonable: 1, detained: 1 });
    expect((await get('otherPrincipal', '/v1/attendance-desk/detention-lists').expect(200)).body).toEqual([]);
    await get('otherPrincipal', `/v1/attendance-desk/detention-lists/${draft.id}`).expect(404);
    await post('hod', `/v1/attendance-desk/detention-lists/${draft.id}/publish`).expect(403);
    const pub = (await post('principal', `/v1/attendance-desk/detention-lists/${draft.id}/publish`).expect(200)).body;
    // A's family (guardian) and A's own login are told; the detention SMS has no template yet.
    expect(pub).toMatchObject({ status: 'published', notified: 2, sms: 0 });
    expect(pub.skipped).toEqual(['No active "attendance_detention" SMS template in Communication', 'No active "attendance_detention" WhatsApp template in Communication']);
    await post('principal', `/v1/attendance-desk/detention-lists/${draft.id}/publish`).expect(409);
    const ev = await owner.query(`select count(*)::int as n from domain_events where tenant_id = $1 and type = 'attendance.detention_list_published'`, [t.tenantId]);
    expect(ev.rows[0].n).toBe(1);
    const pdf = await get('principal', `/v1/attendance-desk/detention-lists/${draft.id}?format=pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    // Hall tickets with the attendance check.
    const session = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 end exam', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    await post('principal', `/v1/exam-sessions/${session}/papers`, { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-18', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201);
    await post('principal', `/v1/exam-sessions/${session}/schedule`).expect(200);
    const tickets = async () => {
      await post('principal', `/v1/exam-sessions/${session}/hall-tickets`, { blockByAttendance: true }).expect(200);
      const rows = (await get('principal', `/v1/exam-sessions/${session}/hall-tickets`).expect(200)).body as { student: string; blocked: boolean; blockedReason: string | null }[];
      return Object.fromEntries(rows.map((r) => [r.student, r.blockedReason]));
    };
    const first = await tickets();
    expect(first['Student A']).toMatch(/^Detained for shortage of attendance \(0% against 75%, Detention list/);
    expect(first['Student C']).toBe('Attendance short (71.4% against 75%); condonation not yet approved');
    expect(first['Student B']).toBeNull();

    // C applies for condonation; the principal grants 5 points: 71.4 + 5 = 76.4% >= 75%, so C's ticket is released.
    const cond = (await post('studentC', '/v1/attendance/condonations', { kind: 'other', reason: 'Family bereavement for two weeks in September' }).expect(201)).body;
    await post('principal', `/v1/attendance/condonations/${cond.id}/decision`, { decision: 'approved', points: 5, note: 'Documents seen' }).expect(200);
    const second = await tickets();
    expect(second['Student C']).toBeNull();
    expect(second['Student A']).toMatch(/^Detained/);

    // Withdrawn lists stop holding tickets back (A is then held by the live figure, still detained).
    await post('hod', `/v1/attendance-desk/detention-lists/${draft.id}/withdraw`, { reason: 'Recount after corrections' }).expect(403);
    await post('principal', `/v1/attendance-desk/detention-lists/${draft.id}/withdraw`, { reason: 'Recount after corrections' }).expect(200);
    expect((await tickets())['Student A']).toBe('Detained for shortage of attendance (0% against 75%)');
  });

  it('a teacher marked absent without leave needs cover, and is not suggested as a substitute', async () => {
    await owner.query(`insert into staff_attendance (tenant_id, user_id, date, status, source) values ($1, $2, $3, 'absent', 'manual')`, [t.tenantId, t.teacher.id, monday]);
    const needed = (await get('principal', `/v1/timetable/substitutions/needed?date=${monday}`).expect(200)).body as { slotId: string; reason: string; leaveRequestId: string | null }[];
    expect(needed).toEqual([expect.objectContaining({ slotId: t.slot.id, reason: 'absent', leaveRequestId: null })]);
  });

  it('reports: marking compliance, subject summary, defaulter trend and the NAAC / AISHE / UDISE+ figures', async () => {
    clock.at = new Date(start.getTime() + 85 * 60_000); // 11:30, after today's period
    await get('teacher', '/v1/attendance-desk/reports/compliance').expect(403);
    await get('principal', `/v1/attendance-desk/reports/compliance?from=${mondayMinus(6)}&to=${monday}`).expect(400); // over 31 days
    const comp = (await get('principal', `/v1/attendance-desk/reports/compliance?from=${mondayMinus(4)}&to=${monday}`).expect(200)).body;
    // Five Mondays: today's period marked the same day, the four earlier ones were entered afterwards: 1 of 5 = 20% on time.
    const row = comp.rows.find((r: { teacherId: string }) => r.teacherId === t.teacher.id);
    expect(row).toMatchObject({ scheduled: 5, sameDay: 1, later: 4, unmarked: 0, markedPct: 100, onTimePct: 20 });
    const subj = (await get('hod', `/v1/attendance-desk/reports/subjects?sectionId=${t.section.id}`).expect(200)).body;
    // Class average after condonation: A 0, B 100, C 71.4 + 5 = 76.4 -> (0 + 100 + 76.4) / 3 = 58.8.
    expect(subj.rows).toEqual([expect.objectContaining({ code: 'BCOM-3.1', held: 7, averagePct: 58.8, short: 1 })]);
    const trend = (await get('principal', '/v1/attendance-desk/reports/trend?weeks=2').expect(200)).body;
    expect(trend.weeks.at(-1)).toMatchObject({ weekEnding: monday, students: 3, short: 1, detained: 1 });
    const acc = (await get('principal', `/v1/attendance-desk/reports/accreditation?year=2026-27`).expect(200)).body;
    expect(acc.instructionalDays).toBeGreaterThanOrEqual(1);
    expect(acc.programmes[0]).toMatchObject({ program: 'BCom', students: 3 });
    expect(acc.feeds.map((f: { item: string }) => f.item)).toContain('UDISE-1.2');
    expect((await get('otherPrincipal', `/v1/attendance-desk/reports/accreditation?year=2026-27`).expect(200)).body.instructionalDays).toBe(0);
  });
});
