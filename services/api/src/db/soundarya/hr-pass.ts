/**
 * The HR and payroll pass on the demo college: staff PAN and UAN (encrypted), the 7th CPC pay matrix with the teaching
 * staff placed on it, investment declarations in every state, reimbursement claims, the SBI salary file, vacations,
 * published openings on the careers page and a worked full and final settlement. Uses the module's own services, so
 * every figure is the one the screens would compute.
 */
import { eq, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../../auth/principal.js';
import { SecretBox } from '../../common/secret-box.js';
import { seal } from '../../common/sensitive.js';
import { loadEnv } from '../../config/env.js';
import { bankAad } from '../../hr/hr.service.js';
import { debitAccountAad } from '../../hr/bank-files.js';
import { cellAtOrAbove } from '../../hr/pay-matrix.logic.js';
import { PayMatrixService } from '../../hr/pay-matrix.service.js';
import { PayrollService } from '../../hr/payroll.service.js';
import { ReimbursementsService } from '../../hr/reimbursements.service.js';
import { settlementNet } from '../../hr/settlement.js';
import { SettlementService } from '../../hr/settlement.service.js';
import { sealStaffIds } from '../../hr/staff-ids.js';
import { fyOfDate, TaxDeclarationsService } from '../../hr/tax-declarations.service.js';
import { bufferStream, ObjectStorage } from '../../storage/storage.service.js';
import { payrollSettings, separations, staffProfiles } from '../schema.js';
import { taxDeclarationItems } from '../schema-hr3.js';
import { STAFF } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays } from './kit.js';
import { service, withTenant } from './nest.js';

