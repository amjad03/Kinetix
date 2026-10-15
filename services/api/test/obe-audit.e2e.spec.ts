import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsxSheets, writeWorkbook } from '../src/common/xlsx.js';
import { parseTargetsSheet } from '../src/obe/obe-depth.controller.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('OBE targets sheet', () => {
  const items = [
    { scope: 'co' as const, targetId: 'c1', code: 'BCOM-3.1/CO1' },
    { scope: 'po' as const, targetId: 'p1', code: 'PO1' },
  ];
  it('reads levels, thresholds and rationale by code, and reports bad rows', () => {
    const head = ['Code', 'Kind', 'Course', 'Statement', 'Target level', 'Student threshold %', 'Rationale'];
    const ok = parseTargetsSheet([head, ['bcom-3.1/co1', 'CO', '', '', '2.2', '65', 'Raised after last year'], ['PO1', 'PO/PSO', '', '', '', '', '']], items, 3);
    expect(ok.errors).toEqual([]);
    expect(ok.targets).toEqual([{ targetId: 'c1', targetLevel: 2.2, thresholdPercent: 65, rationale: 'Raised after last year' }, { targetId: 'p1', targetLevel: null, thresholdPercent: null, rationale: '' }]);
    const bad = parseTargetsSheet([head, ['PO9', '', '', '', '2', '', ''], ['PO1', '', '', '', '4', '', ''], ['PO1', '', '', '', '2', '60', ''], ['BCOM-3.1/CO1', '', '', '', '', '60', '']], items, 3);
    expect(bad.errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
    expect(bad.errors[0].message).toContain('no such');
    expect(parseTargetsSheet([['Name']], items, 3).errors[0].message).toContain('downloaded sheet');
  });
});

