import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { APPLICATION_MOVES, ENQUIRY_ACTIVITY_KINDS, ENQUIRY_SOURCES, ENQUIRY_STAGES, eligibilityFailures, meritScore, type ApplicationStatus } from '@kinetix/shared';
import { and, asc, desc, eq, ilike, inArray, lte, notInArray, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { Day, Phone } from '../common/zod-fields.js';
import { DbService } from '../db/db.service.js';
import { academicYears, admissionCycles, applicationDocuments, applicationPayments, applications, auditLog, enquiries, enquiryActivities, meritLists, programs, users } from '../db/schema.js';
import { ApplicationFeesService } from '../fees/application-fees.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { AdmissionsService, cycleConfig } from './admissions.service.js';
import { EnquiriesService } from './enquiries.service.js';

/** Who runs admissions: the office that counsels, reviews, makes offers and enrols. */
export const ADMISSIONS_ROLES: RoleName[] = ['tenant_admin', 'principal', 'admissions_officer'];

const Id = z.uuid();
const Key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use lowercase letters, digits and underscores');
const FormField = z.object({
  key: Key,
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'number', 'date', 'select', 'email', 'phone']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const DocSpec = z.object({ key: Key, label: z.string().trim().min(1).max(120), required: z.boolean().default(true) });
const CycleBase = z.object({
  programId: Id,
  academicYearId: Id,
  name: z.string().trim().min(3).max(120),
  entryTerm: z.number().int().min(1).max(20).default(1),
  seats: z.number().int().min(1).max(10_000),
  opensOn: Day,
  closesOn: Day,
  applicationFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  offerValidDays: z.number().int().min(1).max(60).default(7),
  formFields: z.array(FormField).max(60).default([]),
  documents: z.array(DocSpec).max(20).default([]),
  eligibility: z
    .object({
      minAge: z.number().int().min(0).max(100).optional(),
      maxAge: z.number().int().min(0).max(100).optional(),
      ageOn: Day.optional(),
      minimums: z.array(z.object({ field: z.string(), min: z.number() })).max(20).optional(),
      allowed: z.array(z.object({ field: z.string(), values: z.array(z.string()).min(1) })).max(20).optional(),
    })
    .default({}),
  meritRules: z.array(z.object({ field: z.string(), weight: z.number().min(0).max(1000) })).max(20).default([]),
});
// A patch must not apply the create defaults to fields it leaves out.
const CyclePatch = z.object(Object.fromEntries(Object.entries(CycleBase.omit({ programId: true, academicYearId: true }).shape).map(([k, v]) => [k, (v as z.ZodType).optional()]))) as unknown as z.ZodType<Partial<Omit<z.infer<typeof CycleBase>, 'programId' | 'academicYearId'>>>;

const EnquiryCreate = z.object({
  name: z.string().trim().min(2).max(120),
  phone: Phone,
  email: z.email().max(200).optional(),
  programId: Id.optional(),
  source: z.enum(ENQUIRY_SOURCES).default('walk_in'),
  message: z.string().trim().max(1000).optional(),
  counsellorId: Id.optional(),
  nextFollowUpOn: Day.optional(),
  campaignId: Id.optional(),
  utmSource: z.string().trim().max(80).optional(),
  utmMedium: z.string().trim().max(80).optional(),
  utmCampaign: z.string().trim().max(80).optional(),
  referralCode: z.string().trim().max(30).optional(),
});
const EnquiryPatch = z.object({ name: z.string().trim().min(2).max(120).optional(), phone: Phone.optional(), email: z.email().max(200).nullable().optional(), programId: Id.nullable().optional(), message: z.string().trim().max(1000).nullable().optional(), nextFollowUpOn: Day.nullable().optional() });
const StageBody = z.object({ stage: z.enum(ENQUIRY_STAGES), reason: z.string().trim().max(500).optional() });
const AssignBody = z.object({ counsellorId: Id.nullable() });
const ActivityBody = z.object({ kind: z.enum(ENQUIRY_ACTIVITY_KINDS), note: z.string().trim().min(1).max(1000), nextFollowUpOn: Day.nullable().optional() });

const APPLICATION_STATUSES = Object.keys(APPLICATION_MOVES) as [ApplicationStatus, ...ApplicationStatus[]];
const AppStatusBody = z.object({ status: z.enum(APPLICATION_STATUSES), reason: z.string().trim().max(500).optional() });
const CycleStatusBody = z.object({ status: z.enum(['draft', 'open', 'closed']) });
const CounterBody = z.object({ method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi']), reference: z.string().trim().max(100).optional() });
const WaiveBody = z.object({ reason: z.string().trim().min(3).max(300) });
const DocReviewBody = z.object({ status: z.enum(['verified', 'rejected']), note: z.string().trim().max(300).optional() });
const EnrollBody = z.object({ sectionId: Id.optional(), rollNo: z.string().trim().min(1).max(20).optional(), activate: z.boolean().default(true), duplicateOverride: z.string().trim().min(3).max(300).optional() });

/** Admissions for staff: the enquiry pipeline, cycles, application review, merit lists and enrolment. */
@Controller('v1/admissions')
export class AdmissionsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AdmissionsService,
    private readonly enquiriesSvc: EnquiriesService,
    private readonly fees: ApplicationFeesService,
    private readonly storage: ObjectStorage,
  ) {}

  private actor = (p: UserPrincipal) => ({ tenantId: p.tenantId, userId: p.userId });

  // ---- enquiries ---------------------------------------------------------------------------------

  @Get('pipeline')
  @Auth('user', ADMISSIONS_ROLES)
  pipeline(@CurrentPrincipal() p: UserPrincipal, @Query('mine') mine?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.enquiriesSvc.pipeline(tx, await this.svc.today(tx), mine === '1' ? p.userId : undefined));
  }

  @Get('enquiries')
  @Auth('user', ADMISSIONS_ROLES)
  listEnquiries(@CurrentPrincipal() p: UserPrincipal, @Query('stage') stage?: string, @Query('counsellorId') counsellorId?: string, @Query('q') q?: string, @Query('due') due?: string, @Query('mine') mine?: string, @Query('sort') sort?: string) {
    const s = q?.trim().replace(/[%_]/g, '');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.svc.today(tx);
      const rows = await tx
        .select({ e: enquiries, counsellorName: users.fullName, programName: programs.name })
        .from(enquiries)
        .leftJoin(users, eq(users.id, enquiries.counsellorId))
        .leftJoin(programs, eq(programs.id, enquiries.programId))
        .where(
          and(
            stage && (ENQUIRY_STAGES as readonly string[]).includes(stage) ? eq(enquiries.stage, stage as (typeof ENQUIRY_STAGES)[number]) : undefined,
            mine === '1' ? eq(enquiries.counsellorId, p.userId) : counsellorId && Id.safeParse(counsellorId).success ? eq(enquiries.counsellorId, counsellorId) : undefined,
            s ? or(ilike(enquiries.name, `%${s}%`), ilike(enquiries.phone, `%${s}%`)) : undefined,
            due === '1' ? and(lte(enquiries.nextFollowUpOn, today), notInArray(enquiries.stage, ['converted', 'lost'])) : undefined,
          ),
        )
        .orderBy(...(sort === 'score' ? [desc(enquiries.leadScore), desc(enquiries.createdAt)] : [desc(enquiries.createdAt)]))
        .limit(300);
      return rows.map((r) => ({ ...r.e, counsellorName: r.counsellorName, programName: r.programName }));
    });
  }

  @Post('enquiries')
  @Auth('user', ADMISSIONS_ROLES)
  createEnquiry(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EnquiryCreate)) body: z.infer<typeof EnquiryCreate>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.enquiriesSvc.create(tx, this.actor(p), body, await this.svc.today(tx)));
  }

  @Get('enquiries/:id')
  @Auth('user', ADMISSIONS_ROLES)
  getEnquiry(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.enquiriesSvc.get(tx, id);
      const activities = await tx
        .select({ a: enquiryActivities, actorName: users.fullName })
        .from(enquiryActivities)
        .leftJoin(users, eq(users.id, enquiryActivities.actorId))
        .where(eq(enquiryActivities.enquiryId, id))
        .orderBy(desc(enquiryActivities.createdAt));
      return { ...e, activities: activities.map((x) => ({ ...x.a, actorName: x.actorName })) };
    });
  }

  @Patch('enquiries/:id')
  @Auth('user', ADMISSIONS_ROLES)
  patchEnquiry(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EnquiryPatch)) body: z.infer<typeof EnquiryPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.enquiriesSvc.get(tx, id);
      const [row] = await tx.update(enquiries).set({ ...body, updatedAt: new Date() }).where(eq(enquiries.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'admissions.enquiry.updated.v1', subjectType: 'enquiry', subjectId: id, data: { fields: Object.keys(body) } });
      return this.enquiriesSvc.rescore(tx, row.id);
    });
  }

  @Post('enquiries/:id/assign')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AssignBody)) body: z.infer<typeof AssignBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enquiriesSvc.assign(tx, this.actor(p), id, body.counsellorId));
  }

  @Post('enquiries/:id/stage')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  stage(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StageBody)) body: z.infer<typeof StageBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enquiriesSvc.moveStage(tx, this.actor(p), id, body.stage, body.reason));
  }

  @Post('enquiries/:id/activities')
  @Auth('user', ADMISSIONS_ROLES)
  activity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActivityBody)) body: z.infer<typeof ActivityBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enquiriesSvc.logActivity(tx, this.actor(p), id, body));
  }

  /** Staff who can own an enquiry, for the assignment menu. */
  @Get('counsellors')
  @Auth('user', ADMISSIONS_ROLES)
  counsellors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.execute(sql`select distinct u.id, u.full_name as "fullName" from users u join user_roles r on r.user_id = u.id where r.role in ('admissions_officer', 'principal', 'tenant_admin') and u.status = 'active' order by u.full_name`)).rows);
  }

  // ---- cycles -----------------------------------------------------------------------------------------

  @Get('cycles')
  @Auth('user', ADMISSIONS_ROLES)
  listCycles(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ c: admissionCycles, programName: programs.name, yearLabel: academicYears.label })
        .from(admissionCycles)
        .innerJoin(programs, eq(programs.id, admissionCycles.programId))
        .innerJoin(academicYears, eq(academicYears.id, admissionCycles.academicYearId))
        .orderBy(desc(admissionCycles.opensOn));
      const counts = await tx.select({ cycleId: applications.cycleId, status: applications.status, n: sql<number>`count(*)::int` }).from(applications).groupBy(applications.cycleId, applications.status);
      return rows.map((r) => {
        const by: Record<string, number> = Object.fromEntries(counts.filter((c) => c.cycleId === r.c.id).map((c) => [c.status, c.n]));
        const held = (by.offered ?? 0) + (by.accepted ?? 0) + (by.enrolled ?? 0);
        return { ...r.c, programName: r.programName, yearLabel: r.yearLabel, counts: by, seatsLeft: r.c.seats - held };
      });
    });
  }

  @Post('cycles')
  @Auth('user', ADMISSIONS_ROLES)
  createCycle(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CycleBase)) body: z.infer<typeof CycleBase>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.createCycle(tx, this.actor(p), body));
  }

  @Get('cycles/:id')
  @Auth('user', ADMISSIONS_ROLES)
  getCycle(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.cycle(tx, id));
  }

  @Patch('cycles/:id')
  @Auth('user', ADMISSIONS_ROLES)
  patchCycle(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CyclePatch)) body: z.infer<typeof CyclePatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.updateCycle(tx, this.actor(p), id, body));
  }

  @Post('cycles/:id/status')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  cycleStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CycleStatusBody)) body: z.infer<typeof CycleStatusBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.setCycleStatus(tx, this.actor(p), id, body.status));
  }

  /** Runs the eligibility rules and document checks over the applications under review. */
  @Post('cycles/:id/evaluate')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  evaluate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.evaluate(tx, this.actor(p), id));
  }

  @Post('cycles/:id/expire-offers')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  expire(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.expireOffers(tx, this.actor(p), id));
  }

  // ---- merit lists ------------------------------------------------------------------------------------

  @Get('cycles/:id/merit-lists')
  @Auth('user', ADMISSIONS_ROLES)
  meritLists(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(meritLists).where(eq(meritLists.cycleId, id)).orderBy(desc(meritLists.version));
      return rows.map((l) => ({ id: l.id, version: l.version, seats: l.seats, ranked: l.entries.length, publishedAt: l.publishedAt, createdAt: l.createdAt }));
    });
  }

  @Post('cycles/:id/merit-lists')
  @Auth('user', ADMISSIONS_ROLES)
  generate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.generateMeritList(tx, this.actor(p), id));
  }

  @Get('merit-lists/:id')
  @Auth('user', ADMISSIONS_ROLES)
  getMeritList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [l] = await tx.select().from(meritLists).where(eq(meritLists.id, id));
      if (!l) throw new NotFoundException('Merit list not found');
      const apps = l.entries.length ? await tx.select({ id: applications.id, applicationNo: applications.applicationNo, applicantName: applications.applicantName, status: applications.status }).from(applications).where(inArray(applications.id, l.entries.map((e) => e.applicationId))) : [];
      const by = new Map(apps.map((a) => [a.id, a]));
      return { ...l, entries: l.entries.map((e) => ({ ...e, applicationNo: by.get(e.applicationId)?.applicationNo, applicantName: by.get(e.applicationId)?.applicantName, status: by.get(e.applicationId)?.status })) };
    });
  }

  @Post('merit-lists/:id/publish')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.publishMeritList(tx, this.actor(p), id));
  }

  // ---- applications -----------------------------------------------------------------------------------

  @Get('applications')
  @Auth('user', ADMISSIONS_ROLES)
  listApplications(@CurrentPrincipal() p: UserPrincipal, @Query('cycleId') cycleId?: string, @Query('status') status?: string, @Query('q') q?: string) {
    const s = q?.trim().replace(/[%_]/g, '');
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: applications.id,
          applicationNo: applications.applicationNo,
          applicantName: applications.applicantName,
          phone: applications.phone,
          status: applications.status,
          feeStatus: applications.feeStatus,
          meritScore: applications.meritScore,
          meritRank: applications.meritRank,
          submittedAt: applications.submittedAt,
          cycleId: applications.cycleId,
          cycleName: admissionCycles.name,
        })
        .from(applications)
        .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
        .where(
          and(
            cycleId && Id.safeParse(cycleId).success ? eq(applications.cycleId, cycleId) : undefined,
            status && (APPLICATION_STATUSES as string[]).includes(status) ? eq(applications.status, status as ApplicationStatus) : undefined,
            s ? or(ilike(applications.applicantName, `%${s}%`), ilike(applications.applicationNo, `%${s}%`), ilike(applications.phone, `%${s}%`)) : undefined,
          ),
        )
        .orderBy(desc(applications.submittedAt))
        .limit(500),
    );
  }

  /** Everything a reviewer needs: answers against the form, documents, fee, eligibility check and history. */
  @Get('applications/:id')
  @Auth('user', ADMISSIONS_ROLES)
  getApplication(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.application(tx, id);
      const cycle = await this.svc.cycle(tx, a.cycleId);
      const cfg = cycleConfig(cycle);
      const [y] = await tx.select({ startsOn: academicYears.startsOn }).from(academicYears).where(eq(academicYears.id, cycle.academicYearId));
      const today = await this.svc.today(tx);
      const documents = await tx
        .select({ id: applicationDocuments.id, docKey: applicationDocuments.docKey, fileName: applicationDocuments.fileName, contentType: applicationDocuments.contentType, sizeBytes: applicationDocuments.sizeBytes, status: applicationDocuments.status, reviewNote: applicationDocuments.reviewNote, uploadedAt: applicationDocuments.uploadedAt })
        .from(applicationDocuments)
        .where(eq(applicationDocuments.applicationId, id));
      const payments = await tx.select().from(applicationPayments).where(eq(applicationPayments.applicationId, id)).orderBy(asc(applicationPayments.createdAt));
      const history = await tx
        .select({ action: auditLog.action, data: auditLog.data, at: auditLog.at, actorName: users.fullName })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(and(eq(auditLog.subjectType, 'application'), eq(auditLog.subjectId, id)))
        .orderBy(desc(auditLog.at), desc(auditLog.id));
      const { accessTokenHash: _hash, ...safe } = a;
      return {
        ...safe,
        cycle: { id: cycle.id, name: cycle.name, programId: cycle.programId, entryTerm: cycle.entryTerm, applicationFeePaise: cycle.applicationFeePaise, ...cfg },
        documents,
        payments: payments.map((x) => ({ id: x.id, amountPaise: x.amountPaise, method: x.method, status: x.status, receiptNo: x.receiptNo, reference: x.reference, paidAt: x.paidAt })),
        eligibilityCheck: eligibilityFailures({ ...cfg.eligibility, ageOn: cfg.eligibility.ageOn ?? y.startsOn }, { dateOfBirth: a.dateOfBirth, answers: a.answers }, today),
        liveMeritScore: meritScore(cfg.meritRules, a.answers),
        allowedStatuses: APPLICATION_MOVES[a.status],
        history,
      };
    });
  }

  @Post('applications/:id/status')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  async status(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AppStatusBody)) body: z.infer<typeof AppStatusBody>) {
    if (body.status === 'enrolled') throw new BadRequestException('Enrol the applicant with the Enrol action');
    const row = await this.db.withTenant(p.tenantId, (tx) => this.svc.setStatus(tx, this.actor(p), id, body.status, body.reason));
    return { id: row.id, status: row.status, statusReason: row.statusReason, offerExpiresOn: row.offerExpiresOn };
  }

  @Post('applications/:id/fee/counter')
  @Auth('user', ADMISSIONS_ROLES)
  counter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CounterBody)) body: z.infer<typeof CounterBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.fees.recordCounter(tx, { tenantId: p.tenantId, applicationId: id, actorId: p.userId, ...body }));
  }

  @Post('applications/:id/fee/waive')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal'])
  waive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(WaiveBody)) body: z.infer<typeof WaiveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.application(tx, id, true);
      if (a.feeStatus !== 'pending') throw new BadRequestException('No application fee is due');
      await tx.update(applications).set({ feeStatus: 'waived', updatedAt: new Date() }).where(eq(applications.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'admissions.application.fee_waived.v1', subjectType: 'application', subjectId: id, data: { reason: body.reason } });
      return { id, feeStatus: 'waived' };
    });
  }

  @Post('applications/:id/documents/:docId/review')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  reviewDoc(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string, @Body(new ZodBody(DocReviewBody)) body: z.infer<typeof DocReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (body.status === 'rejected' && !(body.note && body.note.length >= 3)) throw new BadRequestException('Say what is wrong with the document');
      const [d] = await tx
        .update(applicationDocuments)
        .set({ status: body.status, reviewNote: body.note ?? null, reviewedBy: p.userId })
        .where(and(eq(applicationDocuments.id, docId), eq(applicationDocuments.applicationId, id)))
        .returning({ id: applicationDocuments.id, docKey: applicationDocuments.docKey, status: applicationDocuments.status });
      if (!d) throw new NotFoundException('Document not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'admissions.document.reviewed.v1', subjectType: 'application', subjectId: id, data: { docKey: d.docKey, status: d.status, note: body.note ?? null } });
      return d;
    });
  }

  @Get('applications/:id/documents/:docId/file')
  @Auth('user', ADMISSIONS_ROLES)
  async file(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string, @Res() res: Response) {
    const d = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(applicationDocuments).where(and(eq(applicationDocuments.id, docId), eq(applicationDocuments.applicationId, id)));
      if (!row) throw new NotFoundException('Document not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'admissions.document.viewed.v1', subjectType: 'application', subjectId: id, data: { docKey: row.docKey } });
      return row;
    });
    const { stream, size } = await this.storage.get(d.storageKey);
    res.setHeader('content-type', d.contentType);
    res.setHeader('content-length', size);
    res.setHeader('content-disposition', `inline; filename="${d.fileName.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('cache-control', 'private, no-store');
    stream.pipe(res);
  }

  /** Converts an accepted application into an enrolled student with a class, roll number and guardian. */
  @Post('applications/:id/enroll')
  @Auth('user', ADMISSIONS_ROLES)
  enroll(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EnrollBody)) body: z.infer<typeof EnrollBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.enroll(tx, { tenantId: p.tenantId, userId: p.userId }, id, body));
  }
}
