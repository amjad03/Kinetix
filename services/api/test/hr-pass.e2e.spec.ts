import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../src/common/secret-box.js';
import { rotateAll } from '../src/db/rotate-secrets.js';
import * as depth from '../src/db/schema-depth.js';
import * as hrpay from '../src/db/schema-hrpay.js';
import * as s from '../src/db/schema.js';
import { resealStaffIds } from '../src/hr/staff-ids.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

/**
 * The HR and payroll production pass: staff PAN/UAN encrypted at rest (and rotated), investment declarations and proofs
 * feeding TDS, reimbursements paid through payroll as non-wages, the 7th CPC pay matrix (placement, increment,
 * promotion), the worked full and final settlement, bank-specific salary files, the public careers page, vacation
 * leave and the UGC cadre check, with other roles and another institution refused. Figures are worked by hand.
 */
describe('HR and payroll pass', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 3 November 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-11-03T04:30:00Z'));
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
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const profile = (code: string, over: object = {}) => ({ employeeCode: code, employmentType: 'permanent', dateOfJoining: '2020-06-01', status: 'active', taxRegime: 'new', ...over });

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@hp.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const acc = await addUser('Anu Accounts', 'accountant');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      accountant: await login(t.slug, acc.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, teacher: t.teacher.id, teacher2: t.teacher2.id });
    await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { gender: 'female', pan: 'ABCDE1234F', uan: '100200300400' })).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher2}`, profile('T002', { dateOfJoining: '2015-07-01', gender: 'male', esiEnabled: true })).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher}/bank`, { accountHolder: 'Teacher One', bankName: 'State Bank of India', ifsc: 'SBIN0001234', accountNumber: '10000000001' }).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher2}/bank`, { accountHolder: 'Teacher Two', bankName: 'HDFC Bank', ifsc: 'HDFC0000123', accountNumber: '50100000002' }).expect(200);
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('keeps staff PAN and UAN encrypted at rest, decrypts them for HR and exports, and rotates them', async () => {
    const [row] = await db.select().from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher));
    expect(row.panEnc).toMatch(/^v1\./);
    expect(row.panEnc).not.toContain('ABCDE');
    expect(row.uanEnc).toMatch(/^v1\./);
    expect([row.panLast4, row.uanLast4]).toEqual(['234F', '0400']);
    expect((await get('hr', `/v1/hr/staff/${ids.teacher}`).expect(200)).body).toMatchObject({ pan: 'ABCDE1234F', uan: '100200300400' });
    // The binding: the same ciphertext copied onto another staff member does not decrypt there.
    await db.update(s.staffProfiles).set({ panEnc: row.panEnc }).where(eq(s.staffProfiles.userId, ids.teacher2));
    expect((await get('hr', `/v1/hr/staff/${ids.teacher2}`).expect(200)).body.pan).toBe('[cannot be decrypted]');

    // A value kept in clear before migration 0198 stays readable and is sealed by the migrate step.
    await db.update(s.staffProfiles).set({ panEnc: 'PQRSX6789K', panLast4: null }).where(eq(s.staffProfiles.userId, ids.teacher2));
    expect((await get('hr', `/v1/hr/staff/${ids.teacher2}`).expect(200)).body.pan).toBe('PQRSX6789K');
    expect((await resealStaffIds(drizzle(owner))).rotated).toBeGreaterThanOrEqual(1);
    const [sealed] = await db.select().from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher2));
    expect(sealed.panEnc).toMatch(/^v1\./);
    expect(sealed.panLast4).toBe('789K');

    // Key rotation moves both to the new key; the API on the new key reads them.
    const k1 = Buffer.from(env.SECRETS_ENCRYPTION_KEY, 'base64');
    const k2 = Buffer.alloc(32, 11);
    const out = await rotateAll(drizzle(owner, { schema: s }), new SecretBox({ 1: k1, 2: k2 }, 2));
    expect(out.staff_identifiers.rotated).toBeGreaterThanOrEqual(2);
    const [moved] = await db.select().from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher));
    expect(moved.panEnc).toMatch(/^v2\./);
    const saved = { v: process.env.SECRETS_ENCRYPTION_KEY_VERSION, old: process.env.SECRETS_ENCRYPTION_OLD_KEYS, key: process.env.SECRETS_ENCRYPTION_KEY };
    Object.assign(process.env, { SECRETS_ENCRYPTION_KEY: k2.toString('base64'), SECRETS_ENCRYPTION_KEY_VERSION: '2', SECRETS_ENCRYPTION_OLD_KEYS: `1:${k1.toString('base64')}` });
    try {
      expect((await get('hr', `/v1/hr/staff/${ids.teacher}`).expect(200)).body).toMatchObject({ pan: 'ABCDE1234F', uan: '100200300400' });
      expect((await get('hr', `/v1/hr/staff/${ids.teacher2}`).expect(200)).body.pan).toBe('PQRSX6789K');
      expect((await rotateAll(drizzle(owner, { schema: s }), new SecretBox({ 1: k1, 2: k2 }, 2))).staff_identifiers.rotated).toBe(0);
    } finally {
      Object.assign(process.env, { SECRETS_ENCRYPTION_KEY: saved.key });
      if (saved.v === undefined) delete process.env.SECRETS_ENCRYPTION_KEY_VERSION;
      if (saved.old === undefined) delete process.env.SECRETS_ENCRYPTION_OLD_KEYS;
    }
    // Back on key 1 for the rest of the file: HR records them (and the bank accounts the rotation also moved) again.
    await put('hr', `/v1/hr/staff/${ids.teacher}/bank`, { accountHolder: 'Teacher One', bankName: 'State Bank of India', ifsc: 'SBIN0001234', accountNumber: '10000000001' }).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher2}/bank`, { accountHolder: 'Teacher Two', bankName: 'HDFC Bank', ifsc: 'HDFC0000123', accountNumber: '50100000002' }).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { gender: 'female', pan: 'ABCDE1234F', uan: '100200300400', expectedVersion: (await get('hr', `/v1/hr/staff/${ids.teacher}`)).body.version })).expect(200);
    await put('hr', `/v1/hr/staff/${ids.teacher2}`, profile('T002', { dateOfJoining: '2015-07-01', gender: 'male', esiEnabled: true, pan: 'PQRSX6789K', expectedVersion: (await get('hr', `/v1/hr/staff/${ids.teacher2}`)).body.version })).expect(200);
    expect((await get('teacher', `/v1/hr/staff/${ids.teacher2}`)).status).toBe(403);
  });

  it('places staff on the 7th CPC matrix, gives the annual increment once and fixes pay on promotion', async () => {
    const levels = (await get('accountant', '/v1/payroll/pay-matrix').expect(200)).body as { id: string; level: string; cells: number[] }[];
    const l10 = levels.find((l) => l.level === '10')!;
    const l11 = levels.find((l) => l.level === '11')!;
    // Entry 57,700; each cell 3% more to the nearest ₹100: 59,431 → 59,400; 61,182 → 61,200; 63,036 → 63,000; 64,890 → 64,900.
    expect(l10.cells.slice(0, 6)).toEqual([57_700_00, 59_400_00, 61_200_00, 63_000_00, 64_900_00, 66_800_00]);
    expect(l10.cells).toHaveLength(40);
    expect(l11.cells[0]).toBe(68_900_00);

    await post('principal', '/v1/payroll/components', { code: 'DA', name: 'Dearness allowance', kind: 'earning', pfWage: true, taxable: true, calc: 'percent', percent: 55, baseCode: 'BASIC', sortOrder: 2 }).expect(201);
    await put('accountant', `/v1/payroll/pay-matrix/staff/${ids.teacher}`, { levelId: l10.id, cell: 5, effectiveFrom: '2026-04-01' }).expect(403);
    await put('principal', `/v1/payroll/pay-matrix/staff/${ids.teacher}`, { levelId: l10.id, cell: 5, effectiveFrom: '2026-04-15' }).expect(400);
    const placed = (await put('principal', `/v1/payroll/pay-matrix/staff/${ids.teacher}`, { levelId: l10.id, cell: 5, effectiveFrom: '2026-04-01', hraClass: 'Y', orderNo: 'HR/2026/12' }).expect(200)).body;
    // Basic 64,900; DA 55% → 35,695; HRA for a Y city with DA at or above 50%: 20% of basic → 12,980.
    expect(placed).toMatchObject({ basicPaise: 64_900_00, cell: 5, daPercent: 55, hraPaise: 12_980_00 });
    const st = (await get('accountant', `/v1/payroll/structures/${ids.teacher}`).expect(200)).body.current;
    expect(Object.fromEntries(st.lines.map((l: { code: string; monthlyPaise: number }) => [l.code, l.monthlyPaise]))).toEqual({ BASIC: 64_900_00, DA: 35_695_00, HRA: 12_980_00 });

    // 1 July: joined in 2020, so the placement in April does not hold the increment back. Cell 6 = 66,800.
    const preview = (await post('principal', '/v1/payroll/pay-matrix/increments', { on: '2026-07-01' }).expect(200)).body;
    expect(preview).toMatchObject({ applied: false, due: 1 });
    expect(preview.staff[0]).toMatchObject({ userId: ids.teacher, fromCell: 5, toCell: 6, toBasicPaise: 66_800_00, due: true });
    await post('principal', '/v1/payroll/pay-matrix/increments', { on: '2026-07-15' }).expect(400);
    expect((await post('principal', '/v1/payroll/pay-matrix/increments', { on: '2026-07-01', apply: true }).expect(200)).body.due).toBe(1);
    const again = (await post('principal', '/v1/payroll/pay-matrix/increments', { on: '2026-07-01', apply: true }).expect(200)).body;
    expect(again.due).toBe(0);
    expect(again.staff[0].reason).toBe('Already given');

    // Promotion to Level 11 from October: 66,800 + one notional increment = 68,804 → 68,800; first L11 cell at or above it: 68,900.
    const promo = (await put('principal', `/v1/payroll/pay-matrix/staff/${ids.teacher}`, { levelId: l11.id, effectiveFrom: '2026-10-01', kind: 'promotion', orderNo: 'CAS/2026/4' }).expect(200)).body;
    expect(promo).toMatchObject({ cell: 1, basicPaise: 68_900_00, hraPaise: 13_780_00 });
    const moves = (await get('accountant', `/v1/payroll/pay-matrix/staff/${ids.teacher}/moves`).expect(200)).body;
    expect(moves.map((m: { kind: string; toBasicPaise: number }) => `${m.kind} ${m.toBasicPaise / 100}`)).toEqual(['promotion 68900', 'increment 66800', 'placement 64900']);
    const book = await db.select().from(hrpay.serviceBookEntries).where(eq(hrpay.serviceBookEntries.userId, ids.teacher));
    expect(book.map((b) => b.kind).sort()).toEqual(['increment', 'pay_fixation', 'promotion']);
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, ids.teacher));
    expect(notes.filter((n) => n.kind === 'payslip').length).toBeGreaterThanOrEqual(3);
  });

  it('takes an investment declaration with HRA through approval and proof verification into the TDS figures', async () => {
    const empty = (await get('teacher', '/v1/hr/tax-declarations/me').expect(200)).body;
    expect(empty).toEqual({ fy: 2026, declaration: null });
    const body = {
      fy: 2026,
      regime: 'old',
      rentMonthlyPaise: 25_000_00,
      rentMonths: 12,
      metro: false,
      landlordName: 'K. Ramesh',
      items: [
        { section: '80C', label: 'PPF', declaredPaise: 70_000_00 },
        { section: '80C', label: 'LIC premium', declaredPaise: 50_000_00 },
        { section: '80D', label: 'Family health insurance', declaredPaise: 30_000_00 },
        { section: '80CCD1B', label: 'NPS tier I', declaredPaise: 60_000_00 },
      ],
    };
    await put('teacher', '/v1/hr/tax-declarations/me', { ...body, fy: 2024 }).expect(400);
    let d = (await put('teacher', '/v1/hr/tax-declarations/me', body).expect(200)).body;
    // Salary for HRA (rule 2A) from the October structure: basic 68,900 + DA 37,895 = 1,06,795 × 12 = 12,81,540; HRA 13,780 × 12 = 1,65,360.
    // Exemption = least of 1,65,360; rent 3,00,000 − 10% of 12,81,540 (1,28,154) = 1,71,846; 40% of 12,81,540 = 5,12,616 → 1,65,360.
    // 80D capped at 25,000; 80CCD(1B) at 50,000. Other deductions = 25,000 + 50,000 + 1,65,360 = 2,40,360.
    expect(d.declared).toMatchObject({ section80cPaise: 1_20_000_00, hraExemptPaise: 1_65_360_00, otherDeductionsPaise: 2_40_360_00 });
    // New regime on 1,20,575 × 12 = 14,46,900: less 75,000 = 13,71,900; 20,000 + 40,000 + 15% of 1,71,900 (25,785) = 85,785; cess 4% = 89,216 → 89,220.
    expect(d.estimate).toMatchObject({ grossPaise: 14_46_900_00, newPaise: 89_220_00 });
    // Rent above ₹1 lakh needs the landlord's PAN.
    await post('teacher', '/v1/hr/tax-declarations/me/submit', { fy: 2026 }).expect(400);
    d = (await put('teacher', '/v1/hr/tax-declarations/me', { ...body, landlordPan: 'lmnop4321q', expectedVersion: d.version }).expect(200)).body;
    expect(d.landlordPan).toBe('LMNOP4321Q');
    const [rawDecl] = await db.select().from((await import('../src/db/schema-hr3.js')).taxDeclarations).where(eq((await import('../src/db/schema-hr3.js')).taxDeclarations.id, d.id));
    expect(rawDecl.landlordPanEnc).toMatch(/^v1\./);
    await post('teacher', '/v1/hr/tax-declarations/me/submit', { fy: 2026 }).expect(200);
    await put('teacher', '/v1/hr/tax-declarations/me', body).expect(409);

    await get('teacher', '/v1/hr/tax-declarations').expect(403);
    await post('teacher', `/v1/hr/tax-declarations/${d.id}/approve`, {}).expect(403);
    const list = (await get('accountant', '/v1/hr/tax-declarations?status=submitted').expect(200)).body;
    expect(list).toMatchObject({ fy: 2026, total: 1, counts: { submitted: 1 } });
    expect(list.rows[0]).toMatchObject({ userId: ids.teacher, declaredPaise: 2_10_000_00 });
    await post('hr', `/v1/hr/tax-declarations/${d.id}/approve`, { expectedVersion: d.version - 1 }).expect(409);
    d = (await post('hr', `/v1/hr/tax-declarations/${d.id}/approve`, { note: 'Declared figures used for TDS' }).expect(200)).body;
    expect(d.status).toBe('approved');
    let [prof] = await db.select().from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher));
    expect([prof.taxRegime, prof.tax80cPaise, prof.taxOtherDeductionsPaise]).toEqual(['old', 1_20_000_00, 2_40_360_00]);

    // Proofs: PPF backs 60,000 of 70,000; LIC and health insurance in full; no NPS proof.
    const item = (label: string) => d.items.find((i: { label: string }) => i.label === label).id as string;
    await post('teacher', '/v1/hr/tax-declarations/me/submit-proofs', { fy: 2026 }).expect(400);
    await http().post(`/v1/hr/tax-declarations/items/${item('PPF')}/proof`).set(auth('teacher')).attach('file', Buffer.from('not a pdf'), 'x.txt').expect(400);
    await http().post(`/v1/hr/tax-declarations/items/${item('PPF')}/proof`).set(auth('teacher2')).attach('file', PDF, 'ppf.pdf').expect(404);
    for (const l of ['PPF', 'LIC premium', 'Family health insurance']) await http().post(`/v1/hr/tax-declarations/items/${item(l)}/proof`).set(auth('teacher')).attach('file', PDF, `${l}.pdf`).expect(201);
    await post('teacher', '/v1/hr/tax-declarations/me/submit-proofs', { fy: 2026 }).expect(200);
    await get('teacher2', `/v1/hr/tax-declarations/items/${item('PPF')}/proof`).expect(404);
    expect((await get('accountant', `/v1/hr/tax-declarations/items/${item('PPF')}/proof`).expect(200)).headers['content-type']).toBe('application/pdf');
    d = (await get('accountant', `/v1/hr/tax-declarations/${d.id}`).expect(200)).body;
    await post('accountant', `/v1/hr/tax-declarations/${d.id}/verify`, { items: [{ id: item('PPF'), accepted: true, acceptedPaise: 80_000_00 }] }).expect(400);
    d = (await post('accountant', `/v1/hr/tax-declarations/${d.id}/verify`, { expectedVersion: d.version, items: [{ id: item('PPF'), accepted: true, acceptedPaise: 60_000_00, note: 'Passbook shows ₹60,000' }, { id: item('LIC premium'), accepted: true }, { id: item('Family health insurance'), accepted: true }] }).expect(200)).body;
    // Accepted: 80C 60,000 + 50,000 = 1,10,000; other = 25,000 (80D cap) + 0 (NPS not proved) + HRA 1,65,360 = 1,90,360.
    expect(d).toMatchObject({ status: 'verified', accepted: { section80cPaise: 1_10_000_00, otherDeductionsPaise: 1_90_360_00 }, applied: { basis: 'verified' } });
    [prof] = await db.select().from(s.staffProfiles).where(eq(s.staffProfiles.userId, ids.teacher));
    expect([prof.tax80cPaise, prof.taxOtherDeductionsPaise]).toEqual([1_10_000_00, 1_90_360_00]);
    const trail = await db.select().from(s.auditLog).where(eq(s.auditLog.subjectId, ids.teacher));
    expect(trail.filter((a) => a.action === 'hr.tax_figures_applied')).toHaveLength(2);
    // Another institution sees none of it.
    expect((await get('outsider', '/v1/hr/tax-declarations').expect(200)).body.total).toBe(0);
    await get('outsider', `/v1/hr/tax-declarations/${d.id}`).expect(404);
    expect((await get('accountant', '/v1/records/tax-declarations?f.fy=2026').expect(200)).body.total).toBe(1);
  });

  it('pays reimbursements on the payslip outside ESI wages, then files ECR, 24Q and the bank files', async () => {
    const c = (await get('accountant', '/v1/payroll/components').expect(200)).body as { id: string; code: string }[];
    const comp = (code: string) => c.find((x) => x.code === code)!.id;
    await put('accountant', `/v1/payroll/structures/${ids.teacher2}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: comp('BASIC'), monthlyPaise: 15_000_00 }, { componentId: comp('HRA'), monthlyPaise: 3_000_00 }] }).expect(200);

    await post('teacher2', '/v1/hr/reimbursements', { category: 'travel', spentOn: '2026-11-10', amountPaise: 2_400_00, description: 'Bus to the university valuation camp' }).expect(400);
    const travel = (await post('teacher2', '/v1/hr/reimbursements', { category: 'travel', spentOn: '2026-10-28', amountPaise: 2_400_00, description: 'Bus to the university valuation camp' }).expect(201)).body;
    const medical = (await post('teacher2', '/v1/hr/reimbursements', { category: 'medical', spentOn: '2026-10-30', amountPaise: 1_500_00, description: 'Clinic bill' }).expect(201)).body;
    expect([travel.claimNo, medical.claimNo]).toEqual(['RB/2026-27/0001', 'RB/2026-27/0002']);
    expect(travel).toMatchObject({ status: 'submitted', taxFree: true });
    await http().post(`/v1/hr/reimbursements/${travel.id}/bill`).set(auth('teacher2')).attach('file', PDF, 'ticket.pdf').expect(201);
    await get('teacher', `/v1/hr/reimbursements/${travel.id}`).expect(404);
    await get('outsider', `/v1/hr/reimbursements/${travel.id}`).expect(404);
    await post('teacher', `/v1/hr/reimbursements/${travel.id}/decide`, { approve: true }).expect(403);
    await post('hr', `/v1/hr/reimbursements/${travel.id}/decide`, { approve: false, note: '' }).expect(400);
    await post('hr', `/v1/hr/reimbursements/${travel.id}/decide`, { approve: true, approvedPaise: 3_000_00 }).expect(400);
    await post('hr', `/v1/hr/reimbursements/${travel.id}/decide`, { approve: true, payMonth: '2026-11' }).expect(200);
    await post('hr', `/v1/hr/reimbursements/${medical.id}/decide`, { approve: true, payMonth: '2026-11' }).expect(200);
    await post('hr', `/v1/hr/reimbursements/${medical.id}/decide`, { approve: true }).expect(409);

    let run = (await post('accountant', '/v1/payroll/runs', { month: '2026-11' }).expect(201)).body;
    const slip = run.payslips.find((p: { user: { id: string } }) => p.user.id === ids.teacher2);
    // Earnings 15,000 + 3,000 + 2,400 + 1,500 = 21,900. ESI wages leave out the bills: 18,000 ≤ 21,000, so ESI applies:
    // employee 0.75% = 135, employer 3.25% = 585. PF 12% of 15,000 = 1,800. No PT under 25,000. Net 21,900 − 1,935 = 19,965.
    expect(slip.grossPaise).toBe(21_900_00);
    expect(slip.earnings.filter((e: { code: string }) => e.code === 'REIMB').map((e: { amountPaise: number }) => e.amountPaise).sort()).toEqual([1_500_00, 2_400_00]);
    expect(slip.deductions).toEqual([{ code: 'PF', name: 'Provident Fund', amountPaise: 1_800_00 }, { code: 'ESI', name: 'ESI', amountPaise: 135_00 }]);
    expect(slip.employer.esiPaise).toBe(585_00);
    expect(slip.netPaise).toBe(19_965_00);
    // Taxable salary counts the medical bill but not the travel: 18,000 + 1,500.
    const [stored] = await db.select().from(s.payslips).where(eq(s.payslips.id, slip.id));
    expect(stored.taxableGrossPaise).toBe(19_500_00);
    expect(Object.keys(stored.data as object)).not.toContain('pan');
    expect(Object.keys(stored.data as object)).not.toContain('uan');

    run = (await post('accountant', `/v1/payroll/runs/${run.id}/verify`, { expectedVersion: run.version }).expect(200)).body;
    run = (await post('principal', `/v1/payroll/runs/${run.id}/approve`, { expectedVersion: run.version }).expect(200)).body;
    const ecr = (await get('accountant', `/v1/payroll/runs/${run.id}/ecr.txt`).expect(200)).text;
    expect(ecr).toContain('100200300400#~#');
    run = (await post('principal', `/v1/payroll/runs/${run.id}/lock`, { expectedVersion: run.version }).expect(200)).body;
    const q24 = (await get('accountant', '/v1/payroll/24q.csv?fy=2026&quarter=3&annexure=1').expect(200)).text;
    expect(q24).toContain('ABCDE1234F');
    expect(q24).toContain('PQRSX6789K');
    expect((await get('accountant', `/v1/hr/reimbursements/${travel.id}`).expect(200)).body.status).toBe('paid');

    // Bank files: an SBI account goes as an SBI transfer, HDFC as NEFT; HDFC's own file the other way round.
    await get('accountant', `/v1/payroll/runs/${run.id}/bank-file?format=sbi`).expect(409);
    await put('accountant', '/v1/payroll/bank-file', { format: 'sbi', debitAccount: '30012345678' }).expect(403);
    expect((await put('principal', '/v1/payroll/bank-file', { format: 'sbi', debitAccount: '30012345678', corporateId: 'SIMS01' }).expect(200)).body).toEqual({ format: 'sbi', debitAccountLast4: '5678', corporateId: 'SIMS01' });
    const [ps] = await db.select().from(s.payrollSettings).where(eq(s.payrollSettings.tenantId, t.tenantId));
    expect(ps.bankFile.debitAccountEnc).toMatch(/^v1\./);
    const sbi = (await get('accountant', `/v1/payroll/runs/${run.id}/bank-file`).expect(200)).text.split('\r\n');
    expect(sbi[0]).toBe('Beneficiary Account Number,IFSC,Beneficiary Name,Amount,Payment Mode,Debit Account Number,Narration');
    expect(sbi).toContain('50100000002,HDFC0000123,TEACHER TWO,19965.00,NEFT,30012345678,Salary November 2026');
    expect(sbi.some((l) => l.startsWith('10000000001,SBIN0001234,TEACHER ONE,') && l.includes(',SBI,30012345678,'))).toBe(true);
    const hdfc = (await get('accountant', `/v1/payroll/runs/${run.id}/bank-file?format=hdfc`).expect(200)).text.split('\r\n').filter(Boolean);
    expect(hdfc.find((l) => l.includes('50100000002'))!.split(',').slice(0, 5)).toEqual(['I', '', '50100000002', '19965.00', 'TEACHER TWO']);
    expect(hdfc.find((l) => l.includes('10000000001'))!.split(',')[0]).toBe('N');
    expect(hdfc[0].split(',')).toHaveLength(28);
    const canara = (await get('accountant', `/v1/payroll/runs/${run.id}/bank-file?format=canara`).expect(200)).text;
    expect(canara).toContain('30012345678|50100000002|TEACHER TWO|HDFC0000123|19965.00|NEFT|Salary November 2026|03-11-2026');
    await get('teacher', `/v1/payroll/runs/${run.id}/bank-file`).expect(403);
  });

  it('works out the full and final settlement line by line and keeps payroll from paying the month twice', async () => {
    const types = (await get('hr', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string; name: string; paid: boolean; annualDays: number; accrual: string; carryForwardMax: number }[];
    const el = types.find((x) => x.code === 'EL')!;
    await put('hr', `/v1/hr/leave-types/${el.id}`, { code: 'EL', name: el.name, paid: true, annualDays: el.annualDays, accrual: el.accrual, carryForwardMax: el.carryForwardMax, encashable: true }).expect(200);
    await db.insert(s.leaveBalances).values({ tenantId: t.tenantId, userId: ids.teacher2, leaveTypeId: el.id, year: 2026, opening: 16 });
    const sep = (await post('teacher2', '/v1/hr/separations', { reason: 'Moving to Mysuru', noticeDays: 90, lastWorkingDay: '2026-12-15' }).expect(201)).body;
    await post('hr', `/v1/hr/separations/${sep.id}/accept`, {}).expect(200);
    for (const dep of ['Department', 'Library', 'Accounts', 'IT', 'Hostel', 'HR']) await put('hr', `/v1/hr/separations/${sep.id}/clearances/${dep}`, { status: 'cleared', duesPaise: dep === 'Library' ? 350_00 : 0 }).expect(200);
    await get('teacher2', `/v1/hr/separations/${sep.id}/settlement/compute`).expect(403);
    const f = (await get('hr', `/v1/hr/separations/${sep.id}/settlement/compute`).expect(200)).body;
    const line = (code: string) => f.lines.find((l: { code: string }) => l.code === code)?.amountPaise;
    // December is not paid by payroll: 18,000 × 15/31 = 8,709.68 → 8,710.
    expect(line('SALARY')).toBe(8_710_00);
    // Earned leave: opening 16 + 14 accrued (15 a year, monthly, to November: 13.75 → 14) = 30 days × 15,000 / 30 = 15,000.
    expect(line('LEAVE')).toBe(15_000_00);
    // Gratuity: 1 July 2015 to 15 December 2026 is 11 years 5 months → 11 years; 15/26 × 15,000 × 11 = 95,192.31 → 95,192.
    expect(line('GRATUITY')).toBe(95_192_00);
    // Notice: 90 days asked, 42 served (3 November to 15 December) → 48 days × 18,000 / 30 = 28,800.
    expect(line('NOTICE')).toBe(28_800_00);
    expect(line('DUES')).toBe(350_00);
    expect(f.netPaise).toBe(8_710_00 + 15_000_00 + 95_192_00 - 28_800_00 - 350_00);
    expect((await get('hr', `/v1/hr/separations/${sep.id}/settlement/compute?waiveNotice=1`).expect(200)).body.netPaise).toBe(8_710_00 + 15_000_00 + 95_192_00 - 350_00);

    const settled = (await put('hr', `/v1/hr/separations/${sep.id}/settlement`, { note: 'Full and final as worked out; notice shortfall recovered', extra: [{ label: 'Pending honorarium', kind: 'earning', amountPaise: 2_000_00 }] }).expect(200)).body;
    expect(settled).toMatchObject({ status: 'settled', settlementPaise: 8_710_00 + 15_000_00 + 95_192_00 - 28_800_00 - 350_00 + 2_000_00 });
    expect(settled.settlementLines.map((l: { code: string }) => l.code)).toEqual(['SALARY', 'LEAVE', 'GRATUITY', 'NOTICE', 'DUES', 'EXTRA1']);
    const { settledFor } = await import('../src/hr/settled-months.js');
    expect(await db.transaction(async (tx) => [...(await settledFor(tx as never, '2026-12'))])).toEqual([ids.teacher2]);
  });

  it('publishes openings on the careers page and takes applications online', async () => {
    const op = (await post('hr', '/v1/records/job-openings', { title: 'Assistant Professor, Commerce', positions: 2, closesOn: '2026-11-30', description: 'BCom and MCom papers', eligibility: "Master's with 55% and NET/KSET or Ph.D.", published: true }).expect(201)).body;
    const hidden = (await post('hr', '/v1/records/job-openings', { title: 'Lab assistant', positions: 1 }).expect(201)).body;
    const page = (await http().get(`/v1/public/careers/${t.slug}`).expect(200)).body;
    expect(page.openings.map((o: { id: string }) => o.id)).toEqual([op.id]);
    expect(page.openings[0]).toMatchObject({ eligibility: "Master's with 55% and NET/KSET or Ph.D.", closesOn: '2026-11-30' });
    expect((await http().get(`/v1/public/careers/${other.slug}`).expect(200)).body.openings).toEqual([]);
    await http().get(`/v1/public/careers/${t.slug}/openings/${hidden.id}`).expect(404);
    await http().get('/v1/public/careers/no-such-college').expect(404);
    const form = (r: request.Test, over: Record<string, string> = {}) => {
      const f = { fullName: 'Pavithra Rao', email: 'Pavithra@Example.in', phone: '98450 12345', qualification: 'M.Com, KSET', experienceYears: '4', netSet: 'true', ...over };
      for (const [k, v] of Object.entries(f)) r.field(k, v);
      return r;
    };
    await form(http().post(`/v1/public/careers/${t.slug}/openings/${op.id}/apply`), { phone: '12' }).expect(400);
    await form(http().post(`/v1/public/careers/${t.slug}/openings/${op.id}/apply`)).attach('resume', PDF, 'cv.pdf').expect(201);
    await form(http().post(`/v1/public/careers/${t.slug}/openings/${op.id}/apply`), { email: 'pavithra@example.in' }).expect(409);
    await form(http().post(`/v1/public/careers/${t.slug}/openings/${hidden.id}/apply`)).expect(404);
    await form(http().post(`/v1/public/careers/${t.slug}/openings/${op.id}/apply`), { email: 'bot@spam.in', website: 'http://spam' }).expect(201);
    const apps = await db.select().from(s.jobApplicants).where(eq(s.jobApplicants.openingId, op.id));
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ fullName: 'Pavithra Rao', email: 'pavithra@example.in', phone: '+919845012345', source: 'portal', stage: 'applied', netSet: true, phd: false });
    expect(apps[0].resumeKey).toBeTruthy();
    expect((await get('hr', '/v1/records/job-openings?f.published=yes').expect(200)).body.total).toBe(1);
  });

  it('keeps vacation leave inside declared vacations and checks UGC cadre eligibility', async () => {
    await get('hr', '/v1/hr/module-settings').expect(200);
    await db.update(hrpay.hrSettings).set({ vacations: [{ name: 'Winter vacation', from: '2026-12-21', to: '2026-12-31' }] }).where(eq(hrpay.hrSettings.tenantId, t.tenantId));
    const vl = ((await get('teacher', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string }[]).find((x) => x.code === 'VL')!;
    await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: vl.id, fromDate: '2026-12-18', toDate: '2026-12-22' }).expect(400);
    expect((await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: vl.id, fromDate: '2026-12-21', toDate: '2026-12-31', reason: 'Winter vacation' }).expect(201)).body).toMatchObject({ days: 11, status: 'pending' });
    expect(((await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body as { leaveType: { code: string } }[]).some((b) => b.leaveType.code === 'VL')).toBe(false);

    await db.update(s.staffProfiles).set({ cadre: 'assistant_professor', staffCategory: 'teaching' }).where(eq(s.staffProfiles.userId, ids.teacher));
    await db.update(s.staffProfiles).set({ cadre: 'associate_professor', staffCategory: 'teaching', phdStatus: 'awarded' }).where(eq(s.staffProfiles.userId, ids.teacher2));
    await db.insert(depth.staffQualifications).values([
      { tenantId: t.tenantId, userId: ids.teacher, kind: 'degree', title: 'M.Com.', level: 'PG', percentage: 52 },
      { tenantId: t.tenantId, userId: ids.teacher2, kind: 'degree', title: 'M.Com.', level: 'PG', percentage: 61 },
    ]);
    const r = (await get('hr', '/v1/hr/reports/cadre-eligibility').expect(200)).body;
    const row = (code: string) => r.rows.find((x: { code: string }) => x.code === code);
    expect(row('T001')).toMatchObject({ cadre: 'Assistant Professor', eligible: 'No' });
    expect(row('T001').missing).toBe("55% in the master's degree (has 52%); NET/SET/SLET or a Ph.D.");
    expect(row('T002')).toMatchObject({ cadre: 'Associate Professor', eligible: 'No', missing: '7 publications in peer-reviewed or UGC-listed journals (has 0)' });
    await get('teacher', '/v1/hr/reports/cadre-eligibility').expect(403);
  });

  it('lists the new records on the kit for the right people only', async () => {
    expect((await get('teacher2', '/v1/records/reimbursement-claims').expect(200)).body.total).toBe(2);
    expect((await get('teacher', '/v1/records/reimbursement-claims').expect(200)).body.total).toBe(0);
    expect((await get('accountant', '/v1/records/reimbursement-claims?f.status=paid').expect(200)).body.total).toBe(2);
    expect((await get('outsider', '/v1/records/reimbursement-claims').expect(200)).body.total).toBe(0);
    const claim = (await post('teacher', '/v1/records/reimbursement-claims', { category: 'books', spentOn: '2026-10-05', amountPaise: 850, description: 'Taxation reference book' }).expect(201)).body;
    expect(claim).toMatchObject({ claimNo: 'RB/2026-27/0003', amount: 850, status: 'submitted' });
    await post('teacher', '/v1/records/reimbursement-claims/bulk', { op: 'action', target: { ids: [claim.id] }, action: 'approve' }).expect(403);
    expect((await post('hr', '/v1/records/reimbursement-claims/bulk', { op: 'action', target: { ids: [claim.id] }, action: 'reject', params: { note: 'Personal copy, not for the library' } }).expect(200)).body.succeeded).toBe(1);
    expect((await get('accountant', '/v1/records/pay-matrix-levels?f.scheme=ugc_7cpc').expect(200)).body.total).toBe(6);
    await get('teacher', '/v1/records/pay-matrix-levels').expect(403);
    const lvl = (await post('principal', '/v1/records/pay-matrix-levels', { scheme: 'custom', level: 'C1', name: 'Consolidated lecturer', entryPaise: 30000, count: 5 }).expect(201)).body;
    expect(lvl).toMatchObject({ entry: 30000, top: 33800, cellCount: 5 });
    await patch('teacher', `/v1/records/pay-matrix-levels/${lvl.id}`, { name: 'x' }).expect(403);
  });
});
