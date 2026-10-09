import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campuses, departments, departmentStaff, designations, staffProfiles, tenants, trainingRecords, userRoles, users } from '../db/schema.js';
import { probationReviews, staffTransfers } from '../db/schema-assist.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { hasAnyRole, HR_ROLES, isHr, PAYROLL_APPROVERS, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { probationLetterPdf } from './probation-letter.js';
import { addMonths, daysUntil, DEFAULT_PROBATION_MONTHS, probationEnd, REVIEW_LEAD_DAYS } from './probation-math.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const RecommendBody = z.object({ recommendation: z.enum(['confirm', 'extend']), remarks: z.string().trim().max(1000).default('') });
const DecideBody = z.object({ decision: z.enum(['confirm', 'extend']), remarks: z.string().trim().max(1000).default(''), extendMonths: z.number().int().min(1).max(12).default(3) });
const TransferBody = z.object({
  userId: z.uuid(),
  toDepartmentId: z.uuid().nullish(),
  toDesignationId: z.uuid().nullish(),
  toCampusId: z.uuid().nullish(),
  effectiveOn: Day,
  reason: z.string().trim().max(1000).default(''),
});
const MAX_CERT_BYTES = 5 * 1024 * 1024;

/** Probation confirmation, staff transfers and training certificates (docs/architecture/hr-payroll.md). */
@Controller('v1/hr')
export class StaffChangesController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  private act = (p: UserPrincipal) => ({ tenantId: p.tenantId, actorType: 'user' as const, actorId: p.userId });

  // ---- probation ---------------------------------------------------------------------------------------

  /** Staff on probation with the date it ends and where the review stands. A head of department sees their own department only. */
  @Get('probation')
  @Auth('user', ['tenant_admin', 'principal', 'hr_manager', 'hod'])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('all') all?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.hr.today(tx);
      const rows = await tx
        .select({ userId: staffProfiles.userId, name: users.fullName, code: staffProfiles.employeeCode, doj: staffProfiles.dateOfJoining, department: departments.name, headUserId: departments.headUserId, designation: designations.name })
        .from(staffProfiles)
        .innerJoin(users, eq(users.id, staffProfiles.userId))
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
        .where(and(eq(staffProfiles.status, 'active'), eq(staffProfiles.employmentType, 'probation')))
        .orderBy(asc(users.fullName));
      const mine = isHr(p) ? rows : rows.filter((r) => r.headUserId === p.userId);
      const reviews = mine.length ? await tx.select().from(probationReviews).where(and(inArray(probationReviews.userId, mine.map((r) => r.userId)), inArray(probationReviews.status, ['pending', 'recommended']))) : [];
      const out = mine.map((r) => {
        const review = reviews.find((x) => x.userId === r.userId) ?? null;
        const dueOn = review?.dueOn ?? (r.doj ? probationEnd(r.doj) : null);
        const left = dueOn ? daysUntil(today, dueOn) : null;
        return { userId: r.userId, fullName: r.name, employeeCode: r.code, department: r.department, designation: r.designation, joinedOn: r.doj, dueOn, daysLeft: left, due: left !== null && left <= REVIEW_LEAD_DAYS, review };
      });
      return all === '1' ? out : out.filter((r) => r.due);
    });
  }

  /** The HoD (or HR) records whether to confirm or extend. */
  @Post('probation/:userId/recommend')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal', 'hr_manager', 'hod'])
  recommend(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(RecommendBody)) b: z.infer<typeof RecommendBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sp = await this.probationer(tx, userId);
      if (!isHr(p)) {
        const [d] = sp.departmentId ? await tx.select({ head: departments.headUserId }).from(departments).where(eq(departments.id, sp.departmentId)) : [];
        if (d?.head !== p.userId) throw new ForbiddenException('Only the head of the department can recommend');
      }
      const review = await this.openReview(tx, p.tenantId, sp);
      const [row] = await tx.update(probationReviews).set({ status: 'recommended', recommendation: b.recommendation, hodRemarks: b.remarks || null, hodId: p.userId, recommendedAt: new Date() }).where(eq(probationReviews.id, review.id)).returning();
      await audit(tx, { ...this.act(p), action: 'hr.probation_recommended.v1', subjectType: 'probation_review', subjectId: row.id, data: { userId, recommendation: b.recommendation } });
      return row;
    });
  }

  /** The principal confirms (the staff member becomes permanent) or extends probation by a few months. */
  @Post('probation/:userId/decide')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sp = await this.probationer(tx, userId);
      const review = await this.openReview(tx, p.tenantId, sp);
      if (review.status !== 'recommended') {
        const [d] = sp.departmentId ? await tx.select({ head: departments.headUserId }).from(departments).where(eq(departments.id, sp.departmentId)) : [];
        if (d?.head) throw new ConflictException('The head of the department has not made a recommendation yet');
      }
      const today = await this.hr.today(tx);
      const letterNo = `PRB/${today.slice(0, 4)}/${review.id.slice(0, 6).toUpperCase()}`;
      const common = { decidedBy: p.userId, decidedAt: new Date(), decisionRemarks: b.remarks || null, letterNo };
      let row;
      if (b.decision === 'confirm') {
        [row] = await tx.update(probationReviews).set({ ...common, status: 'confirmed' }).where(eq(probationReviews.id, review.id)).returning();
        await tx.update(staffProfiles).set({ employmentType: 'permanent', updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
      } else {
        const until = addMonths(review.dueOn > today ? review.dueOn : today, b.extendMonths);
        [row] = await tx.update(probationReviews).set({ ...common, status: 'extended', extendedUntil: until }).where(eq(probationReviews.id, review.id)).returning();
        await tx.insert(probationReviews).values({ tenantId: p.tenantId, userId, dueOn: until });
      }
      await audit(tx, { ...this.act(p), action: `hr.probation_${b.decision === 'confirm' ? 'confirmed' : 'extended'}.v1`, subjectType: 'probation_review', subjectId: row.id, data: { userId, until: row.extendedUntil } });
      return row;
    });
  }

  /** Review history of one staff member. */
  @Get('probation/:userId/history')
  @Auth('user', ['tenant_admin', 'principal', 'hr_manager', 'hod'])
  history(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(probationReviews).where(eq(probationReviews.userId, userId)).orderBy(desc(probationReviews.dueOn)));
  }

  /** The confirmation or extension letter of a decided review. */
  @Get('probation/reviews/:id/letter')
  @Auth('user', STAFF_ROLES)
  async letter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const d = await this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(probationReviews).where(eq(probationReviews.id, id));
      if (!r || (r.status !== 'confirmed' && r.status !== 'extended')) throw new NotFoundException('There is no letter for this review');
      if (!isHr(p) && r.userId !== p.userId) throw new NotFoundException('There is no letter for this review');
      const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, r.userId));
      const [sp] = await tx
        .select({ code: staffProfiles.employeeCode, doj: staffProfiles.dateOfJoining, designation: designations.name, department: departments.name })
        .from(staffProfiles)
        .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .where(eq(staffProfiles.userId, r.userId));
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { r, name: u?.name ?? '', sp, institution: t?.name ?? '' };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="probation-letter.pdf"');
    const decidedOn = (d.r.decidedAt ?? new Date()).toISOString().slice(0, 10);
    return new StreamableFile(
      probationLetterPdf({
        institution: d.institution,
        employeeName: d.name,
        employeeCode: d.sp?.code ?? null,
        designation: d.sp?.designation ?? null,
        department: d.sp?.department ?? null,
        joinedOn: d.sp?.doj ?? null,
        outcome: d.r.status === 'confirmed' ? 'confirmed' : 'extended',
        decidedOn,
        effectiveOn: d.r.status === 'confirmed' ? d.r.dueOn : (d.r.extendedUntil ?? d.r.dueOn),
        remarks: d.r.decisionRemarks,
        referenceNo: d.r.letterNo ?? 'PRB',
      }),
    );
  }

  private async probationer(tx: Tx, userId: string) {
    const [sp] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId));
    if (!sp) throw new NotFoundException('Staff member not found');
    if (sp.employmentType !== 'probation') throw new ConflictException('This staff member is not on probation');
    return sp;
  }

  /** The review in progress, started on first use from the joining date. */
  private async openReview(tx: Tx, tenantId: string, sp: typeof staffProfiles.$inferSelect) {
    const [open] = await tx.select().from(probationReviews).where(and(eq(probationReviews.userId, sp.userId), inArray(probationReviews.status, ['pending', 'recommended'])));
    if (open) return open;
    if (!sp.dateOfJoining) throw new BadRequestException('Add the date of joining first');
    const [row] = await tx.insert(probationReviews).values({ tenantId, userId: sp.userId, dueOn: probationEnd(sp.dateOfJoining, DEFAULT_PROBATION_MONTHS) }).returning();
    return row;
  }

  // ---- transfers ---------------------------------------------------------------------------------------

  /** Transfer history, newest first. Staff see their own. Transfers whose date has come are applied first. */
  @Get('transfers')
  @Auth('user', STAFF_ROLES)
  transfers(@CurrentPrincipal() p: UserPrincipal, @Query('userId') userId?: string) {
    const who = isHr(p) ? (userId && z.uuid().safeParse(userId).success ? userId : undefined) : p.userId;
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (isHr(p)) await this.applyDue(tx, p);
      const rows = await tx.select().from(staffTransfers).where(who ? eq(staffTransfers.userId, who) : undefined).orderBy(desc(staffTransfers.effectiveOn), desc(staffTransfers.createdAt)).limit(300);
      const names = await this.names(tx, rows);
      return rows.map((r) => ({ ...r, fullName: names.users.get(r.userId) ?? null, from: { department: names.dept.get(r.fromDepartmentId ?? ''), designation: names.desig.get(r.fromDesignationId ?? ''), campus: names.campus.get(r.fromCampusId ?? '') }, to: { department: names.dept.get(r.toDepartmentId ?? ''), designation: names.desig.get(r.toDesignationId ?? ''), campus: names.campus.get(r.toCampusId ?? '') } }));
    });
  }

  /** The departments, designations and campuses a transfer can move to. */
  @Get('transfers/options')
  @Auth('user', HR_ROLES)
  transferOptions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      departments: await tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
      designations: await tx.select({ id: designations.id, name: designations.name }).from(designations).orderBy(asc(designations.name)),
      campuses: await tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name)),
    }));
  }

  @Post('transfers')
  @Auth('user', HR_ROLES)
  transfer(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TransferBody)) b: z.infer<typeof TransferBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sp] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, b.userId));
      if (!sp) throw new NotFoundException('Staff member not found');
      if (sp.status !== 'active') throw new ConflictException('Only active staff can be transferred');
      const campusRows = await tx.select({ c: userRoles.campusId }).from(userRoles).where(and(eq(userRoles.userId, b.userId), sql`${userRoles.campusId} is not null`));
      const here = [...new Set(campusRows.map((x) => x.c!))];
      const fromCampus = here.length === 1 ? here[0] : null;
      const toDept = b.toDepartmentId && b.toDepartmentId !== sp.departmentId ? b.toDepartmentId : null;
      const toDesig = b.toDesignationId && b.toDesignationId !== sp.designationId ? b.toDesignationId : null;
      const toCampus = b.toCampusId && b.toCampusId !== fromCampus ? b.toCampusId : null;
      if (!toDept && !toDesig && !toCampus) throw new BadRequestException('Choose a new department, campus or designation');
      for (const [table, id, what] of [[departments, toDept, 'department'], [designations, toDesig, 'designation'], [campuses, toCampus, 'campus']] as const) {
        if (!id) continue;
        const [hit] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id));
        if (!hit) throw new BadRequestException(`That ${what} does not exist`);
      }
      const [row] = await tx
        .insert(staffTransfers)
        .values({ tenantId: p.tenantId, userId: b.userId, fromDepartmentId: toDept ? sp.departmentId : null, toDepartmentId: toDept, fromDesignationId: toDesig ? sp.designationId : null, toDesignationId: toDesig, fromCampusId: toCampus ? fromCampus : null, toCampusId: toCampus, effectiveOn: b.effectiveOn, reason: b.reason, createdBy: p.userId })
        .returning();
      await audit(tx, { ...this.act(p), action: 'hr.transfer_created.v1', subjectType: 'staff_transfer', subjectId: row.id, data: { userId: b.userId, effectiveOn: b.effectiveOn } });
      await this.applyDue(tx, p);
      const [fresh] = await tx.select().from(staffTransfers).where(eq(staffTransfers.id, row.id));
      return fresh;
    });
  }

  @Post('transfers/apply-due')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  applyNow(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ applied: await this.applyDue(tx, p) }));
  }

  @Post('transfers/:id/cancel')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(staffTransfers).set({ status: 'cancelled' }).where(and(eq(staffTransfers.id, id), eq(staffTransfers.status, 'scheduled'))).returning();
      if (!row) throw new ConflictException('Only a transfer that has not started can be cancelled');
      await audit(tx, { ...this.act(p), action: 'hr.transfer_cancelled.v1', subjectType: 'staff_transfer', subjectId: id, data: {} });
      return row;
    });
  }

  /** Moves staff whose transfer date has come. The staff record, the department list and campus-bound roles follow. */
  private async applyDue(tx: Tx, p: UserPrincipal): Promise<number> {
    const today = await this.hr.today(tx);
    const due = await tx.select().from(staffTransfers).where(and(eq(staffTransfers.status, 'scheduled'), sql`${staffTransfers.effectiveOn} <= ${today}`)).orderBy(asc(staffTransfers.effectiveOn), asc(staffTransfers.createdAt)).for('update', { skipLocked: true });
    for (const t of due) {
      const patch: Partial<typeof staffProfiles.$inferInsert> = { updatedAt: new Date() };
      if (t.toDepartmentId) patch.departmentId = t.toDepartmentId;
      if (t.toDesignationId) patch.designationId = t.toDesignationId;
      await tx.update(staffProfiles).set(patch).where(eq(staffProfiles.userId, t.userId));
      if (t.toDepartmentId) {
        if (t.fromDepartmentId) await tx.delete(departmentStaff).where(and(eq(departmentStaff.userId, t.userId), eq(departmentStaff.departmentId, t.fromDepartmentId)));
        await tx.insert(departmentStaff).values({ tenantId: t.tenantId, userId: t.userId, departmentId: t.toDepartmentId }).onConflictDoNothing();
      }
      if (t.toCampusId && t.fromCampusId) {
        await tx.execute(sql`update user_roles r set campus_id = ${t.toCampusId} where r.user_id = ${t.userId} and r.campus_id = ${t.fromCampusId} and not exists (select 1 from user_roles x where x.user_id = r.user_id and x.role = r.role and x.campus_id = ${t.toCampusId})`);
      }
      await tx.update(staffTransfers).set({ status: 'applied', appliedAt: new Date() }).where(eq(staffTransfers.id, t.id));
      await audit(tx, { ...this.act(p), action: 'hr.transfer_applied.v1', subjectType: 'staff_transfer', subjectId: t.id, data: { userId: t.userId } });
    }
    return due.length;
  }

  private async names(tx: Tx, rows: (typeof staffTransfers.$inferSelect)[]) {
    const ids = (f: (r: (typeof rows)[number]) => (string | null)[]) => [...new Set(rows.flatMap(f).filter((x): x is string => !!x))];
    const map = async <T extends { id: string }>(list: string[], q: (l: string[]) => Promise<(T & { name: string })[]>) => new Map((list.length ? await q(list) : []).map((r) => [r.id, r.name]));
    return {
      users: await map(ids((r) => [r.userId]), (l) => tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, l))),
      dept: await map(ids((r) => [r.fromDepartmentId, r.toDepartmentId]), (l) => tx.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, l))),
      desig: await map(ids((r) => [r.fromDesignationId, r.toDesignationId]), (l) => tx.select({ id: designations.id, name: designations.name }).from(designations).where(inArray(designations.id, l))),
      campus: await map(ids((r) => [r.fromCampusId, r.toCampusId]), (l) => tx.select({ id: campuses.id, name: campuses.name }).from(campuses).where(inArray(campuses.id, l))),
    };
  }

  // ---- training certificates ---------------------------------------------------------------------------

  /** Attaches the certificate (PDF, JPEG or PNG) to a training record; a new upload replaces the old one. Multipart field `file`. */
  @Post('training-records/:id/certificate')
  @Auth('user', STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CERT_BYTES, files: 1 } }))
  async uploadCertificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the certificate file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The certificate must be a PDF, JPEG or PNG');
    const rec = await this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(trainingRecords).where(eq(trainingRecords.id, id));
      if (!r) throw new NotFoundException('Record not found');
      if (!isHr(p) && r.userId !== p.userId) throw new ForbiddenException('You can attach certificates to your own records only');
      return r;
    });
    await this.scans.assertClean(file.buffer, 'The certificate');
    const key = `tenants/${p.tenantId}/hr/training/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_CERT_BYTES, type);
    try {
      const row = await this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx.update(trainingRecords).set({ certificateKey: key, certificateType: type, certificateName: file.originalname.slice(0, 200) }).where(eq(trainingRecords.id, id)).returning();
        await audit(tx, { ...this.act(p), action: 'hr.training_certificate_uploaded.v1', subjectType: 'training_record', subjectId: id, data: { type } });
        return r;
      });
      if (rec.certificateKey) await this.storage.delete(rec.certificateKey).catch(() => undefined);
      return row;
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  @Get('training-records/:id/certificate')
  @Auth('user', STAFF_ROLES)
  async certificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(trainingRecords).where(eq(trainingRecords.id, id));
      if (!row?.certificateKey || (!isHr(p) && !hasAnyRole(p, ['hod']) && row.userId !== p.userId)) throw new NotFoundException('No certificate attached');
      return row;
    });
    const { stream, size } = await this.storage.get(r.certificateKey!);
    res.set({ 'content-type': r.certificateType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }
}
