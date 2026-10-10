import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogue, estimate, metricScore, naacGrade } from '../src/accreditation/catalogue.js';
import { xlsx } from '../src/accreditation/xlsx.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('accreditation logic', () => {
  it('numbers all seven NAAC criteria and scores against benchmarks', () => {
    const { groups, metrics } = catalogue('naac');
    expect(groups.map((g) => g.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(groups.reduce((a, g) => a + g.weight, 0)).toBe(1000);
    expect(new Set(metrics.map((m) => m.code)).size).toBe(metrics.length);
    expect(metrics.some((m) => m.kind === 'QlM') && metrics.some((m) => m.kind === 'QnM')).toBe(true);
    const ratio = metrics.find((m) => m.code === '2.2.2')!;
    expect(metricScore(ratio, 20, null)).toBe(4);
    expect(metricScore(ratio, 40, null)).toBe(2);
    expect(metricScore(ratio, 40, 3)).toBe(3);
    expect(naacGrade(3.6)).toBe('A++');
    expect(naacGrade(1.2)).toBe('D');
    const e = estimate(groups, new Map([['2.2.2', 4]]), metrics);
    expect(e.estimate).toBe(4);
    expect(e.floor).toBeLessThan(1);
  });

  it('writes a valid zip-based workbook', () => {
    const buf = xlsx([{ name: 'A/B', rows: [['x', 1], ['<y>']] }]);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.includes(Buffer.from('xl/worksheets/sheet1.xml'))).toBe(true);
  });
});

