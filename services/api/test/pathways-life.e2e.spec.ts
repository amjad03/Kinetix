import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { checkAnswers, conditionMet, shownQuestions, showIfProblem, type QuestionDef } from '../src/surveys/survey-rules.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import { EventBus } from '../src/events/events.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('conditional survey questions', () => {
  const qs: QuestionDef[] = [
    { id: 'q1', kind: 'single', prompt: 'Use the library?', options: ['Yes', 'No'], required: true },
    { id: 'q2', kind: 'rating', prompt: 'Rate it', options: [], required: true, showIf: { questionId: 'q1', op: 'eq', value: 'Yes' } },
    { id: 'q3', kind: 'text', prompt: 'Why is it low?', options: [], required: true, showIf: { questionId: 'q2', op: 'lte', value: 2 } },
  ];
  it('evaluates conditions', () => {
    expect(conditionMet({ questionId: 'a', op: 'eq', value: 'Yes' }, { questionId: 'a', choices: ['Yes'] })).toBe(true);
    expect(conditionMet({ questionId: 'a', op: 'gte', value: 4 }, { questionId: 'a', rating: 3 })).toBe(false);
    expect(conditionMet({ questionId: 'a', op: 'neq', value: 'Yes' }, undefined)).toBe(true);
    expect(conditionMet({ questionId: 'a', op: 'includes', value: 'late' }, { questionId: 'a', text: 'Always LATE' })).toBe(true);
  });
  it('hides what depends on a hidden question', () => {
    const shown = shownQuestions(qs, new Map([['q1', { questionId: 'q1', choices: ['No'] }], ['q2', { questionId: 'q2', rating: 1 }]]));
    expect([...shown]).toEqual(['q1']);
  });
  it('requires only the questions that are shown', () => {
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['No'] }])).toMatchObject({ ok: true, answers: [{ questionId: 'q1' }] });
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Yes'] }])).toEqual({ ok: false, error: 'Please answer: Rate it' });
    expect(checkAnswers(qs, [{ questionId: 'q1', choices: ['Yes'] }, { questionId: 'q2', rating: 2 }])).toEqual({ ok: false, error: 'Please answer: Why is it low?' });
    // An answer to a hidden question is dropped, not stored.
    const r = checkAnswers(qs, [{ questionId: 'q1', choices: ['No'] }, { questionId: 'q2', rating: 5 }]);
    expect(r.ok && r.answers.map((a) => a.questionId)).toEqual(['q1']);
  });
  it('checks that a condition points at an earlier, suitable question', () => {
    expect(showIfProblem({ showIf: { questionId: 'zz', op: 'eq', value: 'x' } }, qs)).toContain('earlier');
    expect(showIfProblem({ showIf: { questionId: 'q1', op: 'gte', value: 3 } }, qs)).toContain('rating');
    expect(showIfProblem({ showIf: { questionId: 'q1', op: 'eq', value: 'Maybe' } }, qs)).toContain('options');
    expect(showIfProblem({ showIf: { questionId: 'q1', op: 'eq', value: 'Yes' } }, qs)).toBeNull();
  });
});

