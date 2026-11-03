import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Insecure direct object references: a family or a student asks for another child's records by id. 40 high-risk routes
 * (marks, results, fees, documents, chat, health, attendance, welfare, DPDP) must answer 403 or 404 to them, and the
 * child's own family must still get the record (so a 404 is not just a missing row).
 */
describe('IDOR: families and students cannot read another child by id', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  /** Ids belonging to student B (guardian2's child). */
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens.guardianA = await login(t.guardian.email!);
    tokens.guardianB = await login(t.guardian2.email!);
    tokens.studentC = await login(t.studentUser.email!);
    const b = t.students[1].id;
    ids.student = b;
    ids.invoice = randomUUID();
    await owner.query(`insert into fee_invoices (id, tenant_id, student_id, section_id, batch_id, title, amount_paise, due_on, created_by) values ($1,$2,$3,$4,$5,'Tuition',100000,'2026-11-01',$6)`, [ids.invoice, t.tenantId, b, t.section.id, randomUUID(), t.principal.id]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const B = () => ids.student;
  /** [method, path]; `{s}` is student B, `{inv}` B's fee invoice. */
  const ROUTES: [string, string][] = [
    ['get', '/v1/affiliation/marks-card/{s}?sessionId={rand}'],
    ['post', '/v1/ai/parent/children/{s}/insight'],
    ['get', '/v1/attendance-desk/students/{s}'],
    ['get', '/v1/conversations/families/{s}'],
    ['get', '/v1/documents/vault/student/{s}'],
    ['post', '/v1/documents/vault/student/{s}?title=x&category=aadhaar'],
    ['get', '/v1/exam-sessions/{rand}/hall-tickets/{s}/pdf'],
    ['get', '/v1/fees/credits/students/{s}'],
    ['get', '/v1/fees/students/{s}'],
    ['get', '/v1/fees/students/{s}/instalments'],
    ['get', '/v1/fees/invoices/{inv}/instalments'],
    ['get', '/v1/school/report-cards/{rand}'],
    ['get', '/v1/marks/students/{s}'],
    ['get', '/v1/parent/children/{s}/attendance'],
    ['get', '/v1/parent/children/{s}/subjects'],
    ['get', '/v1/parent/children/{s}/summary'],
    ['get', '/v1/parent/children/{s}/activities'],
    ['get', '/v1/parent/children/{s}/bank-transfers'],
    ['get', '/v1/parent/children/{s}/behaviour'],
    ['get', '/v1/parent/children/{s}/diary'],
    ['get', '/v1/parent/children/{s}/early-years'],
    ['get', '/v1/parent/children/{s}/early-years/learning-story.pdf?termId={rand}'],
    ['get', '/v1/parent/children/{s}/health'],
    ['get', '/v1/profiles/students/{s}/attendance'],
    ['get', '/v1/results/students/{s}'],
    ['get', '/v1/results/students/{s}/backlogs'],
    ['get', '/v1/results/students/{s}/exams'],
    ['get', '/v1/results/students/{s}/marks-card.pdf?sessionId={rand}'],
    ['get', '/v1/results/students/{s}/progress-report.pdf'],
    ['get', '/v1/results/students/{s}/transcript.pdf'],
    ['post', '/v1/results/students/{s}/revaluations'],
    ['get', '/v1/school-learning/boards/results/students/{s}?academicYearId={rand}'],
    ['get', '/v1/students/{s}/marks-ledger'],
    ['get', '/v1/careers/resumes/{s}'],
    ['get', '/v1/careers/resumes/{s}/pdf'],
    ['get', '/v1/passport/students/{s}'],
    ['get', '/v1/passport/students/{s}/pdf'],
    ['get', '/v1/campus-life/clubs/{rand}/members/{s}/certificate'],
    ['get', '/v1/homework/{rand}/submissions/{s}'],
    ['post', '/v1/parent/children/{s}/diary/{rand}/acknowledge'],
  ];
  const fill = (path: string) => path.replace('{s}', B()).replace('{inv}', ids.invoice).replaceAll('{rand}', randomUUID());
  /** A valid body where the route needs one, so validation cannot answer before the ownership check. */
  const BODIES: Record<string, object> = { '/v1/results/students/{s}/revaluations': { sessionId: randomUUID(), subjectId: randomUUID(), reason: 'Please recheck' } };

  it('lists 40 high-risk routes', () => expect(ROUTES).toHaveLength(40));

  for (const who of ['guardianA', 'studentC'] as const) {
    it(`${who} gets 403 or 404 on every one of them for student B`, async () => {
      const leaks: string[] = [];
      for (const [m, path] of ROUTES) {
        const req = (http() as unknown as Record<string, (u: string) => request.Test>)[m](fill(path)).set({ authorization: `Bearer ${tokens[who]}` });
        // The vault reads the file itself as the body: a real PDF header, so the type check passes and ownership decides.
        const res = path.startsWith('/v1/documents/vault') && m === 'post' ? await req.set('content-type', 'application/octet-stream').send(Buffer.from('%PDF-1.4\n%%EOF\n')) : await req.send(BODIES[path] ?? {});
        if (![403, 404].includes(res.status)) leaks.push(`${m.toUpperCase()} ${path} -> ${res.status}`);
      }
      expect(leaks).toEqual([]);
    });
  }

  it('student B\'s own guardian still reads the records (the 404s above are not missing rows)', async () => {
    const ok: string[] = [];
    for (const path of ['/v1/parent/children/{s}/summary', '/v1/parent/children/{s}/attendance', '/v1/fees/students/{s}', '/v1/results/students/{s}', '/v1/parent/children/{s}/health', '/v1/documents/vault/student/{s}']) {
      const res = await http().get(fill(path)).set({ authorization: `Bearer ${tokens.guardianB}` });
      if (res.status !== 200) ok.push(`${path} -> ${res.status}`);
    }
    expect(ok).toEqual([]);
  });
});
