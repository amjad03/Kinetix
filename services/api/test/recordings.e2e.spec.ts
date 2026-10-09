import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import { SpeechToText } from '../src/ai/asr.js';
import type { ChatMessage } from '../src/ai/tasks.js';
import type { LlmProvider } from '../src/ai/providers.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

class FakeAsr extends SpeechToText {
  readonly configured = true;
  failNext = 0;
  calls: { bytes: number; mime: string; language: string }[] = [];
  async transcribe(audio: Buffer, mime: string, language: string) {
    this.calls.push({ bytes: audio.length, mime, language });
    if (this.failNext-- > 0) throw new Error('speech server down');
    return 'Today we learned how goodwill is valued using the average profit method and the super profit method.';
  }
}

class FakeLlm implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly model = 'test-model';
  readonly preview = false;
  prompts: ChatMessage[][] = [];
  async complete(messages: ChatMessage[]) {
    this.prompts.push(messages);
    return {
      text: JSON.stringify({ summary: 'The class learned two ways to value goodwill.', keyPoints: ['Average profit method', 'Super profit method'] }),
      promptTokens: 50,
      completionTokens: 20,
    };
  }
}

const lessonLog = { v: 1, canvas: { w: 1920, h: 1080 }, background: 'plain', events: [[0, 'b', 1, 'pen', -16777216, 4, 10, 10], [40, 'p', 1, 20, 20], [80, 'e', 1]] };

