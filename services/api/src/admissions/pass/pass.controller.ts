import { Body, Controller, Get, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../../auth/principal.js';
import { csvCell as pdfCsvCell } from '../../common/pdf.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ZodBody } from '../../common/zod-body.js';
import { Day, Phone } from '../../common/zod-fields.js';
import { DbService } from '../../db/db.service.js';
import { SystemLookups } from '../../db/system-lookups.service.js';
import { ADMISSIONS_ROLES } from '../admissions.controller.js';
import { BroadcastService } from './broadcast.service.js';
import { CHECKLIST_STATUSES } from './checklist.js';
import { EnrolmentService } from './enrolment.service.js';
import { HORIZONTAL_KINDS, SEAT_TYPES, SUPERNUMERARY_KINDS } from './reservation.js';
import { AdmissionReturnsService } from './returns.service.js';
import { EXAMS, SeatsService } from './seats.service.js';

/** Returns and approval lists are also read by the exam and accreditation offices. */
const RETURN_ROLES: RoleName[] = [...ADMISSIONS_ROLES, 'exam_controller', 'quality_officer'];

const Label = z.string().trim().min(1).max(120);
const Pct = z.number().min(0).max(100);
const PlanBody = z.object({
  options: z.array(z.object({ label: Label, intake: z.number().int().min(1).max(5000) })).min(1).max(60),
  seatTypes: z.array(z.object({ seatType: z.enum(SEAT_TYPES), percent: Pct })).min(1).max(4),
  reservation: z.object({ appliesTo: z.array(z.enum(SEAT_TYPES)).max(4), categories: z.array(z.object({ key: z.string().trim().min(1).max(20), percent: Pct })).max(15) }),
  horizontal: z.object({ appliesTo: z.array(z.enum(SEAT_TYPES)).max(4), kinds: z.array(z.object({ kind: z.enum(HORIZONTAL_KINDS), percent: Pct })).max(7) }),
  supernumerary: z.array(z.object({ kind: z.enum(SUPERNUMERARY_KINDS), percent: Pct, seatType: z.enum(SEAT_TYPES) })).max(5),
});
const DereserveBody = z.object({
  interchange: z.array(z.tuple([z.string().max(20), z.string().max(20)])).max(5).default([['sc', 'st']]),
  toMerit: z.boolean().default(true),
  surrender: z.partialRecord(z.enum(SEAT_TYPES), z.enum(SEAT_TYPES)).default({}),
});
const ClaimsBody = z.object({ horizontal: z.array(z.enum(HORIZONTAL_KINDS)).max(7).default([]), supernumerary: z.array(z.enum(SUPERNUMERARY_KINDS)).max(5).default([]), familyIncomePaise: z.number().int().min(0).max(100_000_000_000).nullable().optional() });
const EntranceBody = z.object({
  exam: z.enum(EXAMS),
  rows: z.array(z.object({ applicationNo: z.string().trim().max(40).optional(), rollNo: z.string().trim().max(40).optional(), rank: z.number().int().min(1).max(5_000_000).optional(), score: z.number().min(0).max(1000).optional() }).refine((r) => !!(r.applicationNo || r.rollNo), 'Give the application number or roll number')).min(1).max(2000),
});
const ExternalBody = z.object({
  authority: z.enum(['kea', 'comedk']),
  rows: z
    .array(
      z.object({
        allotmentRef: z.string().trim().min(3).max(60),
        rollNo: z.string().trim().min(3).max(40),
        rank: z.number().int().min(1).max(5_000_000),
        name: z.string().trim().min(2).max(120),
        dateOfBirth: Day.optional(),
        gender: z.enum(['female', 'male', 'other']).optional(),
        phone: Phone,
        email: z.email().max(200).optional(),
        guardianName: z.string().trim().min(2).max(120),
        guardianPhone: Phone,
        category: z.string().trim().min(1).max(20),
        option: z.string().trim().max(120).optional(),
        claims: z.object({ horizontal: z.array(z.enum(HORIZONTAL_KINDS)).max(7).optional(), supernumerary: z.array(z.enum(SUPERNUMERARY_KINDS)).max(5).optional() }).optional(),
      }),
    )
    .min(1)
    .max(1000),
});
const PresetBody = z.object({ preset: z.string().regex(/^[a-z0-9-]{2,60}$/).nullable() });
const ItemBody = z.object({ status: z.enum(CHECKLIST_STATUSES), dueOn: Day.nullable().optional(), referenceNo: z.string().trim().max(80).nullable().optional(), note: z.string().trim().max(500).nullable().optional() });
const ProvisionalBody = z.object({ dueOn: Day.optional(), undertaking: z.literal(true, 'The undertaking must be signed') });
const EnrollBody = z.object({ sectionId: z.uuid().optional(), rollNo: z.string().trim().min(1).max(20).optional(), activate: z.boolean().default(true), duplicateOverride: z.string().trim().min(5).max(300).optional() });
const ProgrammeBody = z.object({ branchCode: z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/, 'Letters and digits, up to 6').nullable().optional(), sanctionedIntake: z.number().int().min(0).max(10000).nullable().optional(), approvalBody: z.string().trim().max(80).nullable().optional(), approvalRef: z.string().trim().max(120).nullable().optional(), approvalValidTo: Day.nullable().optional() });
const Segment = z.object({ stages: z.array(z.enum(['new', 'contacted', 'counselling', 'applied', 'converted', 'lost', 'deferred'])).max(7).optional(), programId: z.uuid().optional(), sources: z.array(z.string().max(20)).max(12).optional(), campaignId: z.uuid().optional(), followUpBy: Day.optional(), createdFrom: Day.optional(), createdTo: Day.optional() });
const BroadcastBody = z.object({ templateId: z.uuid(), segment: Segment.default({}), campaignId: z.uuid().nullable().optional(), idempotencyKey: z.string().trim().min(8).max(80).optional() });
const PreviewBody = z.object({ channel: z.enum(['sms', 'whatsapp', 'email']), segment: Segment.default({}) });
const OptOutBody = z.object({ optedOut: z.boolean() });
const StatusBody = z.object({ applicationNo: z.string().trim().min(3).max(40), dateOfBirth: Day, website: z.string().max(200).optional() });

