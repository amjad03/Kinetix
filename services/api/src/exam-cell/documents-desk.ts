import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Ip, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { academicDocRequests, applications, certificates, recordCorrections, students, users, verificationRequests } from '../db/schema.js';
import { DOC_TITLE, type DocKind } from '../academic-docs/academic-docs.logic.js';
import { RecordRegistry, type RecordEntity } from '../records/entity.js';
import { OptionalText, Ref, Text } from '../records/helpers.js';
import { auditCell, CELL, CELL_READ } from './common.js';
import { supersedeDocuments } from './result-runs.js';
import { cellSettings } from './settings.js';
import { studentOptions } from './withholds.js';

export const CORRECTION_FIELDS = ['full_name', 'date_of_birth', 'gender', 'guardian_name'] as const;
const FIELD_WORDS: Record<(typeof CORRECTION_FIELDS)[number], string> = { full_name: 'Name', date_of_birth: 'Date of birth', gender: 'Gender', guardian_name: "Parent's or guardian's name" };

const DuplicateBody = z.object({ affidavitRef: z.string().trim().min(3).max(200), firNo: z.string().trim().max(100).optional(), reason: z.string().trim().min(3).max(300) });
const PayBody = z.object({ paymentRef: z.string().trim().min(3).max(100) });
const CorrectionBody = z.object({ field: z.enum(CORRECTION_FIELDS), requestedValue: z.string().trim().min(1).max(200), reason: z.string().trim().min(3).max(500), documentRef: z.string().trim().min(3).max(300) });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });
const PublicVerifyBody = z.object({ requesterName: z.string().trim().min(2).max(120), organisation: z.string().trim().min(2).max(200), email: z.email().max(200), serialNo: z.string().trim().min(3).max(80), candidateName: z.string().trim().min(2).max(120) });
const RejectBody = z.object({ note: z.string().trim().min(3).max(500) });

/** The value a correction would change, read from the record. */
async function currentValue(tx: Tx, studentId: string, field: (typeof CORRECTION_FIELDS)[number]): Promise<{ value: string | null; applicationId: string | null }> {
  const [s] = await tx.select({ name: students.fullName, applicationId: students.applicationId }).from(students).where(eq(students.id, studentId));
  if (!s) throw new NotFoundException('Student not found');
  if (field === 'full_name') return { value: s.name, applicationId: s.applicationId };
  if (!s.applicationId) return { value: null, applicationId: null };
  const [a] = await tx.select({ dob: applications.dateOfBirth, gender: applications.gender, guardian: applications.guardianName }).from(applications).where(eq(applications.id, s.applicationId));
  return { value: field === 'date_of_birth' ? (a?.dob ?? null) : field === 'gender' ? (a?.gender ?? null) : (a?.guardian ?? null), applicationId: s.applicationId };
}

export async function fileCorrection(tx: Tx, p: UserPrincipal, studentId: string, b: z.infer<typeof CorrectionBody>): Promise<string> {
  if (b.field === 'date_of_birth' && !/^\d{4}-\d{2}-\d{2}$/.test(b.requestedValue)) throw new BadRequestException('Give the date of birth like 2006-05-14');
  const cur = await currentValue(tx, studentId, b.field);
  if (b.field !== 'full_name' && !cur.applicationId) throw new ConflictException(`${FIELD_WORDS[b.field]} of this student is not held in ZYNETIX; it is kept with the admission application`);
  if ((cur.value ?? '').trim().toLowerCase() === b.requestedValue.trim().toLowerCase()) throw new BadRequestException('That is already the value on record');
  const [open] = await tx.select({ id: recordCorrections.id }).from(recordCorrections).where(and(eq(recordCorrections.studentId, studentId), eq(recordCorrections.field, b.field), sql`${recordCorrections.status} in ('requested', 'approved')`));
  if (open) throw new ConflictException('A correction of this field is already open');
  const [row] = await tx.insert(recordCorrections).values({ tenantId: p.tenantId, studentId, field: b.field, currentValue: cur.value, requestedValue: b.requestedValue, reason: b.reason, documentRef: b.documentRef, createdBy: p.userId }).returning({ id: recordCorrections.id });
  return row.id;
}