describe('student life, surveys, grievance evidence and discipline records', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const del = (who: string, url: string) => http().delete(url).set(auth(who));
  const q = async <R = { id: string }>(sql: string, args: unknown[]) => (await owner.query(sql, args)).rows as R[];
  const bin = (who: string, url: string) =>
    get(who, url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const L = '/v1/campus-life';

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const [alum] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Asha Rao', email: 'asha@alum.in', passwordHash: hash }).returning();
    ids.alumUser = alum.id;
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
    };
    ids.me = t.students[2].id;
    ids.club = (await q(`insert into clubs (tenant_id, name, category) values ($1,'Debate','cultural') returning id`, [t.tenantId]))[0].id;
    await q(`insert into club_members (tenant_id, club_id, student_id, status) values ($1,$2,$3,'active')`, [t.tenantId, ids.club, ids.me]);
    ids.event = (await q(`insert into campus_events (tenant_id, title, event_type, venue, capacity, starts_at, ends_at, status, created_by) values ($1,'Careers workshop','workshop','Hall 1',50,'2026-10-15T05:00:00Z','2026-10-15T08:00:00Z','published',$2) returning id`, [t.tenantId, t.principal.id]))[0].id;
    await q(`insert into event_registrations (tenant_id, event_id, student_id, registered_by, status, qr_token, checked_in_at) values ($1,$2,$3,$4,'registered','tok-a-${t.slug}', now())`, [t.tenantId, ids.event, ids.me, t.principal.id]);
    await q(`insert into event_registrations (tenant_id, event_id, student_id, registered_by, status, qr_token) values ($1,$2,$3,$4,'registered','tok-b-${t.slug}')`, [t.tenantId, ids.event, t.students[0].id, t.principal.id]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lets alumni write success stories that the alumni office publishes', async () => {
    const a = (await post('principal', '/v1/placements/alumni', { fullName: 'Asha Rao', graduationYear: 2022, program: 'BCom', employer: 'Infosys', designation: 'Analyst' }).expect(201)).body;
    await post('principal', '/v1/alumni-portal/link', { alumniId: a.id, userId: ids.alumUser }).expect(200);
    tokens.alum = await login(t.slug, 'asha@alum.in');
    await post('alum', '/v1/alumni-portal/stories', { title: 'Short', body: 'too short' }).expect(400);
    const st = (await post('alum', '/v1/alumni-portal/stories', { title: 'From Soundarya to Infosys', body: 'I joined the debate club in my first year and that is where I learned to explain numbers simply, which my first job demanded every day.' }).expect(201)).body;
    await post('principal', `/v1/placements/success-stories/${st.id}/review`, { decision: 'publish' }).expect(409);
    await post('alum', `/v1/alumni-portal/stories/${st.id}/submit`).expect(200);
    await put('alum', `/v1/alumni-portal/stories/${st.id}`, { title: 'x yz', body: 'y'.repeat(60) }).expect(409);
    expect((await get('principal', '/v1/placements/success-stories?status=submitted').expect(200)).body).toHaveLength(1);
    await get('teacher', '/v1/placements/success-stories').expect(403);
    expect((await get('student', '/v1/alumni-stories').expect(200)).body).toEqual([]);
    await post('principal', `/v1/placements/success-stories/${st.id}/review`, { decision: 'reject', note: 'Please add your batch year' }).expect(200);
    expect((await put('alum', `/v1/alumni-portal/stories/${st.id}`, { title: 'From Soundarya to Infosys', body: 'Batch of 2022. I joined the debate club in my first year and that is where I learned to explain numbers simply, which my first job demanded.' }).expect(200)).body.status).toBe('draft');
    await post('alum', `/v1/alumni-portal/stories/${st.id}/submit`).expect(200);
    await post('principal', `/v1/placements/success-stories/${st.id}/review`, { decision: 'publish', featured: true }).expect(200);
    const shown = (await get('student', '/v1/alumni-stories').expect(200)).body;
    expect(shown[0]).toMatchObject({ title: 'From Soundarya to Infosys', alumnus: 'Asha Rao', graduationYear: 2022, employer: 'Infosys', featured: true });
    expect((await get('alum', '/v1/alumni-portal/stories').expect(200)).body[0].status).toBe('published');
    expect(await q<{ n: number }>(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2`, [t.tenantId, ids.alumUser]).then((r) => r[0].n)).toBe(2);
  });

  it('names club office bearers and keeps an achievements log the student app shows', async () => {
    await post('teacher', `${L}/clubs/${ids.club}/office-bearers`, { studentId: t.students[0].id, post: 'President', fromOn: '2026-08-01' }).expect(409);
    const b = (await post('teacher', `${L}/clubs/${ids.club}/office-bearers`, { studentId: ids.me, post: 'Secretary', fromOn: '2026-08-01' }).expect(201)).body;
    await post('teacher', `${L}/clubs/${ids.club}/office-bearers`, { studentId: ids.me, post: 'secretary', fromOn: '2026-08-01' }).expect(409);
    expect((await get('student', `${L}/clubs/${ids.club}/office-bearers`).expect(200)).body[0]).toMatchObject({ post: 'Secretary', fullName: 'Student C', active: true });
    await post('teacher', `${L}/clubs/${ids.club}/achievements`, { title: 'Inter-college debate winners', level: 'state', position: 'First', achievedOn: '2026-09-20', participants: [{ studentId: ids.me, name: 'Student C' }, { name: 'Guest speaker' }] }).expect(201);
    await post('student', `${L}/clubs/${ids.club}/achievements`, { title: 'x yz', achievedOn: '2026-09-20' }).expect(403);
    expect((await get('parent', `${L}/achievements?level=state`).expect(200)).body).toHaveLength(1);
    const mine = (await get('student', '/v1/student/activities').expect(200)).body;
    expect(mine.clubs[0]).toMatchObject({ club: 'Debate', posts: ['Secretary'] });
    expect(mine.achievements[0]).toMatchObject({ title: 'Inter-college debate winners', level: 'state', position: 'First' });
    expect(mine.events[0].title).toBe('Careers workshop');
    await post('teacher', `${L}/office-bearers/${b.id}/end`).expect(200);
    await post('teacher', `${L}/office-bearers/${b.id}/end`).expect(404);
    expect((await get('student', '/v1/student/activities').expect(200)).body.clubs[0].posts).toEqual([]);
  });

  it('keeps committee evidence and prints a report pack', async () => {
    const c = (await post('principal', `${L}/committees`, { name: 'IQAC', statutory: true, description: 'Quality cell' }).expect(201)).body;
    await post('principal', `${L}/committees/${c.id}/members`, { userId: t.teacher.id, role: 'secretary', tenureStart: '2026-04-01' }).expect(201);
    const m = (await post('principal', `${L}/committees/${c.id}/meetings`, { title: 'Annual quality review', meetingOn: '2026-09-10', agenda: 'AQAR draft' }).expect(201)).body;
    await patch('principal', `${L}/meetings/${m.id}`, { minutes: 'AQAR approved with two changes', status: 'held' }).expect(200);
    await post('principal', `${L}/meetings/${m.id}/actions`, { title: 'Collect feedback reports', ownerUserId: t.teacher.id, dueOn: '2026-10-30' }).expect(201);
    await post('principal', `${L}/committees/${c.id}/evidence`, { title: 'Signed minutes', kind: 'document', meetingId: m.id, file: { filename: 'minutes.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('%PDF-1.4 minutes').toString('base64') } }).expect(201);
    await post('principal', `${L}/committees/${c.id}/evidence`, { title: 'Photo folder', url: 'https://example.org/photos' }).expect(201);
    await post('principal', `${L}/committees/${c.id}/evidence`, { title: 'both', url: 'https://example.org/x', file: { filename: 'a.pdf', contentType: 'application/pdf', contentBase64: 'AAAA' } }).expect(400);
    await get('teacher', `${L}/committees/${c.id}/evidence`).expect(403);
    const list = (await get('principal', `${L}/committees/${c.id}/evidence`).expect(200)).body;
    expect(list).toHaveLength(2);
    const file = list.find((e: { contentType: string | null }) => e.contentType);
    expect((await bin('principal', `${L}/evidence/${file.id}/download`)).body.toString()).toBe('%PDF-1.4 minutes');
    const pack = await bin('principal', `${L}/committees/${c.id}/report-pack?from=2026-04-01&to=2026-10-20`);
    expect(pack.status).toBe(200);
    expect(pack.headers['content-type']).toContain('application/pdf');
    expect((pack.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await del('principal', `${L}/evidence/${file.id}`).expect(204);
    expect((await get('principal', `${L}/committees/${c.id}/evidence`).expect(200)).body).toHaveLength(1);
  });

  it('issues attendance certificates to those who checked in, and runs an approved gallery', async () => {
    const r1 = (await post('teacher', `${L}/events/${ids.event}/certificates`).expect(200)).body;
    expect(r1).toEqual({ issued: 1, alreadyHad: 0 });
    expect((await post('teacher', `${L}/events/${ids.event}/certificates`).expect(200)).body).toEqual({ issued: 0, alreadyHad: 1 });
    const mine = (await get('student', `${L}/events/${ids.event}/my-certificate`).expect(200)).body;
    expect(mine.certificateId).toBeTruthy();
    const cert = (await q<{ status: string; serial_no: string; rendered_body: string }>(`select status, serial_no, rendered_body from certificates where id = $1`, [mine.certificateId]))[0];
    expect(cert.status).toBe('issued');
    expect(cert.serial_no).toMatch(/^EVT\//);
    expect(cert.rendered_body).toContain('Careers workshop');
    expect((await get('parent', `${L}/events/${ids.event}/my-certificate?studentId=${t.students[0].id}`).expect(200)).body).toEqual({ certificateId: null });

    const staffItem = (await post('teacher', `${L}/events/${ids.event}/media`, { caption: 'Opening', kind: 'photo', file: { filename: 'a.png', contentType: 'image/png', contentBase64: PNG } }).expect(201)).body;
    expect(staffItem.approved).toBe(true);
    const own = (await post('student', `${L}/events/${ids.event}/media`, { caption: 'My view', url: 'https://example.org/p.jpg' }).expect(201)).body;
    expect(own.approved).toBe(false);
    await post('student', `${L}/events/${ids.event}/media`, { caption: 'bad', file: { filename: 'x.pdf', contentType: 'application/pdf', contentBase64: PNG } }).expect(409);
    await post('parent', `${L}/events/${ids.event}/media`, { url: 'https://example.org/q.jpg' }).expect(403);
    expect((await get('student', `${L}/events/${ids.event}/media`).expect(200)).body).toHaveLength(1);
    expect((await get('teacher', `${L}/events/${ids.event}/media`).expect(200)).body).toHaveLength(2);
    await post('student', `${L}/media/${own.id}/approve`).expect(403);
    await post('teacher', `${L}/media/${own.id}/approve`).expect(200);
    expect((await get('parent', `${L}/events/${ids.event}/media`).expect(200)).body).toHaveLength(2);
    const img = await bin('parent', `${L}/media/${staffItem.id}/file`);
    expect(img.headers['content-type']).toContain('image/png');
    expect((img.body as Buffer).length).toBeGreaterThan(20);
    await del('teacher', `${L}/media/${staffItem.id}`).expect(204);
  });

  describe('surveys', () => {
    const S = '/v1/surveys';
    const answers = (rows: Record<string, unknown>[]) => ({ answers: rows });

    it('shows a question only when an earlier answer calls for it', async () => {
      const sv = (await post('teacher', S, {
        title: 'Library feedback',
        audience: 'students',
        questions: [
          { kind: 'single', prompt: 'Do you use the library?', options: ['Yes', 'No'] },
          { kind: 'rating', prompt: 'How helpful is it?', showIf: { ord: 1, op: 'eq', value: 'Yes' } },
        ],
      }).expect(201)).body;
      expect(sv.questions[1].showIf).toMatchObject({ questionId: sv.questions[0].id, op: 'eq', value: 'Yes' });
      await post('teacher', S, { title: 'Bad condition', audience: 'students', questions: [{ kind: 'rating', prompt: 'a b c', showIf: { ord: 1, op: 'gte', value: 3 } }] }).expect(400);
      await post('teacher', S, { title: 'Wrong option', audience: 'students', questions: [{ kind: 'single', prompt: 'Pick one', options: ['A', 'B'] }, { kind: 'text', prompt: 'Why that one', showIf: { ord: 1, op: 'eq', value: 'C' } }] }).expect(400);
      await post('teacher', `${S}/${sv.id}/publish`).expect(200);
      const [q1, q2] = sv.questions;
      const mineList = (await get('student', `${S}/mine`).expect(200)).body;
      expect(mineList[0].questions[1].showIf).toMatchObject({ op: 'eq', value: 'Yes' });
      await post('student', `${S}/${sv.id}/responses`, answers([{ questionId: q1.id, choices: ['Yes'] }])).expect(400);
      await post('student', `${S}/${sv.id}/responses`, answers([{ questionId: q1.id, choices: ['No'] }, { questionId: q2.id, rating: 5 }])).expect(201);
      const res = (await get('teacher', `${S}/${sv.id}/results`).expect(200)).body;
      expect(res.questions[1].answered).toBe(0);
    });

    it('opens by itself, starts the next cycle when one closes, and compares cycles', async () => {
      const opens = new Date(clock.at.getTime() - 86_400_000);
      const closes = new Date(clock.at.getTime() + 6 * 86_400_000);
      const sv = (await post('teacher', S, {
        title: 'Weekly pulse',
        audience: 'students',
        autoPublish: true,
        repeatEveryDays: 30,
        seriesKey: 'pulse',
        opensAt: opens.toISOString(),
        closesAt: closes.toISOString(),
        questions: [{ kind: 'rating', prompt: 'How was campus life this month?' }, { kind: 'single', prompt: 'Would you recommend us?', options: ['Yes', 'No'] }],
      }).expect(201)).body;
      expect(sv.status).toBe('draft');
      await post('student', `${S}/schedule/run`).expect(403);
      expect((await post('principal', `${S}/schedule/run`).expect(200)).body).toEqual({ opened: [sv.id], closed: [] });
      expect((await post('principal', `${S}/schedule/run`).expect(200)).body).toEqual({ opened: [], closed: [] });
      const [r1, r2] = sv.questions;
      await post('student', `${S}/${sv.id}/responses`, answers([{ questionId: r1.id, rating: 3 }, { questionId: r2.id, choices: ['No'] }])).expect(201);
      expect(await q<{ n: number }>(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title = 'A survey needs your answer' and body = 'Weekly pulse'`, [t.tenantId, t.studentUser.id]).then((r) => r[0].n)).toBe(1);

      // The cycle ends; the next one is drafted for 30 days later and opens when its time comes.
      clock.at = new Date(closes.getTime() + 3600_000);
      const run = (await post('principal', `${S}/schedule/run`).expect(200)).body;
      expect(run.closed).toEqual([sv.id]);
      const next = (await q<{ id: string; opens_at: Date; closes_at: Date; status: string }>(`select id, opens_at, closes_at, status from surveys where tenant_id = $1 and series_key = 'pulse' and id <> $2`, [t.tenantId, sv.id]))[0];
      expect(next.status).toBe('draft');
      expect(next.opens_at.getTime()).toBe(closes.getTime() + 30 * 86_400_000);
      expect(next.closes_at.getTime() - next.opens_at.getTime()).toBe(closes.getTime() - opens.getTime());
      expect((await q<{ n: number }>(`select count(*)::int as n from survey_questions where survey_id = $1`, [next.id]))[0].n).toBe(2);
      expect((await post('principal', `${S}/schedule/run`).expect(200)).body.opened).toEqual([]);
      clock.at = new Date(next.opens_at.getTime() + 3600_000);
      expect((await post('principal', `${S}/schedule/run`).expect(200)).body.opened).toEqual([next.id]);
      const nextQs = (await get('student', `${S}/mine`).expect(200)).body.find((x: { id: string }) => x.id === next.id).questions;
      await post('student', `${S}/${next.id}/responses`, answers([{ questionId: nextQs[0].id, rating: 5 }, { questionId: nextQs[1].id, choices: ['Yes'] }])).expect(201);

      const trend = (await get('teacher', `${S}/series/pulse/trend`).expect(200)).body;
      expect(trend.cycles).toHaveLength(2);
      const rating = trend.questions.find((x: { prompt: string }) => x.prompt.startsWith('How was campus'));
      expect(rating.points.map((p: { average: number }) => p.average)).toEqual([3, 5]);
      expect(rating.change).toBe(2);
      expect((await get('teacher', `${S}/series`).expect(200)).body[0]).toMatchObject({ key: 'pulse', cycles: 2, closed: 1 });
      await get('teacher2', `${S}/series/pulse/trend`).expect(404);
      clock.at = new Date('2026-10-20T04:30:00Z');
    });
  });

  it('keeps grievance evidence with the same privacy as the ticket', async () => {
    const tk = (await post('student', '/v1/grievances', { category: 'academic', subject: 'Marks not updated', description: 'My internal marks have not been entered for two months.', anonymous: true }).expect(201)).body;
    const ev = (await post('student', `/v1/grievances/${tk.id}/evidence`, { title: 'Screenshot of portal', file: { filename: 'portal.png', contentType: 'image/png', contentBase64: PNG } }).expect(201)).body;
    await post('teacher', `/v1/grievances/${tk.id}/evidence`, { file: { filename: 'x.png', contentType: 'image/png', contentBase64: PNG } }).expect(404);
    const staffView = (await get('principal', `/v1/grievances/${tk.id}/evidence`).expect(200)).body;
    expect(staffView).toHaveLength(1);
    expect(staffView[0].addedBy).toBeUndefined();
    expect(staffView[0].mine).toBe(false);
    const own = (await get('student', `/v1/grievances/${tk.id}/evidence`).expect(200)).body;
    expect(own[0]).toMatchObject({ mine: true, title: 'Screenshot of portal' });
    expect((await bin('principal', `/v1/grievances/evidence/${ev.id}/download`)).headers['content-type']).toContain('image/png');
    await bin('teacher', `/v1/grievances/evidence/${ev.id}/download`).then((r) => expect(r.status).toBe(404));
    const events = (await get('principal', `/v1/grievances/${tk.id}`).expect(200)).body.timeline as { kind: string }[];
    expect(events.map((e) => e.kind)).toContain('evidence_added');
    await del('principal', `/v1/grievances/evidence/${ev.id}`).expect(404);
    await del('student', `/v1/grievances/evidence/${ev.id}`).expect(204);
    expect((await get('principal', `/v1/grievances/${tk.id}/evidence`).expect(200)).body).toEqual([]);
  });

  it('records witnesses to an incident and reaches the parents, who acknowledge', async () => {
    const inc = (await post('teacher', '/v1/discipline/incidents', { studentId: t.students[0].id, incidentOn: '2026-10-14', kind: 'Late to class', severity: 'minor', description: 'Third late arrival this week.' }).expect(201)).body;
    await post('teacher', `/v1/discipline/incidents/${inc.id}/witnesses`, { name: 'Student B', role: 'student', studentId: t.students[1].id, statement: 'He came in at 10:20.' }).expect(201);
    await post('teacher', `/v1/discipline/incidents/${inc.id}/witnesses`, { name: 'Mr. Gupta', role: 'staff' }).expect(201);
    await post('teacher2', `/v1/discipline/incidents/${inc.id}/witnesses`, { name: 'X' }).expect(404);
    expect((await get('teacher', `/v1/discipline/incidents/${inc.id}/witnesses`).expect(200)).body).toHaveLength(2);
    await post('teacher', `/v1/discipline/incidents/${inc.id}/parent-contacts`, { summary: 'Please speak with your child.' }).expect(403);
    const contacts = (await post('principal', `/v1/discipline/incidents/${inc.id}/parent-contacts`, { method: 'meeting', summary: 'Meeting with the class teacher on Friday.', meetingOn: '2026-10-23' }).expect(201)).body;
    expect(contacts).toHaveLength(1);
    const notice = (await get('parent', '/v1/discipline/my-notices').expect(200)).body;
    expect(notice[0]).toMatchObject({ kind: 'Late to class', method: 'meeting', studentName: 'Student A', acknowledgedAt: null });
    expect((await get('parent2', '/v1/discipline/my-notices').expect(200)).body).toEqual([]);
    await post('parent2', `/v1/discipline/parent-contacts/${contacts[0].id}/acknowledge`).expect(404);
    await post('parent', `/v1/discipline/parent-contacts/${contacts[0].id}/acknowledge`).expect(200);
    expect((await get('principal', `/v1/discipline/incidents/${inc.id}/parent-contacts`).expect(200)).body[0].acknowledgedAt).toBeTruthy();
    expect(await q<{ n: number }>(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title like 'A note from the school%'`, [t.tenantId, t.guardian.id]).then((r) => r[0].n)).toBe(1);
    // What the parent sees as behaviour comes with the notice attached.
    const beh = (await get('parent', `/v1/parent/children/${t.students[0].id}/behaviour`).expect(200)).body;
    expect(beh.incidents[0]).toMatchObject({ kind: 'Late to class' });
    expect(beh.incidents[0].notices).toHaveLength(1);
    void EventBus;
  });
});
