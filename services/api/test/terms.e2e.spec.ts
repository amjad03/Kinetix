import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { RetentionService } from '../src/recordings/retention.service.js';
import { bufferStream, ObjectStorage } from '../src/storage/storage.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** Academic terms, recording retention until the semester ends, and year plans that follow the term. */
describe('academic terms and recording retention', () => {
  const owner = ownerPool();
  // Monday 5 October 2026, 10:30 IST.
  const clock = new FixedClock(new Date('2026-10-05T05:00:00Z'));
  const at = (date: string) => (clock.at = new Date(`${date}T05:00:00Z`));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let bba: { programId: string };
  let yearId: string;
  let oddId: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const term = (b: Record<string, unknown>) => ({ academicYearId: yearId, name: 'Term', ...b });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = { teacher: await login(t.teacher.email!), principal: await login(t.principal.email!), parent: await login(t.guardian.email!) };
    yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    const { rows } = await owner.query(`insert into programs (tenant_id, campus_id, name, level, term_count) values ($1, $2, 'BBA', 'ug', 6) returning id`, [t.tenantId, t.campus.id]);
    bba = { programId: rows[0].id };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps terms inside the year and without overlaps for the same programs', async () => {
    await http().post('/v1/admin/terms').set(auth('teacher')).send(term({ startsOn: '2026-08-01', endsOn: '2026-12-15' })).expect(403);
    const odd = (await http().post('/v1/admin/terms').set(auth('principal')).send(term({ name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-15' })).expect(201)).body;
    oddId = odd.id;
    expect(odd).toMatchObject({ name: 'Odd semester 2026', programIds: null });

    expect((await http().post('/v1/admin/terms').set(auth('principal')).send(term({ startsOn: '2026-07-01', endsOn: '2026-07-31' })).expect(400)).body.message).toMatch(/within the academic year/);
    await http().post('/v1/admin/terms').set(auth('principal')).send(term({ startsOn: '2026-12-20', endsOn: '2026-12-01' })).expect(400);
    await http().post('/v1/admin/terms').set(auth('principal')).send(term({ startsOn: '2026-12-01', endsOn: '2027-01-31', programIds: [randomUUID()] })).expect(400);
    // A term for every program overlaps a term for any program.
    expect((await http().post('/v1/admin/terms').set(auth('principal')).send(term({ startsOn: '2026-12-01', endsOn: '2027-03-31', programIds: [bba.programId] })).expect(400)).body.message).toMatch(/overlaps "Odd semester 2026"/);

    // Made for BCom only, BBA can have its own calendar.
    await http().put(`/v1/admin/terms/${oddId}`).set(auth('principal')).send(term({ name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-15', programIds: [t.program.id] })).expect(200);
    const bbaTerm = (await http().post('/v1/admin/terms').set(auth('principal')).send(term({ name: 'BBA term 2', startsOn: '2026-12-01', endsOn: '2027-03-31', programIds: [bba.programId] })).expect(201)).body;
    await http().post('/v1/admin/terms').set(auth('principal')).send(term({ name: 'Even', startsOn: '2026-12-10', endsOn: '2027-05-31', programIds: [t.program.id] })).expect(400);
    // Without an academic year, the one the term starts in.
    expect((await http().post('/v1/admin/terms').set(auth('principal')).send({ name: 'Summer', startsOn: '2027-06-01', endsOn: '2027-06-30' }).expect(400)).body.message).toMatch(/within an academic year/);
    const even = (await http().post('/v1/admin/terms').set(auth('principal')).send({ name: 'Even semester 2027', startsOn: '2027-01-01', endsOn: '2027-05-31', programIds: [t.program.id] }).expect(201)).body;
    expect(even.academicYearId).toBe(yearId);
    // Changing a term does not clash with itself.
    await http().put(`/v1/admin/terms/${bbaTerm.id}`).set(auth('principal')).send(term({ name: 'BBA term 2', startsOn: '2026-12-02', endsOn: '2027-03-31', programIds: [bba.programId] })).expect(200);

    const staff = (await http().get('/v1/terms').set(auth('teacher')).expect(200)).body;
    expect(staff.map((x: { name: string }) => x.name)).toEqual(['Odd semester 2026', 'BBA term 2', 'Even semester 2027']);
    expect(staff[0]).toMatchObject({ academicYear: '2026-27', programs: ['BCom'] });
    const family = (await http().get('/v1/terms').set(auth('parent')).expect(200)).body;
    expect(family.map((x: { name: string }) => x.name)).toEqual(['Odd semester 2026', 'Even semester 2027']);

    await http().delete(`/v1/admin/terms/${bbaTerm.id}`).set(auth('teacher')).expect(403);
    await http().delete(`/v1/admin/terms/${bbaTerm.id}`).set(auth('principal')).expect(204);
    await http().delete(`/v1/admin/terms/${bbaTerm.id}`).set(auth('principal')).expect(404);
    const { rows } = await owner.query(`select action from audit_log where tenant_id = $1 and action like 'term.%' order by id`, [t.tenantId]);
    expect(rows.map((r: { action: string }) => r.action)).toEqual(['term.created', 'term.updated', 'term.created', 'term.created', 'term.updated', 'term.deleted']);
  });

  it('has a recording grace period setting (0 to 90 days, default 7)', async () => {
    expect((await http().get('/v1/admin/settings').set(auth('principal')).expect(200)).body.recordingRetentionGraceDays).toBe(7);
    await http().put('/v1/admin/settings').set(auth('principal')).send({ recordingRetentionGraceDays: 91 }).expect(400);
    await http().put('/v1/admin/settings').set(auth('principal')).send({ recordingRetentionGraceDays: -1 }).expect(400);
    expect((await http().put('/v1/admin/settings').set(auth('principal')).send({ recordingRetentionGraceDays: 10 }).expect(200)).body.recordingRetentionGraceDays).toBe(10);
    expect((await http().get('/v1/admin/settings').set(auth('principal')).expect(200)).body.recordingRetentionGraceDays).toBe(10);
    await http().put('/v1/admin/settings').set(auth('principal')).send({ recordingRetentionGraceDays: 7 }).expect(200);
  });

  it('starts a year plan without an end date at the end of the current term', async () => {
    const course = (await owner.query(`select id from courses where code = 'bcom-3-corporate-accounting'`)).rows[0].id;
    await owner.query(`update subjects set course_id = $1 where id = $2`, [course, t.subject.id]);
    const cls = { sectionId: t.section.id, subjectId: t.subject.id };
    const inTerm = (await http().post('/v1/year-plans/generate').set(auth('teacher')).send({ ...cls, startsOn: '2026-10-05' }).expect(200)).body;
    expect(inTerm).toMatchObject({ startsOn: '2026-10-05', endsOn: '2026-12-15' });
    // Between terms: about a semester, as before.
    const between = (await http().post('/v1/year-plans/generate').set(auth('teacher')).send({ ...cls, startsOn: '2026-12-21' }).expect(200)).body;
    expect(between).toMatchObject({ startsOn: '2026-12-21', endsOn: '2027-04-11' });
    // Today (5 October) falls in the odd semester.
    expect((await http().post('/v1/year-plans/generate').set(auth('teacher')).send(cls).expect(200)).body).toMatchObject({ startsOn: '2026-10-05', endsOn: '2026-12-15' });
  });

  describe('retention', () => {
    const ids: Record<string, string> = {};
    const keys = (id: string) => ({ events: `tenants/${t.tenantId}/recordings/${id}/events.json`, audio: `tenants/${t.tenantId}/recordings/${id}/audio` });
    const storage = () => app.get(ObjectStorage);
    const sweep = () => app.get(RetentionService).sweep(t.tenantId);
    const mine = async () => (await http().get('/v1/recordings').set(auth('teacher')).expect(200)).body as { id: string; expiresOn: string | null; keep: boolean }[];
    const insert = async (name: string, startedAt: string, sectionId: string | null) => {
      const id = randomUUID();
      const k = keys(id);
      await storage().put(k.events, bufferStream(Buffer.from('{"v":1,"events":[]}')), 1000, 'application/json');
      await storage().put(k.audio, bufferStream(Buffer.alloc(100, 1)), 1000, 'audio/mp4');
      const summary = { summary: `Summary of ${name}`, keyPoints: ['One'] };
      await owner.query(
        `insert into recordings (id, tenant_id, owner_id, section_id, subject_id, title, started_at, events_key, events_bytes, audio_key, audio_mime, audio_bytes, finished_at, shared_at, transcript, transcript_state, summary, summary_state)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 19, $9, 'audio/mp4', 100, $7, $7, 'Words', 'done', $10, 'done')`,
        [id, t.tenantId, t.teacher.id, sectionId, t.subject.id, name, startedAt, k.events, k.audio, JSON.stringify(summary)],
      );
      await owner.query(`insert into ai_cache (tenant_id, key, task, result, model) values ($1, $2, 'summarize', $3, 'm')`, [t.tenantId, `k-${id}`, JSON.stringify(summary)]);
      await owner.query(
        `insert into notifications (tenant_id, user_id, kind, title, body, data, dedupe_key) values ($1, $2, 'recording', 'Lesson recording', $3, $4, $5)`,
        [t.tenantId, t.guardian.id, name, JSON.stringify({ recordingId: id, sectionId: t.section.id }), `recording:${id}`],
      );
      ids[name] = id;
      return id;
    };

    beforeAll(async () => {
      at('2026-10-05');
      await insert('expiring', '2026-09-10T05:00:00Z', t.section.id);
      await insert('kept', '2026-09-11T05:00:00Z', t.section.id);
      await insert('no class', '2026-09-12T05:00:00Z', null);
      await insert('before any term', '2026-07-20T05:00:00Z', t.section.id);
      await insert('next term', '2027-01-10T05:00:00Z', t.section.id);
    });

    it('shows when each recording will be deleted, and lets the teacher keep one', async () => {
      const list = await mine();
      const byId = (name: string) => list.find((r) => r.id === ids[name])!;
      // Odd semester ends 15 December; 7 days' grace; deleted on the day after.
      expect(byId('expiring')).toMatchObject({ expiresOn: '2026-12-23', keep: false });
      expect(byId('next term')).toMatchObject({ expiresOn: '2027-06-08' });
      expect(byId('no class').expiresOn).toBeNull();
      expect(byId('before any term').expiresOn).toBeNull();

      await http().post(`/v1/recordings/${ids.kept}/keep`).set(auth('principal')).send({ keep: true }).expect(404);
      const kept = (await http().post(`/v1/recordings/${ids.kept}/keep`).set(auth('teacher')).send({ keep: true }).expect(200)).body;
      expect(kept).toMatchObject({ keep: true, expiresOn: null });
      const { rows } = await owner.query(`select action from audit_log where subject_id = $1`, [ids.kept]);
      expect(rows).toEqual([{ action: 'recording.kept' }]);

      const overview = (await http().get('/v1/admin/recordings/retention').set(auth('principal')).expect(200)).body;
      await http().get('/v1/admin/recordings/retention').set(auth('teacher')).expect(403);
      expect(overview).toMatchObject({ today: '2026-10-05', graceDays: 7, noTerm: { count: 2 } });
      expect(overview.classes).toEqual([{ sectionId: t.section.id, sectionName: 'BCom Sem 3 A', total: 4, kept: 1, expiringSoon: 0, nextExpiresOn: '2026-12-23' }]);
      expect(overview.noTerm.recordings.map((r: { title: string }) => r.title).sort()).toEqual(['before any term', 'no class']);
      at('2026-12-01');
      const soon = (await http().get('/v1/admin/recordings/retention').set(auth('principal')).expect(200)).body;
      expect(soon.classes[0].expiringSoon).toBe(1);
    });

    it('tells the teacher once, a week before', async () => {
      at('2026-12-15');
      expect(await sweep()).toEqual({ warned: [], deleted: [] });
      at('2026-12-16');
      expect(await sweep()).toEqual({ warned: [ids.expiring], deleted: [] });
      expect(await sweep()).toEqual({ warned: [], deleted: [] });
      const inbox = (await http().get('/v1/notifications').set(auth('teacher')).expect(200)).body.items;
      expect(inbox).toHaveLength(1);
      expect(inbox[0]).toMatchObject({ kind: 'recording', title: 'Recording will be deleted on Wed 23 Dec', data: { recordingId: ids.expiring, expiresOn: '2026-12-23' } });
      expect(inbox[0].body).toContain('expiring (BCom Sem 3 A)');
    });

    it('deletes expired recordings with their files, from the daily job', async () => {
      at('2026-12-22');
      expect((await sweep()).deleted).toEqual([]);
      at('2026-12-23');
      const jobs = app.get(JobsService);
      expect(await jobs.ensureDaily()).toBeGreaterThan(0);
      expect(await jobs.ensureDaily()).toBe(0); // already queued
      await jobs.drain();

      const k = keys(ids.expiring);
      expect(await storage().size(k.events)).toBeNull();
      expect(await storage().size(k.audio)).toBeNull();
      expect((await owner.query(`select 1 from recordings where id = $1`, [ids.expiring])).rowCount).toBe(0);
      expect((await owner.query(`select retracted_at is not null as gone from notifications where data->>'recordingId' = $1`, [ids.expiring])).rows.every((r: { gone: boolean }) => r.gone)).toBe(true);
      expect((await owner.query(`select 1 from ai_cache where key = $1`, [`k-${ids.expiring}`])).rowCount).toBe(0);
      const { rows: audits } = await owner.query(`select actor_type, data from audit_log where action = 'recording.expired' and subject_id = $1`, [ids.expiring]);
      expect(audits).toEqual([{ actor_type: 'system', data: expect.objectContaining({ title: 'expiring', termId: oddId, expiresOn: '2026-12-23', bytes: 119 }) }]);

      // Kept, class-less and term-less recordings stay, files and all.
      for (const name of ['kept', 'no class', 'before any term', 'next term']) {
        expect((await owner.query(`select 1 from recordings where id = $1`, [ids[name]])).rowCount).toBe(1);
        expect(await storage().size(keys(ids[name]).audio)).toBe(100);
      }
      expect((await owner.query(`select 1 from ai_cache where key = $1`, [`k-${ids.kept}`])).rowCount).toBe(1);

      // The next run is queued for tomorrow.
      const { rows } = await owner.query(`select run_after > now() + interval '23 hours' as tomorrow from jobs where tenant_id = $1 and kind = 'recording.retention' and state = 'queued'`, [t.tenantId]);
      expect(rows).toEqual([{ tomorrow: true }]);
    });

    it('applies the grace period from settings', async () => {
      await http().put('/v1/admin/settings').set(auth('principal')).send({ recordingRetentionGraceDays: 0 }).expect(200);
      const next = (await mine()).find((r) => r.id === ids['next term'])!;
      expect(next.expiresOn).toBe('2027-06-01');
      at('2027-06-01');
      expect(await sweep()).toEqual({ warned: [], deleted: [ids['next term']] });
      // Letting go of "keep" makes the recording expire like the others.
      await http().post(`/v1/recordings/${ids.kept}/keep`).set(auth('teacher')).send({ keep: false }).expect(200);
      expect(await sweep()).toEqual({ warned: [], deleted: [ids.kept] });
      expect(await storage().size(keys(ids.kept).audio)).toBeNull();
    });
  });
});
