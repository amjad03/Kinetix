import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { annotationProblem } from '../src/evaluation/evaluation.logic.js';
import { nameRevealsStudent, sanitisePage } from '../src/evaluation/scan-sanitise.js';
import { correctionProblem, retentionReasons } from '../src/dpdp/dpdp.logic.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** A w x h white RGB PNG with a text chunk (which the sanitiser must drop). */
function png(w: number, h: number, withText = true): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1), 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...(withText ? [chunk('tEXt', Buffer.from('Author\0Riya Sharma'))] : []), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const idatRows = (b: Buffer, w: number, h: number) => {
  let pos = 8;
  const types: string[] = [];
  let idat = Buffer.alloc(0);
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    types.push(type);
    if (type === 'IDAT') idat = Buffer.concat([idat, b.subarray(pos + 8, pos + 8 + len)]);
    pos += 12 + len;
  }
  const raw = inflateSync(idat);
  const stride = w * 3 + 1;
  return { types, row: (y: number) => raw.subarray(y * stride + 1, (y + 1) * stride), h };
};

describe('rules', () => {
  it('checks annotation geometry', () => {
    expect(annotationProblem({ kind: 'tick', x: 0.5, y: 0.5 })).toBeNull();
    expect(annotationProblem({ kind: 'tick', x: 1.2, y: 0.5 })).toMatch(/inside/);
    expect(annotationProblem({ kind: 'highlight', x: 0.5, y: 0.1, w: 0.6, h: 0.1 })).toMatch(/off the page/);
    expect(annotationProblem({ kind: 'highlight', x: 0.1, y: 0.1, w: 0, h: 0.1 })).toMatch(/width/);
    expect(annotationProblem({ kind: 'comment', x: 0.1, y: 0.1 })).toMatch(/comment/);
  });
  it('spots file names that reveal the student', () => {
    expect(nameRevealsStudent('R1.png', { rollNo: 'R1', fullName: 'Asha Rao' })).toBe('the roll number');
    expect(nameRevealsStudent('scan-asha.jpg', { rollNo: 'R1', fullName: 'Asha Rao' })).toBe('the student name');
    expect(nameRevealsStudent('page-1.png', { rollNo: 'R1', fullName: 'Asha Rao' })).toBeNull();
    expect(nameRevealsStudent('R10.png', { rollNo: 'R1', fullName: 'Asha Rao' })).toBeNull();
  });
  it('masks the header band of a PNG and drops its metadata', () => {
    const out = sanitisePage(png(4, 10), 'image/png', true, 30);
    expect(out.masked).toBe(true);
    const r = idatRows(out.buffer, 4, 10);
    expect(r.types).not.toContain('tEXt');
    expect([...r.row(0)].every((v) => v === 0)).toBe(true);
    expect([...r.row(2)].every((v) => v === 0)).toBe(true);
    expect([...r.row(3)].every((v) => v === 255)).toBe(true);
    // Only the first page is masked; a JPEG first page cannot be masked, so it is refused.
    expect(sanitisePage(png(4, 10), 'image/png', false, 30).masked).toBe(false);
    expect(() => sanitisePage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg', true, 30)).toThrow();
  });
  it('applies retention rules and validates corrections', () => {
    const none = { feePayments: 0, payslips: 0, donations: 0, examMarks: 0, activeWards: 0, enrolledStudent: false };
    expect(retentionReasons(none)).toEqual([]);
    expect(retentionReasons({ ...none, payslips: 2, examMarks: 1 })).toHaveLength(2);
    expect(correctionProblem('email', 'nope')).toBeTruthy();
    expect(correctionProblem('phone', '+91 98765 43210')).toBeNull();
    expect(correctionProblem('passwordHash', 'x')).toBeTruthy();
  });
});

describe('new roles, annotations, delegation, DPDP and the alumni portal', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const au = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(au(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(au(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(au(who)).send(body);
  const del = (who: string, url: string) => http().delete(url).set(au(who));
  const q = async <R = { id: string }>(sql: string, args: unknown[]) => (await owner.query(sql, args)).rows as R[];

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number], tenant = t) {
    const [u] = await db.insert(s.users).values({ tenantId: tenant.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@rd.in`, phone: null, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: tenant.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const ctrl = await addUser('Cora Controller', 'exam_controller');
    const exr = await addUser('Ex Aminer', 'examiner');
    const iqac = await addUser('Iqac Officer', 'quality_officer');
    const alum = await addUser('Alum Nus', 'alumni');
    const alum2 = await addUser('Alum Two', 'alumni');
    const acc = await addUser('Asha Accounts', 'accountant');
    const hr = await addUser('Hema Hr', 'hr_manager');
    const gro = await addUser('Gita Grievance', 'grievance_officer');
    const leaver = await addUser('Lee Leaver', 'teacher');
    const place = await addUser('Pia Placement', 'placement_officer');
    Object.assign(ids, { ctrl: ctrl.id, exr: exr.id, acc: acc.id, hr: hr.id, alum: alum.id, alum2: alum2.id, leaver: leaver.id });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'D1', dateOfJoining: '2025-04-01' });
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    const names = { ctrl, exr, iqac, alum, alum2, acc, hr, gro, leaver, place };
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      student: await login(t.slug, t.studentUser.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    for (const [k, u] of Object.entries(names)) tokens[k] = await login(t.slug, u.email!);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('on-screen annotations and anonymity', () => {
    const E = () => `/v1/evaluation/papers/${ids.paper}`;
    const alloc: Record<string, string> = {};
    const mineOf = async (who: string) => (await get(who, '/v1/evaluation/allocations/mine').expect(200)).body as { id: string; round: number }[];
    const value = async (who: string, id: string, total: number) => {
      const d = (await get(who, `/v1/evaluation/allocations/${id}`).expect(200)).body;
      const [a, b] = d.questions as { id: string }[];
      await put(who, `/v1/evaluation/allocations/${id}/marks`, { entries: [{ questionId: a.id, marks: 10 }, { questionId: b.id, marks: total - 10 }] }).expect(200);
      await post(who, `/v1/evaluation/allocations/${id}/submit`).expect(200);
    };

    it('lets the exam controller set up a paper, which examiners and teachers cannot', async () => {
      const grade = (await post('principal', '/v1/grade-scales', { name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
      await put('principal', '/v1/schemes', {
        subjectId: t.subject.id,
        academicYearId: t.section.academicYearId,
        name: 'Theory',
        credits: 4,
        gradeScaleId: grade,
        passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
        components: [{ code: 'IA', name: 'Internal', kind: 'internal', weight: 40 }, { code: 'SEE', name: 'Semester end', kind: 'external', weight: 60 }],
      }).expect(200);
      ids.session = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
      ids.paper = (await post('principal', `/v1/exam-sessions/${ids.session}/papers`, { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body.id;
      await put('exr', `${E()}/config`, { perExaminerCap: 5, secondSharePercent: 100, thresholdMarks: 5 }).expect(403);
      await put('teacher', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 60 }] }).expect(403);
      await put('ctrl', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 20 }, { no: '2', maxMarks: 40 }] }).expect(200);
      await put('ctrl', `${E()}/config`, { perExaminerCap: 5, secondSharePercent: 100, thresholdMarks: 5, maskHeaderPercent: 30 }).expect(200);
    });

    it('refuses scans that give the student away and blacks out the first page header', async () => {
      const up = (name: string, buf: Buffer, ctype = 'image/png') => http().post(`${E()}/scripts`).set(au('ctrl')).field('rollNo', 'R1').attach('files', buf, { filename: name, contentType: ctype });
      await up('R1.png', png(4, 10)).expect(400);
      await up('student-a.png', png(4, 10)).expect(400);
      await up('scan.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg').expect(400);
      const ok = (await up('scan.png', png(4, 10)).expect(201)).body;
      expect(ok.headerMasked).toBe(true);
      const ov = (await get('ctrl', E()).expect(200)).body;
      ids.script = ov.scripts[0].id;
      const page = await get('ctrl', `${E()}/scripts/${ids.script}/pages/0`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      const r = idatRows(page.body as Buffer, 4, 10);
      expect(r.types).not.toContain('tEXt');
      expect([...r.row(0)].every((v) => v === 0)).toBe(true);
      expect([...r.row(9)].every((v) => v === 255)).toBe(true);
      await get('teacher', `${E()}/scripts/${ids.script}/pages/0`).expect(403);
    });

    it('stores a first, second and third valuation with their own annotations', async () => {
      await post('principal', `${E()}/allocate`, { examinerIds: [ids.exr] }).expect(200);
      alloc.r1 = (await mineOf('exr'))[0].id;
      const base = `/v1/evaluation/allocations/${alloc.r1}/annotations`;
      await post('exr', base, { pageIndex: 0, kind: 'tick', x: 1.4, y: 0.2 }).expect(400);
      await post('exr', base, { pageIndex: 5, kind: 'tick', x: 0.4, y: 0.2 }).expect(400);
      await post('exr', base, { pageIndex: 0, kind: 'comment', x: 0.4, y: 0.2 }).expect(400);
      await post('exr', base, { pageIndex: 0, kind: 'highlight', x: 0.8, y: 0.2, w: 0.4, h: 0.1 }).expect(400);
      await post('teacher', base, { pageIndex: 0, kind: 'tick', x: 0.4, y: 0.2 }).expect(404);
      const tick = (await post('exr', base, { pageIndex: 0, kind: 'tick', x: 0.4, y: 0.2 }).expect(201)).body;
      await post('exr', base, { pageIndex: 0, kind: 'highlight', x: 0.1, y: 0.3, w: 0.5, h: 0.1 }).expect(201);
      await post('exr', base, { pageIndex: 0, kind: 'comment', x: 0.2, y: 0.6, text: 'Good working' }).expect(201);
      await del('exr', `${base}/${tick.id}`).expect(200);
      expect(Number(tick.x)).toBeCloseTo(0.4);
      // Freehand ink: strokes of page-fraction points, bounded and checked.
      const pen = [[[0.1, 0.1], [0.2, 0.15], [0.30001234, 0.1]]];
      const ink = (await post('exr', base, { pageIndex: 0, kind: 'ink', strokes: pen }).expect(201)).body;
      expect(ink.strokes[0][2]).toEqual([0.3, 0.1]);
      expect(Number(ink.x)).toBeCloseTo(0.1);
      expect(Number(ink.w)).toBeCloseTo(0.2);
      await post('exr', base, { pageIndex: 0, kind: 'ink' }).expect(400);
      await post('exr', base, { pageIndex: 0, kind: 'ink', strokes: [[[0.1, 0.1]]] }).expect(400);
      await post('exr', base, { pageIndex: 0, kind: 'ink', strokes: [[[0.1, 0.1], [1.4, 0.2]]] }).expect(400);
      expect((await get('exr', base).expect(200)).body.mine.find((m: { kind: string }) => m.kind === 'ink').strokes).toHaveLength(1);
      await del('exr', `${base}/${ink.id}`).expect(200);

      // AI marking help: a draft only. Nothing enters the valuation until the examiner accepts or edits it.
      const q1 = ((await get('exr', `/v1/evaluation/allocations/${alloc.r1}`).expect(200)).body.questions as { id: string }[])[0];
      const ask = (who: string, body: object) => post(who, `/v1/grading-assist/evaluation/${alloc.r1}/suggest`, body);
      const asked = { questionId: q1.id, question: 'Define depreciation.', answerText: 'Depreciation is the fall in the value of an asset over its life.' };
      await ask('teacher', asked).expect(404);
      await ask('exr', { ...asked, rubric: [{ criterion: 'Definition', marks: 15 }, { criterion: 'Example', marks: 10 }] }).expect(400);
      const draft = (await ask('exr', asked).expect(200)).body;
      expect(draft).toMatchObject({ preview: true, status: 'draft', finalMarks: null });
      const entered = async () => (await owner.query('select marks::float as m from eval_marks where allocation_id = $1 and question_id = $2', [alloc.r1, q1.id])).rows;
      expect(await entered()).toEqual([]);
      await put('teacher', `/v1/grading-assist/suggestions/${draft.id}/decision`, { action: 'accept' }).expect(404);
      await put('exr', `/v1/grading-assist/suggestions/${draft.id}/decision`, { action: 'edit' }).expect(400);
      await put('exr', `/v1/grading-assist/suggestions/${draft.id}/decision`, { action: 'edit', marks: 99 }).expect(400);
      expect((await put('exr', `/v1/grading-assist/suggestions/${draft.id}/decision`, { action: 'edit', marks: 7.5 }).expect(200)).body).toMatchObject({ status: 'edited', finalMarks: 7.5 });
      expect(await entered()).toEqual([{ m: 7.5 }]);
      await put('exr', `/v1/grading-assist/suggestions/${draft.id}/decision`, { action: 'accept' }).expect(409);
      const again = (await ask('exr', asked).expect(200)).body;
      await put('exr', `/v1/grading-assist/suggestions/${again.id}/decision`, { action: 'reject' }).expect(200);
      expect(await entered()).toEqual([{ m: 7.5 }]);
      expect((await get('exr', `/v1/grading-assist/suggestions?allocationId=${alloc.r1}`).expect(200)).body).toHaveLength(2);

      await value('exr', alloc.r1, 50);
      await post('exr', base, { pageIndex: 0, kind: 'cross', x: 0.4, y: 0.9 }).expect(409);

      await post('principal', `${E()}/second-valuation`, { examinerIds: [t.teacher.id] }).expect(200);
      alloc.r2 = (await mineOf('teacher')).find((a) => a.round === 2)!.id;
      await post('teacher', `/v1/evaluation/allocations/${alloc.r2}/annotations`, { pageIndex: 0, kind: 'cross', x: 0.5, y: 0.5 }).expect(201);
      // A second valuer sees none of the first valuer's marks.
      const second = (await get('teacher', `/v1/evaluation/allocations/${alloc.r2}/annotations`).expect(200)).body;
      expect(second.mine).toHaveLength(1);
      expect(second.earlier).toEqual([]);
      await value('teacher', alloc.r2, 30);

      await post('principal', `${E()}/allocate`, { examinerIds: [t.teacher2.id] }).expect(200);
      alloc.r3 = (await mineOf('teacher2')).find((a) => a.round === 3)!.id;
      const third = (await get('teacher2', `/v1/evaluation/allocations/${alloc.r3}/annotations`).expect(200)).body;
      expect(third.mine).toEqual([]);
      expect(third.earlier.map((a: { round: number }) => a.round).sort()).toEqual([1, 1, 2]);
      expect(JSON.stringify(third.earlier)).not.toContain('Ex Aminer');
      // Read only: the third valuer cannot delete the earlier marks.
      await del('teacher2', `/v1/evaluation/allocations/${alloc.r3}/annotations/${third.earlier[0].id}`).expect(404);
    });

    it('shows every round to the exam cell, but not to teachers', async () => {
      const all = (await get('ctrl', `${E()}/scripts/${ids.script}/annotations`).expect(200)).body;
      expect(all.annotations).toHaveLength(3);
      expect(all.annotations.some((a: { examinerName: string }) => a.examinerName === 'Ex Aminer')).toBe(true);
      await get('teacher', `${E()}/scripts/${ids.script}/annotations`).expect(403);
      await get('outsider', `${E()}/scripts/${ids.script}/annotations`).expect(404);
    });
  });

  describe('role permissions', () => {
    it('gives the quality officer OBE, surveys and academic audit but not the exam cell', async () => {
      await get('iqac', `/v1/obe/programs/${t.program.id}/config`).expect(200);
      await get('iqac', '/v1/surveys').expect(200);
      await get('iqac', '/v1/academic-audit/templates').expect(200);
      await put('iqac', `/v1/evaluation/papers/${ids.paper}/config`, { perExaminerCap: 5, secondSharePercent: 0, thresholdMarks: 5 }).expect(403);
      await get('ctrl', `/v1/obe/programs/${t.program.id}/config`).expect(403);
    });
  });

  describe('delegated approvals', () => {
    let requestId: string;
    it('lets nobody but the approver decide, then a delegate within the dates', async () => {
      await post('principal', '/v1/workflows/definitions', { requestType: 'deleg', name: 'Delegated', steps: [{ name: 'Accounts', approver: { kind: 'role', role: 'accountant' } }] }).expect(201);
      requestId = (await post('teacher', '/v1/workflows/requests', { requestType: 'deleg', title: 'Buy chairs' }).expect(201)).body.id;
      await post('teacher2', `/v1/workflows/requests/${requestId}/decide`, { decision: 'approve' }).expect(403);
      expect(((await get('teacher2', '/v1/workflows/requests/inbox').expect(200)).body as unknown[]).length).toBe(0);

      await post('acc', '/v1/delegations', { delegateId: ids.acc, startsOn: '2026-10-30', endsOn: '2026-11-05' }).expect(400);
      await post('acc', '/v1/delegations', { delegateId: t.teacher2.id, startsOn: '2026-11-05', endsOn: '2026-10-30' }).expect(400);
      await post('acc', '/v1/delegations', { delegateId: t.studentUser.id, startsOn: '2026-10-30', endsOn: '2026-11-05' }).expect(409);
      // Dates in the past: not in force today (1 Nov).
      const past = (await post('acc', '/v1/delegations', { delegateId: t.teacher2.id, startsOn: '2026-10-01', endsOn: '2026-10-10' }).expect(201)).body;
      await post('teacher2', `/v1/workflows/requests/${requestId}/decide`, { decision: 'approve' }).expect(403);
      await post('acc', `/v1/delegations/${past.id}/revoke`).expect(200);
      await post('acc', `/v1/delegations/${past.id}/revoke`).expect(409);

      const d = (await post('acc', '/v1/delegations', { delegateId: t.teacher2.id, startsOn: '2026-10-30', endsOn: '2026-11-05', reason: 'Away' }).expect(201)).body;
      ids.delegation = d.id;
      expect(((await get('teacher2', '/v1/workflows/requests/inbox').expect(200)).body as { id: string }[]).map((r) => r.id)).toContain(requestId);
      expect((await get('teacher2', `/v1/workflows/requests/${requestId}`).expect(200)).body.canDecide).toBe(true);
      // The person who asked cannot be approved by the delegate for their own request.
      const res = await post('teacher2', `/v1/workflows/requests/${requestId}/decide`, { decision: 'approve' }).expect(200);
      expect(res.body.status).toBe('approved');
      const log = await q<{ data: { onBehalfOf?: string } }>(`select data from audit_log where tenant_id = $1 and action = 'workflow.approved' and subject_id = $2`, [t.tenantId, requestId]);
      expect(log[0].data.onBehalfOf).toBe(ids.acc);
      expect(await q(`select id from audit_log where tenant_id = $1 and action = 'delegation.created'`, [t.tenantId])).toHaveLength(2);
    });

    it('can be revoked, after which the delegate loses the right; others cannot revoke it', async () => {
      const second = (await post('teacher', '/v1/workflows/requests', { requestType: 'deleg', title: 'Buy desks' }).expect(201)).body.id;
      await post('teacher', `/v1/delegations/${ids.delegation}/revoke`).expect(404);
      expect(((await get('teacher2', '/v1/delegations').expect(200)).body as unknown[]).length).toBeGreaterThan(0);
      await post('acc', `/v1/delegations/${ids.delegation}/revoke`).expect(200);
      await post('teacher2', `/v1/workflows/requests/${second}/decide`, { decision: 'approve' }).expect(403);
      await post('acc', `/v1/workflows/requests/${second}/decide`, { decision: 'approve' }).expect(200);
    });

    it('delegates leave approvals from HR', async () => {
      const types = (await get('teacher', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string }[];
      const lop = types.find((x) => x.code === 'LOP')!.id;
      const leave = (await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: lop, fromDate: '2026-11-10', toDate: '2026-11-10', reason: 'Personal' }).expect(201)).body.id;
      await post('teacher2', `/v1/hr/leave/requests/${leave}/approve`, {}).expect(403);
      const d = (await post('hr', '/v1/delegations', { delegateId: t.teacher2.id, scope: 'leave', startsOn: '2026-10-31', endsOn: '2026-11-03' }).expect(201)).body;
      // A workflows-only delegation would not do; this one is for leave.
      expect((await post('teacher2', `/v1/hr/leave/requests/${leave}/approve`, {}).expect(200)).body.status).toBe('approved');
      await post('hr', `/v1/delegations/${d.id}/revoke`).expect(200);
    });
  });

  describe('DPDP data-principal requests', () => {
    it('gives a student, guardian and staff member a JSON and PDF copy of their data', async () => {
      const st = (await get('student', '/v1/dpdp/me/export').expect(200)).body;
      expect(st.student).toMatchObject({ rollNo: 'R3' });
      expect(st.profile.email).toBe(t.studentUser.email);
      const pa = (await get('parentA', '/v1/dpdp/me/export').expect(200)).body;
      expect(pa.wards).toHaveLength(1);
      expect(pa.wards[0].fullName).toBe('Student A');
      const staff = (await get('teacher', '/v1/dpdp/me/export').expect(200)).body;
      expect(staff.leave.length).toBeGreaterThan(0);
      const pdf = await get('parentA', '/v1/dpdp/me/export.pdf').buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      const mine = (await get('parentA', '/v1/dpdp/me/requests').expect(200)).body as { kind: string; status: string }[];
      expect(mine.filter((r) => r.kind === 'export' && r.status === 'completed')).toHaveLength(2);
      await get('outsider', '/v1/dpdp/me/export').expect(200); // each person gets only their own data
    });

    it('names the grievance officer', async () => {
      const r = (await get('student', '/v1/dpdp/grievance-officer').expect(200)).body;
      expect(r.officer.name).toBe('Gita Grievance');
    });

    it('works the correction queue', async () => {
      await post('parentB', '/v1/dpdp/me/requests', { kind: 'correction', correction: { field: 'email', value: 'not-an-email' } }).expect(400);
      await post('parentB', '/v1/dpdp/me/requests', { kind: 'correction', correction: { field: 'passwordHash', value: 'x' } }).expect(400);
      const r = (await post('parentB', '/v1/dpdp/me/requests', { kind: 'correction', details: 'Wrong phone', correction: { field: 'phone', value: '+91 98765 11111' } }).expect(201)).body;
      await post('parentB', '/v1/dpdp/me/requests', { kind: 'correction', correction: { field: 'phone', value: '+91 98765 22222' } }).expect(409);
      await get('parentB', '/v1/dpdp/requests').expect(403);
      await post('parentB', `/v1/dpdp/requests/${r.id}/process`, { decision: 'approve' }).expect(403);
      const queue = (await get('principal', '/v1/dpdp/requests?status=pending').expect(200)).body as { id: string; person: { fullName: string } }[];
      expect(queue.find((x) => x.id === r.id)?.person.fullName).toBe(t.guardian2.fullName);
      await post('principal', `/v1/dpdp/requests/${r.id}/process`, { decision: 'approve', note: 'Updated' }).expect(200);
      expect((await q<{ phone: string }>('select phone from users where id = $1', [t.guardian2.id]))[0].phone).toBe('+91 98765 11111');
      await post('principal', `/v1/dpdp/requests/${r.id}/process`, { decision: 'approve' }).expect(409);
      const r2 = (await post('parentB', '/v1/dpdp/me/requests', { kind: 'correction', details: 'Change my address on file please' }).expect(201)).body;
      await post('principal', `/v1/dpdp/requests/${r2.id}/process`, { decision: 'reject' }).expect(400);
      expect((await post('principal', `/v1/dpdp/requests/${r2.id}/process`, { decision: 'reject', note: 'Address is not held here' }).expect(200)).body.status).toBe('rejected');
    });

    it('blocks erasure when retention applies and anonymises otherwise', async () => {
      const blocked = (await post('student', '/v1/dpdp/me/requests', { kind: 'erasure', details: 'Please delete me' }).expect(201)).body;
      expect(blocked.retentionNotice.length).toBeGreaterThan(0);
      const res = (await post('principal', `/v1/dpdp/requests/${blocked.id}/process`, { decision: 'approve' }).expect(200)).body;
      expect(res.status).toBe('blocked');
      expect(res.retentionReasons[0]).toMatch(/enrolled/);
      expect((await q<{ full_name: string }>('select full_name from users where id = $1', [t.studentUser.id]))[0].full_name).not.toBe('Erased user');

      await post('leaver', '/v1/dpdp/me/requests', { kind: 'erasure' }).expect(201);
      const pending = (await get('principal', '/v1/dpdp/requests?status=pending').expect(200)).body as { id: string; userId: string }[];
      const mine = pending.find((x) => x.userId === ids.leaver)!;
      expect((await post('principal', `/v1/dpdp/requests/${mine.id}/process`, { decision: 'approve' }).expect(200)).body.status).toBe('completed');
      const u = (await q<{ full_name: string; email: string | null; status: string }>('select full_name, email, status from users where id = $1', [ids.leaver]))[0];
      expect(u).toMatchObject({ full_name: 'Erased user', email: null, status: 'disabled' });
      await http().post('/v1/auth/login').send({ tenant: t.slug, login: 'leelever@rd.in', password: 'pw' }).expect(401);
    });

    it('does not let an administrator process their own request', async () => {
      const r = (await post('principal', '/v1/dpdp/me/requests', { kind: 'correction', details: 'Please fix my name spelling' }).expect(201)).body;
      await post('principal', `/v1/dpdp/requests/${r.id}/process`, { decision: 'approve' }).expect(409);
    });
  });

  describe('alumni portal', () => {
    it('lets a linked alumnus manage their own profile, giving and volunteering', async () => {
      const [a] = await q(`insert into alumni_profiles (tenant_id, full_name, graduation_year, program, email) values ($1,'Alum Nus',2020,'BCom','alum@x.in') returning id`, [t.tenantId]);
      const [b] = await q(`insert into alumni_profiles (tenant_id, full_name, graduation_year, program) values ($1,'Alum Two',2019,'BCom') returning id`, [t.tenantId]);
      await get('alum', '/v1/alumni-portal/me').expect(404);
      await post('teacher', '/v1/alumni-portal/link', { alumniId: a.id, userId: ids.alum }).expect(403);
      await post('place', '/v1/alumni-portal/link', { alumniId: a.id, userId: ids.alum }).expect(200);
      await post('place', '/v1/alumni-portal/link', { alumniId: a.id, userId: ids.alum2 }).expect(200);
      await post('place', '/v1/alumni-portal/link', { alumniId: b.id, userId: ids.alum2 }).expect(409);
      // alum2 now shares profile a; unlink by pointing the second profile at them.
      await q('update alumni_profiles set user_id = null where id = $1', [a.id]);
      await post('place', '/v1/alumni-portal/link', { alumniId: a.id, userId: ids.alum }).expect(200);
      await post('place', '/v1/alumni-portal/link', { alumniId: b.id, userId: ids.alum2 }).expect(200);
      ids.profA = a.id;

      expect((await get('alum', '/v1/alumni-portal/me').expect(200)).body.fullName).toBe('Alum Nus');
      expect((await put('alum', '/v1/alumni-portal/me', { employer: 'Acme', directoryVisible: true }).expect(200)).body).toMatchObject({ employer: 'Acme', directoryVisible: true });
      await get('student', '/v1/alumni-portal/me').expect(403);
      await get('teacher', '/v1/alumni-portal/giving').expect(403);

      const camp = (await post('principal', '/v1/alumni/campaigns', { name: 'Library fund', goalPaise: 10_000_000 }).expect(201)).body;
      expect((await get('alum', '/v1/alumni-portal/campaigns').expect(200)).body).toHaveLength(1);
      await post('alum', `/v1/alumni-portal/campaigns/${camp.id}/pledges`, { amountPaise: 500_000 }).expect(201);
      const don = (await post('principal', `/v1/alumni/campaigns/${camp.id}/donations`, { alumniId: a.id, amountPaise: 250_000, mode: 'upi', receivedOn: '2026-11-01' }).expect(201)).body;
      const giving = (await get('alum', '/v1/alumni-portal/giving').expect(200)).body;
      expect(giving.pledges).toHaveLength(1);
      expect(giving.donations).toHaveLength(1);
      expect(giving.totalGivenPaise).toBe(250_000);
      expect((await get('alum2', '/v1/alumni-portal/giving').expect(200)).body.donations).toHaveLength(0);
      await get('alum', `/v1/alumni-portal/donations/${don.id}/receipt`).expect(200);
      await get('alum2', `/v1/alumni-portal/donations/${don.id}/receipt`).expect(404);

      const opp = (await post('principal', '/v1/alumni/volunteering', { title: 'Career talk', slots: 1 }).expect(201)).body;
      await post('alum', `/v1/alumni-portal/volunteering/${opp.id}/signup`, {}).expect(201);
      await post('alum', `/v1/alumni-portal/volunteering/${opp.id}/signup`, {}).expect(409);
      await post('alum2', `/v1/alumni-portal/volunteering/${opp.id}/signup`, {}).expect(409);
      expect((await get('alum', '/v1/alumni-portal/volunteering').expect(200)).body[0]).toMatchObject({ signedUp: true, taken: 1 });
      await del('alum', `/v1/alumni-portal/volunteering/${opp.id}/signup`).expect(204);
    });

    it('exports the alumnus data including donations', async () => {
      const b = (await get('alum', '/v1/dpdp/me/export').expect(200)).body;
      expect(b.alumni.donations).toHaveLength(1);
      expect(b.profile.roles).toEqual(['alumni']);
    });
  });
});
