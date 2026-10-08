import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { bankTransferSubmissions, feeInvoices, feePayments, sections, students } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { FEE_ROLES, FeesService } from './fees.service.js';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');

/** Multipart fields arrive as text, so the amount is read from a string. */
const SubmitBody = z.object({
  invoiceId: z.uuid(),
  utr: z.string().trim().min(6).max(40).regex(/^[A-Za-z0-9\-/]+$/, 'The UTR can only have letters, digits, - and /'),
  amountPaise: z.coerce.number().int().min(100).max(100_000_000_00),
  transferDate: Day,
});
const RejectBody = z.object({ note: z.string().trim().min(1).max(300) });

/**
 * Bank-transfer payments (PRD section 66). A guardian reports a NEFT/IMPS/RTGS transfer with its UTR
 * (and optionally a screenshot or PDF of the confirmation). The accountant matches it against the
 * bank statement and verifies it, which records the payment through the same path as the counter
 * (numbered receipt, invoice credited, fee-paid event), or rejects it with a reason.
 */
@Controller()
export class BankTransfersController {
  constructor(
    private readonly db: DbService,
    private readonly fees: FeesService,
    private readonly events: EventBus,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  /** Parent App: report a transfer for one of the child's open fees. Multipart: the fields plus an optional `proof` file. */
  @Post('v1/parent/children/:studentId/bank-transfers')
  @Auth('user', ['guardian'])
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: MAX_PROOF_BYTES, files: 1 } }))
  async submit(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodBody(SubmitBody)) body: z.infer<typeof SubmitBody>,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    let proof: { key: string; type: string } | undefined;
    if (file?.buffer?.length) {
      const type = documentType(file.buffer);
      if (!type) throw new BadRequestException('The proof must be a PDF, JPEG or PNG');
      await this.scans.assertClean(file.buffer, 'The proof');
      const key = `tenants/${p.tenantId}/fees/bank-transfers/${body.invoiceId}-${Date.now()}`;
      await this.storage.put(key, Readable.from(file.buffer), MAX_PROOF_BYTES, type);
      proof = { key, type };
    }
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        await this.fees.assertCanSee(tx, p, studentId);
        const [inv] = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.id, body.invoiceId), eq(feeInvoices.studentId, studentId)));
        if (!inv) throw new NotFoundException('Invoice not found');
        if (inv.status !== 'due') throw new BadRequestException(inv.status === 'paid' ? 'This fee is already paid' : 'This fee was cancelled');
        const pending = await tx
          .select({ paise: sql<number>`coalesce(sum(${bankTransferSubmissions.amountPaise}), 0)::bigint`.mapWith(Number) })
          .from(bankTransferSubmissions)
          .where(and(eq(bankTransferSubmissions.invoiceId, inv.id), eq(bankTransferSubmissions.status, 'pending')));
        if (body.amountPaise > inv.amountPaise - inv.paidPaise - pending[0].paise) throw new BadRequestException('That is more than the balance due');
        const [row] = await tx
          .insert(bankTransferSubmissions)
          .values({ tenantId: p.tenantId, invoiceId: inv.id, studentId, submittedBy: p.userId, amountPaise: body.amountPaise, utr: body.utr, transferDate: body.transferDate, proofKey: proof?.key, proofType: proof?.type })
          .returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.bank_transfer_submitted', subjectType: 'bank_transfer', subjectId: row.id, data: { utr: body.utr, amountPaise: body.amountPaise } });
        await this.events.emit(tx, p.tenantId, { type: DomainEvents.BankTransferSubmitted, aggregateType: 'bank_transfer', aggregateId: row.id, payload: { invoiceId: inv.id, studentId, amountPaise: body.amountPaise, utr: body.utr } });
        return this.view(row);
      });
    } catch (e) {
      if (proof) await this.storage.delete(proof.key).catch(() => undefined);
      if ((e as { code?: string; cause?: { code?: string } }).code === '23505' || (e as { cause?: { code?: string } }).cause?.code === '23505') throw new BadRequestException('That UTR has already been submitted');
      throw e;
    }
  }

  /** Parent App: the child's submissions and where each stands. */
  @Get('v1/parent/children/:studentId/bank-transfers')
  @Auth('user', ['guardian'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.fees.assertCanSee(tx, p, studentId);
      const rows = await tx.select().from(bankTransferSubmissions).where(eq(bankTransferSubmissions.studentId, studentId)).orderBy(desc(bankTransferSubmissions.createdAt));
      return rows.map((r) => this.view(r));
    });
  }

  /** The accountant's queue: pending first, oldest first. */
  @Get('v1/fees/bank-transfers')
  @Auth('user', FEE_ROLES)
  queue(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    const st = z.enum(['pending', 'verified', 'rejected']).optional().safeParse(status || undefined);
    if (!st.success) throw new BadRequestException('Bad status');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          t: bankTransferSubmissions,
          invoiceTitle: feeInvoices.title,
          student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
          className: sections.displayName,
          balancePaise: sql<number>`${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}`.mapWith(Number),
        })
        .from(bankTransferSubmissions)
        .innerJoin(feeInvoices, eq(feeInvoices.id, bankTransferSubmissions.invoiceId))
        .innerJoin(students, eq(students.id, bankTransferSubmissions.studentId))
        .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
        .where(st.data ? eq(bankTransferSubmissions.status, st.data) : undefined)
        .orderBy(sql`(${bankTransferSubmissions.status} = 'pending') desc`, asc(bankTransferSubmissions.createdAt))
        .limit(500);
      return rows.map((r) => ({ ...this.view(r.t), invoiceTitle: r.invoiceTitle, student: r.student, className: r.className, balancePaise: r.balancePaise }));
    });
  }

  /** The proof the guardian attached: for the accounts office and the guardian who sent it. */
  @Get('v1/fees/bank-transfers/:id/proof')
  @Auth('user')
  async proof(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(bankTransferSubmissions).where(eq(bankTransferSubmissions.id, id));
      if (!row?.proofKey) throw new NotFoundException('No proof attached');
      if (!this.fees.isFeeStaff(p) && row.submittedBy !== p.userId) throw new NotFoundException('No proof attached');
      return row;
    });
    const { stream, size } = await this.storage.get(r.proofKey!);
    res.set({ 'content-type': r.proofType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }

  /** Verified against the bank statement: the payment is recorded like a counter payment and the guardian gets the receipt. */
  @Post('v1/fees/bank-transfers/:id/verify')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await this.pending(tx, id);
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, row.invoiceId)).for('update');
      if (!inv || inv.status !== 'due') throw new BadRequestException('This fee is no longer open');
      if (row.amountPaise > inv.amountPaise - inv.paidPaise) throw new BadRequestException('That is more than the balance due');
      const [pay] = await tx
        .insert(feePayments)
        .values({ tenantId: p.tenantId, invoiceId: inv.id, studentId: row.studentId, amountPaise: row.amountPaise, method: 'bank_transfer', status: 'created', reference: row.utr, payerUserId: row.submittedBy, recordedBy: p.userId })
        .returning();
      await this.fees.markPaid(tx, pay.id);
      const [done] = await tx.update(bankTransferSubmissions).set({ status: 'verified', reviewedBy: p.userId, reviewedAt: new Date(), paymentId: pay.id }).where(eq(bankTransferSubmissions.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.bank_transfer_verified', subjectType: 'bank_transfer', subjectId: id, data: { paymentId: pay.id, utr: row.utr } });
      return { ...this.view(done), receipt: await this.fees.receipt(tx, p, pay.id) };
    });
  }

  @Post('v1/fees/bank-transfers/:id/reject')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RejectBody)) body: z.infer<typeof RejectBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await this.pending(tx, id);
      const [done] = await tx.update(bankTransferSubmissions).set({ status: 'rejected', reviewedBy: p.userId, reviewedAt: new Date(), reviewNote: body.note }).where(eq(bankTransferSubmissions.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.bank_transfer_rejected', subjectType: 'bank_transfer', subjectId: id, data: { note: body.note } });
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.BankTransferRejected, aggregateType: 'bank_transfer', aggregateId: id, payload: { studentId: row.studentId, invoiceId: row.invoiceId, utr: row.utr, note: body.note } });
      return this.view(done);
    });
  }

  private async pending(tx: Tx, id: string) {
    const [row] = await tx.select().from(bankTransferSubmissions).where(eq(bankTransferSubmissions.id, id)).for('update');
    if (!row) throw new NotFoundException('Submission not found');
    if (row.status !== 'pending') throw new BadRequestException('This submission has already been reviewed');
    return row;
  }

  private view(r: typeof bankTransferSubmissions.$inferSelect) {
    return {
      id: r.id,
      invoiceId: r.invoiceId,
      studentId: r.studentId,
      amountPaise: r.amountPaise,
      utr: r.utr,
      transferDate: r.transferDate,
      hasProof: !!r.proofKey,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      paymentId: r.paymentId,
      createdAt: r.createdAt,
    };
  }
}
