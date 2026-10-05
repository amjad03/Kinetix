import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import type { LlmProvider } from '../src/ai/providers.js';
import type { ChatMessage } from '../src/ai/tasks.js';
import { importContent } from '../src/content/import.js';
import * as schema from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

class RecordingLlm implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly model = 'test-model';
  readonly preview = false;
  prompts: ChatMessage[][] = [];
  async complete(messages: ChatMessage[]) {
    this.prompts.push(messages);
    return { text: JSON.stringify({ answer: 'Goodwill is valued from profits.', keyPoints: [], followUps: [] }), promptTokens: 1, completionTokens: 1 };
  }
}

describe('content library', () => {
  const owner = ownerPool();
  const llm = new RecordingLlm();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  let courseId: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(nextMondayIst('10:30')), (b) => b.overrideProvider(LLM_PROVIDER).useValue(llm));
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      parent: await login(t.slug, t.guardian.email!),
      otherTeacher: await login(other.slug, other.teacher.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
    const courses = await http().get('/v1/content/courses?curriculum=bu-ug&term=3').set(auth('teacher')).expect(200);
    courseId = courses.body.find((c: { code: string }) => c.code === 'bcom-3-corporate-accounting').id;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('serves the global library to every institution', async () => {
    const curricula = await http().get('/v1/content/curricula').set(auth('otherTeacher')).expect(200);
    expect(curricula.body.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(['cbse', 'bu-ug']));
    const outline = await http().get(`/v1/content/courses/${courseId}`).set(auth('otherTeacher')).expect(200);
    expect(outline.body.chapters.map((c: { title: string }) => c.title)).toContain('Valuation of Goodwill');
    expect(outline.body.reviewed).toBe(false);

    const found = await http().get(`/v1/content/search?q=goodwill&courseId=${courseId}`).set(auth('parent')).expect(200);
    expect(found.body[0]).toMatchObject({ title: 'Methods of valuing goodwill', chapterTitle: 'Valuation of Goodwill' });
    const topic = await http().get(`/v1/content/topics/${found.body[0].id}`).set(auth('board')).expect(200);
    expect(topic.body.notes.join(' ')).toContain('Super profit');
  });

  it('gives the board the syllabus of the open class once the subject is linked', async () => {
    expect((await http().get('/v1/content/syllabus').set(auth('board')).expect(200)).body).toEqual({});
    await http().put(`/v1/admin/subjects/${t.subject.id}/course`).set(auth('teacher')).send({ courseId }).expect(403);
    await http().put(`/v1/admin/subjects/${t.subject.id}/course`).set(auth('principal')).send({ courseId }).expect(200);
    const syllabus = await http().get('/v1/content/syllabus').set(auth('board')).expect(200);
    expect(syllabus.body).toMatchObject({ id: courseId, title: 'Corporate Accounting, BCom Semester 3' });
  });

  it("lets an institution add its own topics, which no one else sees and the library can't lose", async () => {
    const outline = (await http().get(`/v1/content/courses/${courseId}`).set(auth('teacher')).expect(200)).body;
    const goodwill = outline.chapters.find((c: { title: string }) => c.title === 'Valuation of Goodwill');
    const added = await http()
      .post(`/v1/content/chapters/${goodwill.id}/topics`)
      .set(auth('teacher'))
      .send({ title: 'Worked examples from past BU papers', notes: ['Normal rate of return used in the 2024 paper was 12%.'] })
      .expect(201);
    const own = await http().post(`/v1/content/courses/${courseId}/chapters`).set(auth('teacher')).send({ title: 'Revision' }).expect(201);

    const mine = (await http().get(`/v1/content/courses/${courseId}`).set(auth('teacher')).expect(200)).body;
    expect(mine.chapters.at(-1)).toMatchObject({ id: own.body.id, title: 'Revision', own: true });
    expect(mine.chapters.find((c: { id: string }) => c.id === goodwill.id).topics.at(-1)).toMatchObject({ title: 'Worked examples from past BU papers', own: true });

    const theirs = (await http().get(`/v1/content/courses/${courseId}`).set(auth('otherTeacher')).expect(200)).body;
    expect(theirs.chapters.map((c: { title: string }) => c.title)).not.toContain('Revision');
    await http().get(`/v1/content/topics/${added.body.id}`).set(auth('otherTeacher')).expect(404);

    // Global topics are read-only; own topics can be edited and deleted.
    const globalTopic = goodwill.topics[0].id;
    await http().patch(`/v1/content/topics/${globalTopic}`).set(auth('teacher')).send({ title: 'Mine now' }).expect(404);
    await http().delete(`/v1/content/topics/${globalTopic}`).set(auth('teacher')).expect(404);
    await http().patch(`/v1/content/topics/${added.body.id}`).set(auth('otherTeacher')).send({ title: 'x' }).expect(404);
    await http().patch(`/v1/content/topics/${added.body.id}`).set(auth('teacher')).send({ title: 'Past paper examples' }).expect(200);
    await http().post(`/v1/content/chapters/${goodwill.id}/topics`).set(auth('parent')).send({ title: 'x' }).expect(403);

    // Re-importing the library keeps ids and the institution's additions.
    const pool = ownerPool();
    await importContent(drizzle(pool, { schema }));
    await pool.end();
    const after = (await http().get(`/v1/content/courses/${courseId}`).set(auth('teacher')).expect(200)).body;
    const again = after.chapters.find((c: { id: string }) => c.id === goodwill.id);
    expect(again.topics[0].id).toBe(globalTopic);
    expect(again.topics.at(-1).title).toBe('Past paper examples');
    await http().delete(`/v1/content/topics/${added.body.id}`).set(auth('teacher')).expect(204);
  });

  it('grounds KINETIX AI in the matching syllabus notes and cites them', async () => {
    const res = await http().post('/v1/ai/explain').set(auth('board')).send({ question: 'How do we value goodwill by the super profit method?' }).expect(200);
    expect(res.body.meta.sources).toEqual([{ topicId: expect.any(String), title: 'Methods of valuing goodwill' }]);
    const system = llm.prompts.at(-1)![0].content;
    expect(system).toContain('Base the answer on these syllabus notes:');
    expect(system).toContain('Super profit = Average maintainable profit − Normal profit');

    // A chosen topic wins over matching; a topic the institution cannot see grounds nothing.
    const shares = (await http().get('/v1/content/search?q=yield').set(auth('teacher')).expect(200)).body[0];
    const chosen = await http().post('/v1/ai/quiz').set(auth('teacher')).send({ topic: 'Practice', count: 1, topicId: shares.id }).expect(502); // the fake replies with an explanation, not a quiz
    expect(chosen.body.message).toBeTruthy();
    expect(llm.prompts.at(-1)![0].content).toContain('Yield method');

    const unrelated = await http().post('/v1/ai/explain').set(auth('otherTeacher')).send({ question: 'What is goodwill?' }).expect(200);
    expect(unrelated.body.meta.sources).toEqual([]); // their subject is not linked to a course
  });
});