/**
 * Academic documents after issue: duplicates of a lost or damaged document (affidavit or FIR, a fee, marked as a
 * duplicate), reissue of a copy made out of date by a correction or a grade change, name / date of birth corrections
 * with a supporting document, and verification requests from employers and other institutions with a fee.
 */
@Controller('v1')
export class DocumentsDeskController {
  constructor(private readonly db: DbService) {}

  @Post('academic-docs/requests/:id/duplicate')
  @Auth('user')
  duplicate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DuplicateBody)) b: z.infer<typeof DuplicateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [orig] = await tx.select().from(academicDocRequests).where(eq(academicDocRequests.id, id));
      if (!orig) throw new NotFoundException('Request not found');
      await assertCanSeeStudent(tx, p, orig.studentId, CELL);
      if (orig.status !== 'issued') throw new ConflictException('Only an issued document can be issued again as a duplicate');
      const [open] = await tx.select({ id: academicDocRequests.id }).from(academicDocRequests).where(and(eq(academicDocRequests.originalId, id), sql`${academicDocRequests.status} in ('requested', 'approved')`));
      if (open) throw new ConflictException('A duplicate of this document is already being processed');
      const fee = (await cellSettings(tx)).duplicateFeePaise;
      const [row] = await tx
        .insert(academicDocRequests)
        .values({ tenantId: p.tenantId, studentId: orig.studentId, kind: orig.kind, purpose: `Duplicate: ${b.reason}`, requestedBy: p.userId, duplicate: true, originalId: id, affidavitRef: b.affidavitRef, firNo: b.firNo ?? null, feePaise: fee })
        .returning();
      await auditCell(tx, p, 'academic_doc.duplicate_requested', 'academic_doc_request', row.id, { data: { originalId: id, affidavitRef: b.affidavitRef, firNo: b.firNo ?? null, feePaise: fee } });
      return row;
    });
  }

  /** Records the fee (duplicate or reissue) as paid; issuing waits for it. */
  @Post('academic-docs/requests/:id/pay')
  @HttpCode(200)
  @Auth('user', CELL)
  pay(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PayBody)) b: z.infer<typeof PayBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(academicDocRequests).where(eq(academicDocRequests.id, id));
      if (!r) throw new NotFoundException('Request not found');
      if (r.feePaise <= 0) throw new ConflictException('This request has no fee');
      if (r.paymentRef) throw new ConflictException('The fee is already recorded');
      const [row] = await tx.update(academicDocRequests).set({ paymentRef: b.paymentRef }).where(eq(academicDocRequests.id, id)).returning();
      await auditCell(tx, p, 'academic_doc.fee_paid', 'academic_doc_request', id, { data: { paymentRef: b.paymentRef, feePaise: r.feePaise } });
      return row;
    });
  }

  /** A fresh copy of an issued document that a correction or grade change made out of date; it goes straight to approved. */
  @Post('academic-docs/requests/:id/reissue')
  @HttpCode(200)
  @Auth('user', CELL)
  reissue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [orig] = await tx.select().from(academicDocRequests).where(eq(academicDocRequests.id, id));
      if (!orig) throw new NotFoundException('Request not found');
      if (orig.status !== 'issued' || !orig.supersededAt) throw new ConflictException('Only an issued document that is out of date is reissued');
      const [open] = await tx.select({ id: academicDocRequests.id }).from(academicDocRequests).where(and(eq(academicDocRequests.originalId, id), sql`${academicDocRequests.status} in ('requested', 'approved')`));
      if (open) throw new ConflictException('A new copy is already being prepared');
      const [row] = await tx.insert(academicDocRequests).values({ tenantId: p.tenantId, studentId: orig.studentId, kind: orig.kind, purpose: `Reissue: ${orig.supersededReason ?? 'record corrected'}`.slice(0, 300), requestedBy: p.userId, originalId: id, status: 'approved', decidedBy: p.userId, decidedAt: new Date(), decisionNote: 'Reissued after a correction' }).returning();
      await auditCell(tx, p, 'academic_doc.reissue_started', 'academic_doc_request', row.id, { data: { originalId: id } });
      return row;
    });
  }

  // ---- record corrections -------------------------------------------------------------------

  @Post('students/:studentId/record-corrections')
  @Auth('user')
  requestCorrection(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(CorrectionBody)) b: z.infer<typeof CorrectionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL);
      const id = await fileCorrection(tx, p, studentId, b);
      await auditCell(tx, p, 'record_correction.created', 'record_correction', id, { after: { field: b.field, requestedValue: b.requestedValue } });
      const [row] = await tx.select().from(recordCorrections).where(eq(recordCorrections.id, id));
      return row;
    });
  }

  @Get('students/:studentId/record-corrections')
  @Auth('user')
  corrections(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL_READ);
      return tx.select().from(recordCorrections).where(eq(recordCorrections.studentId, studentId)).orderBy(desc(recordCorrections.createdAt));
    });
  }

  @Post('record-corrections/:id/decide')
  @HttpCode(200)
  @Auth('user', CELL)
  decideCorrection(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.correction(tx, id);
      if (c.status !== 'requested') throw new ConflictException('This correction is already decided');
      if (!b.approve && !b.note) throw new BadRequestException('Say why the correction is not approved');
      const status = b.approve ? 'approved' : 'rejected';
      const [row] = await tx.update(recordCorrections).set({ status, decisionNote: b.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(recordCorrections.id, id)).returning();
      await auditCell(tx, p, `record_correction.${status}`, 'record_correction', id, { before: { status: 'requested' }, after: { status }, data: { note: b.note ?? null } });
      return row;
    });
  }

  /** Changes the record (audited before and after on the student) and marks the student's issued documents for reissue. */
  @Post('record-corrections/:id/apply')
  @HttpCode(200)
  @Auth('user', CELL)
  applyCorrection(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.correction(tx, id);
      if (c.status !== 'approved') throw new ConflictException(c.status === 'applied' ? 'This correction is already applied' : 'Approve the correction first');
      const field = c.field as (typeof CORRECTION_FIELDS)[number];
      const cur = await currentValue(tx, c.studentId, field);
      if (field === 'full_name') {
        const [s] = await tx.update(students).set({ fullName: c.requestedValue, updatedAt: new Date() }).where(eq(students.id, c.studentId)).returning({ userId: students.userId });
        if (s?.userId) await tx.update(users).set({ fullName: c.requestedValue }).where(eq(users.id, s.userId));
      } else {
        if (!cur.applicationId) throw new ConflictException('This value is not held in ZYNETIX');
        const set = field === 'date_of_birth' ? { dateOfBirth: c.requestedValue } : field === 'gender' ? { gender: c.requestedValue } : { guardianName: c.requestedValue };
        await tx.update(applications).set(set).where(eq(applications.id, cur.applicationId));
      }
      const reissued = await supersedeDocuments(tx, c.studentId, `${FIELD_WORDS[field]} corrected`);
      const [row] = await tx.update(recordCorrections).set({ status: 'applied', appliedAt: new Date(), reissued }).where(eq(recordCorrections.id, id)).returning();
      await auditCell(tx, p, 'student.corrected', 'student', c.studentId, { before: { [field]: cur.value }, after: { [field]: c.requestedValue }, data: { correctionId: id, documentRef: c.documentRef } });
      await auditCell(tx, p, 'record_correction.applied', 'record_correction', id, { before: { status: 'approved' }, after: { status: 'applied' }, data: { reissued } });
      return row;
    });
  }

  // ---- verification requests ----------------------------------------------------------------

  @Post('verification-requests/:id/pay')
  @HttpCode(200)
  @Auth('user', CELL)
  payVerification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PayBody)) b: z.infer<typeof PayBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.verification(tx, id);
      if (v.status !== 'received') throw new ConflictException('The fee is already recorded');
      const [row] = await tx.update(verificationRequests).set({ status: 'paid', paymentRef: b.paymentRef }).where(eq(verificationRequests.id, id)).returning();
      await auditCell(tx, p, 'verification_request.paid', 'verification_request', id, { before: { status: v.status }, after: { status: 'paid' }, data: { paymentRef: b.paymentRef } });
      return row;
    });
  }

  /** Checks the serial number and name against the documents issued: verified, or a mismatch with what does not match. */
  @Post('verification-requests/:id/check')
  @HttpCode(200)
  @Auth('user', CELL)
  check(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.verification(tx, id);
      if (v.status !== 'paid' && !(v.status === 'received' && v.feePaise === 0)) throw new ConflictException(v.status === 'received' ? 'Record the verification fee first' : 'This request is already answered');
      const serial = v.serialNo.trim();
      const [doc] = await tx.select({ id: academicDocRequests.id, kind: academicDocRequests.kind, status: academicDocRequests.status, name: students.fullName, issuedAt: academicDocRequests.issuedAt, superseded: academicDocRequests.supersededAt }).from(academicDocRequests).innerJoin(students, eq(students.id, academicDocRequests.studentId)).where(sql`lower(${academicDocRequests.serialNo}) = ${serial.toLowerCase()}`);
      const [cert] = doc ? [] : await tx.select({ id: certificates.id, status: certificates.status, title: certificates.renderedTitle, name: students.fullName, issuedAt: certificates.issuedAt }).from(certificates).leftJoin(students, eq(students.id, certificates.studentId)).where(sql`lower(${certificates.serialNo}) = ${serial.toLowerCase()}`);
      const found = doc ? { id: doc.id, title: DOC_TITLE[doc.kind as DocKind] ?? doc.kind, issued: doc.status === 'issued', name: doc.name, on: doc.issuedAt } : cert ? { id: cert.id, title: cert.title ?? 'Certificate', issued: cert.status === 'issued', name: cert.name ?? '', on: cert.issuedAt } : null;
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
      let status: 'verified' | 'mismatch';
      let outcome: string;
      if (!found || !found.issued) {
        status = 'mismatch';
        outcome = found ? `${found.title} ${serial} was not issued (it was cancelled or is not yet issued).` : `No document with the serial number ${serial} was issued by this institution.`;
      } else if (norm(found.name) !== norm(v.candidateName)) {
        status = 'mismatch';
        outcome = `${found.title} ${serial} was issued, but to a different name than "${v.candidateName}".`;
      } else {
        status = 'verified';
        outcome = `${found.title} ${serial} was issued to ${found.name}${found.on ? ` on ${found.on.toISOString().slice(0, 10)}` : ''}${doc?.superseded ? '; a corrected copy has since been issued' : ''}.`;
      }
      const [row] = await tx.update(verificationRequests).set({ status, outcome, documentId: found?.id ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(verificationRequests.id, id)).returning();
      await auditCell(tx, p, `verification_request.${status}`, 'verification_request', id, { before: { status: v.status }, after: { status }, data: { outcome } });
      return row;
    });
  }

  @Post('verification-requests/:id/reject')
  @HttpCode(200)
  @Auth('user', CELL)
  rejectVerification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RejectBody)) b: z.infer<typeof RejectBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.verification(tx, id);
      if (v.status === 'verified' || v.status === 'mismatch' || v.status === 'rejected') throw new ConflictException('This request is already answered');
      const [row] = await tx.update(verificationRequests).set({ status: 'rejected', outcome: b.note, decidedBy: p.userId, decidedAt: new Date() }).where(eq(verificationRequests.id, id)).returning();
      await auditCell(tx, p, 'verification_request.rejected', 'verification_request', id, { before: { status: v.status }, after: { status: 'rejected' }, data: { note: b.note } });
      return row;
    });
  }

  private async correction(tx: Tx, id: string) {
    const [c] = await tx.select().from(recordCorrections).where(eq(recordCorrections.id, id));
    if (!c) throw new NotFoundException('Correction not found');
    return c;
  }

  private async verification(tx: Tx, id: string) {
    const [v] = await tx.select().from(verificationRequests).where(eq(verificationRequests.id, id));
    if (!v) throw new NotFoundException('Request not found');
    return v;
  }
}

