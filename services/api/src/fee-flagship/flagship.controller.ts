import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { voucherLines } from '../books/books.service.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, sections, students, tenants } from '../db/schema.js';
import { feeStructures } from '../db/schema-g1.js';
import { feeAssignments, feeGovtScholarships, feeInvoiceLines, feeReceipts, feeStudentProfiles } from '../db/schema-fee-depth.js';
import { feeAccounts, feePaymentFlags, feeProgrammeTransfers } from '../db/schema-fee-flagship.js';
import { FeeSetupService } from '../fee-depth/setup.service.js';
import { syncAccruals } from '../fees/accruals.js';
import { resolveFlag } from '../fees/duplicates.js';
import { feeAccountById } from '../fees/fee-accounts-core.js';
import { headsOf, raiseInvoice, reduceCharge } from '../fees/fee-lines.js';
import { FEE_ROLES, FeesService } from '../fees/fees.service.js';
import { upiQr } from '../fees/upi.js';
import { parsePortalStatusCsv, transferPlan, usedPercent, zohoJournalCsv } from './flagship.logic.js';

const HEADS: RoleName[] = ['principal', 'tenant_admin'];
const ResolveBody = z.object({ resolution: z.enum(['not_duplicate', 'kept_as_advance', 'refunded']), note: z.string().trim().max(300).default('') });
const TransferBody = z.object({
  toStructureId: z.uuid(),
  fromStructureId: z.uuid().nullish(),
  toSectionId: z.uuid().nullish(),
  effectiveOn: Day,
  kind: z.enum(['transfer', 'readmission']).default('transfer'),
  /** A readmission fee charged once (paise). */
  readmissionFeePaise: z.number().int().min(0).max(10_000_000_00).default(0),
  reason: z.string().trim().min(3).max(300),
  preview: z.boolean().default(false),
});
const VerifyBody = z.object({ on: Day, portalStatus: z.string().trim().max(120).nullish(), expectedPaise: z.number().int().min(0).max(100_000_000_00).optional(), holdDues: z.boolean().optional() });
const StatusImport = z.object({ portal: z.enum(['ssp', 'nsp', 'state', 'central', 'institution', 'other']), csv: z.string().min(10).max(2_000_000) });
const RefsBody = z.object({ prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'Use 2 to 6 capital letters') });
const ZohoQuery = z.object({ from: Day, to: Day, fund: z.uuid().optional(), account: z.uuid().optional() });

/**
 * The fees flagship desk: duplicate payments and how they were settled, programme transfers and readmissions with
 * their fee recalculation, government scholarship verification and the portal's status file (Karnataka SSP, NSP),
 * the amount-bound UPI QR of a fee, students' fee references for NEFT, re-booking on the accrual basis, and the Zoho
 * Books journal export.
 */
@Controller('v1')
export class FeeFlagshipController {
  constructor(
    private readonly db: DbService,
    private readonly setup: FeeSetupService,
    private readonly fees: FeesService,
    private readonly clock: Clock,
  ) {}

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  // ---- Duplicate payments -------------------------------------------------------------------------------

