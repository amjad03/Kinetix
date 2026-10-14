import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { NATIONALITIES } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../../auth/auth.decorators.js';
import type { UserPrincipal } from '../../auth/principal.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ZodBody } from '../../common/zod-body.js';
import { Day } from '../../common/zod-fields.js';
import { DbService } from '../../db/db.service.js';
import { tenants } from '../../db/schema.js';
import { SystemLookups } from '../../db/system-lookups.service.js';
import { ADMISSIONS_ROLES } from '../admissions.controller.js';
import { APPROVER_ROLES, DeskService, REQUEST_KINDS } from './desk.service.js';

const REPORTS = ['daily-register', 'category-stats', 'quota-fill', 'conversion', 'agent-statement', 'fee-reconciliation', 'drafts', 'counsellors'] as const;
const MergeBody = z.object({ mergeIds: z.array(z.uuid()).min(1).max(20) });
const MessageBody = z.object({ templateId: z.uuid() });
const RequestBody = z.object({ kind: z.enum(REQUEST_KINDS), reason: z.string().trim().min(3, 'Give a reason').max(500), declaration: z.boolean().optional(), toCycleId: z.uuid().optional(), cancelOn: Day.optional() });
const DecideBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });
const CustodyBody = z.object({ items: z.array(z.object({ document: z.string().trim().min(2).max(160), referenceNo: z.string().trim().max(80).optional() })).min(1).max(20), receivedOn: Day.optional(), note: z.string().trim().max(300).optional() });
const ReturnBody = z.object({ returnedTo: z.string().trim().min(2).max(120), acknowledgement: z.string().trim().min(2).max(200), returnedOn: Day.optional() });
const KindBody = z.object({ admissionType: z.enum(['regular', 'lateral', 'transfer']).optional(), entryTermOverride: z.number().int().min(1).max(20).nullable().optional(), nationality: z.enum(NATIONALITIES).optional() });
const DraftBody = z.object({ applicantName: z.string().trim().max(120).optional(), phone: z.string().trim().max(30).optional(), data: z.record(z.string().max(60), z.unknown()).refine((d) => JSON.stringify(d).length <= 20_000, 'The draft is too large'), step: z.number().int().min(1).max(10).default(1) });

const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuid = (v?: string) => (v && z.uuid().safeParse(v).success ? v : undefined);

/**
 * The admissions desk: duplicates and merging, messages to leads, approval requests and refunds, the custody
 * register, the funnel and the admission registers and reports (docs/research/MODULE_DEPTH_CHECKLIST.md section 1).
 */
@Controller('v1/admissions')
export class DeskController {
  constructor(
    private readonly db: DbService,
    private readonly desk: DeskService,
  ) {}

  private actor = (p: UserPrincipal) => ({ tenantId: p.tenantId, userId: p.userId });

