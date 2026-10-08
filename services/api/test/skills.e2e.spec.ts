import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import { internshipLevel, levelFromCount, levelFromPercent, levelFromPoints, skillLevel } from '../src/skills/skills.logic.js';

describe('skill levels', () => {
  it('turn marks, points and counts into levels 1 to 5', () => {
    expect([30, 40, 55, 70, 85, 100].map(levelFromPercent)).toEqual([1, 2, 3, 4, 5, 5]);
    expect([1, 10, 25, 50, 100].map(levelFromPoints)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 5, 8].map(levelFromCount)).toEqual([1, 2, 3, 4, 5]);
    expect([internshipLevel(null), internshipLevel(80), internshipLevel(95)]).toEqual([3, 4, 5]);
    expect(skillLevel([])).toBeNull();
    expect(skillLevel([2, 5])).toBe(4);
  });
});

describe('skill mapping, outcome passport and SDG mapping', () => {
  const owner = ownerPool();
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
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const del = (who: string, url: string) => http().delete(url).set(auth(who));
  const pdf = (who: string, url: string) =>
    get(who, url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const S = '/v1/skills';

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { me: t.students[2].id, kid: t.students[0].id, teacher: t.teacher.id, subject: t.subject.id });

    // Existing data the passport reads: a published assessment (80/100) mapped to a course outcome, a club with 30 points, and an event attended.
    const q = async <R = { id: string }>(sql: string, args: unknown[]) => (await owner.query(sql, args)).rows as R[];
    ids.assessment = (await q(`insert into assessments (tenant_id, section_id, subject_id, title, kind, max_marks, held_on, published_at, created_by, mark_status) values ($1,$2,$3,'Unit test','test',100,'2026-09-01', now(), $4, 'verified') returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id]))[0].id;
    await q(`insert into marks (tenant_id, assessment_id, student_id, marks) values ($1,$2,$3,80)`, [t.tenantId, ids.assessment, ids.me]);
    const set = (await q(`insert into co_sets (tenant_id, subject_id, version, status, created_by) values ($1,$2,1,'active',$3) returning id`, [t.tenantId, t.subject.id, t.teacher.id]))[0].id;
    ids.co = (await q(`insert into course_outcomes (tenant_id, co_set_id, code, statement) values ($1,$2,'CO1','Prepare financial statements') returning id`, [t.tenantId, set]))[0].id;
    await q(`insert into assessment_co_map (tenant_id, assessment_id, co_id, share) values ($1,$2,$3,1)`, [t.tenantId, ids.assessment, ids.co]);
    ids.club = (await q(`insert into clubs (tenant_id, name, category) values ($1,'Debate','cultural') returning id`, [t.tenantId]))[0].id;
    await q(`insert into club_members (tenant_id, club_id, student_id, status) values ($1,$2,$3,'active')`, [t.tenantId, ids.club, ids.me]);
    const act = (await q(`insert into club_activities (tenant_id, club_id, title, activity_on, points, created_by) values ($1,$2,'Inter-college debate','2026-09-10',30,$3) returning id`, [t.tenantId, ids.club, t.teacher.id]))[0].id;
    await q(`insert into club_activity_attendance (tenant_id, activity_id, student_id, points) values ($1,$2,$3,30)`, [t.tenantId, act, ids.me]);
    ids.event = (await q(`insert into campus_events (tenant_id, title, event_type, capacity, starts_at, ends_at, status, created_by) values ($1,'Careers workshop','workshop',50,'2026-09-15T05:00:00Z','2026-09-15T07:00:00Z','published',$2) returning id`, [t.tenantId, t.teacher.id]))[0].id;
    await q(`insert into event_registrations (tenant_id, event_id, student_id, registered_by, status, qr_token, checked_in_at) values ($1,$2,$3,$4,'registered','tok-${t.slug}', now())`, [t.tenantId, ids.event, ids.me, t.teacher.id]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('skill framework', () => {
    it('the office creates skills; codes are unique; teachers and students cannot create', async () => {
      const a = await post('principal', S, { code: 'fin-lit', name: 'Financial literacy', category: 'knowledge' }).expect(201);
      ids.skillA = a.body.id;
      expect(a.body.code).toBe('FIN-LIT');
      ids.skillB = (await post('principal', S, { code: 'COMM', name: 'Communication', category: 'communication' }).expect(201)).body.id;
      ids.skillC = (await post('principal', S, { code: 'LEAD', name: 'Leadership', category: 'leadership' }).expect(201)).body.id;
      await post('principal', S, { code: 'COMM', name: 'Again' }).expect(409);
      await post('teacher', S, { code: 'X1', name: 'Nope' }).expect(403);
      await post('student', S, { code: 'X2', name: 'Nope' }).expect(403);
      expect((await get('teacher', S).expect(200)).body).toHaveLength(3);
      expect((await get('outsider', S).expect(200)).body).toHaveLength(0);
      await patch('principal', `${S}/${ids.skillC}`, { description: 'Leads a team' }).expect(200);
    });

    it('sources map to skills; references are checked and duplicates refused', async () => {
      await post('principal', `${S}/${ids.skillA}/maps`, { kind: 'subject', ref: ids.subject }).expect(201);
      await post('principal', `${S}/${ids.skillA}/maps`, { kind: 'subject', ref: ids.subject }).expect(409);
      await post('principal', `${S}/${ids.skillA}/maps`, { kind: 'course_outcome', ref: ids.co }).expect(201);
      await post('principal', `${S}/${ids.skillB}/maps`, { kind: 'event_type', ref: 'workshop' }).expect(201);
      await post('principal', `${S}/${ids.skillB}/maps`, { kind: 'event_type', ref: 'party' }).expect(400);
      await post('principal', `${S}/${ids.skillC}/maps`, { kind: 'club', ref: ids.club }).expect(201);
      await post('principal', `${S}/${ids.skillC}/maps`, { kind: 'club', ref: '00000000-0000-4000-8000-000000000000' }).expect(404);
      await post('principal', `${S}/${ids.skillC}/maps`, { kind: 'placement', ref: ids.club }).expect(400);
      await post('principal', `${S}/${ids.skillC}/maps`, { kind: 'internship' }).expect(201);
      await post('teacher', `${S}/${ids.skillC}/maps`, { kind: 'research' }).expect(403);
      const one = (await get('teacher', `${S}/${ids.skillA}`).expect(200)).body;
      expect(one.maps.map((m: { label: string }) => m.label)).toContain('Corporate Accounting');
      expect((await get('teacher', S)).body.find((s: { id: string }) => s.id === ids.skillC).sources).toBe(2);
      await get('outsider', `${S}/${ids.skillA}`).expect(404);
    });
  });

  describe('outcome passport', () => {
    it('computes levels read-only from marks, course outcomes, club points and events', async () => {
      const pp = (await get('student', '/v1/passport/me').expect(200)).body;
      expect(pp.student).toMatchObject({ fullName: t.students[2].fullName, rollNo: t.students[2].rollNo });
      const by = (code: string) => pp.skills.find((s: { code: string }) => s.code === code);
      expect(by('FIN-LIT').level).toBe(4); // 80% in the subject and 80% attainment on CO1
      expect(by('FIN-LIT').evidence.map((e: { source: string }) => e.source).sort()).toEqual(['course_outcome', 'subject']);
      expect(by('COMM')).toMatchObject({ level: 1, evidence: [{ source: 'event_type', title: 'workshop' }] });
      expect(by('LEAD')).toMatchObject({ level: 3, evidence: [{ source: 'club', title: 'Debate', detail: '30 points in 1 activity' }] });
      expect(pp.activities.clubs).toEqual([{ club: 'Debate', points: 30, activities: 1 }]);
      expect(pp.activities.events[0].title).toBe('Careers workshop');
      expect(pp.verification.verified).toBe(false);
    });

    it('manual evidence from staff raises a skill; levels are 1 to 5', async () => {
      await post('teacher', `${S}/${ids.skillB}/evidence`, { studentId: ids.me, level: 6, title: 'Talk' }).expect(400);
      const e = await post('teacher', `${S}/${ids.skillB}/evidence`, { studentId: ids.me, level: 5, title: 'Keynote at annual day', note: 'Observed by the principal' }).expect(201);
      await post('student', `${S}/${ids.skillB}/evidence`, { studentId: ids.me, level: 5, title: 'Self' }).expect(403);
      const pp = (await get('student', '/v1/passport/me').expect(200)).body;
      const comm = pp.skills.find((s: { code: string }) => s.code === 'COMM');
      expect(comm.level).toBe(3); // average of 1 and 5
      expect(comm.evidence).toHaveLength(2);
      expect((await get('teacher', `${S}/${ids.skillB}/evidence`).expect(200)).body).toHaveLength(1);
      await del('teacher', `${S}/evidence/${e.body.id}`).expect(403);
      await del('principal', `${S}/evidence/${e.body.id}`).expect(200);
    });

    it('access: staff read any passport, families only their own, other schools nothing', async () => {
      await get('teacher', `/v1/passport/students/${ids.me}`).expect(200);
      await get('student', `/v1/passport/students/${ids.me}`).expect(200);
      await get('student', `/v1/passport/students/${ids.kid}`).expect(403);
      await get('parent2', `/v1/passport/students/${ids.me}`).expect(403);
      await get('outsider', `/v1/passport/students/${ids.me}`).expect(404);
      await get('principal', '/v1/passport/me').expect(403);
    });

    it('the institution verifies the passport; the PDF carries a QR and the public link answers valid, then revoked', async () => {
      const before = await pdf('student', `/v1/passport/students/${ids.me}/pdf`).expect(200);
      expect(before.headers['content-type']).toContain('application/pdf');
      expect((before.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      await post('teacher', `/v1/passport/students/${ids.me}/verify`).expect(403);
      const v = (await post('principal', `/v1/passport/students/${ids.me}/verify`).expect(200)).body;
      expect(v.verified).toBe(true);
      const m = /\/passport\/([a-z0-9-]+)\/([0-9a-f]{32})$/.exec(v.verifyUrl);
      expect(m).not.toBeNull();
      const after = await pdf('principal', `/v1/passport/students/${ids.me}/pdf`).expect(200);
      expect((after.body as Buffer).length).toBeGreaterThan((before.body as Buffer).length);
      const pub = (await http().get(`/v1/public/verify-passport/${m![1]}/${m![2]}`).expect(200)).body;
      expect(pub).toMatchObject({ status: 'valid', studentName: t.students[2].fullName });
      expect(pub.skills.some((s: { name: string }) => s.name === 'Leadership')).toBe(true);
      expect((await http().get(`/v1/public/verify-passport/${m![1]}/${'0'.repeat(32)}`).expect(200)).body.status).toBe('not_found');
      expect((await get('student', '/v1/passport/me')).body.verification.verified).toBe(true);
      await post('principal', `/v1/passport/students/${ids.me}/revoke`).expect(200);
      expect((await http().get(`/v1/public/verify-passport/${m![1]}/${m![2]}`).expect(200)).body.status).toBe('revoked');
    });
  });

  describe('SDG mapping', () => {
    it('lists the 17 goals', async () => {
      const goals = (await get('teacher', '/v1/sdg/goals').expect(200)).body;
      expect(goals).toHaveLength(17);
      expect(goals[3]).toMatchObject({ number: 4, name: 'Quality Education' });
    });

    it('tags courses, clubs and events to goals; duplicates, unknown items and bad goals are refused', async () => {
      const tag = (who: string, body: object) => post(who, '/v1/sdg/tags', body);
      ids.tag = (await tag('teacher', { sdgNumber: 4, itemType: 'course', itemId: ids.subject }).expect(201)).body.id;
      await tag('teacher', { sdgNumber: 4, itemType: 'course', itemId: ids.subject }).expect(409);
      await tag('teacher', { sdgNumber: 5, itemType: 'club', itemId: ids.club, note: 'Girls debate league' }).expect(201);
      await tag('teacher', { sdgNumber: 4, itemType: 'event', itemId: ids.event }).expect(201);
      await tag('teacher', { sdgNumber: 18, itemType: 'club', itemId: ids.club }).expect(400);
      await tag('teacher', { sdgNumber: 4, itemType: 'event', itemId: ids.club }).expect(404);
      await tag('student', { sdgNumber: 4, itemType: 'club', itemId: ids.club }).expect(403);
      expect((await get('teacher', '/v1/sdg/tags?sdgNumber=4').expect(200)).body.map((x: { title: string }) => x.title).sort()).toEqual(['Careers workshop', 'Corporate Accounting']);
    });

    it('the impact dashboard counts items and people reached per goal', async () => {
      const d = (await get('principal', '/v1/sdg/dashboard').expect(200)).body;
      expect(d.totals).toEqual({ tags: 3, goalsCovered: 2, distinctItems: 3 });
      expect(d.goals).toHaveLength(17);
      const g4 = d.goals.find((g: { number: number }) => g.number === 4);
      expect(g4).toMatchObject({ count: 2, byType: { course: 1, event: 1, club: 0 }, participation: 1 });
      const g5 = d.goals.find((g: { number: number }) => g.number === 5);
      expect(g5.items[0]).toMatchObject({ title: 'Debate', participation: 1, note: 'Girls debate league' });
      const empty = (await get('outsider', '/v1/sdg/dashboard').expect(200)).body;
      expect(empty.totals.tags).toBe(0);
    });

    it('only the office removes a tag', async () => {
      await del('teacher', `/v1/sdg/tags/${ids.tag}`).expect(403);
      await del('principal', `/v1/sdg/tags/${ids.tag}`).expect(200);
      await del('principal', `/v1/sdg/tags/${ids.tag}`).expect(404);
    });
  });
});