describe('OBE completeness: statements list, question difficulty, verified actions, targets in Excel, framework-aware SAR', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const base = () => `/v1/obe/programs/${t.program.id}`;
  const year = () => t.section.academicYearId;
  const q = async (text: string, params: unknown[] = []) => (await owner.query(text, params)).rows;
  const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
    const d: Buffer[] = [];
    res.on('data', (c: Buffer) => d.push(c));
    res.on('end', () => cb(null, Buffer.concat(d)));
  };
  const xlsx = async (path: string, who = 'principal') => readXlsxSheets((await http().get(path).set(as(who)).buffer().parse(bin).expect(200)).body as Buffer);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    const [u] = await q(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'IQAC', 'iqac@audit.in', $2) returning id`, [t.tenantId, await argon2.hash('pw')]);
    await q(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'quality_officer')`, [t.tenantId, u.id]);
    id.iqac = u.id;
    tok.iqac = await login(t.slug, 'iqac@audit.in');
  }, 90000);
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps the vision, mission, PEOs, POs and PSOs as a record kit list: add, edit, import, export, history, guarded delete', async () => {
    const add = (body: Record<string, unknown>, who = 'iqac') => http().post('/v1/records/obe-statements').set(as(who)).send({ programId: t.program.id, ...body });
    id.po1 = (await add({ kind: 'po', code: 'po1', statement: 'Apply accounting knowledge' }).expect(201)).body.id;
    const po1 = (await http().get(`/v1/records/obe-statements/${id.po1}`).set(as('iqac')).expect(200)).body;
    expect(po1).toMatchObject({ code: 'PO1', ord: 1 }); // upper-cased, ordered by its number
    await add({ kind: 'po', code: 'PO1', statement: 'Again' }).expect(409);
    await add({ kind: 'po', code: 'P O!', statement: 'Bad code' }).expect(400);
    await add({ kind: 'pso', code: 'PSO1', statement: 'Prepare company accounts' }, 'teacher').expect(403);
    await http().patch(`/v1/records/obe-statements/${id.po1}`).set(as('iqac')).send({ statement: 'Apply accounting and finance knowledge' }).expect(200);
    const hist = (await http().get(`/v1/records/obe-statements/${id.po1}/history`).set(as('iqac')).expect(200)).body;
    expect(JSON.stringify(hist)).toContain('Apply accounting and finance knowledge');

    // Excel import keyed by programme, kind and code: one new PSO, one PO updated.
    const tpl = await xlsx('/v1/records/obe-statements/import/template', 'iqac');
    const header = tpl[0].rows[0];
    const row = (vals: Record<string, string>) => header.map((h) => vals[h.replace(' *', '')] ?? '');
    const prog = (await q(`select name from programs where id = $1`, [t.program.id]))[0].name as string;
    const file = writeWorkbook([{ name: 'Import', header: true, rows: [header, row({ Programme: prog, Kind: 'PSO', Code: 'PSO1', Statement: 'Prepare company accounts', Order: '1' }), row({ Programme: prog, Kind: 'PO', Code: 'PO1', Statement: 'Apply accounting, finance and tax knowledge', Order: '1' })] }]);
    const check = (await http().post('/v1/records/obe-statements/import').set(as('iqac')).attach('file', file, 's.xlsx').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 1, updated: 1, error: 0 });
    await http().post(`/v1/records/obe-statements/import/${check.id}/commit`).set(as('iqac')).send({}).expect(200);
    const list = (await http().get(`/v1/records/obe-statements?f.programId=${t.program.id}`).set(as('principal')).expect(200)).body;
    expect(list.rows.map((r: { code: string; statement: string }) => `${r.code}: ${r.statement}`).sort()).toEqual(['PO1: Apply accounting, finance and tax knowledge', 'PSO1: Prepare company accounts']);
    const exp = await xlsx('/v1/records/obe-statements/export?format=xlsx', 'iqac');
    expect(exp[0].rows.length).toBe(3);
    expect((await http().get('/v1/records/obe-statements').set(as('outsider')).expect(200)).body.total).toBe(0);

    // A PO mapped from a course outcome cannot be deleted.
    const set = (await http().post(`/v1/obe/subjects/${t.subject.id}/co-sets`).set(as('teacher')).send({}).expect(201)).body.id;
    id.co1 = (await http().post(`/v1/obe/co-sets/${set}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'Prepare the final accounts of companies', bloomLevel: 'Apply' }).expect(201)).body.id;
    id.co2 = (await http().post(`/v1/obe/co-sets/${set}/outcomes`).set(as('teacher')).send({ code: 'CO2', statement: 'Analyse financial statements using ratios', bloomLevel: 'Analyse' }).expect(201)).body.id;
    await http().put(`/v1/obe/co-sets/${set}/matrix`).set(as('teacher')).send({ cells: [{ coId: id.co1, outcomeId: id.po1, strength: 3 }, { coId: id.co2, outcomeId: id.po1, strength: 2 }] }).expect(200);
    await http().post(`/v1/obe/co-sets/${set}/activate`).set(as('iqac')).expect(200);
    expect((await http().get(`/v1/records/obe-statements/${id.po1}`).set(as('iqac')).expect(200)).body.mapped).toBe(2);
    const del = await http().delete(`/v1/records/obe-statements/${id.po1}`).set(as('iqac'));
    expect(del.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(del.body)).toContain('mapped');
    const pso = list.rows.find((r: { code: string }) => r.code === 'PSO1').id;
    await http().delete(`/v1/records/obe-statements/${pso}`).set(as('iqac')).expect(200);
  });

  it('tags questions with a difficulty and reports the spread', async () => {
    const asm = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal test 1', kind: 'test', maxMarks: 20, heldOn: '2026-10-20' }).expect(201)).body.id;
    const paper = `/v1/obe/assessments/${asm}/questions`;
    await http().put(paper).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 20, difficulty: 'tricky' }] }).expect(400);
    const p = (await http().put(paper).set(as('teacher')).send({ questions: [
      { no: '1', maxMarks: 5, bloomLevel: 'Apply', difficulty: 'easy', cos: [{ coId: id.co1 }] },
      { no: '2', maxMarks: 10, bloomLevel: 'Analyse', difficulty: 'hard', cos: [{ coId: id.co2 }] },
      { no: '3', maxMarks: 5, bloomLevel: 'Apply', cos: [{ coId: id.co1 }] },
    ] }).expect(200)).body;
    expect(p.questions.map((x: { difficulty: string | null }) => x.difficulty)).toEqual(['easy', 'hard', null]);
    expect(p.difficulty).toEqual([{ level: 'easy', marks: 5 }, { level: 'medium', marks: 0 }, { level: 'hard', marks: 10 }]);
    // Same shape after marks: difficulty can still change.
    const [r1] = t.students.map((s) => s.id);
    const qid = (no: string) => p.questions.find((x: { no: string }) => x.no === no).id as string;
    await http().put(`/v1/obe/assessments/${asm}/question-marks`).set(as('teacher')).send({ entries: [{ studentId: r1, marks: { [qid('1')]: 4, [qid('2')]: 6, [qid('3')]: 3 } }] }).expect(200);
    const p2 = (await http().put(paper).set(as('teacher')).send({ questions: p.questions.map((x: { no: string; maxMarks: number; bloomLevel: string; cos: unknown[] }) => ({ no: x.no, maxMarks: x.maxMarks, bloomLevel: x.bloomLevel, cos: x.cos, difficulty: 'medium' })) }).expect(200)).body;
    expect(p2.difficulty[1]).toEqual({ level: 'medium', marks: 20 });
    // Copying a paper keeps the difficulty.
    const asm2 = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal test 2', kind: 'test', maxMarks: 20, heldOn: '2026-10-27' }).expect(201)).body.id;
    const c = (await http().post(`/v1/obe/assessments/${asm2}/questions/copy`).set(as('teacher')).send({ fromAssessmentId: asm }).expect(200)).body;
    expect(c.questions.every((x: { difficulty: string }) => x.difficulty === 'medium')).toBe(true);
    const sheet = await xlsx(`/v1/obe/assessments/${asm}/question-marks.xlsx`, 'teacher');
    expect(sheet.find((s) => s.name === 'Paper')!.rows[0]).toContain('Difficulty');
    const cf = await xlsx(`/v1/obe/subjects/${t.subject.id}/course-file.xlsx?academicYearId=${year()}`);
    expect(cf.find((s) => s.name === 'Difficulty spread')!.rows.slice(1).map((r) => [r[0], r[1]])).toEqual([['easy', '0'], ['medium', '40'], ['hard', '0'], ['not set', '0']]);
    expect(cf.find((s) => s.name === 'Paper 1')!.rows[0]).toContain('Difficulty');
  });

  it('closes the action-taken report with a verification by someone other than the owner', async () => {
    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200);
    const a = (await http().post(`${base()}/actions`).set(as('principal')).send({ scope: 'co', targetId: id.co2, title: 'Remedial classes on ratio analysis', ownerId: id.iqac }).expect(201)).body;
    const verify = (who: string, note?: string) => http().post('/v1/records/obe-actions/bulk').set(as(who)).send({ op: 'action', action: 'verify', target: { ids: [a.id] }, params: note ? { note } : {} });
    const meta = (await http().get('/v1/records/obe-actions/meta').set(as('principal')).expect(200)).body;
    expect(meta.actions.map((x: { key: string }) => x.key)).toContain('verify');
    expect((await http().get(`/v1/records/obe-actions/${a.id}`).set(as('principal')).expect(200)).body.stage).toBe('assigned');
    expect((await verify('principal').expect(200)).body.failed).toBe(1); // not done yet
    await http().patch(`/v1/records/obe-actions/${a.id}`).set(as('principal')).send({ status: 'done', rootCause: 'Too little practice', actionTaken: 'Four remedial classes with worked problems', takenOn: '2026-10-25' }).expect(200);
    expect((await http().get(`/v1/records/obe-actions/${a.id}`).set(as('principal')).expect(200)).body.stage).toBe('done');
    expect((await verify('principal').expect(200)).body.failed).toBe(1); // no evidence or re-measurement
    await http().post(`${base()}/evidence`).set(as('principal')).send({ scope: 'action', targetId: a.id, title: 'Remedial class attendance sheet', url: 'https://example.org/attendance.pdf' }).expect(201);
    expect((await verify('iqac').expect(200)).body.failed).toBe(1); // the owner cannot verify
    await http().post('/v1/records/obe-actions/bulk').set(as('teacher')).send({ op: 'action', action: 'verify', target: { ids: [a.id] }, params: {} }).expect(403);
    expect((await verify('principal', 'Checked the attendance and the re-test').expect(200)).body.succeeded).toBe(1);
    const v = (await http().get(`/v1/records/obe-actions/${a.id}`).set(as('principal')).expect(200)).body;
    expect(v).toMatchObject({ stage: 'verified', verifyNote: 'Checked the attendance and the re-test', verifiedByName: t.principal.fullName });
    expect((await http().get('/v1/records/obe-actions?f.verified=yes').set(as('principal')).expect(200)).body.total).toBe(1);
    const dash = (await http().get(`/v1/obe/dashboard?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    expect(dash.counts.actionsToVerify).toBe(0);
    const rep = await xlsx(`${base()}/attainment-report.xlsx?academicYearId=${year()}`);
    const atr = rep.find((s) => s.name === 'ATR')!.rows;
    expect(atr[0]).toContain('Verified');
    expect(atr[1].at(-1)).toContain(t.principal.fullName);
    // Reopening withdraws the verification.
    await http().patch(`/v1/records/obe-actions/${a.id}`).set(as('principal')).send({ status: 'in_progress' }).expect(200);
    expect((await http().get(`/v1/records/obe-actions/${a.id}`).set(as('principal')).expect(200)).body).toMatchObject({ verifiedAt: null, stage: 'evidence' });
    expect((await http().get(`/v1/obe/dashboard?academicYearId=${year()}`).set(as('principal')).expect(200)).body.counts.actionsToVerify).toBe(0);
  });

  it('downloads the targets as Excel, checks an upload and saves it', async () => {
    const sheet = await xlsx(`${base()}/targets.xlsx?academicYearId=${year()}`);
    const rows = sheet[0].rows;
    expect(rows[0]).toEqual(['Code', 'Kind', 'Course', 'Statement', 'Target level', 'Student threshold %', 'Rationale']);
    const codes = rows.slice(1).map((r) => r[0]);
    expect(codes).toEqual(expect.arrayContaining([expect.stringMatching(/\/CO1$/), 'PO1']));
    const co1 = codes.find((c) => c.endsWith('/CO1'))!;
    const upload = (r: (string | number)[][], check = false) => http().post(`${base()}/targets.xlsx?academicYearId=${year()}${check ? '&check=true' : ''}`).set(as('principal')).attach('file', writeWorkbook([{ name: 'Targets', header: true, rows: [rows[0], ...r] }]), 't.xlsx');
    const bad = (await upload([[co1, 'CO', '', '', 9, '', '']]).expect(200)).body;
    expect(bad).toMatchObject({ saved: false });
    expect(bad.errors[0].message).toContain('between 0 and 3');
    expect((await upload([[co1, 'CO', '', '', 2.5, 65, 'Stronger batch'], ['PO1', 'PO/PSO', '', '', 2.2, '', '']], true).expect(200)).body).toMatchObject({ saved: false, rows: 2, errors: [] });
    expect((await http().get(`${base()}/targets?academicYearId=${year()}`).set(as('principal')).expect(200)).body.rows.filter((r: { targetLevel: number | null }) => r.targetLevel !== null)).toHaveLength(0);
    expect((await upload([[co1, 'CO', '', '', 2.5, 65, 'Stronger batch'], ['PO1', 'PO/PSO', '', '', 2.2, '', '']]).expect(200)).body).toMatchObject({ saved: true, set: 2 });
    const tg = (await http().get(`${base()}/targets?academicYearId=${year()}`).set(as('principal')).expect(200)).body.rows.find((r: { code: string }) => r.code === co1);
    expect(tg).toMatchObject({ targetLevel: 2.5, thresholdPercent: 65, rationale: 'Stronger batch', setBy: t.principal.fullName });
    await http().get(`${base()}/targets.xlsx?academicYearId=${year()}`).set(as('teacher')).expect(403);
  });

  it('builds the SAR for the framework: Tier II numbering, Tier I curriculum structure, management criteria 3 and 4, and the assessment years', async () => {
    const sheets = async () => (await xlsx(`${base()}/sar.xlsx?academicYearId=${year()}`)).map((s) => s.name);
    const tier2 = await sheets();
    expect(tier2).toEqual(expect.arrayContaining(['2.1.1 Gaps', '2.1.2 Beyond syllabus', '2.2.2 Question papers', '3.1.1 COs', '3.2.2 CO attainment', 'PO attainment']));
    expect(tier2).not.toContain('2.1.2 Structure');
    await http().put(`${base()}/framework`).set(as('iqac')).send({ framework: 'nba_tier1' }).expect(200);
    const tier1 = await xlsx(`${base()}/sar.xlsx?academicYearId=${year()}`);
    expect(tier1.map((s) => s.name)).toEqual(expect.arrayContaining(['2.1.2 Structure', '2.1.3 Components', '2.1.4 Gaps', '2.1.4b Beyond syllabus']));
    expect(tier1.find((s) => s.name === '2.1.2 Structure')!.rows[0]).toEqual(['Sem', 'Course code', 'Course title', 'Type', 'L', 'T', 'P', 'Credits']);
    await http().put(`${base()}/framework`).set(as('iqac')).send({ framework: 'nba_management' }).expect(200);
    const mgmt = await sheets();
    expect(mgmt).toEqual(expect.arrayContaining(['4.1.2 Structure', '4.1.1 Gaps', '4.2.2 Question papers', '3.1.1 COs']));
    expect(mgmt.indexOf('3.1.1 COs')).toBeLessThan(mgmt.indexOf('4.1.1 Gaps'));

    // An earlier year's attainment shows as CAYm1.
    const [prev] = await q(`insert into academic_years (tenant_id, label, starts_on, ends_on) values ($1, '2025-26', '2025-06-01', '2026-05-31') returning id`, [t.tenantId]);
    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: prev.id }).expect(200);
    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200);
    const multi = await xlsx(`${base()}/sar.xlsx?academicYearId=${year()}`);
    const byYear = multi.find((s) => s.name === '3.3.2 By year')!.rows;
    expect(byYear[0][1]).toMatch(/^CAY /);
    expect(byYear[0][3]).toBe('CAYm1 2025-26');
    expect(byYear[1][0]).toBe('PO1');
    expect(multi.find((s) => s.name === '3.2.2 By year')).toBeTruthy();
  });
});
