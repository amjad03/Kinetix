import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DbService } from '../src/db/db.service.js';
import * as s from '../src/db/schema.js';
import { ComplianceReminders } from '../src/governance/compliance.controller.js';
import { createApp, createTenant, FixedClock, ownerPool, pdfText } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * The governance pass end to end: statutory committees (composition against the regulation, meetings with agenda,
 * attendance and quorum, minutes circulated, objected to, revised and signed, the action-taken report), policies (four
 * eyes, publication, acknowledgement by role), the RTI register (statutory dates, fees, appeals, the return), the
 * compliance calendar (standard deadlines, recurrence, reminders on the clock), the mandatory disclosure page, the
 * board dashboard, DPDP grievances and nominations, and grievances on e-Samadhan. Another role and another
 * institution are refused on each.
 *
 * The clock is pinned at the moment the suite starts and every date is counted from it (IST), so the figures do not
 * depend on the day the suite runs; the reminder job is driven by moving the pinned clock.
 */
describe('governance pass', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = new Date();
  const clock = new FixedClock(start);
  afterEach(() => {
    clock.at = start;
  });
  const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const today = istDay(start);
  const day = (n: number) => istDay(new Date(start.getTime() + n * 86_400_000));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const notes = async (userId: string, like: string) => (await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and dedupe_key like $3`, [t.tenantId, userId, like])).rows[0].n as number;
  const kitAction = (who: string, entity: string, action: string, id: string, params: object = {}) => post(who, `/v1/records/${entity}/bulk`, { op: 'action', action, target: { ids: [id] }, params });

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number], gender?: string) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@gov.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    if (gender) await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: u.id, employeeCode: `E-${u.id.slice(0, 6)}`, gender });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    // The current academic year around the pinned day, so "this year" holds the meetings below whatever the date.
    await owner.query(`update academic_years set starts_on = $2::date - 120, ends_on = $2::date + 240 where tenant_id = $1`, [t.tenantId, today]);
    const u = {
      admin: await addUser('Asha Admin', 'tenant_admin'),
      iqac: await addUser('Indira Iqac', 'quality_officer', 'female'),
      meena: await addUser('Meena Rao', 'teacher', 'female'),
      ravi: await addUser('Ravi Kumar', 'teacher', 'male'),
      gro: await addUser('Gopal Grievance', 'grievance_officer'),
    };
    app = await createApp(clock);
    for (const [k, v] of Object.entries(u)) {
      tokens[k] = await login(t.slug, v.email!);
      ids[k] = v.id;
    }
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    Object.assign(ids, { principal: t.principal.id, teacher: t.teacher.id, student: t.studentUser.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  // ---- statutory committees ------------------------------------------------------------------------------------

  it('sets up the required statutory committees once, and checks the ICC against the POSH Act', async () => {
    const cat = (await get('teacher', '/v1/governance/committees/catalogue').expect(200)).body;
    expect(cat.find((r: { kind: string }) => r.kind === 'icc')).toMatchObject({ minWomenPct: 50, chairWoman: true, maxTenureYears: 3 });
    await post('teacher', '/v1/governance/committees/setup').expect(403);
    const made = (await post('iqac', '/v1/governance/committees/setup').expect(200)).body.created;
    // Eight are required of every college: IQAC, anti-ragging committee and squad, ICC, SGRC, SC/ST cell, governing body ... (not the optional ones).
    expect(made).toEqual(['iqac', 'anti_ragging', 'anti_ragging_squad', 'icc', 'grievance_redressal', 'sc_st_cell', 'governing_body']);
    expect((await post('iqac', '/v1/governance/committees/setup').expect(200)).body.created).toEqual([]);
    expect((await post('iqac', '/v1/governance/committees/setup', { kinds: ['minority_cell'] }).expect(200)).body.created).toEqual(['minority_cell']);

    const c = (await get('iqac', '/v1/governance/committees/compliance').expect(200)).body;
    expect(c.missing).toEqual([]);
    const icc = c.committees.find((x: { kind: string }) => x.kind === 'icc');
    ids.icc = icc.id;
    expect(icc).toMatchObject({ members: 0, status: 'attention', meetingsNorm: 2 });
    expect(icc.issues.map((i: { code: string }) => i.code)).toEqual(['too_few_members', 'no_chair', 'missing_category']);

    // A man presiding and one woman in three: the Act wants a woman presiding officer and half the members women.
    const add = (who: string, b: object) => post(who, `/v1/governance/committees/${ids.icc}/members`, { tenureStart: day(-200), ...b });
    ids.mChair = (await add('iqac', { userId: ids.ravi, role: 'chair' }).expect(201)).body.id;
    await add('iqac', { userId: ids.meena }).expect(201);
    await add('iqac', { userId: ids.teacher, gender: 'male' }).expect(201);
    await add('teacher', { userId: ids.teacher }).expect(403);
    await add('iqac', { role: 'member' }).expect(400); // neither a person nor a name
    await add('iqac', { userId: ids.meena, tenureEnd: day(-300) }).expect(400);
    let mine = (await get('iqac', `/v1/governance/committees/${ids.icc}`).expect(200)).body;
    expect(mine.members.find((m: { userId: string }) => m.userId === ids.ravi)).toMatchObject({ gender: 'male', role: 'chair' }); // from the staff profile
    expect(mine.compliance.issues).toEqual([{ code: 'too_few_members', min: 4, actual: 3 }, { code: 'chair_not_woman' }, { code: 'women_below', min: 50, actual: 33 }, { code: 'missing_category', categories: ['ngo', 'legal', 'external'] }]);

    // Fixed: Meena presides, Ravi is a member, an NGO member without an account joins, and Indira.
    await http().patch(`/v1/governance/committees/${ids.icc}/members/${ids.mChair}`).set(as('iqac')).send({ role: 'member' }).expect(200);
    const meenaRow = mine.members.find((m: { userId: string }) => m.userId === ids.meena);
    await http().patch(`/v1/governance/committees/${ids.icc}/members/${meenaRow.id}`).set(as('iqac')).send({ role: 'chair' }).expect(200);
    ids.mNgo = (await add('iqac', { name: 'Lakshmi N (Sakhi Trust)', category: 'ngo', gender: 'female', role: 'external', contactPublic: true, phone: '+91 80 4000 1000' }).expect(201)).body.id;
    await add('iqac', { userId: ids.iqac }).expect(201);
    mine = (await get('iqac', `/v1/governance/committees/${ids.icc}`).expect(200)).body;
    // 3 women of 5 = 60%.
    expect(mine.compliance.issues).toEqual([]);
    expect(mine.members).toHaveLength(5);
    expect(mine.members.find((m: { name: string }) => m.name.startsWith('Lakshmi'))).toMatchObject({ category: 'ngo', userId: null });
    await put('iqac', `/v1/governance/committees/${ids.icc}/profile`, { helpline: '1800-123-456', email: 'icc@college.in', public: true, orderRef: 'Order 12/2026' }).expect(200);
    // The campus-life view keeps working with an outside member.
    expect((await get('principal', `/v1/campus-life/committees/${ids.icc}/members`).expect(200)).body.map((m: { fullName: string }) => m.fullName)).toContain('Lakshmi N (Sakhi Trust)');
    await get('outsider', `/v1/governance/committees/${ids.icc}`).expect(404);
    await get('student', `/v1/governance/committees/${ids.icc}`).expect(403);
  });

  it('runs a meeting: the chair schedules it with an agenda, records attendance and quorum, and circulates the minutes', async () => {
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    // Meena chairs the ICC, so she manages its meetings; another teacher may not, and only members read them.
    await post('teacher2', `/v1/governance/committees/${ids.icc}/meetings`, { title: 'Not mine', meetingOn: day(-3) }).expect(403);
    const m = (await post('meena', `/v1/governance/committees/${ids.icc}/meetings`, { title: 'ICC meeting 2', meetingOn: day(-3), startsAt: '15:00', venue: 'Board room', agenda: [{ title: 'Awareness week plan', presenter: 'Meena Rao' }, { title: 'Case ICC/2026/03 status' }] }).expect(201)).body;
    ids.meeting = m.id;
    await get('teacher2', `/v1/governance/committees/meetings/${m.id}`).expect(404);
    await get('outsider', `/v1/governance/committees/meetings/${m.id}`).expect(404);
    let d = (await get('ravi', `/v1/governance/committees/meetings/${m.id}`).expect(200)).body;
    expect(d.agenda.map((a: { seq: number; title: string }) => [a.seq, a.title])).toEqual([[1, 'Awareness week plan'], [2, 'Case ICC/2026/03 status']]);
    expect(d.quorum).toEqual({ members: 5, needed: 3, present: 0, met: null });
    expect(d.canManage).toBe(false);

    await put('meena', `/v1/governance/committees/meetings/${m.id}`, { minutes: 'The committee met and reviewed its work.' }).expect(200);
    await put('meena', `/v1/governance/committees/meetings/${m.id}/agenda`, { items: [{ title: 'Awareness week plan', resolution: 'Hold the week from the 2nd Monday of next month', outcome: 'resolved' }, { title: 'Case ICC/2026/03 status', discussion: 'Inquiry report received', resolution: 'Report accepted; recommendation sent to the principal', outcome: 'resolved' }] }).expect(200);
    // No attendance yet: no quorum, no circulation.
    expect((await post('meena', `/v1/governance/committees/meetings/${m.id}/circulate`).expect(409)).body.code).toBe('NO_QUORUM');
    const people = d.attendance as { memberId: string; userId: string | null; name: string }[];
    const byUser = (u: string | null) => people.find((x) => x.userId === u)!.memberId;
    const ngo = people.find((x) => !x.userId)!.memberId;
    // Two of five is below the quorum of three.
    let q = (await put('meena', `/v1/governance/committees/meetings/${m.id}/attendance`, { entries: [{ memberId: byUser(ids.meena), status: 'present' }, { memberId: ngo, status: 'present' }, { memberId: byUser(ids.teacher), status: 'absent' }] }).expect(200)).body;
    expect(q).toEqual({ members: 5, needed: 3, present: 2, met: false });
    await post('meena', `/v1/governance/committees/meetings/${m.id}/circulate`).expect(409);
    await put('meena', `/v1/governance/committees/meetings/${m.id}/attendance`, { entries: [{ memberId: t.students[0].id, status: 'present' }] }).expect(400); // not a member
    q = (await put('meena', `/v1/governance/committees/meetings/${m.id}/attendance`, { entries: [{ memberId: byUser(ids.ravi), status: 'present' }, { memberId: byUser(ids.iqac), status: 'present' }] }).expect(200)).body;
    expect(q).toEqual({ members: 5, needed: 3, present: 4, met: true });

    const c = (await post('meena', `/v1/governance/committees/meetings/${m.id}/circulate`).expect(200)).body;
    expect(c).toMatchObject({ minutesStatus: 'circulated', minutesHash: expect.stringMatching(/^[0-9a-f]{64}$/), sentTo: 2 }); // Ravi and Indira; the NGO member has no account
    expect(await notes(ids.ravi, `committee-minutes:${m.id}:%`)).toBe(1);
    // Circulated minutes are fixed, here and through the campus-life page.
    await put('meena', `/v1/governance/committees/meetings/${m.id}`, { minutes: 'Changed' }).expect(409);
    await http().patch(`/v1/campus-life/meetings/${m.id}`).set(as('principal')).send({ minutes: 'Changed' }).expect(409);
    d = (await get('ravi', `/v1/governance/committees/meetings/${m.id}`).expect(200)).body;
    expect(d).toMatchObject({ canSign: true, mySignoff: null });
  });

  it('takes an objection, revises, recirculates, and approves once the chair and half of those present have signed', async () => {
    const m = ids.meeting;
    await post('teacher', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(403); // was absent
    await post('teacher2', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(404); // not a member
    await post('ravi', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'object' }).expect(400); // an objection needs a reason
    const obj = (await post('ravi', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'object', comment: 'Item 2 should record that the respondent was heard.' }).expect(200)).body;
    expect(obj).toMatchObject({ decision: 'object', minutesStatus: 'circulated', approval: { approved: false, objections: 1 } });
    expect(await notes(ids.meena, 'committee-object:%')).toBe(1);
    await post('ravi', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(409); // signed this text already

    await post('ravi', `/v1/governance/committees/meetings/${m}/revise`).expect(403);
    await post('meena', `/v1/governance/committees/meetings/${m}/revise`).expect(200);
    await put('meena', `/v1/governance/committees/meetings/${m}/agenda`, { items: [{ title: 'Awareness week plan', resolution: 'Hold the week from the 2nd Monday of next month', outcome: 'resolved' }, { title: 'Case ICC/2026/03 status', discussion: 'Inquiry report received; the respondent was heard on both dates', resolution: 'Report accepted; recommendation sent to the principal', outcome: 'resolved' }] }).expect(200);
    const second = (await post('meena', `/v1/governance/committees/meetings/${m}/circulate`).expect(200)).body;

    // Present and able to sign: Meena (chair), Ravi, Indira: two approvals including the chair's.
    let r = (await post('ravi', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(200)).body;
    expect(r).toMatchObject({ minutesStatus: 'circulated', approval: { approvals: 1, needed: 2, objections: 0, chairSigned: false } });
    r = (await post('meena', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(200)).body;
    expect(r).toMatchObject({ minutesStatus: 'approved', approval: { approved: true, approvals: 2 } });
    expect(r.signature).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    await post('iqac', `/v1/governance/committees/meetings/${m}/sign`, { decision: 'approve' }).expect(409); // already approved

    const d = (await get('iqac', `/v1/governance/committees/meetings/${m}`).expect(200)).body;
    expect(d).toMatchObject({ minutesStatus: 'approved', minutesHash: second.minutesHash, status: 'held' });
    // The first round's objection stays on record against the old text.
    expect(d.signoffs.map((x: { decision: string; current: boolean; valid: boolean }) => [x.decision, x.current, x.valid])).toEqual([['object', false, true], ['approve', true, true], ['approve', true, true]]);
    await post('meena', `/v1/governance/committees/meetings/${m}/revise`).expect(409);
    await put('meena', `/v1/governance/committees/meetings/${m}/attendance`, { entries: [] }).expect(409);
    // A signature that no longer matches its text is shown as not verifying.
    await owner.query(`update committee_minute_signoffs set decision = 'object' where meeting_id = $1 and user_id = $2 and minutes_hash = $3`, [m, ids.ravi, second.minutesHash]);
    expect((await get('iqac', `/v1/governance/committees/meetings/${m}`).expect(200)).body.signoffs[1]).toMatchObject({ valid: false });
    await owner.query(`update committee_minute_signoffs set decision = 'approve' where meeting_id = $1 and user_id = $2 and minutes_hash = $3`, [m, ids.ravi, second.minutesHash]);

    const pdf = (await get('ravi', `/v1/governance/committees/meetings/${m}/minutes.pdf`).buffer(true).parse(binary).expect(200)).body as Buffer;
    const text = pdfText(pdf);
    expect(text).toContain('4 OF 5 PRESENT (QUORUM 3) - QUORUM MET');
    expect(text).toContain('respondent was heard');
    expect(text).toContain(second.minutesHash);
    await get('teacher2', `/v1/governance/committees/meetings/${m}/minutes.pdf`).expect(404);
    expect(await notes(ids.ravi, `committee-approved:${m}:%`)).toBe(1);
  });

  it('keeps the action-taken report: the owner reports, the ATR totals and lists overdue items', async () => {
    const d = (await get('iqac', `/v1/governance/committees/meetings/${ids.meeting}`).expect(200)).body;
    const a1 = (await post('meena', `/v1/governance/committees/meetings/${ids.meeting}/actions`, { title: 'Book the auditorium for awareness week', ownerUserId: ids.ravi, dueOn: day(10), agendaItemId: d.agenda[0].id }).expect(201)).body;
    const a2 = (await post('meena', `/v1/governance/committees/meetings/${ids.meeting}/actions`, { title: 'Send the recommendation letter', ownerUserId: ids.principal, dueOn: day(-1) }).expect(201)).body;
    await post('ravi', `/v1/governance/committees/meetings/${ids.meeting}/actions`, { title: 'Not his to add', ownerUserId: ids.ravi, dueOn: day(1) }).expect(403);
    await put('teacher', `/v1/governance/committees/action-items/${a1.id}/report`, { actionTaken: 'Done it' }).expect(403);
    await put('ravi', `/v1/governance/committees/action-items/${a1.id}/report`, { actionTaken: 'Auditorium booked for three days', evidenceUrl: 'https://example.org/booking/77' }).expect(200);
    const atr = (await get('iqac', `/v1/governance/committees/atr/report?committeeId=${ids.icc}`).expect(200)).body;
    expect(atr.totals).toEqual({ total: 2, done: 1, open: 1, overdue: 1, reported: 1 });
    expect(atr.rows.find((r: { id: string }) => r.id === a2.id)).toMatchObject({ overdue: true, owner: t.principal.fullName });
    await get('teacher', '/v1/governance/committees/atr/report').expect(403);
    const x = await get('iqac', `/v1/governance/committees/atr/report.xlsx?committeeId=${ids.icc}`).buffer(true).parse(binary).expect(200);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const me = (await get('principal', '/v1/governance/committees/me/summary').expect(200)).body;
    expect(me.actions.map((a: { title: string; overdue: boolean }) => [a.title, a.overdue])).toEqual([['Send the recommendation letter', true]]);
    // The year's compliance: one meeting held of the ICC's two a year; the overdue action puts it under attention.
    const icc = (await get('iqac', '/v1/governance/committees/compliance').expect(200)).body.committees.find((c: { id: string }) => c.id === ids.icc);
    expect(icc).toMatchObject({ meetingsHeld: 1, minutesPending: 0, openActions: 1, overdueActions: 1, doneActions: 1, women: 3, members: 5, status: 'attention' });
  });

  // ---- policies --------------------------------------------------------------------------------------------------

  it('keeps policies as versions: four eyes, publication to the roles that must acknowledge, and supersession', async () => {
    const body = { code: 'POL/HR/01', title: 'Code of conduct for staff', category: 'code_of_conduct', audience: ['teacher'], reviewMonths: 24, body: 'Staff shall treat every student with dignity and respect, and shall not ...' };
    await post('teacher', '/v1/governance/policies', body).expect(403);
    await post('iqac', '/v1/governance/policies', { ...body, code: 'bad code' }).expect(400);
    const pol = (await post('iqac', '/v1/governance/policies', body).expect(201)).body;
    await post('iqac', '/v1/governance/policies', body).expect(409);
    const v1 = pol.versions[0];
    await put('iqac', `/v1/governance/policies/versions/${v1.id}`, { body: `${body.body} Version one wording.` }).expect(200);
    await post('iqac', `/v1/governance/policies/versions/${v1.id}/approve`).expect(409); // not in review
    await post('iqac', `/v1/governance/policies/versions/${v1.id}/move`, { to: 'in_review' }).expect(200);
    await put('iqac', `/v1/governance/policies/versions/${v1.id}`, { body: 'Too late to change this text here' }).expect(409);
    expect((await post('iqac', `/v1/governance/policies/versions/${v1.id}/approve`).expect(403)).body.code).toBe('FOUR_EYES');
    await post('principal', `/v1/governance/policies/versions/${v1.id}/publish`).expect(409); // approve first
    await post('principal', `/v1/governance/policies/versions/${v1.id}/approve`).expect(200);
    const pub = (await post('principal', `/v1/governance/policies/versions/${v1.id}/publish`).expect(200)).body;
    // Four teachers on the roll: teacher, teacher2, Meena and Ravi.
    expect(pub).toMatchObject({ status: 'published', effectiveFrom: today, told: 4 });
    expect(await notes(ids.ravi, `policy:${v1.id}`)).toBe(1);

    const mine = (await get('ravi', '/v1/governance/policies/me/list').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ versionId: v1.id, version: 1, mustAcknowledge: true, pending: true })]);
    expect((await get('student', '/v1/governance/policies/me/list').expect(200)).body).toEqual([]);
    await get('student', `/v1/governance/policies/versions/${v1.id}/text`).expect(404);
    expect((await get('ravi', `/v1/governance/policies/versions/${v1.id}/text`).expect(200)).body).toMatchObject({ body: expect.stringContaining('Version one wording'), fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/), mustAcknowledge: true });
    await post('student', `/v1/governance/policies/versions/${v1.id}/acknowledge`).expect(404);
    const ack = (await post('ravi', `/v1/governance/policies/versions/${v1.id}/acknowledge`).expect(200)).body;
    expect(ack).toMatchObject({ already: false });
    expect((await post('ravi', `/v1/governance/policies/versions/${v1.id}/acknowledge`).expect(200)).body).toMatchObject({ already: true });
    await post('meena', `/v1/governance/policies/versions/${v1.id}/acknowledge`).expect(200);
    let acks = (await get('iqac', `/v1/governance/policies/versions/${v1.id}/acks?state=pending`).expect(200)).body;
    expect(acks).toMatchObject({ audience: 4, acknowledged: 2, pending: 2 });
    expect(acks.rows.map((r: { userId: string }) => r.userId).sort()).toEqual([ids.teacher, t.teacher2.id].sort());
    expect((await post('iqac', `/v1/governance/policies/versions/${v1.id}/remind`).expect(200)).body).toEqual({ reminded: 2 });
    const list = (await get('iqac', '/v1/governance/policies').expect(200)).body;
    expect(list[0]).toMatchObject({ code: 'POL/HR/01', published: { version: 1 }, audienceSize: 4, acknowledged: 2, ackPct: 50, reviewDue: false });
    expect(list[0].nextReviewOn).toBe(`${Number(today.slice(0, 4)) + 2}${today.slice(4)}`.replace(/-02-29$/, '-02-28'));
    expect((await get('outsider', '/v1/governance/policies').expect(200)).body).toEqual([]);

    // Version 2 supersedes; acknowledgements of version 1 do not carry over.
    await post('iqac', `/v1/governance/policies/${pol.id}/versions`, { body: `${body.body} Version two adds social media.`, changeNote: 'Social media clause' }).expect(201);
    await post('iqac', `/v1/governance/policies/${pol.id}/versions`, { body: `${body.body} Another.`, changeNote: 'Clash' }).expect(409);
    const det = (await get('iqac', `/v1/governance/policies/${pol.id}`).expect(200)).body;
    const v2 = det.versions[0];
    await post('iqac', `/v1/governance/policies/versions/${v2.id}/move`, { to: 'in_review' }).expect(200);
    await post('admin', `/v1/governance/policies/versions/${v2.id}/approve`).expect(200);
    await post('admin', `/v1/governance/policies/versions/${v2.id}/publish`).expect(200);
    const after = (await get('iqac', `/v1/governance/policies/${pol.id}`).expect(200)).body;
    expect(after.versions.map((v: { version: number; status: string; acknowledged: number; intact: boolean }) => [v.version, v.status, v.acknowledged, v.intact])).toEqual([[2, 'published', 0, true], [1, 'superseded', 2, true]]);
    await post('ravi', `/v1/governance/policies/versions/${v1.id}/acknowledge`).expect(409); // replaced
    expect((await get('ravi', '/v1/governance/policies/me/list').expect(200)).body[0]).toMatchObject({ version: 2, pending: true });
    acks = (await get('iqac', `/v1/governance/policies/versions/${v2.id}/acks`).expect(200)).body;
    expect(acks).toMatchObject({ acknowledged: 0, pending: 4 });
    ids.policy = pol.id;
    ids.policyV2 = v2.id;
  });

  // ---- RTI ------------------------------------------------------------------------------------------------------

  it('keeps the RTI register on the statutory clock: 30 days, 48 hours, free when late, refusals by section, first appeals', async () => {
    const base = { applicantName: 'R. Mehta', receivedOn: day(-40), mode: 'post', subject: 'Merit list of admissions', information: 'Copies of the merit list for BCom 2026', feePaise: 10, pioUserId: ids.iqac };
    await post('teacher', '/v1/records/rti-requests', base).expect(403);
    const late = (await post('admin', '/v1/records/rti-requests', base).expect(201)).body;
    expect(late).toMatchObject({ requestNo: expect.stringMatching(/RTI/), dueOn: day(-10), status: 'received', overdue: true, feePaise: 10 });
    expect(await notes(ids.iqac, `rti-assigned:${late.id}`)).toBe(1);
    const urgent = (await post('admin', '/v1/records/rti-requests', { ...base, applicantName: 'S. Rao', receivedOn: today, lifeLiberty: true, subject: 'Hostel detention order', bpl: true, feePaise: 0 }).expect(201)).body;
    expect(urgent.dueOn).toBe(day(2));
    const apio = (await post('admin', '/v1/records/rti-requests', { ...base, applicantName: 'K. Iyer', receivedOn: day(-2), viaApio: true, subject: 'Faculty list' }).expect(201)).body;
    expect(apio.dueOn).toBe(day(33));

    // Late: no further fee may be asked (s.7(6)), whatever the pages.
    let r = (await kitAction('admin', 'rti-requests', 'reply', late.id, { reply: 'Copies enclosed (12 pages).', pages: 12 }).expect(200)).body;
    expect(r).toMatchObject({ succeeded: 1 });
    expect((await get('admin', `/v1/records/rti-requests/${late.id}`).expect(200)).body).toMatchObject({ status: 'replied', repliedOn: today, additionalFeeRupees: 0 });
    // On time: Rs 2 a page.
    await kitAction('admin', 'rti-requests', 'reply', apio.id, { reply: 'List enclosed.', pages: 5 }).expect(200);
    expect((await get('admin', `/v1/records/rti-requests/${apio.id}`).expect(200)).body.additionalFeeRupees).toBe(10);
    await kitAction('admin', 'rti-requests', 'reject', urgent.id, { section: '8(1)(z)', reason: 'Not a section of the Act at all' }).expect(400);
    await kitAction('admin', 'rti-requests', 'reject', urgent.id, { section: '8(1)(j)', reason: 'Personal information of another student with no public interest' }).expect(200);

    // First appeal: within 30 days of the reply; decided by the appellate authority.
    r = (await kitAction('admin', 'rti-requests', 'appeal', late.id, { grounds: 'Copies incomplete' }).expect(200)).body;
    expect((await get('admin', `/v1/records/rti-requests/${late.id}`).expect(200)).body).toMatchObject({ appealFiledOn: today, appealDueOn: day(30) });
    await kitAction('admin', 'rti-requests', 'appealPartly', late.id, { decision: 'Supply the two missing pages within 7 days' }).expect(200);
    r = (await kitAction('admin', 'rti-requests', 'appealAllowed', late.id, { decision: 'Again, allowed' })).body;
    expect(r.rows[0].ok).toBe(false);

    const reg = (await get('admin', `/v1/governance/rti/register?from=${day(-60)}&to=${today}`).expect(200)).body;
    // Received 3 (fees: Rs 10 + 0 + Rs 10, and Rs 10 further), replied 2 (one late), refused 1 under 8(1)(j), one appeal received and decided.
    expect(reg).toMatchObject({ received: 3, replied: 2, refused: 1, refusedBySection: { '8(1)(j)': 1 }, lateReplies: 1, feesPaise: 3000, appealsReceived: 1, appealsDecided: 1, appealsPending: 0, pendingAtEnd: 0 });
    await get('teacher', '/v1/governance/rti/register').expect(403);
    expect((await get('outsider', '/v1/records/rti-requests').expect(200)).body.total).toBe(0);
    expect((await http().delete(`/v1/records/rti-requests/${late.id}`).set(as('admin')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
  });

  // ---- compliance calendar ---------------------------------------------------------------------------------------

  it('adds the standard deadlines, rolls a recurring one on, and reminds on the clock once per step', async () => {
    await post('teacher', '/v1/governance/compliance/standard', {}).expect(403);
    const std = (await post('iqac', '/v1/governance/compliance/standard', { startYear: 2026 }).expect(200)).body;
    expect(std).toEqual({ added: 12, year: '2026-27' });
    expect((await post('iqac', '/v1/governance/compliance/standard', { startYear: 2026 }).expect(200)).body.added).toBe(0);

    const dl = (await post('iqac', '/v1/records/compliance-deadlines', { title: 'NAAC IIQA filed', authority: 'naac', dueOn: day(7), recurrence: 'annual', ownerUserId: ids.ravi }).expect(201)).body;
    const pf = (await post('iqac', '/v1/records/compliance-deadlines', { title: 'PF challan', authority: 'epfo', dueOn: day(-2), recurrence: 'monthly' }).expect(201)).body;
    const job = app.get(ComplianceReminders);
    const run = async (at: Date) => {
      clock.at = at;
      return app.get(DbService).withTenant(t.tenantId, (tx) => job.run(tx));
    };
    // Today: IIQA is 7 days out, so the 7-day reminder goes to Ravi; PF is overdue and the principals are told once.
    let out = await run(start);
    expect(await notes(ids.ravi, `compliance-remind:${dl.id}:7`)).toBe(1);
    expect(await notes(ids.principal, `compliance-missed:${pf.id}`)).toBe(1);
    expect(out.missed).toBeGreaterThanOrEqual(1);
    out = await run(start); // the same day again: nothing new
    expect(await notes(ids.ravi, `compliance-remind:${dl.id}:%`)).toBe(1);
    await run(new Date(start.getTime() + 3 * 86_400_000)); // 4 days left: still the 7-day step
    expect(await notes(ids.ravi, `compliance-remind:${dl.id}:%`)).toBe(1);
    await run(new Date(start.getTime() + 6 * 86_400_000)); // 1 day left
    expect(await notes(ids.ravi, `compliance-remind:${dl.id}:1`)).toBe(1);

    const done = (await post('iqac', `/v1/governance/compliance/${dl.id}/done`, { reference: 'IIQA/2026/889' }).expect(200)).body;
    const nextYear = `${Number(day(7).slice(0, 4)) + 1}${day(7).slice(4)}`.replace(/-02-29$/, '-02-28');
    expect(done.message).toBe(`Done; next due ${nextYear}`);
    await post('iqac', `/v1/governance/compliance/${dl.id}/done`, {}).expect(409);
    const cal = (await get('iqac', `/v1/governance/compliance/calendar?from=${day(-10)}&to=${day(400)}`).expect(200)).body;
    const all = cal.months.flatMap((m: { items: unknown[] }) => m.items) as { id: string; title: string; state: string; dueOn: string; reference: string }[];
    expect(all.find((i) => i.id === dl.id)).toMatchObject({ state: 'done', reference: 'IIQA/2026/889' });
    expect(all.find((i) => i.title === 'NAAC IIQA filed' && i.id !== dl.id)).toMatchObject({ dueOn: nextYear, state: 'upcoming' });
    expect(all.find((i) => i.id === pf.id)).toMatchObject({ state: 'overdue' });
    // The kit's own steps: waive needs a reason; reopening the done one is refused because its next occurrence exists.
    expect((await kitAction('iqac', 'compliance-deadlines', 'reopen', dl.id)).body.rows[0]).toMatchObject({ ok: false });
    await kitAction('iqac', 'compliance-deadlines', 'waive', pf.id, { note: 'No staff on PF this month' }).expect(200);
    await get('teacher', '/v1/governance/compliance/calendar').expect(403);
    expect((await get('outsider', '/v1/records/compliance-deadlines').expect(200)).body.total).toBe(0);
  });

  // ---- disclosure, grievances, DPDP and the dashboard -------------------------------------------------------------

  it('publishes the mandatory disclosure page with public committees, policies and typed lines only', async () => {
    await http().get(`/v1/public/disclosure/${t.slug}`).expect(404);
    await post('iqac', '/v1/records/disclosure-items', { section: 'approvals', label: 'AICTE permanent id', value: '1-12345678', public: true }).expect(201);
    await post('iqac', '/v1/records/disclosure-items', { section: 'fees', label: 'Fee approval draft', value: 'Internal', public: false }).expect(201);
    await post('iqac', '/v1/records/disclosure-items', { section: 'fees', label: 'Bad link', url: 'javascript:alert(1)' }).expect(400);
    await put('iqac', `/v1/governance/policies/${ids.policy}`, { public: true }).expect(200);
    const preview = (await get('iqac', '/v1/governance/disclosure').expect(200)).body;
    expect(preview.published).toBe(false);
    expect(preview.sections.find((s: { section: string }) => s.section === 'fees').items).toHaveLength(1);
    await put('teacher', '/v1/governance/disclosure/settings', { published: true }).expect(403);
    await put('iqac', '/v1/governance/disclosure/settings', { published: true, intro: 'Disclosed as required by UGC and AICTE.' }).expect(200);
    const page = (await http().get(`/v1/public/disclosure/${t.slug}`).expect(200)).body;
    expect(page.sections).toEqual([{ section: 'approvals', items: [expect.objectContaining({ label: 'AICTE permanent id', value: '1-12345678' })] }]);
    const icc = page.committees.find((c: { kind: string }) => c.kind === 'icc');
    expect(icc).toMatchObject({ helpline: '1800-123-456', email: 'icc@college.in' });
    expect(icc.members.find((m: { name: string }) => m.name.startsWith('Lakshmi'))).toMatchObject({ phone: '+91 80 4000 1000' });
    expect(icc.members.find((m: { name: string }) => m.name === 'Ravi Kumar')).toMatchObject({ phone: '' });
    expect(page.committees.some((c: { kind: string }) => c.kind === 'minority_cell')).toBe(false); // not public by default
    expect(page.policies).toEqual([expect.objectContaining({ code: 'POL/HR/01', version: 2, versionId: ids.policyV2 })]);
    expect((await http().get(`/v1/public/disclosure/${t.slug}/policies/${ids.policyV2}`).expect(200)).body.body).toContain('social media');
    await http().get(`/v1/public/disclosure/${other.slug}`).expect(404);
    await http().get(`/v1/public/disclosure/${other.slug}/policies/${ids.policyV2}`).expect(404);
  });

  it('records a grievance raised on UGC e-Samadhan, and DPDP grievances and nominations with answer-by dates', async () => {
    const g = (await post('student', '/v1/grievances', { category: 'exam', subject: 'Revaluation result not given', description: 'Applied for revaluation six weeks ago.' }).expect(201)).body;
    await post('student', `/v1/grievances/${g.id}/external-ref`, { portal: 'e_samadhan', ref: 'ES/2026/1' }).expect(403);
    await post('gro', `/v1/grievances/${g.id}/external-ref`, { portal: 'e_samadhan', ref: '' }).expect(400);
    const x = (await post('gro', `/v1/grievances/${g.id}/external-ref`, { portal: 'e_samadhan', ref: 'UGC/ES/2026/004512' }).expect(200)).body;
    expect(x).toMatchObject({ externalPortal: 'e_samadhan', externalRef: 'UGC/ES/2026/004512', externalRefOn: today });
    expect((await get('gro', '/v1/records/grievances?f.external=e_samadhan').expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([g.id]);

    await post('parent', '/v1/dpdp/me/requests', { kind: 'grievance', details: 'short' }).expect(400);
    const dg = (await post('parent', '/v1/dpdp/me/requests', { kind: 'grievance', details: 'My phone number was shared with a coaching centre.' }).expect(201)).body;
    expect(new Date(dg.dueAt).getTime()).toBe(start.getTime() + 90 * 86_400_000);
    await post('parent', '/v1/dpdp/me/requests', { kind: 'nomination' }).expect(400);
    const nom = (await post('parent', '/v1/dpdp/me/requests', { kind: 'nomination', nominee: { name: 'Sunita Devi', relation: 'spouse' } }).expect(201)).body;
    expect(nom).toMatchObject({ nominee: { name: 'Sunita Devi', relation: 'spouse' } });
    expect(new Date(nom.dueAt).getTime()).toBe(start.getTime() + 30 * 86_400_000);
    clock.at = new Date(start.getTime() + 31 * 86_400_000);
    const overdue = (await get('principal', '/v1/dpdp/requests?overdue=true').expect(200)).body;
    expect(overdue.map((r: { id: string }) => r.id)).toEqual([nom.id]);
    clock.at = start;
    await post('principal', `/v1/dpdp/requests/${dg.id}/process`, { decision: 'approve' }).expect(400); // write the reply
    expect((await post('principal', `/v1/dpdp/requests/${dg.id}/process`, { decision: 'approve', note: 'The number was removed and the staff member counselled.' }).expect(200)).body.status).toBe('completed');
    await post('principal', `/v1/dpdp/requests/${nom.id}/process`, { decision: 'approve' }).expect(200);
  });

  it('gives the board one governance view with the figures above, and only to the leadership', async () => {
    const d = (await get('principal', '/v1/governance/dashboard').expect(200)).body;
    expect(d.committees).toMatchObject({ statutory: 8, missing: [], minutesPending: 0, openActions: 1, overdueActions: 1, doneActions: 1, meetingsHeld: 1 });
    expect(d.committees.attention.map((c: { kind: string }) => c.kind)).toContain('icc');
    expect(d.rti).toMatchObject({ open: 0, overdue: 0, appealsPending: 0, year: 3 });
    expect(d.policies).toMatchObject({ published: 1, reviewDue: 0, inApproval: 0, acknowledgements: 0 });
    expect(d.grievances).toMatchObject({ open: 1, external: 1 });
    expect(d.dpdp).toEqual({ pending: 0, overdue: 0 });
    expect(d.calendar.overdue).toBeGreaterThanOrEqual(0);
    expect(d.calendar.doneYear).toBe(1);
    await get('teacher', '/v1/governance/dashboard').expect(403);
    await get('student', '/v1/governance/dashboard').expect(403);
    const o = (await get('outsider', '/v1/governance/dashboard').expect(200)).body;
    expect(o.committees).toMatchObject({ statutory: 0, openActions: 0 });
    expect(o.rti.year).toBe(0);
  });
});
