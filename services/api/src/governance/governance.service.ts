import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, max, ne } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, changesOf } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { businessRules, incidents, incidentUpdates } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { TasksService } from '../tasks/tasks.service.js';
import { breachDeadline, canMoveIncident, canMoveRule, dayBefore, type IncidentStatus, RESPONSE_HOURS, type RuleDomain } from './governance.logic.js';

export interface NewRule {
  domain: RuleDomain;
  key: string;
  title: string;
  description: string;
  params: Record<string, unknown>;
  effectiveFrom: string;
}

export interface NewIncident {
  title: string;
  severity: 'sev1' | 'sev2' | 'sev3' | 'sev4';
  category: string;
  description: string;
  impact: string;
  detectedAt?: Date;
  personalDataInvolved: boolean;
  ownerId?: string | null;
}

/**
 * The governance writes shared by the governance endpoints and the record kit lists: rule versions and their
 * four-eyes approval, and incidents with their timeline, tasks and breach clock.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly clock: Clock,
    private readonly tasks: TasksService,
    private readonly events: EventBus,
  ) {}

  /** A new draft version of a rule (version numbers count up per domain and key). */
  async draftRule(tx: Tx, p: UserPrincipal, b: NewRule) {
    const [{ n }] = await tx.select({ n: max(businessRules.version) }).from(businessRules).where(and(eq(businessRules.domain, b.domain), eq(businessRules.key, b.key)));
    const [row] = await tx.insert(businessRules).values({ ...b, tenantId: p.tenantId, version: (n ?? 0) + 1, authorId: p.userId }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'rule.drafted', subjectType: 'business_rule', subjectId: row.id, data: { domain: b.domain, key: b.key, version: row.version } });
    return row;
  }

  /** draft to in_review (a task for the approvers), in_review back to draft, approved to retired. */
  async moveRule(tx: Tx, p: UserPrincipal, id: string, to: 'draft' | 'in_review' | 'retired') {
    const [r] = await tx.select().from(businessRules).where(eq(businessRules.id, id)).for('update');
    if (!r) throw new NotFoundException('Rule not found');
    if (!canMoveRule(r.status, to)) throw new ConflictException(`A rule that is ${r.status} cannot become ${to}`);
    const [row] = await tx.update(businessRules).set({ status: to, effectiveTo: to === 'retired' ? this.clock.now().toISOString().slice(0, 10) : r.effectiveTo }).where(eq(businessRules.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `rule.${to}`, subjectType: 'business_rule', subjectId: id, changes: { status: { before: r.status, after: to } } });
    if (to === 'in_review') {
      await this.tasks.createForRole(tx, p.tenantId, ['principal', 'tenant_admin'], { ownerId: p.userId, title: `Approve rule ${r.domain}/${r.key} v${r.version}`, description: r.title, sourceModule: 'business_rules', sourceId: id, priority: 'normal', slaHours: 72, escalateRole: 'tenant_admin' });
    }
    return row;
  }

  /** A second person approves the rule. The version before it ends the day before this one starts. */
  async approveRule(tx: Tx, p: UserPrincipal, id: string) {
    const [r] = await tx.select().from(businessRules).where(eq(businessRules.id, id)).for('update');
    if (!r) throw new NotFoundException('Rule not found');
    if (r.status !== 'in_review') throw new ConflictException('Send the rule for review before approving it');
    if (r.authorId === p.userId) throw new ForbiddenException('A rule must be approved by someone other than its author');
    const prior = await tx.select().from(businessRules).where(and(eq(businessRules.domain, r.domain), eq(businessRules.key, r.key), eq(businessRules.status, 'approved'), ne(businessRules.id, id)));
    for (const o of prior) {
      if (!o.effectiveTo || o.effectiveTo >= r.effectiveFrom) await tx.update(businessRules).set({ effectiveTo: dayBefore(r.effectiveFrom) }).where(eq(businessRules.id, o.id));
    }
    const [row] = await tx.update(businessRules).set({ status: 'approved', approverId: p.userId, approvedAt: this.clock.now() }).where(eq(businessRules.id, id)).returning();
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.RuleApproved, aggregateType: 'business_rule', aggregateId: id, actorId: p.userId, payload: { domain: r.domain, key: r.key, version: r.version, effectiveFrom: r.effectiveFrom } });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'rule.approved', subjectType: 'business_rule', subjectId: id, data: { domain: r.domain, key: r.key, version: r.version, effectiveFrom: r.effectiveFrom }, changes: { status: { before: 'in_review', after: 'approved' } } });
    return row;
  }

  /** Reports an incident. Severity 1 and 2 and personal-data incidents raise a task with an SLA. */
  async reportIncident(tx: Tx, p: UserPrincipal, b: NewIncident) {
    const detectedAt = b.detectedAt ?? this.clock.now();
    const [row] = await tx.insert(incidents).values({ ...b, ownerId: b.ownerId ?? null, detectedAt, tenantId: p.tenantId, reportedBy: p.userId }).returning();
    await tx.insert(incidentUpdates).values({ tenantId: p.tenantId, incidentId: row.id, kind: 'status', body: 'Incident reported', statusAfter: 'open', authorId: p.userId });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'incident.reported', subjectType: 'incident', subjectId: row.id, data: { severity: b.severity, category: b.category, personalDataInvolved: b.personalDataInvolved } });
    if (b.severity === 'sev1' || b.severity === 'sev2' || b.personalDataInvolved) {
      const sla = b.personalDataInvolved ? Math.min(RESPONSE_HOURS[b.severity], 24) : RESPONSE_HOURS[b.severity];
      const t = { ownerId: p.userId, title: `Incident ${b.severity.toUpperCase()}: ${b.title}`, description: b.impact || b.description, sourceModule: 'incidents', sourceId: row.id, priority: 'urgent' as const, slaHours: sla, escalateRole: 'tenant_admin' as RoleName };
      if (b.ownerId) await this.tasks.create(tx, { ...t, tenantId: p.tenantId, assigneeId: b.ownerId });
      else await this.tasks.createForRole(tx, p.tenantId, ['principal', 'tenant_admin'], t);
    }
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.IncidentReported, aggregateType: 'incident', aggregateId: row.id, actorId: p.userId, payload: { severity: b.severity, category: b.category } });
    return { ...row, regulatorDeadline: breachDeadline(detectedAt, b.personalDataInvolved) };
  }

  /** A note on the timeline, optionally moving the incident to a new status. */
  async updateIncident(tx: Tx, p: UserPrincipal, id: string, b: { body: string; kind?: 'note' | 'escalation' | 'notification'; status?: IncidentStatus }) {
    const [inc] = await tx.select().from(incidents).where(eq(incidents.id, id)).for('update');
    if (!inc) throw new NotFoundException('Incident not found');
    if (b.status) {
      const move = canMoveIncident(inc.status, b.status, inc);
      if (!move.ok) throw new BadRequestException(move.reason);
      await tx.update(incidents).set({ status: b.status, resolvedAt: b.status === 'resolved' || b.status === 'closed' ? (inc.resolvedAt ?? this.clock.now()) : null, updatedAt: this.clock.now() }).where(eq(incidents.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'incident.status', subjectType: 'incident', subjectId: id, changes: { status: { before: inc.status, after: b.status } } });
    }
    const [row] = await tx.insert(incidentUpdates).values({ tenantId: p.tenantId, incidentId: id, kind: b.status ? 'status' : (b.kind ?? 'note'), body: b.body, statusAfter: b.status ?? null, authorId: p.userId }).returning();
    return row;
  }

  /** Marks that the Data Protection Board was told (once), on the timeline too. */
  async regulatorNotified(tx: Tx, p: UserPrincipal, id: string) {
    const [before] = await tx.select().from(incidents).where(eq(incidents.id, id)).for('update');
    if (!before) throw new NotFoundException('Incident not found');
    if (!before.personalDataInvolved) throw new BadRequestException('Only a personal-data incident is reported to the Data Protection Board');
    if (before.regulatorNotifiedAt) return before;
    const [row] = await tx.update(incidents).set({ regulatorNotifiedAt: this.clock.now(), updatedAt: this.clock.now() }).where(eq(incidents.id, id)).returning();
    await tx.insert(incidentUpdates).values({ tenantId: p.tenantId, incidentId: id, kind: 'notification', body: 'Data Protection Board notified', authorId: p.userId });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'incident.edited', subjectType: 'incident', subjectId: id, changes: changesOf(before, row, ['regulatorNotifiedAt']) });
    return row;
  }
}