  @Get('fees/flags')
  @Auth('user', FEE_ROLES)
  flags(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    const st = z.enum(['open', 'resolved']).optional().safeParse(status || undefined);
    if (!st.success) throw new BadRequestException('Bad status');
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ flag: feePaymentFlags, student: students.fullName, rollNo: students.rollNo, receiptNo: feePayments.receiptNo, method: feePayments.method, provider: feePayments.provider })
        .from(feePaymentFlags)
        .innerJoin(students, eq(students.id, feePaymentFlags.studentId))
        .innerJoin(feePayments, eq(feePayments.id, feePaymentFlags.paymentId))
        .where(st.data ? eq(feePaymentFlags.status, st.data) : undefined)
        .orderBy(desc(feePaymentFlags.createdAt))
        .limit(500),
    );
  }

  @Post('fees/flags/:id/resolve')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  resolve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResolveBody)) b: z.infer<typeof ResolveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(feePaymentFlags).where(eq(feePaymentFlags.id, id)).for('update');
      if (!f) throw new NotFoundException('Flag not found');
      if (f.status !== 'open') throw new ConflictException('This flag has been settled');
      const row = await resolveFlag(tx, { tenantId: p.tenantId, userId: p.userId }, f, b.resolution, b.note, await this.today(tx));
      await auditUser(tx, p, `fee_payment_flag.${b.resolution}`, 'fee_payment_flag', id, { amountPaise: f.amountPaise, reason: f.reason, note: b.note });
      return row;
    });
  }

  // ---- Programme transfer and readmission ---------------------------------------------------------------

  /**
   * Moves a student to another programme's fee structure from a date: the old structure is kept for the share of the
   * year used, the new one charged for the rest (paid money beyond the kept share counts against the new fee), the
   * old assignment is superseded and the new one recorded. A readmission can add a one-off readmission fee. With
   * `preview` nothing is saved.
   */
  @Post('fee-setup/students/:id/transfer')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  transfer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Body(new ZodBody(TransferBody)) b: z.infer<typeof TransferBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select().from(students).where(eq(students.id, studentId));
      if (!st) throw new NotFoundException('Student not found');
      const to = await this.setup.structure(tx, b.toStructureId);
      if (to.status !== 'published') throw new ConflictException('Only a published structure can be given');
      if (b.toSectionId && !(await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.toSectionId)))[0]) throw new NotFoundException('Class not found');
      const actives = await tx.select().from(feeAssignments).where(and(eq(feeAssignments.studentId, studentId), eq(feeAssignments.status, 'active'), b.fromStructureId ? eq(feeAssignments.structureId, b.fromStructureId) : undefined));
      const from = b.fromStructureId ? actives[0] : actives.find((a) => a.structureId !== b.toStructureId);
      if (b.fromStructureId && !from) throw new NotFoundException('The student does not have that structure');
      if (actives.some((a) => a.structureId === b.toStructureId)) throw new ConflictException('The student already has that structure');
      const fromStructure = from ? await this.setup.structure(tx, from.structureId) : null;
      const range = (await this.setup.termRange(tx, to)) ?? (fromStructure ? await this.setup.termRange(tx, fromStructure) : null);
      if (!range) throw new BadRequestException('The structure has no academic year to count the share over');
      const used = b.kind === 'readmission' ? 0 : usedPercent(range.start, range.end, b.effectiveOn);
      const [oldInv] = from?.invoiceId ? await tx.select().from(feeInvoices).where(eq(feeInvoices.id, from.invoiceId)) : [];
      const heads = await headsOf(tx, p.tenantId);
      const [facts] = await this.setup.facts(tx, [studentId]);
      const newLines = this.setup.linesFor(to, heads, { ...facts, sectionId: b.toSectionId ?? facts.sectionId });
      const newFull = newLines.reduce((t, l) => t + l.amountPaise, 0);
      const oldNet = oldInv && oldInv.status !== 'cancelled' ? oldInv.amountPaise : 0;
      const plan = transferPlan({ oldNetPaise: oldNet, oldPaidPaise: oldInv?.paidPaise ?? 0, newFullPaise: newFull, usedPercent: b.kind === 'readmission' ? 0 : used });
      const preview = { ...plan, effectiveOn: b.effectiveOn, from: fromStructure ? { id: fromStructure.id, name: fromStructure.name } : null, to: { id: to.id, name: to.name }, readmissionFeePaise: b.readmissionFeePaise, oldDuesPaise: oldInv && b.kind === 'readmission' ? oldInv.amountPaise - oldInv.paidPaise : 0 };
      if (b.preview) return preview;
      const today = await this.today(tx);
      // The old fee: kept for the share used (never below what was paid).
      if (oldInv && plan.reduceOldPaise > 0 && b.kind === 'transfer') await reduceCharge(tx, oldInv.id, plan.reduceOldPaise, [], { kind: 'revision', userId: p.userId, date: today, note: `Moved to ${to.name}` });
      if (from && b.kind === 'transfer') await tx.update(feeAssignments).set({ status: 'superseded' }).where(eq(feeAssignments.id, from.id));
      if (b.toSectionId && b.toSectionId !== st.sectionId) await tx.update(students).set({ sectionId: b.toSectionId }).where(eq(students.id, studentId));
      const sectionId = b.toSectionId ?? st.sectionId;
      const share = 100 - plan.usedPercent;
      const lines = newLines.map((l) => ({ ...l, amountPaise: Math.round((l.amountPaise * share) / 100) }));
      let newInv: typeof feeInvoices.$inferSelect | null = null;
      if (plan.newChargePaise > 0) {
        newInv = await raiseInvoice(tx, { tenantId: p.tenantId, studentId, sectionId, title: to.name, dueOn: today, createdBy: p.userId, lines, structureId: to.id, academicYear: to.academicYear, kind: 'fee', feeAccountId: to.feeAccountId ?? null, date: today });
        // Paid on the old fee beyond its kept share counts against the new one.
        if (plan.paidCountedOnNewPaise > 0) await reduceCharge(tx, newInv.id, plan.paidCountedOnNewPaise, [], { kind: 'revision', userId: p.userId, date: today, note: `Paid on ${fromStructure?.name ?? 'the previous programme'}` });
        await tx.insert(feeAssignments).values({ tenantId: p.tenantId, structureId: to.id, studentId, invoiceId: newInv.id, amountPaise: plan.newChargePaise, prorataPercent: share, assignedBy: p.userId });
      }
      if (b.kind === 'readmission' && b.readmissionFeePaise > 0) {
        const fine = heads.find((h) => h.kind === 'fine');
        await raiseInvoice(tx, { tenantId: p.tenantId, studentId, sectionId, title: 'Readmission fee', dueOn: today, createdBy: p.userId, kind: 'charge', lines: [{ code: fine?.code ?? 'FIN', name: 'Readmission fee', priority: fine?.sortOrder ?? 9000, amountPaise: b.readmissionFeePaise }], feeAccountId: to.feeAccountId ?? null, date: today });
      }
      const [row] = await tx
        .insert(feeProgrammeTransfers)
        .values({ tenantId: p.tenantId, studentId, fromStructureId: fromStructure?.id ?? null, toStructureId: to.id, fromSectionId: st.sectionId, toSectionId: sectionId, effectiveOn: b.effectiveOn, usedPercent: plan.usedPercent, oldKeptPaise: plan.oldAfterPaise, oldReducedPaise: b.kind === 'transfer' ? plan.reduceOldPaise : 0, newChargedPaise: plan.newChargePaise - plan.paidCountedOnNewPaise, newInvoiceId: newInv?.id ?? null, kind: b.kind, reason: b.reason, createdBy: p.userId })
        .returning();
      await auditUser(tx, p, `fee_programme_transfer.${b.kind}`, 'fee_programme_transfer', row.id, { studentId, from: fromStructure?.name ?? null, to: to.name, ...plan });
      return { ...preview, id: row.id, newInvoiceId: newInv?.id ?? null };
    });
  }

  @Get('fee-setup/students/:id/transfers')
  @Auth('user', FEE_ROLES)
  transfers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(feeProgrammeTransfers).where(eq(feeProgrammeTransfers.studentId, studentId)).orderBy(desc(feeProgrammeTransfers.createdAt)));
  }

  // ---- Government scholarships: verification and the portal's status file --------------------------------

  /** The institution verified the application on the portal (Karnataka SSP's "approved by HOI" step). */
  @Post('fee-collect/govt-scholarships/:id/verify')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select().from(feeGovtScholarships).where(eq(feeGovtScholarships.id, id)).for('update');
      if (!g) throw new NotFoundException('Scholarship not found');
      if (g.status !== 'applied') throw new ConflictException('Only an applied scholarship can be verified');
      const [row] = await tx
        .update(feeGovtScholarships)
        .set({ status: 'verified', verifiedOn: b.on, portalStatus: b.portalStatus ?? 'Verified by the institution', ...(b.expectedPaise !== undefined ? { expectedPaise: b.expectedPaise } : {}), ...(b.holdDues !== undefined ? { holdDues: b.holdDues } : {}), updatedAt: new Date() })
        .where(eq(feeGovtScholarships.id, id))
        .returning();
      await auditUser(tx, p, 'govt_scholarship.verified', 'govt_scholarship', id, { on: b.on, expectedPaise: row.expectedPaise });
      return row;
    });
  }

  /**
   * The portal's status export (SSP, NSP…): each application found by its number moves on (verified, sanctioned,
   * rejected) with the portal's own wording; disbursements are reported for the office to receipt against the bank
   * credit (the money is receipted when it reaches the institution's account).
   */
  @Post('fee-collect/govt-scholarships/import-status')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  importStatus(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StatusImport)) b: z.infer<typeof StatusImport>) {
    let rows: ReturnType<typeof parsePortalStatusCsv>;
    try {
      rows = parsePortalStatusCsv(b.csv);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.db.withTenant(p.tenantId, async (tx) => {
      const report: { applicationNo: string; ok: boolean; message: string; status?: string; disbursedPaise?: number | null }[] = [];
      const order = ['applied', 'verified', 'sanctioned', 'received'];
      for (const r of rows) {
        const [g] = await tx.select().from(feeGovtScholarships).where(and(eq(feeGovtScholarships.portal, b.portal), eq(feeGovtScholarships.applicationNo, r.applicationNo))).for('update');
        if (!g) {
          report.push({ applicationNo: r.applicationNo, ok: false, message: 'No such application in the tracker' });
          continue;
        }
        if (['received', 'rejected', 'lapsed'].includes(g.status) && r.status !== 'received') {
          report.push({ applicationNo: r.applicationNo, ok: false, message: `Already ${g.status}` });
          continue;
        }
        // Disbursed money is receipted from the bank credit; here the tracker moves only as far as sanctioned.
        const next = r.status === 'rejected' ? 'rejected' : r.status === 'received' ? 'sanctioned' : r.status;
        const status = next === 'rejected' || order.indexOf(next) > order.indexOf(g.status) ? next : g.status;
        await tx
          .update(feeGovtScholarships)
          .set({ status, portalStatus: r.portalStatus, ...(r.sanctionedPaise ? { sanctionedPaise: r.sanctionedPaise, sanctionedOn: g.sanctionedOn ?? r.on } : {}), ...(status === 'verified' && !g.verifiedOn ? { verifiedOn: r.on } : {}), updatedAt: new Date() })
          .where(eq(feeGovtScholarships.id, g.id));
        report.push({ applicationNo: r.applicationNo, ok: true, message: r.disbursedPaise ? 'Disbursed: receipt it when the money reaches the bank' : 'Updated', status, disbursedPaise: r.disbursedPaise });
      }
      await auditUser(tx, p, 'govt_scholarship.status_imported', 'govt_scholarship', undefined, { portal: b.portal, rows: rows.length, updated: report.filter((x) => x.ok).length });
      return { rows: report, updated: report.filter((x) => x.ok).length, notFound: report.filter((x) => !x.ok).length };
    });
  }

  // ---- UPI QR ---------------------------------------------------------------------------------------------

  /** The amount-bound UPI QR (NPCI intent) of a fee's balance, in the fee account's UPI id: for the office and the family. */
  @Get('fees/invoices/:id/upi')
  @Auth('user')
  invoiceUpi(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('amountPaise') amount?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id));
      if (!inv) throw new NotFoundException('Invoice not found');
      await this.fees.assertCanSee(tx, p, inv.studentId);
      const balance = inv.status === 'due' ? inv.amountPaise - inv.paidPaise : 0;
      const want = amount && /^\d{3,12}$/.test(amount) ? Math.min(Number(amount), balance) : balance;
      return this.upiFor(tx, inv, want);
    });
  }

  /** The QR for what is still due on the fees a receipt paid (printed on the receipt). */
  @Get('fee-collect/receipts/:id/upi')
  @Auth('user')
  receiptUpi(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, id));
      if (!r) throw new NotFoundException('Receipt not found');
      await this.fees.assertCanSee(tx, p, r.studentId);
      const invs = await tx.select().from(feeInvoices).where(and(inArray(feeInvoices.id, sql`(select invoice_id from fee_payments where receipt_id = ${id}::uuid)`), eq(feeInvoices.status, 'due')));
      const open = invs.find((i) => i.amountPaise > i.paidPaise);
      return open ? this.upiFor(tx, open, open.amountPaise - open.paidPaise) : null;
    });
  }

  private async upiFor(tx: Tx, inv: typeof feeInvoices.$inferSelect, amountPaise: number) {
    const account = await feeAccountById(tx, inv.feeAccountId);
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const [prof] = await tx.select({ ref: feeStudentProfiles.feeRef }).from(feeStudentProfiles).where(eq(feeStudentProfiles.studentId, inv.studentId));
    const qr = upiQr({ vpa: account?.upiVpa, payee: account?.upiPayeeName ?? account?.name ?? t.name, amountPaise, reference: `${prof?.ref ?? ''}${(inv.invoiceNo ?? inv.id.slice(0, 8)).replace(/[^A-Za-z0-9]/g, '')}`, note: inv.title });
    return qr ? { ...qr, payee: account?.upiPayeeName ?? account?.name ?? t.name, feeAccount: account?.name ?? null } : null;
  }

  // ---- Fee references for NEFT and challans ----------------------------------------------------------------

  /** Gives every student without one a fee reference (prefix + roll number) to quote in NEFT narrations. */
  @Post('fees/fee-refs/generate')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  generateRefs(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RefsBody)) b: z.infer<typeof RefsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: students.id, roll: students.rollNo, ref: feeStudentProfiles.feeRef, profileId: feeStudentProfiles.id }).from(students).leftJoin(feeStudentProfiles, eq(feeStudentProfiles.studentId, students.id)).where(eq(students.status, 'active')).orderBy(asc(students.rollNo));
      const taken = new Set(rows.map((r) => r.ref).filter(Boolean));
      let made = 0;
      for (const r of rows.filter((x) => !x.ref)) {
        let ref = `${b.prefix}${(r.roll ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`.slice(0, 20);
        for (let n = 2; taken.has(ref) && n < 100; n++) ref = `${ref.slice(0, 18)}${n}`;
        taken.add(ref);
        if (r.profileId) await tx.update(feeStudentProfiles).set({ feeRef: ref, updatedAt: new Date() }).where(eq(feeStudentProfiles.id, r.profileId));
        else await tx.insert(feeStudentProfiles).values({ tenantId: p.tenantId, studentId: r.id, feeRef: ref }).onConflictDoNothing();
        made++;
      }
      await auditUser(tx, p, 'fees.fee_refs_generated', 'fee_reminder', undefined, { prefix: b.prefix, made });
      return { made };
    });
  }

  // ---- Accrual basis ---------------------------------------------------------------------------------------

  /** Books what open invoices ask for that the books have not been told (after switching to the accrual basis). */
  @Post('fees/accruals/sync')
  @HttpCode(200)
  @Auth('user', HEADS)
  syncAll(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const invs = await tx.select({ id: feeInvoices.id }).from(feeInvoices).where(sql`${feeInvoices.status} <> 'cancelled' or exists (select 1 from fee_accruals a where a.invoice_id = ${feeInvoices.id})`);
      let journals = 0;
      for (const i of invs) {
        if (!(await tx.select({ id: feeInvoiceLines.id }).from(feeInvoiceLines).where(eq(feeInvoiceLines.invoiceId, i.id)).limit(1)).length) continue;
        journals += (await syncAccruals(tx, { tenantId: p.tenantId, userId: p.userId }, i.id, today, { note: 'Accrual sync' })).length;
      }
      await auditUser(tx, p, 'fees.accruals_synced', 'fee_invoice', undefined, { invoices: invs.length, journals });
      return { invoices: invs.length, journals };
    });
  }

  // ---- Zoho Books export -----------------------------------------------------------------------------------

  /** The vouchers of a period (one fund or fee account's books, or all) as Zoho Books' manual journal import file. */
  @Get('books/zoho.csv')
  @Auth('user', FEE_ROLES)
  zoho(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const b = ZohoQuery.safeParse(q);
    if (!b.success) throw new BadRequestException('Give from and to dates (YYYY-MM-DD)');
    if (b.data.from > b.data.to) throw new BadRequestException('The start date is after the end date');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fundId = b.data.fund ?? (b.data.account ? ((await tx.select({ f: feeAccounts.fundId }).from(feeAccounts).where(eq(feeAccounts.id, b.data.account)))[0]?.f ?? undefined) : undefined);
      const vs = await voucherLines(tx, { from: b.data.from, to: b.data.to, fundId: fundId ?? undefined });
      await auditUser(tx, p, 'books.zoho_exported', 'tenant', p.tenantId, { from: b.data.from, to: b.data.to, vouchers: vs.length, fundId: fundId ?? null });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="zoho-journals-${b.data.from}-to-${b.data.to}.csv"`);
      return zohoJournalCsv(vs.map((v) => ({ date: v.date, number: v.number, narration: v.narration, voucherType: v.voucherType, lines: v.lines.map((l) => ({ accountName: l.accountName, code: l.code, debitPaise: l.debitPaise, creditPaise: l.creditPaise })) })));
    });
  }

  /** Students' fee structures, for the transfer dialog. */
  @Get('fee-setup/students/:id/structures')
  @Auth('user', FEE_ROLES)
  studentStructures(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      assigned: await tx.select({ id: feeAssignments.id, structureId: feeAssignments.structureId, name: feeStructures.name, amountPaise: feeAssignments.amountPaise, prorataPercent: feeAssignments.prorataPercent, status: feeAssignments.status, invoiceId: feeAssignments.invoiceId }).from(feeAssignments).innerJoin(feeStructures, eq(feeStructures.id, feeAssignments.structureId)).where(eq(feeAssignments.studentId, studentId)).orderBy(desc(feeAssignments.createdAt)),
      published: await tx.select({ id: feeStructures.id, name: feeStructures.name, academicYear: feeStructures.academicYear, programId: feeStructures.programId }).from(feeStructures).where(and(eq(feeStructures.status, 'published'), eq(feeStructures.active, true))).orderBy(asc(feeStructures.name)),
    }));
  }
}