/** An employer or another institution asks to verify a document (public, rate limited); the office answers by email. */
@Controller('v1/public')
export class VerificationPublicController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('verification-requests/:slug')
  async submit(@Param('slug') slug: string, @Body(new ZodBody(PublicVerifyBody)) b: z.infer<typeof PublicVerifyBody>, @Ip() ip: string) {
    await this.limiter.hit(`verify-request:${ip}`, 10, 3_600_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('Institution not found');
    return this.db.withTenant(tenant.id, async (tx) => {
      const fee = (await cellSettings(tx)).verificationFeePaise;
      const [row] = await tx.insert(verificationRequests).values({ tenantId: tenant.id, ...b, feePaise: fee }).returning({ id: verificationRequests.id });
      return { id: row.id, feePaise: fee, status: 'received' };
    });
  }
}

const STATUS = (list: string[]) => list.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ') }));

export function correctionsEntity(): RecordEntity {
  return {
    key: 'record-corrections',
    module: 'exams',
    table: recordCorrections,
    subjectType: 'record_correction',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')}: ${FIELD_WORDS[r.field as (typeof CORRECTION_FIELDS)[number]] ?? String(r.field)}`.trim(),
    list: {
      select: { id: recordCorrections.id, studentId: recordCorrections.studentId, studentName: students.fullName, rollNo: students.rollNo, field: recordCorrections.field, currentValue: recordCorrections.currentValue, requestedValue: recordCorrections.requestedValue, reason: recordCorrections.reason, documentRef: recordCorrections.documentRef, status: recordCorrections.status, decisionNote: recordCorrections.decisionNote, reissued: recordCorrections.reissued, createdAt: recordCorrections.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, recordCorrections.studentId)),
      search: [students.fullName, students.rollNo, recordCorrections.requestedValue, recordCorrections.documentRef],
      filters: {
        status: { label: 'Status', options: STATUS(['requested', 'approved', 'rejected', 'applied']), where: (v) => (['requested', 'approved', 'rejected', 'applied'].includes(v) ? eq(recordCorrections.status, v) : undefined) },
        field: { label: 'Field', options: CORRECTION_FIELDS.map((f) => ({ value: f, label: FIELD_WORDS[f] })), where: (v) => ((CORRECTION_FIELDS as readonly string[]).includes(v) ? eq(recordCorrections.field, v) : undefined) },
      },
      sorts: { created: recordCorrections.createdAt, student: students.fullName, status: recordCorrections.status },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: recordCorrections.studentId, required: true, edit: false, options: studentOptions },
      field: { label: 'Field', type: 'select', schema: z.enum(CORRECTION_FIELDS), column: recordCorrections.field, required: true, edit: false, options: CORRECTION_FIELDS.map((f) => ({ value: f, label: FIELD_WORDS[f] })) },
      requestedValue: { label: 'Correct value', type: 'text', schema: Text(200), column: recordCorrections.requestedValue, required: true, edit: false },
      reason: { label: 'Reason', type: 'textarea', schema: Text(500), column: recordCorrections.reason, required: true, edit: false },
      documentRef: { label: 'Supporting document', type: 'text', schema: Text(300), column: recordCorrections.documentRef, required: true, edit: false, help: 'What it is and its number, e.g. SSLC marks card 2021/123456' },
    },
    create: async (ctx, v) => fileCorrection(ctx.tx, ctx.p, String(v.studentId), { field: v.field as (typeof CORRECTION_FIELDS)[number], requestedValue: String(v.requestedValue), reason: String(v.reason), documentRef: String(v.documentRef) }),
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: recordCorrections.status }).from(recordCorrections).where(eq(recordCorrections.id, id)))[0]?.s === 'applied' ? 'An applied correction stays on record' : null) },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'field', header: 'Field', value: (r) => FIELD_WORDS[r.field as (typeof CORRECTION_FIELDS)[number]] ?? String(r.field) },
      { key: 'currentValue', header: 'On record' },
      { key: 'requestedValue', header: 'Correct value' },
      { key: 'documentRef', header: 'Supporting document' },
      { key: 'status', header: 'Status' },
      { key: 'reissued', header: 'Documents to reissue' },
    ],
  };
}

