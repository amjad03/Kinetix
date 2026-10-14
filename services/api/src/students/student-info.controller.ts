import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { REBALANCE_MODES, ROLL_ORDERS } from './student-info.logic.js';
import { CHANGE_DECIDE_ROLES, CLEARANCE_DEPARTMENTS, CLEARANCE_LEADS, CLEARANCE_PURPOSES, DETAIL_EDIT_ROLES, StudentInfoService } from './student-info.service.js';
import { LIFECYCLE_ROLES, PROFILE_ROLES } from './students.controller.js';

const DEPT_ROLES = [...new Set(Object.values(CLEARANCE_DEPARTMENTS).flatMap((d) => d.roles))] as RoleName[];
/** Who sees clearances: the profile readers and every department that signs one off. */
const CLEARANCE_READ: RoleName[] = [...new Set([...PROFILE_ROLES, ...CLEARANCE_LEADS, ...DEPT_ROLES])];
const CLEARANCE_RAISE: RoleName[] = [...LIFECYCLE_ROLES, 'admissions_officer'];
const REPORT_KINDS = ['strength', 'religion', 'age', 'missing', 'dropouts', 'tc-register'] as const;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DetailsBody = z.object({
  values: z.record(z.string(), z.union([z.string().max(500), z.boolean(), z.number(), z.null()])).optional(),
  custom: z.record(z.string(), z.union([z.string().max(500), z.boolean(), z.number(), z.null()])).optional(),
  aadhaar: z.string().trim().max(20).nullable().optional(),
});
const ChangeBody = z.object({ field: z.string().trim().min(2).max(60), newValue: z.string().trim().min(1).max(500), reason: z.string().trim().min(3, 'Say why').max(500) });
const DecideBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });
const ClearanceBody = z.object({ purpose: z.enum(CLEARANCE_PURPOSES).default('tc'), note: z.string().trim().max(500).optional(), departments: z.array(z.string()).max(10).optional() });
const ItemBody = z.object({ status: z.enum(['cleared', 'blocked']), note: z.string().trim().max(500).optional() });
const RollBody = z.object({
  sectionId: z.uuid(),
  order: z.enum(ROLL_ORDERS),
  prefix: z.string().trim().max(12).regex(/^[A-Za-z0-9/-]*$/, 'Letters, digits, / and - only').default(''),
  start: z.number().int().min(0).max(100_000).default(1),
  width: z.number().int().min(1).max(6).default(2),
  girlsFirst: z.boolean().default(true),
  dryRun: z.boolean().default(true),
});
const RebalanceBody = z.object({ sectionIds: z.array(z.uuid()).min(2).max(12), mode: z.enum(REBALANCE_MODES), reason: z.string().trim().min(3).max(300).default('Sections reshuffled'), dryRun: z.boolean().default(true) });

/**
 * Student information beyond the roll (docs/research/MODULE_DEPTH_CHECKLIST.md section 2): profile details and custom
 * fields, siblings, change requests from students and parents, no-dues clearances, roll numbers and section
 * reshuffles, promotion eligibility, and the registers and statements.
 */
@Controller('v1')
export class StudentInfoController {
  constructor(
    private readonly db: DbService,
    private readonly svc: StudentInfoService,
  ) {}

