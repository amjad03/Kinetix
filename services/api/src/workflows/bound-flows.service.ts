import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { applications, grievanceEvents, grievanceTickets, workflowActions } from '../db/schema.js';
import { refundRequests } from '../db/schema-pathways.js';
import { CertificatesService } from '../documents/certificates.service.js';
import { DomainEvents, EventBus, type DomainEvent } from '../events/events.js';
import { issueRefund } from '../finance/finance.controller.js';
import { decideScholarship } from '../finance/scholarships.controller.js';
import { BOUND_SOURCE } from './bound-flows.js';

/**
 * Applies the outcome of a workflow to the record it was about: a scholarship is awarded, a refund issued, a
 * certificate approved, an application fee waived, a grievance resolved. A rejection records that and changes nothing else.
 * Runs when the engine announces `workflows.decided`, once per event.
 */
@Injectable()
export class BoundFlowsService implements OnApplicationBootstrap {
  private readonly log = new Logger(BoundFlowsService.name);

  constructor(
    private readonly bus: EventBus,
    private readonly certs: CertificatesService,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe('bound-flows', [DomainEvents.WorkflowsDecided], (e, tx) => this.apply(e, tx));
  }

  async apply(e: DomainEvent, tx: Tx): Promise<void> {
    const pl = e.payload as { requestId: string; status: string; sourceModule: string | null; sourceId: string | null; comment?: string };
    if (!pl.sourceId || !Object.values(BOUND_SOURCE).includes(pl.sourceModule as never)) return;
    if (pl.status !== 'approved' && pl.status !== 'rejected') return;
    const approved = pl.status === 'approved';
    const actor = { tenantId: e.tenantId, userId: e.actorId! };
    const [last] = await tx.select({ comment: workflowActions.comment }).from(workflowActions).where(and(eq(workflowActions.requestId, pl.requestId), eq(workflowActions.action, approved ? 'approved' : 'rejected'))).orderBy(desc(workflowActions.seq)).limit(1);
    const note = pl.comment || last?.comment || (approved ? 'Approved through workflow' : 'Rejected through workflow');
    try {
      switch (pl.sourceModule) {
        case BOUND_SOURCE.scholarship:
          await decideScholarship(tx, actor, pl.sourceId, approved, note);
          break;
        case BOUND_SOURCE.refund:
          await this.refund(tx, actor, pl.sourceId, approved);
          break;
        case BOUND_SOURCE.certificate:
          await this.certs.applyDecision(tx, actor, pl.sourceId, approved ? 'approved' : 'rejected', note);
          break;
        case BOUND_SOURCE.waiver:
          if (approved) {
            await tx.update(applications).set({ feeStatus: 'waived', updatedAt: new Date() }).where(and(eq(applications.id, pl.sourceId), eq(applications.feeStatus, 'pending')));
            await audit(tx, { tenantId: e.tenantId, actorType: 'user', actorId: actor.userId, action: 'admissions.application.fee_waived.v1', subjectType: 'application', subjectId: pl.sourceId, data: { workflowRequestId: pl.requestId } });
          }
          break;
        case BOUND_SOURCE.grievance:
          await this.grievance(tx, actor, pl.sourceId, approved, note);
          break;
      }
    } catch (err) {
      // The domain record changed while the request was open (already decided elsewhere, no longer eligible): leave a trail instead of failing the event.
      this.log.warn(`Workflow ${pl.requestId} (${pl.sourceModule}) could not be applied: ${(err as Error).message}`);
      await audit(tx, { tenantId: e.tenantId, actorType: 'system', action: 'workflow.apply_failed', subjectType: 'workflow_request', subjectId: pl.requestId, data: { sourceModule: pl.sourceModule, reason: (err as Error).message.slice(0, 300) } });
    }
  }

  private async refund(tx: Tx, actor: { tenantId: string; userId: string }, requestId: string, approved: boolean) {
    const [r] = await tx.select().from(refundRequests).where(eq(refundRequests.id, requestId)).for('update');
    if (!r || r.status !== 'pending') return;
    if (!approved) {
      await tx.update(refundRequests).set({ status: 'rejected', decidedAt: new Date() }).where(eq(refundRequests.id, requestId));
      return;
    }
    const row = await issueRefund(tx, actor, { paymentId: r.paymentId, amountPaise: r.amountPaise, reason: r.reason });
    await tx.update(refundRequests).set({ status: 'refunded', refundId: row.id, decidedAt: new Date() }).where(eq(refundRequests.id, requestId));
  }

  private async grievance(tx: Tx, actor: { tenantId: string; userId: string }, ticketId: string, approved: boolean, note: string) {
    const [t] = await tx.select().from(grievanceTickets).where(eq(grievanceTickets.id, ticketId)).for('update');
    if (!t) return;
    const [proposal] = await tx.select().from(grievanceEvents).where(and(eq(grievanceEvents.ticketId, ticketId), eq(grievanceEvents.kind, 'resolution_proposed'))).orderBy(desc(grievanceEvents.createdAt)).limit(1);
    if (!approved || !proposal) {
      await tx.insert(grievanceEvents).values({ tenantId: actor.tenantId, ticketId, actorUserId: actor.userId, actorRole: 'staff', kind: 'resolution_rejected', visibility: 'internal', body: note });
      return;
    }
    await tx.update(grievanceTickets).set({ status: 'resolved', resolution: proposal.body, resolvedAt: new Date(), version: t.version + 1 }).where(eq(grievanceTickets.id, ticketId));
    await tx.insert(grievanceEvents).values({ tenantId: actor.tenantId, ticketId, actorUserId: actor.userId, actorRole: 'staff', kind: 'resolved', visibility: 'public', body: proposal.body });
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'grievance.resolved', subjectType: 'grievance', subjectId: ticketId, data: { viaWorkflow: true } });
  }
}
