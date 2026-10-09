import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { applications, certificates, feePayments, feeRefunds, grievanceEvents, grievanceTickets, scholarshipApplications, workflowRequests } from '../db/schema.js';
import { refundRequests } from '../db/schema-pathways.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { canMoveTicket } from '../welfare/welfare-rules.js';
import { GRIEVANCE_STAFF } from '../welfare/welfare.access.js';
import { found } from '../placements/placements.access.js';
import { BOUND, BOUND_SOURCE } from './bound-flows.js';
import { WorkflowsService } from './workflows.service.js';

const ADMISSIONS_SEND: UserPrincipal['roles'] = ['tenant_admin', 'principal', 'admissions_officer'];
const OFFICE: UserPrincipal['roles'] = ['tenant_admin', 'principal'];
const RefundBody = z.object({ paymentId: z.uuid(), amountPaise: z.number().int().min(100).max(10_000_000_000), reason: z.string().trim().min(3).max(200) });
const WaiverBody = z.object({ reason: z.string().trim().min(3).max(300) });
const ResolutionBody = z.object({ resolution: z.string().trim().min(5).max(3000) });

/**
 * Sends scholarships, refunds, certificates, application-fee waivers and grievance resolutions through the
 * approval workflow the institution has set up for them. The outcome is applied to the record when the last approver decides.
 */
@Controller('v1/workflows/bound')
export class BoundFlowsController {
  constructor(
    private readonly db: DbService,
    private readonly wf: WorkflowsService,
  ) {}

  private start(tx: Tx, p: UserPrincipal, requestType: string, title: string, sourceModule: string, sourceId: string, amountRupees?: number) {
    return this.wf.start(tx, { tenantId: p.tenantId, requesterId: p.userId, requestType, title, amount: amountRupees ?? null, sourceModule, sourceId });
  }

  /** Whether a request for this record is already waiting. */
  private async assertNoOpen(tx: Tx, module: string, sourceId: string) {
    const [open] = await tx.select({ id: workflowRequests.id }).from(workflowRequests).where(and(eq(workflowRequests.sourceModule, module), eq(workflowRequests.sourceId, sourceId), sql`${workflowRequests.status} in ('pending', 'returned')`));
    if (open) throw new ConflictException('This is already waiting for approval');
  }

  @Post('scholarships/:id')
  @Auth('user', FEE_ROLES)
  scholarship(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(scholarshipApplications).where(eq(scholarshipApplications.id, id)))[0], 'Application');
      if (a.status !== 'pending') throw new ConflictException(`This application is already ${a.status}`);
      await this.assertNoOpen(tx, BOUND_SOURCE.scholarship, id);
      return this.start(tx, p, BOUND.scholarship, 'Scholarship award', BOUND_SOURCE.scholarship, id);
    });
  }

  @Post('refunds')
  @Auth('user', FEE_ROLES)
  refund(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RefundBody)) b: z.infer<typeof RefundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, b.paymentId));
      if (!pay || pay.status !== 'paid') throw new NotFoundException('Paid payment not found');
      const [done] = await tx.select({ t: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)::bigint` }).from(feeRefunds).where(eq(feeRefunds.paymentId, pay.id));
      const [pending] = await tx.select({ t: sql<number>`coalesce(sum(${refundRequests.amountPaise}), 0)::bigint` }).from(refundRequests).where(and(eq(refundRequests.paymentId, pay.id), eq(refundRequests.status, 'pending')));
      if (Number(done.t) + Number(pending.t) + b.amountPaise > pay.amountPaise) throw new BadRequestException('That is more than was paid');
      const [r] = await tx.insert(refundRequests).values({ tenantId: p.tenantId, paymentId: pay.id, amountPaise: b.amountPaise, reason: b.reason, requestedBy: p.userId }).returning();
      const req = await this.start(tx, p, BOUND.refund, `Fee refund: ${b.reason}`, BOUND_SOURCE.refund, r.id, b.amountPaise / 100);
      return { refundRequestId: r.id, workflowRequestId: req.id, status: req.status };
    });
  }

  @Post('certificates/:id')
  @Auth('user', OFFICE)
  certificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(certificates).where(eq(certificates.id, id)))[0], 'Certificate');
      if (c.status !== 'requested') throw new ConflictException(`This request is already ${c.status}`);
      await this.assertNoOpen(tx, BOUND_SOURCE.certificate, id);
      return this.start(tx, p, BOUND.certificate, `Certificate request${c.purpose ? `: ${c.purpose}` : ''}`, BOUND_SOURCE.certificate, id);
    });
  }

  @Post('admission-waivers/:applicationId')
  @Auth('user', ADMISSIONS_SEND)
  waiver(@CurrentPrincipal() p: UserPrincipal, @Param('applicationId', ParseUUIDPipe) applicationId: string, @Body(new ZodBody(WaiverBody)) b: z.infer<typeof WaiverBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select({ id: applications.id, feeStatus: applications.feeStatus }).from(applications).where(eq(applications.id, applicationId)))[0], 'Application');
      if (a.feeStatus !== 'pending') throw new BadRequestException('No application fee is due');
      await this.assertNoOpen(tx, BOUND_SOURCE.waiver, applicationId);
      return this.start(tx, p, BOUND.waiver, `Application fee waiver: ${b.reason}`, BOUND_SOURCE.waiver, applicationId);
    });
  }

  /** The grievance team proposes a resolution; once approved it is recorded as the resolution and the reporter can rate it. */
  @Post('grievances/:id/resolution')
  @Auth('user', GRIEVANCE_STAFF)
  grievance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResolutionBody)) b: z.infer<typeof ResolutionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = found((await tx.select().from(grievanceTickets).where(eq(grievanceTickets.id, id)))[0], 'Ticket');
      if (t.committee) throw new NotFoundException('Ticket not found');
      if (!canMoveTicket(t.status, 'resolved')) throw new ConflictException(`A ${t.status} ticket cannot be resolved`);
      await this.assertNoOpen(tx, BOUND_SOURCE.grievance, id);
      await tx.insert(grievanceEvents).values({ tenantId: p.tenantId, ticketId: id, actorUserId: p.userId, actorRole: 'staff', kind: 'resolution_proposed', visibility: 'internal', body: b.resolution });
      return this.start(tx, p, BOUND.grievance, `Resolution for ${t.ticketNo}`, BOUND_SOURCE.grievance, id);
    });
  }

  /** The latest approval request for a record, so screens can show where it stands. */
  @Get(':module/:sourceId')
  @HttpCode(200)
  @Auth('user', [...FEE_ROLES, ...ADMISSIONS_SEND, ...GRIEVANCE_STAFF])
  status(@CurrentPrincipal() p: UserPrincipal, @Param('module') module: string, @Param('sourceId') sourceId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select({ id: workflowRequests.id, status: workflowRequests.status, title: workflowRequests.title, decidedAt: workflowRequests.decidedAt, currentStep: workflowRequests.currentStep }).from(workflowRequests).where(and(eq(workflowRequests.sourceModule, module), eq(workflowRequests.sourceId, sourceId))).orderBy(desc(workflowRequests.createdAt)).limit(1);
      return r ?? { id: null };
    });
  }
}