  @Get('students/:id/details')
  @Auth('user', PROFILE_ROLES)
  details(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.details(tx, p, id));
  }

  @Put('students/:id/details')
  @Auth('user', PROFILE_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DetailsBody)) body: z.infer<typeof DetailsBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.updateDetails(tx, p, id, body));
  }

  /** The next admission number from the admissions series (Settings > Admissions > Numbering). */
  @Post('students/:id/admission-no')
  @HttpCode(200)
  @Auth('user', DETAIL_EDIT_ROLES)
  admissionNo(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ admissionNo: await this.svc.assignAdmissionNo(tx, p, id) }));
  }

  @Get('students/:id/siblings')
  @Auth('user', PROFILE_ROLES)
  siblings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.student(tx, id);
      return this.svc.siblings(tx, id);
    });
  }

  // ---- change requests --------------------------------------------------------------------------------

  /** The student's requests: for staff, the student and the student's guardians. */
  @Get('students/:id/change-requests')
  @Auth('user')
  changeRequests(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.changeRequests(tx, p, id));
  }

  /** Asks for a profile detail to be corrected: staff, the student or a guardian. */
  @Post('students/:id/change-requests')
  @Auth('user')
  requestChange(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ChangeBody)) body: z.infer<typeof ChangeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.requestChange(tx, p, id, body));
  }

  @Get('student-change-requests/mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.changeRequests(tx, p));
  }

  @Post('student-change-requests/:id/decide')
  @HttpCode(200)
  @Auth('user', CHANGE_DECIDE_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) body: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ result: await this.svc.decideChange(tx, p, id, body.decision, body.note) }));
  }

  @Post('student-change-requests/:id/cancel')
  @HttpCode(200)
  @Auth('user')
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.cancelChange(tx, p, id));
  }

  // ---- clearances -------------------------------------------------------------------------------------

  @Get('students/:id/clearances')
  @Auth('user', CLEARANCE_READ)
  clearances(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, id, CLEARANCE_READ);
      return this.svc.studentClearances(tx, id);
    });
  }

  @Post('students/:id/clearances')
  @Auth('user', CLEARANCE_RAISE)
  raise(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ClearanceBody)) body: z.infer<typeof ClearanceBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.raiseClearance(tx, p, id, body));
  }

  @Get('student-clearances/:id')
  @Auth('user', CLEARANCE_READ)
  clearance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.clearance(tx, id));
  }

  @Post('student-clearances/:id/recheck')
  @HttpCode(200)
  @Auth('user', CLEARANCE_READ)
  recheck(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.recheckClearance(tx, p, id));
  }

  @Post('student-clearance-items/:id/decide')
  @HttpCode(200)
  @Auth('user', CLEARANCE_READ)
  decideItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemBody)) body: z.infer<typeof ItemBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decideClearanceItem(tx, p, id, body.status, body.note));
  }

  // ---- roll numbers, sections, promotion -------------------------------------------------------------------

  @Post('students/roll-numbers')
  @HttpCode(200)
  @Auth('user', LIFECYCLE_ROLES)
  renumber(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RollBody)) body: z.infer<typeof RollBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.renumber(tx, p, body));
  }

  @Post('students/rebalance')
  @HttpCode(200)
  @Auth('user', LIFECYCLE_ROLES)
  rebalance(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RebalanceBody)) body: z.infer<typeof RebalanceBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.rebalance(tx, p, body));
  }

  @Get('students/promotions/eligibility')
  @Auth('user', LIFECYCLE_ROLES)
  eligibility(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('minAttendancePct') minPct?: string, @Query('maxDuesPaise') maxDues?: string) {
    if (!sectionId || !z.uuid().safeParse(sectionId).success) throw new BadRequestException('Choose a class');
    const minAttendancePct = Math.min(100, Math.max(0, Number(minPct ?? 75) || 0));
    const maxDuesPaise = Math.max(0, Number(maxDues ?? 0) || 0);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.promotionEligibility(tx, { sectionId, minAttendancePct, maxDuesPaise }));
  }

  @Get('students/reports/:kind')
  @Auth('user', PROFILE_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query('from') from?: string, @Query('to') to?: string, @Query('on') on?: string, @Query('programId') programId?: string) {
    if (!(REPORT_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown report');
    const day = (v?: string) => (v && Day.safeParse(v).success ? v : undefined);
    return this.db.withTenant(p.tenantId, (tx) => this.svc.report(tx, kind, { from: day(from), to: day(to), on: day(on), programId: programId && z.uuid().safeParse(programId).success ? programId : undefined }));
  }
}