describe('lesson recordings', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  const asr = new FakeAsr();
  const llm = new FakeLlm();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const drain = () => app.get(JobsService).drain();
  const audio = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));

  /** Records a lesson on the board the way the app does. */
  const record = async (opts: { audio?: boolean; share?: boolean; asJson?: boolean } = {}) => {
    const id = randomUUID();
    await http().put(`/v1/recordings/${id}`).set(auth('board')).send({ title: 'Valuation of goodwill', startedAt: clock.at.toISOString() }).expect(200);
    const events = http().put(`/v1/recordings/${id}/events`).set(auth('board'));
    if (opts.asJson) await events.send(lessonLog).expect(204);
    else await events.set('content-type', 'application/octet-stream').send(Buffer.from(JSON.stringify(lessonLog))).expect(204);
    if (opts.audio) await http().put(`/v1/recordings/${id}/audio`).set(auth('board')).set('content-type', 'audio/mp4').send(audio).expect(204);
    const done = await http().post(`/v1/recordings/${id}/finish`).set(auth('board')).send({ durationMs: 120_000, share: opts.share ?? false }).expect(200);
    return { id, body: done.body };
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(SpeechToText).useValue(asr).overrideProvider(LLM_PROVIDER).useValue(llm));
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.guardian.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
    // Student A missed this period.
    await http()
      .post('/v1/attendance')
      .set(auth('teacher'))
      .send({ slotId: t.slot.id, date: monday, records: [{ studentId: t.students[0].id, status: 'absent' }, { studentId: t.students[1].id, status: 'present' }] })
      .expect(201);
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('uploads, transcribes, summarises and shares a lesson with the class', async () => {
    await drain(); // jobs other test files left queued
    const { id, body } = await record({ audio: true, share: true });
    expect(body).toMatchObject({ title: 'Valuation of goodwill', sectionName: 'BCom Sem 3 A', subjectName: 'Corporate Accounting', hasAudio: true, transcriptState: 'queued', durationMs: 120_000 });
    expect(body.sharedAt).toBeTruthy();

    expect(await drain()).toBe(2); // transcript, then summary
    expect(asr.calls.at(-1)).toEqual({ bytes: audio.length, mime: 'audio/mp4', language: 'en' });
    expect(llm.prompts.at(-1)![1].content).toContain('average profit method');

    const seen = await http().get(`/v1/recordings/${id}`).set(auth('parent')).expect(200);
    expect(seen.body).toMatchObject({ transcriptState: 'done', summaryState: 'done', summary: { keyPoints: ['Average profit method', 'Super profit method'] } });
    expect(seen.body.transcript).toContain('goodwill');

    // The absent student's family is told they missed it; others get the general message.
    const inbox = async (who: string) => (await http().get('/v1/notifications').set(auth(who)).expect(200)).body.items.filter((n: { kind: string }) => n.kind === 'recording');
    expect((await inbox('parent'))[0]).toMatchObject({ title: 'Missed Corporate Accounting? Watch the lesson', data: { recordingId: id } });
    expect((await inbox('parent2'))[0]).toMatchObject({ title: 'Lesson recording: Corporate Accounting' });
    expect(await inbox('student')).toHaveLength(1);

    // The parent summary lists it, flagged as missed for this child only.
    const forA = await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('parent')).expect(200);
    expect(forA.body.recordings[0]).toMatchObject({ id, missed: true });
    const forB = await http().get(`/v1/parent/children/${t.students[1].id}/summary`).set(auth('parent2')).expect(200);
    expect(forB.body.recordings[0]).toMatchObject({ id, missed: false });
  });

  it('streams the event log and seekable audio to the class only', async () => {
    const { id } = await record({ audio: true, share: true, asJson: true });
    const events = await http().get(`/v1/recordings/${id}/events`).set(auth('student')).expect(200);
    expect(JSON.parse(events.text ?? JSON.stringify(events.body))).toEqual(lessonLog);

    const whole = await http().get(`/v1/recordings/${id}/audio`).set(auth('parent2')).buffer(true).expect(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.compare(whole.body as Buffer, audio)).toBe(0);

    const part = await http().get(`/v1/recordings/${id}/audio`).set(auth('parent2')).set('range', 'bytes=100-199').buffer(true).expect(206);
    expect(part.headers['content-range']).toBe(`bytes 100-199/${audio.length}`);
    expect(Buffer.compare(part.body as Buffer, audio.subarray(100, 200))).toBe(0);
    const tail = await http().get(`/v1/recordings/${id}/audio`).set(auth('parent2')).set('range', 'bytes=-10').buffer(true).expect(206);
    expect((tail.body as Buffer).length).toBe(10);
    await http().get(`/v1/recordings/${id}/audio`).set(auth('parent2')).set('range', 'bytes=999999-').expect(416);

    await http().get(`/v1/recordings/${id}`).set(auth('outsider')).expect(404);
    await http().get(`/v1/recordings/${id}/audio`).set(auth('outsider')).expect(404);
    await http().get(`/v1/recordings/${id}`).set(auth('principal')).expect(200);
  });

  it('keeps unshared and unfinished recordings to the teacher', async () => {
    const { id } = await record();
    await http().get(`/v1/recordings/${id}`).set(auth('parent')).expect(404);
    await http().get(`/v1/recordings/${id}`).set(auth('teacher')).expect(200);
    const mine = await http().get('/v1/recordings').set(auth('teacher')).expect(200);
    expect(mine.body.map((r: { id: string }) => r.id)).toContain(id);
    const shared = await http().get(`/v1/recordings?sectionId=${t.section.id}`).set(auth('parent')).expect(200);
    expect(shared.body.map((r: { id: string }) => r.id)).not.toContain(id);
    await http().get(`/v1/recordings?sectionId=${t.otherSection.id}`).set(auth('parent')).expect(404);

    // Sharing later, from the Teacher App.
    await http().post(`/v1/recordings/${id}/share`).set(auth('teacher2')).expect(404);
    await http().post(`/v1/recordings/${id}/share`).set(auth('teacher')).expect(200);
    await http().get(`/v1/recordings/${id}`).set(auth('parent')).expect(200);

    const pending = randomUUID();
    await http().put(`/v1/recordings/${pending}`).set(auth('board')).send({ title: 'Draft', startedAt: clock.at.toISOString() }).expect(200);
    await http().post(`/v1/recordings/${pending}/finish`).set(auth('board')).send({ durationMs: 1000 }).expect(400); // no event log yet
  });

  it('rejects bad uploads and refuses changes after finishing', async () => {
    const { id } = await record();
    await http().put(`/v1/recordings/${id}/events`).set(auth('board')).set('content-type', 'application/octet-stream').send(Buffer.from('{}')).expect(400);
    const fresh = randomUUID();
    await http().put(`/v1/recordings/${fresh}`).set(auth('board')).send({ title: 'X', startedAt: clock.at.toISOString() }).expect(200);
    await http().put(`/v1/recordings/${fresh}/events`).set(auth('board')).set('content-type', 'application/octet-stream').send(Buffer.from('not json')).expect(400);
    await http().put(`/v1/recordings/${fresh}/events`).set(auth('board')).set('content-type', 'application/octet-stream').send(Buffer.from('{"v":3,"events":[]}')).expect(400);
    await http().put(`/v1/recordings/${fresh}/audio`).set(auth('board')).set('content-type', 'video/mp4').send(audio).expect(400);
    await http().put(`/v1/recordings/${fresh}/audio`).set(auth('teacher')).set('content-type', 'audio/mp4').send(audio).expect(403);
  });

  it('retries a failed transcription with backoff', async () => {
    await drain(); // earlier tests' jobs
    asr.failNext = 1;
    const { id } = await record({ audio: true });
    expect(await drain()).toBe(1);
    const job = await owner.query(`select state, attempts, last_error, run_after > now() as later from jobs where payload->>'recordingId' = $1`, [id]);
    expect(job.rows[0]).toMatchObject({ state: 'queued', attempts: 1, last_error: 'speech server down', later: true });

    await owner.query(`update jobs set run_after = now() where payload->>'recordingId' = $1`, [id]);
    expect(await drain()).toBe(2);
    const done = await http().get(`/v1/recordings/${id}`).set(auth('teacher')).expect(200);
    expect(done.body.transcriptState).toBe('done');
  });
});