const page = (v?: string) => Math.max(1, Math.min(10_000, Number(v) || 1));
const size = (v?: string) => Math.max(1, Math.min(200, Number(v) || 25));
const uuidOr = (v?: string) => (v && z.uuid().safeParse(v).success ? v : undefined);
/** Applicants type these fields on the public form: quoted and formula-neutralised (leading = + - @ tab CR). */
const csvCell = (v: unknown) => pdfCsvCell(v);

/**
 * Admissions pass for staff: the reservation matrix (seat plan, de-reservation), claims, entrance results, seats
 * allotted by KEA or COMEDK, eligibility from the university profile, the admission checklist, provisional admission,
 * enrolment with register number, fees and sign-in details, campaign broadcasts, and the returns.
 */
@Controller('v1/admissions')
export class PassController {
  constructor(
    private readonly db: DbService,
    private readonly seats: SeatsService,
    private readonly enrolment: EnrolmentService,
    private readonly returns: AdmissionReturnsService,
    private readonly broadcasts: BroadcastService,
  ) {}

  @Get('pass/catalog')
  @Auth('user', ADMISSIONS_ROLES)
  catalog() {
    return this.seats.catalog();
  }

  // ---- reservation matrix -------------------------------------------------------------------------------------

  @Get('cycles/:id/reservation')
  @Auth('user', ADMISSIONS_ROLES)
  matrix(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.matrix(tx, id));
  }

  @Put('cycles/:id/reservation')
  @Auth('user', ADMISSIONS_ROLES)
  applyPlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PlanBody)) body: z.infer<typeof PlanBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.applyPlan(tx, p, id, body));
  }

  @Post('cycles/:id/reservation/dereserve')
  @Auth('user', ['tenant_admin', 'principal'])
  dereserve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DereserveBody)) body: z.infer<typeof DereserveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.dereserve(tx, p, id, body));
  }

  @Put('applications/:id/claims')
  @Auth('user', ADMISSIONS_ROLES)
  claims(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ClaimsBody)) body: z.infer<typeof ClaimsBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.setClaims(tx, p, id, body));
  }

  @Post('cycles/:id/entrance-results')
  @Auth('user', ADMISSIONS_ROLES)
  entrance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EntranceBody)) body: z.infer<typeof EntranceBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.importEntrance(tx, p, id, body.exam, body.rows));
  }

  @Post('cycles/:id/external-allotments')
  @Auth('user', ADMISSIONS_ROLES)
  external(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ExternalBody)) body: z.infer<typeof ExternalBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.importExternalAllotments(tx, p, id, body.authority, body.rows));
  }

  @Get('cycles/:id/profile-eligibility')
  @Auth('user', ADMISSIONS_ROLES)
  eligibility(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.eligibilityOptions(tx, id));
  }

  @Put('cycles/:id/profile-eligibility')
  @Auth('user', ADMISSIONS_ROLES)
  setEligibility(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PresetBody)) body: z.infer<typeof PresetBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.seats.setEligibilityPreset(tx, p, id, body.preset));
  }

  // ---- checklist, provisional admission, enrolment -----------------------------------------------------------

  @Get('applications/:id/checklist')
  @Auth('user', ADMISSIONS_ROLES)
  checklist(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.checklist(tx, id));
  }

  @Post('applications/:id/checklist')
  @Auth('user', ADMISSIONS_ROLES)
  createChecklist(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.ensureChecklist(tx, p, id));
  }

  @Patch('checklist-items/:id')
  @Auth('user', ADMISSIONS_ROLES)
  item(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemBody)) body: z.infer<typeof ItemBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.updateItem(tx, p, id, body));
  }

  @Post('applications/:id/provisional')
  @Auth('user', ADMISSIONS_ROLES)
  provisional(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ProvisionalBody)) body: z.infer<typeof ProvisionalBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.provisionalAdmit(tx, p, id, body));
  }

  @Get('applications/:id/admission-letter')
  @Auth('user', ADMISSIONS_ROLES)
  letter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.letter(tx, id));
  }

  /** Enrolment with the register number, fee structures and sign-in details (the plain enrol endpoint does the same). */
  @Post('applications/:id/admit')
  @Auth('user', ADMISSIONS_ROLES)
  admit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EnrollBody)) body: z.infer<typeof EnrollBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.enroll(tx, p, id, body));
  }

  @Post('students/:id/credentials')
  @Auth('user', ADMISSIONS_ROLES)
  resend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.issueCredentials(tx, p, id));
  }

  @Get('students/:id/credentials')
  @Auth('user', ADMISSIONS_ROLES)
  credentialLog(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.credentialLog(tx, id));
  }

  @Get('programme-settings')
  @Auth('user', ADMISSIONS_ROLES)
  programmes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.programmeSettings(tx));
  }

  @Put('programme-settings/:programId')
  @Auth('user', ['tenant_admin', 'principal'])
  setProgramme(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) id: string, @Body(new ZodBody(ProgrammeBody)) body: z.infer<typeof ProgrammeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.setProgrammeSettings(tx, p, id, body));
  }

  @Get('awaiting-register-no')
  @Auth('user', ADMISSIONS_ROLES)
  awaiting(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.awaitingRegisterNo(tx));
  }

  @Get('provisional-follow-ups')
  @Auth('user', ADMISSIONS_ROLES)
  followUps(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.enrolment.provisionalFollowUps(tx));
  }

  // ---- returns ------------------------------------------------------------------------------------------------

  @Get('returns/approval-list')
  @Auth('user', RETURN_ROLES)
  async approval(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response, @Query('cycleId') cycleId?: string, @Query('programId') programId?: string, @Query('yearId') yearId?: string, @Query('format') format?: string) {
    const out = await this.db.withTenant(p.tenantId, (tx) => this.returns.approvalList(tx, { cycleId: uuidOr(cycleId), programId: uuidOr(programId), yearId: uuidOr(yearId) }));
    if (format !== 'csv') return out;
    const cols: [string, keyof (typeof out.rows)[number]][] = [['Sl. No.', 'slNo'], ['Programme', 'programme'], ['Academic year', 'academicYear'], ['Application No.', 'applicationNo'], ['Admission No.', 'admissionNo'], ['Register No.', 'registerNo'], ['Name', 'name'], ['Gender', 'gender'], ['Date of birth', 'dateOfBirth'], ['Category', 'category'], ['Seat type', 'seatType'], ['Admission type', 'admissionType'], ['Qualifying exam', 'qualifying'], ['Qualifying %', 'qualifyingPercent'], ['Entrance', 'entrance'], ['Allotment ref.', 'allotmentRef'], ['Admitted on', 'admittedOn'], ['Provisional', 'provisional'], ['Eligibility certificate', 'eligibilityCertificate']];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admission-approval-list.csv"');
    return [cols.map((c) => c[0]).join(','), ...out.rows.map((r) => cols.map((c) => csvCell(r[c[1]])).join(','))].join('\n');
  }

  @Get('returns/intake')
  @Auth('user', RETURN_ROLES)
  intake(@CurrentPrincipal() p: UserPrincipal, @Query('yearId', ParseUUIDPipe) yearId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.returns.intakeReturn(tx, yearId));
  }

  @Get('returns/aishe')
  @Auth('user', RETURN_ROLES)
  aishe(@CurrentPrincipal() p: UserPrincipal, @Query('yearId', ParseUUIDPipe) yearId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.returns.aisheEnrolment(tx, yearId));
  }

  // ---- broadcasts ---------------------------------------------------------------------------------------------

  @Post('broadcasts/preview')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) body: z.infer<typeof PreviewBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.preview(tx, body.segment, body.channel));
  }

  @Post('broadcasts')
  @Auth('user', ADMISSIONS_ROLES)
  broadcast(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BroadcastBody)) body: z.infer<typeof BroadcastBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.create(tx, p, body));
  }

  @Get('broadcasts')
  @Auth('user', ADMISSIONS_ROLES)
  broadcastList(@CurrentPrincipal() p: UserPrincipal, @Query('campaignId') campaignId?: string, @Query('page') pg?: string, @Query('pageSize') ps?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.list(tx, { campaignId: uuidOr(campaignId), page: page(pg), pageSize: size(ps) }));
  }

  @Get('broadcasts/:id/sends')
  @Auth('user', ADMISSIONS_ROLES)
  sends(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('status') status?: string, @Query('page') pg?: string, @Query('pageSize') ps?: string) {
    const st = status && ['queued', 'sent', 'skipped', 'failed'].includes(status) ? status : undefined;
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.sends(tx, id, { status: st, page: page(pg), pageSize: size(ps) }));
  }

  @Post('enquiries/:id/opt-out')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  optOut(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OptOutBody)) body: z.infer<typeof OptOutBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.optOut(tx, p, id, body.optedOut));
  }
}

/** The public status page: application number and date of birth, rate-limited per address. */
@Controller('v1/public/admissions/:slug')
export class PublicStatusController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly returns: AdmissionReturnsService,
  ) {}

  @Post('status')
  @HttpCode(200)
  async status(@Param('slug') slug: string, @Ip() ip: string, @Body(new ZodBody(StatusBody)) body: z.infer<typeof StatusBody>) {
    await this.limiter.hit(`admission-status:${slug}:${ip}`, 10, 15 * 60_000);
    if (body.website) throw new NotFoundException('No application matches that number and date of birth');
    const t = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.system.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Not found');
    return this.db.withTenant(t.id, (tx) => this.returns.publicStatus(tx, body.applicationNo, body.dateOfBirth));
  }
}
