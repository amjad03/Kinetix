import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapToTemplate, normaliseYear } from '../src/accreditation/accreditation.service.js';
import { scoreOf } from '../src/accreditation/engine.js';
import { SOURCES } from '../src/accreditation/sources.js';
import { FRAMEWORKS, framework, metricsOf } from '../src/accreditation/frameworks/index.js';
import { naacGrade } from '../src/accreditation/frameworks/naac.js';
import { xlsx } from '../src/accreditation/xlsx.js';
import { readXlsxSheets } from '../src/common/xlsx.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** The file stored under `name` in a store-only ZIP (the exports never compress). */
function entry(zip: Buffer, name: string): Buffer | null {
  let p = 0;
  while (p + 30 <= zip.length && zip.readUInt32LE(p) === 0x04034b50) {
    const size = zip.readUInt32LE(p + 18);
    const nameLen = zip.readUInt16LE(p + 26);
    const extra = zip.readUInt16LE(p + 28);
    const n = zip.toString('utf8', p + 30, p + 30 + nameLen);
    const start = p + 30 + nameLen + extra;
    if (n === name) return zip.subarray(start, start + size);
    p = start + size;
  }
  return null;
}
const names = (zip: Buffer) => {
  const out: string[] = [];
  let p = 0;
  while (p + 30 <= zip.length && zip.readUInt32LE(p) === 0x04034b50) {
    const size = zip.readUInt32LE(p + 18);
    const nameLen = zip.readUInt16LE(p + 26);
    out.push(zip.toString('utf8', p + 30, p + 30 + nameLen));
    p += 30 + nameLen + zip.readUInt16LE(p + 28) + size;
  }
  return out;
};
const sheetsOf = (b: Buffer) => readXlsxSheets(b);
const sheet = (b: Buffer, name: string) => sheetsOf(b).find((s) => s.name === name)?.rows ?? null;