  @Get('desk/funnel')
  @Auth('user', ADMISSIONS_ROLES)
  funnel(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.funnel(tx, { from: day(from), to: day(to) }));
  }

  @Get('desk/reports/:kind')
  @Auth('user', ADMISSIONS_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query('from') from?: string, @Query('to') to?: string, @Query('yearId') yearId?: string, @Query('by') by?: string) {
    if (!(REPORTS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown report');
    return this.db.withTenant(p.tenantId, (tx) => this.desk.report(tx, kind, { from: day(from), to: day(to), yearId: uuid(yearId), by }));
  }

  // ---- enquiries ----------------------------------------------------------------------------------------

  @Get('enquiries/:id/duplicates')
  @Auth('user', [...ADMISSIONS_ROLES, 'counsellor'])
  duplicates(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.enquiryDuplicates(tx, id));
  }

  @Post('enquiries/:id/merge')
  @HttpCode(200)
  @Auth('user', [...ADMISSIONS_ROLES, 'counsellor'])
  merge(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MergeBody)) body: z.infer<typeof MergeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.mergeEnquiries(tx, this.actor(p), id, body.mergeIds));
  }

  @Get('lead-templates')
  @Auth('user', [...ADMISSIONS_ROLES, 'counsellor'])
  templates(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.leadTemplates(tx));
  }

  @Post('enquiries/:id/message')
  @HttpCode(200)
  @Auth('user', [...ADMISSIONS_ROLES, 'counsellor'])
  message(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MessageBody)) body: z.infer<typeof MessageBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ result: await this.desk.messageEnquiry(tx, this.actor(p), id, body.templateId) }));
  }

  // ---- one application: requests, refund, custody, scholarships ------------------------------------------------

  /** What the application page shows beside the review: requests, originals in custody, refund quote, programme options, scholarships. */
  @Get('applications/:id/desk')
  @Auth('user', ADMISSIONS_ROLES)
  applicationDesk(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      requests: await this.desk.requestsFor(tx, id),
      custody: await this.desk.custodyFor(tx, id),
      refund: await this.desk.refundQuote(tx, id),
      changeTargets: await this.desk.changeTargets(tx, id),
      scholarships: await this.desk.scholarshipCheck(tx, id),
      canDecide: p.roles.some((r) => APPROVER_ROLES.includes(r)),
    }));
  }

  @Get('applications/:id/refund-quote')
  @Auth('user', ADMISSIONS_ROLES)
  quote(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('on') on?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.refundQuote(tx, id, day(on)));
  }

  @Get('applications/:id/scholarships')
  @Auth('user', ADMISSIONS_ROLES)
  scholarships(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.scholarshipCheck(tx, id));
  }

  @Post('applications/:id/requests')
  @Auth('user', ADMISSIONS_ROLES)
  raise(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RequestBody)) body: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.raiseRequest(tx, this.actor(p), id, body));
  }

  @Post('requests/:id/decide')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) body: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ result: await this.desk.decideRequest(tx, { ...this.actor(p), roles: p.roles }, id, body.decision, body.note) }));
  }

  @Patch('applications/:id/admission-kind')
  @Auth('user', ADMISSIONS_ROLES)
  kind(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(KindBody)) body: z.infer<typeof KindBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.setAdmissionKind(tx, this.actor(p), id, body));
  }

  @Post('applications/:id/custody')
  @Auth('user', ADMISSIONS_ROLES)
  receive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CustodyBody)) body: z.infer<typeof CustodyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.receiveOriginals(tx, this.actor(p), { applicationId: id, ...body }));
  }

  @Post('custody/:id/return')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  giveBack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReturnBody)) body: z.infer<typeof ReturnBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ result: await this.desk.returnOriginal(tx, this.actor(p), id, body) }));
  }

  @Post('refund-slabs/ugc')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal'])
  ugc(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.desk.loadUgcSlabs(tx, this.actor(p)));
  }
}

/** Saved application drafts on the public form: start, save and resume with the secret link (no sign-in). */
@Controller('v1/public/admissions/:slug')
export class PublicDraftsController {
  constructor(
    private readonly db: DbService,
    private readonly desk: DeskService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  private async tenant(slug: string) {
    const t = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Institution not found');
    return t;
  }

  @Post('cycles/:cycleId/drafts')
  async start(@Param('slug') slug: string, @Param('cycleId', ParseUUIDPipe) cycleId: string, @Ip() ip: string, @Body(new ZodBody(DraftBody)) body: z.infer<typeof DraftBody>) {
    await this.limiter.hit(`draft:${slug}:${ip}`, 20, 60 * 60_000);
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, (tx) => this.desk.createDraft(tx, t.id, cycleId, body));
  }

  @Get('drafts/:id')
  async get(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-draft-token') token?: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const d = await this.desk.draft(tx, id, token);
      const [inst] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, t.id));
      return { id: d.id, cycleId: d.cycleId, step: d.step, data: d.data, submittedApplicationId: d.submittedApplicationId, expiresAt: d.expiresAt, institution: inst?.name ?? '' };
    });
  }

  @Put('drafts/:id')
  async save(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Ip() ip: string, @Headers('x-draft-token') token: string | undefined, @Body(new ZodBody(DraftBody)) body: z.infer<typeof DraftBody>) {
    await this.limiter.hit(`draft-save:${slug}:${ip}`, 200, 60 * 60_000);
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, (tx) => this.desk.saveDraft(tx, id, token, body));
  }
}
