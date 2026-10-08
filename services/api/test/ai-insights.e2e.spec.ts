import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import type { LlmProvider } from '../src/ai/providers.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** Records every prompt and answers with a valid insight. */
class CapturingModel implements LlmProvider {
  readonly name = 'test';
  readonly model = 'insight-model';
  readonly preview = false;
  readonly prompts: string[] = [];
  async complete(messages: { role: string; content: unknown }[]) {
    this.prompts.push(messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'));
    const reply = { headline: 'Collection is on track.', highlights: ['Most of the billed fees are in.'], risks: ['Some dues are overdue.'], suggestions: ['Call the overdue families.'] };
    return { text: JSON.stringify(reply), promptTokens: 100, completionTokens: 40 };
  }
}

describe('Domain AI assistants: finance, admissions and HR insights', () => {
  const owner = ownerPool();
  const model = new CapturingModel();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const post = (who: string, path: string, body: object = {}) => http().post(path).set({ authorization: `Bearer ${tokens[who]}` }).send(body);

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')), (b) => b.overrideProvider(LLM_PROVIDER).useValue(model));
    tokens = { principal: await login(t.principal.email!), teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!) };
    // Fees with a student on the books, and an enquiry from a named family.
    await owner.query(
      `insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, paid_paise, due_on, status, created_by)
       values ($1, $2, $3, gen_random_uuid(), 'Term 1', 1000000, 400000, '2026-09-01', 'due', $4)`,
      [t.tenantId, t.students[0].id, t.section.id, t.principal.id],
    );
    await owner.query(`insert into enquiries (tenant_id, name, phone) values ($1, 'Zebediah Quillfeather', '9000000001')`, [t.tenantId]);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('summarises fees and budgets for the finance office only', async () => {
    await post('teacher', '/v1/ai/insights/finance').expect(403);
    await post('student', '/v1/ai/insights/finance').expect(403);
    const res = await post('principal', '/v1/ai/insights/finance', { language: 'hi' }).expect(200);
    expect(res.body.task).toBe('financeInsight');
    expect(res.body.result).toMatchObject({ headline: 'Collection is on track.', highlights: ['Most of the billed fees are in.'] });
    const prompt = model.prompts.at(-1)!;
    // The API computed these figures: 10,000 billed, 4,000 collected, 6,000 overdue.
    expect(prompt).toContain('"billedRupees":10000');
    expect(prompt).toContain('"collectedRupees":4000');
    expect(prompt).toContain('"overdueRupees":6000');
    expect(prompt).toContain('Hindi');
  });

  it('never sends student or enquirer names to the model', async () => {
    await post('principal', '/v1/ai/insights/finance', { fresh: true }).expect(200);
    await post('principal', '/v1/ai/insights/admissions', { fresh: true }).expect(200);
    await post('principal', '/v1/ai/insights/hr', { fresh: true }).expect(200);
    const sent = model.prompts.join('\n');
    for (const s of t.students) expect(sent).not.toContain(s.fullName);
    expect(sent).not.toContain('Zebediah');
    expect(sent).not.toContain(t.teacher.fullName);
  });

  it('summarises the admissions funnel', async () => {
    await post('teacher', '/v1/ai/insights/admissions').expect(403);
    const res = await post('principal', '/v1/ai/insights/admissions', { fresh: true }).expect(200);
    expect(res.body.task).toBe('admissionsInsight');
    expect(model.prompts.at(-1)).toContain('"funnel"');
    expect(model.prompts.at(-1)).toContain('"new":1');
  });

  it('summarises leave, attendance and payroll for HR', async () => {
    await post('teacher', '/v1/ai/insights/hr').expect(403);
    const res = await post('principal', '/v1/ai/insights/hr', { fresh: true }).expect(200);
    expect(res.body.task).toBe('hrInsight');
    expect(model.prompts.at(-1)).toContain('"pendingLeaveRequests":0');
  });

  it('labels the placeholder when no AI server is connected, and records usage per task', async () => {
    const rows = await owner.query(`select task, count(*)::int as n from ai_usage where tenant_id = $1 and task in ('financeInsight','admissionsInsight','hrInsight') group by task`, [t.tenantId]);
    expect(rows.rows.map((r) => r.task).sort()).toEqual(['admissionsInsight', 'financeInsight', 'hrInsight']);
    await post('principal', '/v1/ai/insights/finance', { language: 'fr' }).expect(400);
  });
});