describe('accreditation catalogue', () => {
  it('seeds every framework with unique metric codes, types, formulas and templates', () => {
    expect(FRAMEWORKS.map((f) => f.key)).toEqual(['naac-aff-ug', 'naac-autonomous', 'naac-university', 'nba-ug-eng-t2', 'nba-ug-eng-t1', 'nba-pg-mgmt', 'nirf-college', 'nirf-university', 'nirf-engineering', 'nirf-management', 'nirf-pharmacy', 'aishe-dcf2', 'udise-plus', 'aicte-eoa', 'ugc-disclosure', 'cbse-oasis']);
    for (const f of FRAMEWORKS) {
      const ms = metricsOf(f);
      expect(new Set(ms.map((m) => m.code)).size, f.key).toBe(ms.length);
      for (const m of ms) {
        expect(m.formula.length, `${f.key} ${m.code}`).toBeGreaterThan(5);
        if (m.kind === 'QnM' && !m.options) {
          expect(m.inputs.length, `${f.key} ${m.code} inputs`).toBeGreaterThan(0);
          expect(m.columns.length, `${f.key} ${m.code} columns`).toBeGreaterThan(0);
        }
        expect(m.years).toBeGreaterThanOrEqual(1);
        // Every live source a metric names exists.
        for (const k of [...m.inputs.map((i) => i.source), m.rowsSource].filter((x): x is string => !!x)) expect(SOURCES[k], `${f.key} ${m.code} ${k}`).toBeDefined();
      }
    }
  });

  it('weighs NAAC criteria per institution type, NBA to 1000 marks and NIRF parameters to 100', () => {
    const crit = (key: string) => Object.fromEntries(framework(key)!.criteria.filter((c) => c.id !== 'EP').map((c) => [c.id, c.weight]));
    expect(crit('naac')).toEqual({ 1: 100, 2: 350, 3: 110, 4: 100, 5: 140, 6: 100, 7: 100 });
    expect(crit('naac-autonomous')).toEqual({ 1: 150, 2: 300, 3: 150, 4: 100, 5: 100, 6: 100, 7: 100 });
    expect(crit('naac-university')).toEqual({ 1: 150, 2: 200, 3: 250, 4: 100, 5: 100, 6: 100, 7: 100 });
    // Key indicator weights are the sum of their metrics, so the criterion totals hold metric by metric.
    for (const k of ['naac-aff-ug', 'naac-autonomous', 'naac-university']) expect(metricsOf(framework(k)!).reduce((a, m) => a + m.weight, 0), k).toBe(1000);
    expect(framework('nba')!.criteria.reduce((a, c) => a + c.weight, 0)).toBe(1000);
    for (const k of ['nirf-college', 'nirf-university', 'nirf-engineering', 'nirf-management', 'nirf-pharmacy']) {
      const f = framework(k)!;
      expect(f.criteria.reduce((a, c) => a + c.weight, 0), k).toBe(100);
      for (const c of f.criteria) expect(c.indicators[0].metrics.reduce((a, m) => a + m.weight, 0), `${k} ${c.id}`).toBe(100);
    }
    expect(Object.fromEntries(framework('nirf-college')!.criteria.map((c) => [c.id, c.weight]))).toEqual({ TLR: 40, RP: 15, GO: 25, OI: 10, PR: 10 });
    expect(metricsOf(framework('nirf-engineering')!).map((m) => m.code)).toEqual(['TLR.SS', 'TLR.FSR', 'TLR.FQE', 'TLR.FRU', 'RP.PU', 'RP.QP', 'RP.IPR', 'RP.FPPP', 'GO.GPH', 'GO.GUE', 'GO.MS', 'GO.GPHD', 'OI.RD', 'OI.WD', 'OI.ESCS', 'OI.PCS', 'PR.PR']);
    const aff = metricsOf(framework('naac')!).map((m) => m.code);
    for (const c of ['1.1.1', '1.2.1', '2.1.1', '2.2.1', '2.4.2', '2.6.3', '2.7.1', '3.1.1', '3.3.1', '3.5.1', '4.1.2', '5.2.1', '6.5.2', '7.1.3', '7.3.1', 'EP-1.1']) expect(aff, c).toContain(c);
  });

  it('scores NAAC points out of 4, choices, NBA bands and NIRF formulas', () => {
    const naac = framework('naac')!;
    const ratio = metricsOf(naac).find((m) => m.code === '2.2.1')!;
    expect(scoreOf(naac, ratio, 20, {}, null, 40)).toBe(4);
    expect(scoreOf(naac, ratio, 40, {}, null, 40)).toBe(2);
    expect(scoreOf(naac, ratio, 40, {}, 3, 40)).toBe(3);
    const fb = metricsOf(naac).find((m) => m.code === '1.4.1')!;
    expect(scoreOf(naac, fb, 3, {}, null, 20)).toBe(3);
    expect(naacGrade(3.6)).toBe('A++');
    expect(naacGrade(1.2)).toBe('D');
    const nba = framework('nba')!;
    const er = metricsOf(nba).find((m) => m.code === '4.1')!;
    expect(scoreOf(nba, er, 85, {}, null, 20)).toBe(18);
    const sfr = metricsOf(nba).find((m) => m.code === '5.1')!;
    expect(scoreOf(nba, sfr, 20, {}, null, 20)).toBe(15);
    expect(scoreOf(nba, sfr, 26, {}, null, 20)).toBe(0);
    const nirf = framework('nirf-engineering')!;
    const fsr = metricsOf(nirf).find((m) => m.code === 'TLR.FSR')!;
    expect(scoreOf(nirf, fsr, 15, {}, null, 30)).toBe(30);
    expect(scoreOf(nirf, fsr, 60, {}, null, 30)).toBe(0);
    const wd = metricsOf(nirf).find((m) => m.code === 'OI.WD')!;
    expect(scoreOf(nirf, wd, 50, { womenStudents: 50, students: 100, womenFaculty: 2, faculty: 20 }, null, 30)).toBe(22.5);
  });

  it('reads years and places ERP records under template columns', () => {
    expect(normaliseYear('2024-25')).toBe('2024-25');
    expect(normaliseYear('2024-2025')).toBe('2024-25');
    expect(normaliseYear('2024')).toBe('2024-25');
    expect(normaliseYear('2024-27')).toBeNull();
    const rows = mapToTemplate(['Year', 'Name of student placed / enrolling into higher education', 'Programme graduated from', 'Name of the employer / institution joined'], ['Name of student placed', 'Programme', 'Name of the employer', 'Pay package (LPA)'], [['Asha', 'BCom', 'Infosys', 4.5]], '2026-27');
    expect(rows).toEqual([['2026-27', 'Asha', 'BCom', 'Infosys']]);
    const wb = xlsx([{ name: 'A/B', rows: [['x', 1], ['<y>']], header: [0] }, { name: 'Two', rows: [['z']] }]);
    expect(wb.subarray(0, 2).toString()).toBe('PK');
    expect(sheetsOf(wb).map((s) => s.name)).toEqual(['A-B', 'Two']);
    expect(sheet(wb, 'A-B')).toEqual([['x', '1'], ['<y>']]);
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
  const bin = async (who: string, url: string) =>
    (await get(who, url).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200)).body as Buffer;
  const pdf = (name: string) => ({ filename: name, contentType: 'application/pdf', contentBase64: Buffer.from(`%PDF-1.4 ${name}`).toString('base64') });
  const metricOf = (o: { metrics: { code: string }[] }, code: string) => o.metrics.find((m) => m.code === code) as Record<string, any>;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tok = { principal: await login(t.slug, t.principal.email!), teacher: await login(t.slug, t.teacher.email!), student: await login(t.slug, t.studentUser.email!), outsider: await login(other.slug, other.principal.email!) };
    // Live ERP data the metrics read: two full-time teachers (one with a Ph.D.), students admitted this year, a published
    // final-semester session with two passes out of three, a placement offer, journal papers and an admission cycle.
    const q = (s: string, v: unknown[] = []) => owner.query(s, v);
    const [prof] = (await q(`insert into designations (tenant_id, name) values ($1, 'Professor') returning id`, [t.tenantId])).rows;
    await q(`insert into staff_profiles (tenant_id, user_id, employee_code, employment_type, date_of_joining, gender, designation_id) values ($1, $2, 'E1', 'permanent', '2012-07-01', 'female', $4), ($1, $3, 'E2', 'permanent', '2021-06-15', 'male', null)`, [t.tenantId, t.teacher.id, t.teacher2.id, prof.id]);
    await q(`insert into staff_qualifications (tenant_id, user_id, kind, title, level, year) values ($1, $2, 'degree', 'Ph.D. in Commerce', 'doctorate', 2010)`, [t.tenantId, t.teacher.id]);
    await q(`update students set enrolled_on = '2026-08-01' where tenant_id = $1`, [t.tenantId]);
    const [year] = (await q(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows;
    await q(`insert into admission_cycles (tenant_id, program_id, academic_year_id, name, seats, opens_on, closes_on) values ($1, $2, $3, 'BCom 2026', 60, '2026-06-10', '2026-07-31')`, [t.tenantId, t.program.id, year.id]);
    const [ses] = (await q(`insert into exam_sessions (tenant_id, academic_year_id, program_id, term, name, starts_on, ends_on, status, published_at, created_by) values ($1, $2, $3, 6, 'BCom final', '2026-08-01', '2026-08-20', 'published', '2026-09-15T05:00:00Z', $4) returning id`, [t.tenantId, year.id, t.program.id, t.principal.id])).rows;
    for (const [i, s] of t.students.entries()) await q(`insert into exam_results (tenant_id, session_id, student_id, sgpa, cgpa, credits_attempted, credits_earned, credit_points, outcome) values ($1, $2, $3, 7, 7.5, 20, 20, 140, $4)`, [t.tenantId, ses.id, s.id, i < 2 ? 'pass' : 'fail']);
    const [co] = (await q(`insert into placement_companies (tenant_id, name) values ($1, 'Infosys') returning id`, [t.tenantId])).rows;
    const [dr] = (await q(`insert into placement_drives (tenant_id, company_id, title, role_title) values ($1, $2, 'Campus drive', 'Analyst') returning id`, [t.tenantId, co.id])).rows;
    const [reg] = (await q(`insert into drive_registrations (tenant_id, drive_id, student_id, cgpa_at, backlogs_at) values ($1, $2, $3, 7.5, 0) returning id`, [t.tenantId, dr.id, t.students[0].id])).rows;
    await q(`insert into placement_offers (tenant_id, drive_id, registration_id, student_id, role_title, ctc_lpa, status, offered_on) values ($1, $2, $3, $4, 'Analyst', 4.5, 'accepted', '2026-09-20')`, [t.tenantId, dr.id, reg.id, t.students[0].id]);
    await q(`insert into publications (tenant_id, owner_user_id, title, kind, venue, year, indexed_in) values ($1, $2, 'Cooperative banks in Karnataka', 'journal', 'Indian Journal of Commerce', 2026, '{Scopus}'), ($1, $2, 'GST and MSMEs', 'journal', 'Journal of Accounting', 2026, '{}'), ($1, $3, 'Microfinance outreach', 'journal', 'Finance India', 2025, '{}')`, [t.tenantId, t.teacher.id, t.teacher2.id]);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('serves the catalogue: frameworks, aliases and the criteria tree with formulas, templates and evidence', async () => {
    const list = (await get('principal', '/v1/accreditation/frameworks').expect(200)).body;
    expect(list).toHaveLength(16);
    expect(list.find((f: { key: string }) => f.key === 'naac-aff-ug')).toMatchObject({ body: 'naac', weight: 1000, criteria: 7 });
    const tree = (await get('principal', '/v1/accreditation/frameworks/naac').expect(200)).body;
    expect(tree.key).toBe('naac-aff-ug');
    expect(tree.criteria.map((c: { id: string }) => c.id)).toEqual(['EP', '1', '2', '3', '4', '5', '6', '7']);
    const m = tree.criteria[2].indicators[0].metrics[0];
    expect(m).toMatchObject({ code: '2.1.1', kind: 'QnM', combine: 'avg', years: 5 });
    expect(m.inputs.map((i: { key: string }) => i.key)).toEqual(['admitted', 'sanctioned']);
    expect(m.columns).toEqual(['Programme name', 'Programme code', 'Number of seats sanctioned', 'Number of students admitted', 'Year']);
    expect(m.evidence.length).toBeGreaterThan(0);
    await get('principal', '/v1/accreditation/frameworks/nope').expect(404);
    await get('student', '/v1/accreditation/frameworks').expect(403);
    // Settings override a benchmark; unknown metrics are refused.
    await put('principal', '/v1/accreditation/nirf-engineering/settings', { bench: { 'GO.MS': 8 } }).expect(200);
    await put('principal', '/v1/accreditation/nirf-engineering/settings', { bench: { 'X.Y': 8 } }).expect(400);
    const nirf = (await get('principal', '/v1/accreditation/frameworks/nirf-engineering').expect(200)).body;
    expect(nirf.criteria[2].indicators[0].metrics.find((x: { code: string }) => x.code === 'GO.MS').bench).toBe(8);
  });

  it('computes metrics year by year from ERP data with the records behind them', async () => {
    const o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(o.cycle).toBe('2026-27');
    expect(o.window).toEqual(['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
    expect(o.criteria.map((c: { id: string }) => c.id)).toEqual(['EP', '1', '2', '3', '4', '5', '6', '7']);
    expect(metricOf(o, '2.2.1')).toMatchObject({ value: 1.5, valueSource: 'auto', yearsRequired: 1 });
    expect(metricOf(o, '2.4.2').value).toBe(50);
    expect(metricOf(o, '2.4.2').years.filter((y: { hasData: boolean }) => y.hasData)).toHaveLength(5);
    expect(metricOf(o, '2.6.3').value).toBeCloseTo(66.67, 1);
    expect(metricOf(o, '3.3.1').value).toBe(1.5);
    expect(metricOf(o, '5.2.1').value).toBeCloseTo(33.33, 1);
    expect(metricOf(o, '2.1.1').value).toBe(5);
    expect(metricOf(o, 'EP-1.1').years.at(-1).value).toBe(3);
    const ratio = metricOf(o, '2.2.1');
    expect(ratio.score).toBe(4);
    expect(o.estimate).toMatchObject({ scoring: 'naac' });
    expect(o.estimate.value).toBeGreaterThan(0);
    expect(o.estimate.binary.ready).toBe(false);
    // Drill-down: the full-time teachers and final-year results behind the figures.
    const d = (await get('principal', '/v1/accreditation/naac/metrics/2.6.3').expect(200)).body;
    expect(d.metric.inputs.map((i: { key: string }) => i.key)).toEqual(['passed', 'appeared']);
    const rec = d.records.find((r: { year: string; input: string }) => r.year === '2026-27' && r.input === 'appeared');
    expect(rec.total).toBe(3);
    expect(rec.columns[0]).toBe('Roll no.');
    // NIRF and NBA read the same data.
    const n = (await get('principal', '/v1/accreditation/nirf-engineering/overview').expect(200)).body;
    expect(metricOf(n, 'TLR.FSR').value).toBe(1.5);
    expect(metricOf(n, 'GO.MS').value).toBe(4.5);
    expect(metricOf(n, 'GO.MS').score).toBeCloseTo((25 * 4.5) / 8, 1);
    expect(n.estimate.scoring).toBe('nirf');
    const b = (await get('principal', '/v1/accreditation/nba/overview').expect(200)).body;
    expect(b.framework.key).toBe('nba-ug-eng-t2');
    expect(metricOf(b, '5.1').value).toBe(1.5);
    // Another institution sees none of it; students cannot read.
    const x = (await get('outsider', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(metricOf(x, '2.2.1').value).toBeNull();
    await get('student', '/v1/accreditation/naac/overview').expect(403);
    await get('principal', '/v1/accreditation/xyz/overview').expect(404);
  });

  it('takes inputs, rows, options and narratives per year, and imports filled templates', async () => {
    await put('principal', '/v1/accreditation/naac/metrics/2.4.1', { year: '2025-26', inputs: { sanctioned: 4 } }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/2.4.1', { year: '2026-27', inputs: { sanctioned: 4 } }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/2.4.1', { year: '2019-20', inputs: { sanctioned: 4 } }).expect(400);
    await put('principal', '/v1/accreditation/naac/metrics/2.4.1', { inputs: { nope: 4 } }).expect(400);
    await put('principal', '/v1/accreditation/naac/metrics/1.4.1', { options: [0, 1, 3] }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/1.4.1', { options: [9] }).expect(400);
    await put('principal', '/v1/accreditation/naac/metrics/1.1.1', { textValue: 'The academic calendar is prepared before each term and the teaching plan is reviewed by the IQAC every month.' }).expect(200);
    await put('principal', '/v1/accreditation/naac/metrics/3.4.2', { selfScore: 3.5 }).expect(200);
    await put('teacher', '/v1/accreditation/naac/metrics/2.4.1', { inputs: { sanctioned: 1 } }).expect(403);
    await put('principal', '/v1/accreditation/naac/metrics/9.9.9', { value: 1 }).expect(404);
    let o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    const ft = metricOf(o, '2.4.1');
    expect(ft.years.find((y: { year: string }) => y.year === '2026-27').value).toBe(50);
    expect(ft.value).toBe(50);
    expect(metricOf(o, '1.4.1')).toMatchObject({ value: 3, score: 3, options: { selected: [0, 1, 3] } });
    expect(metricOf(o, '1.1.1').narrative).toContain('academic calendar');
    expect(metricOf(o, '3.4.2').score).toBe(3.5);

    // Template round trip: the MoU template with rows for two years feeds the MoU count.
    const tpl = await bin('principal', '/v1/accreditation/naac/metrics/3.5.1/template.xlsx');
    const head = sheet(tpl, 'Data template')!;
    expect(head[4]).toEqual(['Academic year', 'Name of the organisation / institution / industry with whom the MoU is signed', 'Year of signing MoU', 'Duration', 'List the actual activities under each MoU and web links year-wise']);
    const filled = xlsx([{ name: 'Data template', rows: [...head.slice(0, 5), ['2025-26', 'Infosys Ltd', '2025', '3 years', 'Internships'], ['2026-27', 'Canara Bank', '2026', '2 years', 'Training'], ['2026-27', 'KLE University', '2026', '5 years', 'Faculty exchange'], ['1999-00', 'Old', '1999', '1', 'x']] }]);
    const imp = (await post('principal', '/v1/accreditation/naac/metrics/3.5.1/import', { file: { filename: 'mou.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: filled.toString('base64') } }).expect(201)).body;
    expect(imp.stored).toEqual({ '2025-26': { rows: 1, inputs: 0 }, '2026-27': { rows: 2, inputs: 0 } });
    expect(imp.skipped).toHaveLength(1);
    // Year-wise inputs sheet: sanctioned posts for 2024-25.
    const t241 = await bin('principal', '/v1/accreditation/naac/metrics/2.4.1/template.xlsx');
    const inputs = sheet(t241, 'Year-wise inputs')!;
    expect(inputs[2][0]).toBe('Academic year');
    const yi = xlsx([{ name: 'Year-wise inputs', rows: [inputs[0], [], inputs[2], ['2024-25', '2', '4', '']] }]);
    expect((await post('principal', '/v1/accreditation/naac/metrics/2.4.1/import', { file: { filename: 'x.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: yi.toString('base64') } }).expect(201)).body.stored).toEqual({ '2024-25': { rows: 0, inputs: 1 } });
    await post('principal', '/v1/accreditation/naac/metrics/2.4.1/import', { file: { filename: 'x.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: Buffer.from('not a workbook').toString('base64') } }).expect(400);
    o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(metricOf(o, '3.5.1')).toMatchObject({ value: 3 });
    expect(metricOf(o, '3.5.1').years.find((y: { year: string }) => y.year === '2026-27').inputs[0]).toMatchObject({ value: 2, source: 'rows' });
    expect(metricOf(o, '2.4.1').years.find((y: { year: string }) => y.year === '2024-25').value).toBe(50);
  });

  it('keeps evidence per metric and year, downloads it and packs it with an index', async () => {
    const ev = (await post('principal', '/v1/accreditation/naac/metrics/2.4.1/evidence', { year: '2025-26', title: 'Sanction letter 2025', file: pdf('sanction.pdf') }).expect(201)).body;
    expect(ev).toMatchObject({ fileName: 'sanction.pdf', year: '2025-26' });
    await post('principal', '/v1/accreditation/naac/metrics/2.4.1/evidence', { title: 'Board minutes', url: 'https://example.org/bos.pdf' }).expect(201);
    await post('principal', '/v1/accreditation/naac/metrics/2.4.1/evidence', { title: 'Fake', file: { filename: 'x.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('not a pdf').toString('base64') } }).expect(400);
    await post('principal', '/v1/accreditation/naac/metrics/2.4.1/evidence', { year: '2010-11', title: 'Too old' }).expect(400);
    const list = (await get('principal', '/v1/accreditation/naac/metrics/2.4.1/evidence').expect(200)).body;
    expect(list.map((e: { year: string }) => e.year).sort()).toEqual(['2025-26', '2026-27']);
    expect((await bin('principal', `/v1/accreditation/evidence/${ev.id}/download`)).toString()).toContain('%PDF-1.4 sanction.pdf');
    const o = (await get('principal', '/v1/accreditation/naac/overview').expect(200)).body;
    expect(metricOf(o, '2.4.1').evidence).toBe(2);
    const pack = await bin('principal', '/v1/accreditation/naac/evidence-pack.zip');
    const files = names(pack);
    expect(files).toContain('00 Evidence index.pdf');
    expect(files).toContain('Criterion 2/2.4.1/2025-26/sanction.pdf');
    expect(entry(pack, '00 Evidence index.pdf')!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(entry(pack, '00 Evidence index.csv')!.toString()).toContain('https://example.org/bos.pdf');
    await get('teacher', '/v1/accreditation/naac/evidence-pack.zip').expect(403);
  });

  it('tracks DVV clarifications with deviations, responses, documents and decisions', async () => {
    const q = (await post('principal', '/v1/accreditation/dvv', { framework: 'naac', cycle: '2026-27', metricCode: '2.4.1', deviation: 'documents_missing', query: 'Provide the sanction letters for all five years', heiValue: 50, dueOn: '2026-10-27' }).expect(201)).body;
    expect(q).toMatchObject({ framework: 'naac-aff-ug', status: 'open', deviation: 'documents_missing' });
    await post('principal', '/v1/accreditation/dvv', { framework: 'naac', cycle: '2026-27', metricCode: '9.9.9', query: 'x y z' }).expect(404);
    expect((await get('principal', '/v1/accreditation/naac/metrics/2.4.1').expect(200)).body.metric.dvvOpen).toBe(1);
    await post('principal', `/v1/accreditation/dvv/${q.id}/documents`, { title: 'Sanction letters', file: pdf('letters.pdf') }).expect(201);
    await post('principal', `/v1/accreditation/dvv/${q.id}/documents`, { title: 'Nothing' }).expect(400);
    expect((await put('principal', `/v1/accreditation/dvv/${q.id}`, { response: 'Letters for 2022-27 uploaded' }).expect(200)).body.status).toBe('answered');
    const rej = (await put('principal', `/v1/accreditation/dvv/${q.id}`, { status: 'rejected', dvvValue: 40 }).expect(200)).body;
    expect(rej).toMatchObject({ status: 'rejected', dvvValue: 40 });
    const list = (await get('principal', '/v1/accreditation/dvv?framework=naac&cycle=2026-27').expect(200)).body;
    expect(list[0]).toMatchObject({ documents: 1, response: 'Letters for 2022-27 uploaded' });
    const x = await bin('principal', '/v1/accreditation/naac/dvv.xlsx?cycle=2026-27');
    const rows = sheet(x, 'DVV clarifications')!;
    expect(rows[2]).toEqual(['Metric', 'Deviation', 'Clarification asked by DVV', 'Value filed by the institution', 'Value recommended by DVV', 'Institution response', 'Status', 'Respond by']);
    expect(rows[3].slice(0, 2)).toEqual(['2.4.1', 'documents missing']);
    await put('teacher', `/v1/accreditation/dvv/${q.id}`, { status: 'closed' }).expect(403);
  });

  it('assigns metrics to faculty with due dates, lets owners fill and submit them, and sends reminders', async () => {
    const a = (await post('principal', '/v1/accreditation/naac/tasks', { scope: '3.3.1', ownerId: t.teacher.id, reviewerId: t.principal.id, dueOn: '2026-10-22' }).expect(201)).body;
    expect(a.status).toBe('assigned');
    await post('principal', '/v1/accreditation/naac/tasks', { scope: '9.9', ownerId: t.teacher.id }).expect(400);
    await post('principal', '/v1/accreditation/naac/tasks', { scope: '3' }).expect(400);
    const people = (await get('principal', '/v1/accreditation/people').expect(200)).body;
    expect(people.staff.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining([t.teacher.id, t.teacher2.id]));
    await get('teacher', '/v1/accreditation/people').expect(403);
    const crit = (await post('principal', '/v1/accreditation/naac/tasks', { scope: '5', ownerId: t.teacher2.id, dueOn: '2026-10-01' }).expect(201)).body;
    const theirs = (await http().get('/v1/accreditation/my-tasks').set({ authorization: `Bearer ${await login(t.slug, t.teacher2.email!)}` }).expect(200)).body;
    expect(theirs[0]).toMatchObject({ kind: 'criterion', scope: '5' });
    expect(theirs[0].metrics.map((m: { code: string }) => m.code)).toContain('5.2.1');
    const mine = (await get('teacher', '/v1/accreditation/my-tasks').expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ scope: '3.3.1', kind: 'metric', frameworkTitle: 'NAAC - Affiliated / constituent UG college' });
    // The owner can read and fill the assigned metric, comment on it, but not other metrics.
    await get('teacher', '/v1/accreditation/naac/metrics/3.3.1').expect(200);
    await put('teacher', '/v1/accreditation/naac/metrics/3.3.1', { year: '2024-25', rows: [['Paper', 'A. Rao', 'Commerce', 'J. Commerce', '2024', '1234-5678', 'https://x']] }).expect(200);
    await get('teacher', '/v1/accreditation/naac/metrics/2.4.1').expect(403);
    await post('teacher', '/v1/accreditation/naac/metrics/3.3.1/comments', { body: 'Added the 2024 paper' }).expect(201);
    expect((await get('principal', '/v1/accreditation/naac/metrics/3.3.1/comments').expect(200)).body[0]).toMatchObject({ body: 'Added the 2024 paper' });
    await put('teacher', `/v1/accreditation/tasks/${a.id}`, { status: 'approved' }).expect(400);
    await put('teacher', `/v1/accreditation/tasks/${a.id}`, { ownerId: t.teacher2.id }).expect(400);
    expect((await put('teacher', `/v1/accreditation/tasks/${a.id}`, { status: 'submitted' }).expect(200)).body.status).toBe('submitted');
    expect((await put('principal', `/v1/accreditation/tasks/${a.id}`, { status: 'approved' }).expect(200)).body.status).toBe('approved');
    // Reminders: the overdue criterion task (due 1 Oct) gets one, once a day; the approved one does not.
    expect((await post('principal', '/v1/accreditation/naac/tasks/remind').expect(201)).body.sent).toBe(1);
    expect((await post('principal', '/v1/accreditation/naac/tasks/remind').expect(201)).body.sent).toBe(0);
    const n = (await owner.query(`select title from notifications where user_id = $1 and kind = 'task' order by created_at`, [t.teacher2.id])).rows;
    expect(n.map((r: { title: string }) => r.title).join('|')).toContain('criterion 5 is overdue');
    const r = (await get('principal', '/v1/accreditation/naac/readiness').expect(200)).body;
    expect(r.criteria.find((c: { id: string }) => c.id === '5')).toMatchObject({ owners: [t.teacher2.fullName], overdue: 1, nextDue: '2026-10-01' });
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.gaps[0]).toHaveProperty('reasons');
    expect(r.tasks.find((x: { id: string }) => x.id === crit.id).overdue).toBe(true);
    expect(r.dvv).toMatchObject({ rejected: 1 });
    expect(r.estimate.binary.reasons).toContain('floor');
    expect(r.metrics.find((m: { code: string }) => m.code === '3.3.1')).toMatchObject({ task: { status: 'approved' } });
  });

  it('exports NAAC SSR and AQAR, NIRF, NBA, AISHE and UDISE+ in their official layouts', async () => {
    const z = await bin('principal', '/v1/accreditation/naac/export.zip');
    const files = names(z);
    for (const f of ['Extended profile.xlsx', 'Criterion 1/1.2.1.xlsx', 'Criterion 3/3.5.1.xlsx', 'Criterion 7/7.3.1.xlsx', 'Summary.xlsx', 'DVV clarifications.xlsx', 'README.txt']) expect(files, f).toContain(f);
    const mou = entry(z, 'Criterion 3/3.5.1.xlsx')!;
    expect(sheetsOf(mou).map((s) => s.name)).toEqual(['Data template', 'Year-wise', 'Summary']);
    const tplRows = sheet(mou, 'Data template')!;
    expect(tplRows[4]).toEqual(['Academic year', 'Name of the organisation / institution / industry with whom the MoU is signed', 'Year of signing MoU', 'Duration', 'List the actual activities under each MoU and web links year-wise']);
    expect(tplRows.slice(5).map((r) => r[1])).toEqual(['Infosys Ltd', 'Canara Bank', 'KLE University']);
    // ERP records are placed under the template columns (placements for 5.2.1).
    const placed = sheet(entry(z, 'Criterion 5/5.2.1.xlsx')!, 'Data template')!;
    expect(placed[4]).toEqual(['Year', 'Name of student placed / enrolling into higher education', 'Programme graduated from', 'Name of the employer / institution joined', 'Pay package at appointment / name of programme admitted to']);
    expect(placed[5].slice(0, 4)).toEqual(['2026-27', 'Student A', 'BCom', 'Infosys']);
    const ep = sheet(entry(z, 'Extended profile.xlsx')!, 'Extended profile')!;
    expect(ep[2]).toEqual(['Metric', 'Particulars', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
    expect(sheetsOf(entry(z, 'Summary.xlsx')!).map((s) => s.name)).toEqual(['Summary', 'Metrics', 'Gaps']);

    const aqar = await bin('principal', '/v1/accreditation/naac/aqar.xlsx');
    const an = sheetsOf(aqar).map((s) => s.name);
    expect(an.slice(0, 8)).toEqual(['Part A', 'Criterion 1', 'Criterion 2', 'Criterion 3', 'Criterion 4', 'Criterion 5', 'Criterion 6', 'Criterion 7']);
    expect(an).toContain('3.5.1');
    expect(sheet(aqar, 'Criterion 2')![2]).toEqual(['Metric', 'Type', 'Description', 'Response for 2026-27', 'Inputs', 'Evidence files']);

    const nirf = await bin('principal', '/v1/accreditation/nirf-engineering/export.xlsx');
    expect(sheetsOf(nirf).map((s) => s.name)).toEqual(['Score estimate', 'Sanctioned (Approved) Intake', 'Total Actual Student Strength', 'Placement & Higher Studies', 'Ph.D Student Details', 'Financial Resources - Capital', 'Financial Resources - Operation', 'Sponsored Research Details', 'Consultancy Project Details', 'PCS Facilities', 'Faculty Details', 'IPR']);
    expect(sheet(nirf, 'Placement & Higher Studies')![0]).toEqual(['Academic year', 'No. of first year students intake in the year', 'No. of first year students admitted in the year', 'No. of students graduating in minimum stipulated time', 'No. of students placed', 'Median salary of placed graduates (amount in INR)', 'No. of students selected for higher studies']);
    expect(sheet(nirf, 'Placement & Higher Studies')![3]).toEqual(['2026-27', '60', '3', '2', '1', '450000']);
    const est = sheet(nirf, 'Score estimate')!;
    expect(est[3]).toEqual(['Parameter', 'Weight %', 'Sub-parameter', 'Title', 'Value', 'Unit', 'Benchmark', 'Marks', 'Of', 'Formula']);
    expect(est.some((r) => r[2] === 'FSR' && r[7] === '30')).toBe(true);
    expect(sheetsOf(await bin('principal', '/v1/accreditation/nirf-management/export.xlsx')).map((s) => s.name)).toContain('Executive Development Programs');

    const nba = await bin('principal', '/v1/accreditation/nba/export.xlsx?tier=2');
    const bn = sheetsOf(nba).map((s) => s.name);
    for (const s of ['Summary', 'Criterion 4', 'Table 4.1', 'Table 4.2', 'Table 4.5', 'Table 5.1', 'Table 5.3', 'CO-PO attainment', 'CO-PO matrix']) expect(bn, s).toContain(s);
    expect(sheet(nba, 'Table 4.1')![3]).toEqual(['Item', 'CAY (2026-27)', 'CAYm1 (2025-26)', 'CAYm2 (2024-25)']);
    await get('principal', '/v1/accreditation/nba/export.xlsx?tier=3').expect(400);

    const aishe = await bin('principal', '/v1/accreditation/aishe/export.xlsx');
    expect(sheetsOf(aishe).map((s) => s.name)).toEqual(['Block 1 Basic information', 'Block 2 Programmes', 'Block 3 Teaching staff', 'Teacher information', 'Block 4 Non-teaching staff', 'Block 5 Enrolment', 'Block 5 PwD and minority', 'Block 5 Foreign students', 'Block 6 Examination results', 'Block 7 Financial', 'Block 8 Infrastructure', 'Block 9 Scholarships', 'To complete by hand']);
    const en = sheet(aishe, 'Block 5 Enrolment')!;
    expect(en[1].slice(0, 4)).toEqual(['Programme', 'General male', 'General female', 'General transgender']);
    expect(en[2][0]).toBe('BCom');
    expect(en[2].at(-1)).toBe('3');
    expect(sheet(aishe, 'Block 6 Examination results')![1]).toEqual(['BCom', '3', '0', '2', '0', '3', '2']);

    const ud = await bin('principal', '/v1/accreditation/udise/export.xlsx');
    expect(sheetsOf(ud).map((s) => s.name)).toEqual(['School profile', 'Facilities', 'Teacher profile', 'Enrolment by class', 'Student profile (SDMS)', 'Results', 'To complete by hand']);
    expect(sheet(ud, 'Teacher profile')!.length).toBe(3);

    for (const url of ['/v1/accreditation/naac-university/export.zip', '/v1/accreditation/naac-autonomous/aqar.xlsx', '/v1/accreditation/nirf-college/export.xlsx', '/v1/accreditation/naac/export.xlsx', '/v1/accreditation/iqac/atr.xlsx']) expect((await bin('principal', url)).subarray(0, 2).toString(), url).toBe('PK');
    await get('principal', '/v1/accreditation/nirf/export.zip').expect(400);
    await get('teacher', '/v1/accreditation/naac/export.zip').expect(403);
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
    expect(metricOf(o, '7.2.1').autoNarrative).toContain('Best practices');
    expect(metricOf(o, '6.5.1').autoNarrative).toContain('IQAC meetings');
    await get('teacher', '/v1/accreditation/iqac/meetings').expect(403);
  });

  it('lets a teacher add own evidence, which the quality team verifies and the publication metric counts', async () => {
    const e = (await post('teacher', '/v1/accreditation/my-evidence', { kind: 'publication', title: 'A study of cooperative banks', year: 2026, venue: 'Journal of Commerce', file: pdf('paper.pdf') }).expect(201)).body;
    expect(e.fileName).toBe('paper.pdf');
    expect((await get('teacher', '/v1/accreditation/my-evidence').expect(200)).body).toHaveLength(1);
    await get('teacher', '/v1/accreditation/faculty-evidence').expect(403);
    await post('teacher', `/v1/accreditation/faculty-evidence/${e.id}/verify`).expect(403);
    const before = metricOf((await get('principal', '/v1/accreditation/naac/overview').expect(200)).body, '3.3.1').combinedInputs.papers;
    expect((await post('principal', `/v1/accreditation/faculty-evidence/${e.id}/verify`).expect(201)).body.verified).toBe(true);
    const after = metricOf((await get('principal', '/v1/accreditation/naac/overview').expect(200)).body, '3.3.1').combinedInputs.papers;
    expect(after).toBe(before + 1);
    await post('student', '/v1/accreditation/my-evidence', { kind: 'award', title: 'x y' }).expect(403);
  });
});