export function verificationsEntity(): RecordEntity {
  return {
    key: 'verification-requests',
    module: 'exams',
    table: verificationRequests,
    subjectType: 'verification_request',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.serialNo)} (${String(r.organisation)})`,
    list: {
      select: { id: verificationRequests.id, requesterName: verificationRequests.requesterName, organisation: verificationRequests.organisation, email: verificationRequests.email, serialNo: verificationRequests.serialNo, candidateName: verificationRequests.candidateName, feePaise: verificationRequests.feePaise, paymentRef: verificationRequests.paymentRef, status: verificationRequests.status, outcome: verificationRequests.outcome, createdAt: verificationRequests.createdAt, decidedAt: verificationRequests.decidedAt },
      search: [verificationRequests.organisation, verificationRequests.serialNo, verificationRequests.candidateName, verificationRequests.requesterName],
      filters: { status: { label: 'Status', options: STATUS(['received', 'paid', 'verified', 'mismatch', 'rejected']), where: (v) => (['received', 'paid', 'verified', 'mismatch', 'rejected'].includes(v) ? eq(verificationRequests.status, v) : undefined) } },
      sorts: { created: verificationRequests.createdAt, organisation: verificationRequests.organisation, status: verificationRequests.status },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      requesterName: { label: 'Asked by', type: 'text', schema: Text(120), column: verificationRequests.requesterName, required: true },
      organisation: { label: 'Organisation', type: 'text', schema: Text(200), column: verificationRequests.organisation, required: true },
      email: { label: 'Email', type: 'email', schema: z.email().max(200), column: verificationRequests.email, required: true },
      serialNo: { label: 'Serial number', type: 'text', schema: Text(80), column: verificationRequests.serialNo, required: true },
      candidateName: { label: 'Candidate', type: 'text', schema: Text(120), column: verificationRequests.candidateName, required: true },
      outcome: { label: 'Answer', type: 'textarea', schema: OptionalText(1000), column: verificationRequests.outcome, create: false },
    },
    create: async (ctx, v) => {
      const fee = (await cellSettings(ctx.tx)).verificationFeePaise;
      const [row] = await ctx.tx.insert(verificationRequests).values({ tenantId: ctx.p.tenantId, requesterName: String(v.requesterName), organisation: String(v.organisation), email: String(v.email), serialNo: String(v.serialNo), candidateName: String(v.candidateName), feePaise: fee, createdBy: ctx.p.userId }).returning({ id: verificationRequests.id });
      return row.id;
    },
    remove: { guard: async (ctx, id) => (['verified', 'mismatch'].includes((await ctx.tx.select({ s: verificationRequests.status }).from(verificationRequests).where(eq(verificationRequests.id, id)))[0]?.s ?? '') ? 'An answered request stays on record' : null) },
    columns: [
      { key: 'createdAt', header: 'Received', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
      { key: 'organisation', header: 'Organisation' },
      { key: 'requesterName', header: 'Asked by' },
      { key: 'email', header: 'Email' },
      { key: 'serialNo', header: 'Serial number' },
      { key: 'candidateName', header: 'Candidate' },
      { key: 'feePaise', header: 'Fee (Rs)', value: (r) => Number(r.feePaise ?? 0) / 100 },
      { key: 'paymentRef', header: 'Payment' },
      { key: 'status', header: 'Status' },
      { key: 'outcome', header: 'Answer' },
    ],
  };
}


@Injectable()
export class DocumentDeskRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit(): void {
    this.registry.register(correctionsEntity());
    this.registry.register(verificationsEntity());
  }
}