describe('accreditation module', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tok: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set({ authorization: `Bearer ${tok[who]}` });
  const post = (who: string, url: string, body: object = {}) => http().post(url).set({ authorization: `Bearer ${tok[who]}` }).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set({ authorization: `Bearer ${tok[who]}` }).send(body);
  const bin = (res: request.Response, cb: (b: Buffer) => void) => cb(res.body as Buffer);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tok = { principal: await login(t.slug, t.principal.email!), teacher: await login(t.slug, t.teacher.email!), student: await login(t.slug, t.studentUser.email!), outsider: await login(other.slug, other.principal.email!) };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('shows every NAAC metric with ERP-computed figures and a predicted score', async () => {
    const o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(o.cycle).toBe('2026-27');
    expect(o.groups).toHaveLength(7);
    const students = o.metrics.find((m: { code: string }) => m.code === '2.1.1');
    expect(students.source).toBe('auto');
    expect(students.value).toBeGreaterThan(0);
    expect(o.estimate).toHaveProperty('grade');
    await get('student', '/v1/accreditation/naac/overview').expect(403);
    await get('principal', '/v1/accreditation/xyz/overview').expect(404);
  });

  it('takes manual figures, narratives, own marking and evidence, and tracks completeness', async () => {
    const before = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body.completeness.complete;
    await put('principal', '/v1/accreditation/naac/metrics/1.1.2', { value: 80, rows: [['BCom', '2020', '2025', '80']] }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/1.1.1', { textValue: 'Academic calendar is prepared before each term.' }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/3.6.2', { selfScore: 3.5 }).expect(200);
    await post('principal', '/v1/accreditation/naac/metrics/1.1.2/evidence', { title: 'Board of studies minutes', url: 'https://example.org/bos.pdf' }).expect(201);
    const withFile = (await post('principal', '/v1/accreditation/naac/metrics/1.1.2/evidence', { title: 'Signed minutes', file: { filename: 'minutes.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('%PDF-1.4 minutes').toString('base64') } }).expect(201)).body;
    expect(withFile.fileName).toBe('minutes.pdf');
    await post('principal', '/v1/accreditation/naac/metrics/1.1.2/evidence', { title: 'Fake', file: { filename: 'x.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('not a pdf').toString('base64') } }).expect(400);
    await put('teacher', '/v1/accreditation/naac/metrics/1.1.2', { value: 1 }).expect(403);
    await put('principal', '/v1/accreditation/naac/metrics/9.9.9', { value: 1 }).expect(404);
    const o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    const m = o.metrics.find((x: { code: string }) => x.code === '1.1.2');
    expect(m).toMatchObject({ value: 80, source: 'manual', evidence: 2, score: 3.2, complete: true });
    expect(o.completeness.complete).toBeGreaterThan(before);
    expect((await get('principal', '/v1/accreditation/naac/metrics/1.1.2/evidence').expect(200)).body).toHaveLength(2);
    // another tenant sees none of it
    const x = (await get('outsider', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(x.metrics.find((y: { code: string }) => y.code === '1.1.2').source).not.toBe('manual');
  });

  it('exports NAAC metric workbooks with the DVV list, and NBA, NIRF, AISHE and ATR workbooks', async () => {
    const q = (await post('principal', '/v1/accreditation/dvv', { cycle: '2026-27', metricCode: '1.1.2', query: 'Share the syllabus revision minutes' }).expect(201)).body;
    await put('principal', `/v1/accreditation/dvv/${q.id}`, { response: 'Uploaded as evidence' }).expect(200);
    expect((await get('principal', '/v1/accreditation/dvv?cycle=2026-27').expect(200)).body[0].status).toBe('answered');
    const z = await get('principal', '/v1/accreditation/naac/export.zip').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    bin(z, (b) => {
      expect(b.subarray(0, 2).toString()).toBe('PK');
      for (const name of ['Criterion 1/1.1.2.xlsx', 'Criterion 7/7.3.1.xlsx', 'Summary.xlsx', 'DVV clarifications.xlsx', 'README.txt']) expect(b.includes(Buffer.from(name)), name).toBe(true);
    });
    for (const url of ['/v1/accreditation/nba/export.xlsx?tier=2', '/v1/accreditation/nirf/export.xlsx', '/v1/accreditation/aishe/export.xlsx', '/v1/accreditation/iqac/atr.xlsx', '/v1/accreditation/naac/metrics/2.6.3/template.xlsx']) {
      const r = await get('principal', url).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
      expect((r.body as Buffer).subarray(0, 2).toString(), url).toBe('PK');
    }
    await get('principal', '/v1/accreditation/nba/export.xlsx?tier=3').expect(400);
  });

  it('runs the IQAC workspace: meetings, actions, feedback action taken, practices', async () => {
    const m = (await post('principal', '/v1/accreditation/iqac/meetings', { title: 'IQAC term meeting', meetingOn: '2026-10-01', minutes: 'Reviewed AQAR plan' }).expect(201)).body;
    const a = (await post('principal', `/v1/accreditation/iqac/meetings/${m.id}/actions`, { action: 'Collect alumni feedback', ownerName: 'Coordinator' }).expect(201)).body;
    await put('principal', `/v1/accreditation/iqac/actions/${a.id}`, { actionTaken: 'Survey sent', status: 'done' }).expect(200);
    const ms = (await get('principal', '/v1/accreditation/iqac/meetings').expect(200)).body;
    expect(ms[0].actions[0]).toMatchObject({ status: 'done', actionTaken: 'Survey sent' });
    const f = (await post('principal', '/v1/accreditation/iqac/feedback-reports', { cycle: '2026-27', stakeholder: 'students', summary: 'Lab hours too few', averageRating: 3.8, responses: 120 }).expect(201)).body;
    expect(f.status).toBe('analysed');
    expect((await put('principal', `/v1/accreditation/iqac/feedback-reports/${f.id}`, { actionTaken: 'Added two lab hours' }).expect(200)).body.status).toBe('action_taken');
    await get('principal', '/v1/accreditation/iqac/feedback-analysis').expect(200);
    await post('principal', '/v1/accreditation/iqac/practices', { kind: 'best_practice', title: 'Mentoring circles', objectives: 'Reduce dropouts' }).expect(201);
    const o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    const by = (c: string) => o.metrics.find((x: { code: string }) => x.code === c);
    expect(by('7.2.1').autoValue).toBe(1);
    expect(by('6.5.1').autoValue).toBe(1);
    expect(by('1.4.2').autoValue).toBe(1);
    await get('teacher', '/v1/accreditation/iqac/meetings').expect(403);
  });

  it('lets a teacher add own evidence, which the quality team verifies and the publication metric counts', async () => {
    const e = (await post('teacher', '/v1/accreditation/my-evidence', { kind: 'publication', title: 'A study of cooperative banks', year: 2026, venue: 'Journal of Commerce', file: { filename: 'minutes.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('%PDF-1.4 minutes').toString('base64') } }).expect(201)).body;
    expect(e.fileName).toBe('minutes.pdf');
    expect((await get('teacher', '/v1/accreditation/my-evidence').expect(200)).body).toHaveLength(1);
    await get('teacher', '/v1/accreditation/faculty-evidence').expect(403);
    await post('teacher', `/v1/accreditation/faculty-evidence/${e.id}/verify`).expect(403);
    expect((await post('principal', `/v1/accreditation/faculty-evidence/${e.id}/verify`).expect(201)).body.verified).toBe(true);
    const o = (await get('principal', '/v1/accreditation/nirf/overview').expect(200)).body;
    expect(o.metrics.find((x: { code: string }) => x.code === 'RP.PU').autoValue).toBeGreaterThan(0);
    expect((await get('principal', '/v1/accreditation/faculty-evidence').expect(200)).body).toHaveLength(1);
    await post('student', '/v1/accreditation/my-evidence', { kind: 'award', title: 'x y' }).expect(403);
  });
});