const PDF = (title: string) => Buffer.from(`%PDF-1.4\n1 0 obj<< /Title (${title}) >>endobj\ntrailer<<>>\n%%EOF\n`);
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export async function hrPass(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const hrUser = c.byEmail.hr.id;
  const as = (userId: string, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: c.tenantId, userId, roles });
  const hr = as(hrUser, ['hr_manager']);
  const principal = as(c.byEmail.principal.id, ['principal']);
  const storage = await service(ObjectStorage);

  // PAN, UAN and the salary account for every staff member, sealed at rest (ECR, 24Q and the bank file read them).
  // Non-teaching staff are marked so, and teachers get the cadre of their designation, for the UGC and NAAC lists.
  const box = SecretBox.fromEnv(loadEnv());
  const BANKS = [['State Bank of India', 'SBIN0040254'], ['Canara Bank', 'CNRB0002845'], ['HDFC Bank', 'HDFC0001739'], ['State Bank of India', 'SBIN0011354']] as const;
  await withTenant(c.tenantId, async (tx) => {
    for (const [i, s] of c.staff.entries()) {
      const def = STAFF[i];
      const teaching = !!def && (def.roles.includes('teacher') || def.roles.includes('principal'));
      const cadre = !teaching ? null : def.roles.includes('principal') ? 'principal' : /^Professor/.test(def.designation) ? 'professor' : /Associate/.test(def.designation) ? 'associate_professor' : 'assistant_professor';
      await tx.execute(sql`update staff_profiles set staff_category = ${teaching ? 'teaching' : 'non_teaching'}, cadre = coalesce(cadre, ${cadre}) where user_id = ${s.id}::uuid`);
      if (box) {
        const [bank, ifsc] = BANKS[i % BANKS.length];
        const account = String(30_000_000_000 + i * 7_919_311).slice(0, 11);
        await tx.update(staffProfiles).set({ bankAccountHolder: def?.name.replace(/^(Dr|Prof|Capt)\.\s*/, '') ?? 'Staff', bankName: bank, bankIfsc: ifsc, bankAccountEnc: box.encrypt(account, bankAad(c.tenantId, s.id)), bankAccountLast4: account.slice(-4) }).where(eq(staffProfiles.userId, s.id));
      }
    }
    for (const [i, s] of c.staff.entries()) {
      const surname = (STAFF[i]?.name ?? 'X').replace(/^(Dr|Prof|Capt)\.\s*/, '').split(' ').pop()!.toUpperCase();
      const pan = `${LETTERS[i % 24]}${LETTERS[(i * 7) % 24]}${LETTERS[(i * 3) % 24]}P${surname[0] ?? 'X'}${String(1000 + i * 37).slice(-4)}${LETTERS[(i * 5) % 24]}`;
      await tx.update(staffProfiles).set(sealStaffIds(c.tenantId, s.id, { pan, uan: String(100_200_300_400 + i * 1013) })).where(eq(staffProfiles.userId, s.id));
    }
  });

  // The 7th CPC matrix: professors on Level 14, associate professors on 13A, assistant professors on 10 or 11, from this month.
  const matrix = await service(PayMatrixService);
  const payroll = await service(PayrollService);
  const month = c.today.slice(0, 7);
  await withTenant(c.tenantId, async (tx) => {
    const levels = await matrix.levels(tx, c.tenantId);
    await payroll.components(tx, c.tenantId);
    await tx.execute(sql`insert into salary_components (tenant_id, code, name, kind, pf_wage, taxable, sort_order, calc, percent, base_code) values (${c.tenantId}::uuid, 'DA', 'Dearness allowance', 'earning', true, true, 2, 'percent', 55, 'BASIC') on conflict do nothing`);
    const lv = (l: string) => levels.find((x) => x.level === l)!;
    for (const [i, def] of STAFF.entries()) {
      if (!def.roles.includes('teacher')) continue;
      const d = def.designation;
      const level = /^Professor/.test(d) ? lv('14') : /Associate/.test(d) ? lv('13A') : def.basic >= 57_000 ? lv('11') : lv('10');
      // One cell for each completed year of service (the annual increments a teacher would have drawn), never below their pay.
      const [prof] = await tx.select({ joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(eq(staffProfiles.userId, c.staff[i].id));
      const years = prof?.joined ? Math.floor((Date.parse(c.today) - Date.parse(prof.joined)) / (365.25 * 86_400_000)) : 0;
      const cell = Math.min(level.cells.length, Math.max(cellAtOrAbove(level.cells, def.basic * 100), 1 + Math.min(years, 12)));
      await matrix.place(tx, principal, c.staff[i].id, { levelId: level.id, cell, effectiveFrom: `${month}-01`, kind: 'placement', hraClass: 'Y', orderNo: `SIMS/HR/${month.slice(0, 4)}/PM-${String(i + 1).padStart(3, '0')}`, note: '7th CPC pay matrix adopted by the governing council' });
    }
  });

  // Investment declarations: drafts, waiting, approved, verified (with proofs) and one sent back.
  const decl = await service(TaxDeclarationsService);
  const fy = fyOfDate(c.today);
  const people = c.teachers.slice(0, 12);
  const plans: { regime: 'old' | 'new'; rent: number; items: [string, string, number][]; to: 'draft' | 'submitted' | 'approved' | 'verified' | 'rejected' }[] = [
    { regime: 'old', rent: 18_000, items: [['80C', 'PPF', 1_00_000], ['80C', 'LIC premium', 32_000], ['80D', 'Family floater health insurance', 22_500]], to: 'verified' },
    { regime: 'old', rent: 15_000, items: [['80C', 'ELSS mutual fund', 60_000], ['80C', "Children's tuition fees", 48_000], ['24B', 'Housing loan interest', 1_65_000]], to: 'verified' },
    { regime: 'old', rent: 0, items: [['80C', 'Housing loan principal', 1_20_000], ['80CCD1B', 'NPS tier I', 50_000], ['80D_SENIOR_PARENTS', "Parents' health insurance", 38_000]], to: 'approved' },
    { regime: 'new', rent: 0, items: [], to: 'approved' },
    { regime: 'old', rent: 12_000, items: [['80C', 'PPF', 70_000], ['80E', 'Education loan interest', 26_000]], to: 'submitted' },
    { regime: 'old', rent: 20_000, items: [['80C', 'Sukanya Samriddhi', 1_50_000], ['80D', 'Health insurance', 18_000]], to: 'submitted' },
    { regime: 'new', rent: 0, items: [], to: 'submitted' },
    { regime: 'old', rent: 9_000, items: [['80C', 'NSC', 40_000]], to: 'rejected' },
    { regime: 'old', rent: 0, items: [['80C', 'LIC premium', 24_000], ['80G', 'Donation to PM CARES', 5_000]], to: 'draft' },
  ];
  for (const [i, plan] of plans.entries()) {
    const who = people[i];
    if (!who) break;
    const me = as(who.id, ['teacher']);
    await withTenant(c.tenantId, async (tx) => {
      let d = await decl.save(tx, me, { fy, regime: plan.regime, rentMonthlyPaise: plan.rent * 100, rentMonths: plan.rent ? 12 : 0, metro: false, landlordName: plan.rent ? ['K. Ramesh', 'S. Lakshmi', 'M. Nagaraj', 'B. Shantha'][i % 4] : '', landlordPan: plan.rent * 12 > 1_00_000 ? `AAAP${LETTERS[i]}${String(4321 + i)}Q` : null, items: plan.items.map(([section, label, rs]) => ({ section: section as '80C', label, declaredPaise: rs * 100 })) });
      if (plan.to === 'draft') return;
      d = await decl.submit(tx, me, fy, false);
      if (plan.to === 'submitted') return;
      if (plan.to === 'rejected') return void (await decl.reject(tx, hr, d.id, undefined, 'Attach the NSC certificate number and the date of purchase'));
      d = await decl.approve(tx, hr, d.id, undefined, 'Declared figures used for TDS from this month');
      if (plan.to === 'approved') return;
      // Proofs for the verified ones: each item's receipt, then HR accepts them (the PPF one for less than declared).
      for (const it of d.items) {
        const key = `tenants/${c.tenantId}/hr/tax-proofs/${it.id}-seed`;
        await storage.put(key, bufferStream(PDF(it.label)), 1024 * 1024, 'application/pdf');
        await tx.update(taxDeclarationItems).set({ proofKey: key, proofType: 'application/pdf', proofName: `${it.label}.pdf`, proofStatus: 'submitted' }).where(eq(taxDeclarationItems.id, it.id));
      }
      d = await decl.submit(tx, me, fy, true);
      await decl.verify(tx, hr, d.id, undefined, d.items.map((it) => ({ id: it.id, accepted: true, acceptedPaise: it.label === 'PPF' ? 80_000_00 : it.declaredPaise, note: it.label === 'PPF' ? 'Passbook shows ₹80,000 for the year' : '' })), 'Proofs checked against the originals');
    });
  }
  // One more set of proofs waiting for HR.
  const waiting = people[9];
  if (waiting) {
    const me = as(waiting.id, ['teacher']);
    await withTenant(c.tenantId, async (tx) => {
      await decl.save(tx, me, { fy, regime: 'old', rentMonthlyPaise: 14_000_00, rentMonths: 12, metro: false, landlordName: 'R. Venkatesh', landlordPan: 'AAAPV7788K', items: [{ section: '80C', label: 'PPF', declaredPaise: 90_000_00 }, { section: '80D', label: 'Health insurance', declaredPaise: 21_000_00 }] });
      let d = await decl.submit(tx, me, fy, false);
      d = await decl.approve(tx, hr, d.id, undefined, '');
      for (const it of d.items) {
        const key = `tenants/${c.tenantId}/hr/tax-proofs/${it.id}-seed`;
        await storage.put(key, bufferStream(PDF(it.label)), 1024 * 1024, 'application/pdf');
        await tx.update(taxDeclarationItems).set({ proofKey: key, proofType: 'application/pdf', proofName: `${it.label} receipt.pdf`, proofStatus: 'submitted' }).where(eq(taxDeclarationItems.id, it.id));
      }
      await decl.submit(tx, me, fy, true);
    });
  }

  // Reimbursement claims: approved onto this month (paid on the next payslip), waiting, rejected, and one with its bill.
  const claims = await service(ReimbursementsService);
  const claimPlans: [number, 'travel' | 'conference' | 'books' | 'telephone' | 'medical' | 'fuel', number, string, 'approve' | 'reject' | 'wait'][] = [
    [0, 'travel', 1_840, 'KSRTC bus to Bengaluru City University valuation camp and back', 'approve'],
    [1, 'conference', 3_500, 'Registration: national seminar on GST at Christ University', 'approve'],
    [2, 'books', 2_260, 'Taxmann Direct Taxes Law and Practice, 2026 edition', 'approve'],
    [3, 'telephone', 799, 'Mobile bill for online classes, October', 'approve'],
    [4, 'medical', 4_200, 'Out-patient treatment, Sparsh Hospital', 'approve'],
    [5, 'travel', 2_950, 'Train to Mysuru for the BoS meeting', 'wait'],
    [6, 'conference', 6_000, 'FDP on outcome-based education, registration', 'wait'],
    [7, 'fuel', 1_500, 'Fuel for the industrial visit', 'reject'],
    [8, 'books', 1_180, 'Research methodology reference book', 'wait'],
    [10, 'telephone', 599, 'Internet bill, October', 'wait'],
  ];
  for (const [i, cat, rs, desc, then] of claimPlans) {
    const who = c.teachers[i];
    if (!who) continue;
    await withTenant(c.tenantId, async (tx) => {
      const claim = await claims.create(tx, as(who.id, ['teacher']), { category: cat, spentOn: addDays(c.today, -(5 + i * 2)), amountPaise: rs * 100, description: desc });
      if (i % 2 === 0) {
        const key = `tenants/${c.tenantId}/hr/reimbursements/${claim.id}-seed`;
        await storage.put(key, bufferStream(PDF(desc)), 1024 * 1024, 'application/pdf');
        await tx.execute(sql`update reimbursement_claims set bill_key = ${key}, bill_type = 'application/pdf', bill_name = ${`${claim.claimNo.replaceAll('/', '-')}.pdf`} where id = ${claim.id}::uuid`);
      }
      if (then === 'approve') await claims.decide(tx, hr, claim.id, { approve: true, payMonth: month, note: '' });
      if (then === 'reject') await claims.decide(tx, hr, claim.id, { approve: false, note: 'Fuel for official visits is paid as conveyance allowance' });
    });
  }

  // The salary file goes to SBI (the institution's salary account there); vacations for vacation leave; the careers page.
  await withTenant(c.tenantId, async (tx) => {
    await tx.update(payrollSettings).set({ bankFile: { format: 'sbi', debitAccountEnc: seal(debitAccountAad(c.tenantId), '38012745561'), debitAccountLast4: '5561', corporateId: 'SIMSBLR01' } }).where(eq(payrollSettings.tenantId, c.tenantId));
  });
  await k.q(`update hr_settings set vacations = $2::jsonb, reimbursement_limits = $3::jsonb where tenant_id = $1`, [c.tenantId, JSON.stringify([{ name: 'Winter vacation', from: `${c.today.slice(0, 4)}-12-22`, to: `${c.today.slice(0, 4)}-12-31` }, { name: 'Summer vacation', from: `${Number(c.today.slice(0, 4)) + 1}-04-20`, to: `${Number(c.today.slice(0, 4)) + 1}-05-31` }]), JSON.stringify({ books: 10_000_00, telephone: 6_000_00, medical: 15_000_00 })]);
  await k.ins('leave_types', { code: 'VL', name: 'Vacation leave', paid: true, annualDays: 0, accrual: 'yearly', carryForwardMax: 0, kind: 'vacation', countsHolidays: true, halfDayAllowed: false, sortOrder: 80 }, { returning: false });
  await k.q(`update job_openings set published = true, eligibility = $2 where tenant_id = $1 and status = 'open'`, [c.tenantId, "Master's degree with at least 55% (50% for SC/ST/OBC/PwD) and NET/KSET or a Ph.D. under the UGC Regulations 2018."]);

  // A worked full and final settlement: a teacher of eight years leaving with a notice shortfall, every clearance done.
  const settle = await service(SettlementService);
  const leaver = c.teachers[c.teachers.length - 6];
  if (leaver) {
    await k.q(`update staff_profiles set date_of_joining = '2018-06-01', status = 'on_notice' where user_id = $1`, [leaver.id]);
    const s = await k.one<{ id: string }>('separations', { userId: leaver.id, resignedOn: addDays(c.today, -20), noticeDays: 90, lastWorkingDay: addDays(c.today, 40), reason: 'Joining a deemed university as Associate Professor', status: 'clearance', noticeShortfallDays: 30 });
    await k.ins('exit_clearances', ['Department', 'Library', 'Accounts', 'IT', 'Hostel', 'HR'].map((department) => ({ separationId: s.id, department, status: 'cleared', duesPaise: department === 'Library' ? 650_00 : 0, remarks: department === 'Library' ? 'Late fine on three books' : 'No dues', clearedBy: hrUser, clearedAt: new Date(`${addDays(c.today, -2)}T12:00:00+05:30`) })), { returning: false });
    await withTenant(c.tenantId, async (tx) => {
      const [row] = await tx.select().from(separations).where(eq(separations.id, s.id));
      const worked = await settle.compute(tx, c.tenantId, row, false);
      const lines = [...worked.lines, { code: 'EXTRA1', label: 'Honorarium for university valuation', kind: 'earning' as const, amountPaise: 3_600_00, basis: 'Added by HR' }];
      await tx.update(separations).set({ status: 'settled', settlementPaise: settlementNet(lines), settlementLines: lines, settlementNote: 'Worked out under the Payment of Gratuity Act and the leave rules; notice shortfall of 30 days recovered.' }).where(eq(separations.id, s.id));
    });
  }
}
