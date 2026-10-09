import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, changesOf } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { businessRules, documentRetentionPolicies, incidents, incidentUpdates, users, vaultDocuments } from '../db/schema.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';
import { TasksService } from '../tasks/tasks.service.js';
import { breachDeadline, canMoveIncident, canMoveRule, dayBefore, INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, retentionDue, RESPONSE_HOURS, RULE_DOMAINS, ruleInForce } from './governance.logic.js';

/** Who writes and approves rules, runs incidents and sets retention. */
export const GOVERNANCE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RuleBody = z.object({
  domain: z.enum(RULE_DOMAINS),
  key: z.string().trim().regex(/^[a-z0-9_.-]{2,60}$/, 'Use lower-case letters, digits, dots, dashes or underscores'),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(''),
  params: z.record(z.string(), z.unknown()).default({}),
  effectiveFrom: iso,
});
const RuleEdit = RuleBody.pick({ title: true, description: true, params: true, effectiveFrom: true }).partial();

const IncidentBody = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(INCIDENT_SEVERITIES),
  category: z.enum(INCIDENT_CATEGORIES),
  description: z.string().trim().max(4000).default(''),
  impact: z.string().trim().max(2000).default(''),
  detectedAt: z.coerce.date().optional(),
  personalDataInvolved: z.boolean().default(false),
  ownerId: z.uuid().optional(),
});
const IncidentEdit = z.object({
  ownerId: z.uuid().nullable().optional(),
  impact: z.string().trim().max(2000).optional(),
  rootCause: z.string().trim().max(4000).optional(),
  correctiveActions: z.string().trim().max(4000).optional(),
  regulatorNotified: z.boolean().optional(),
});
const UpdateBody = z.object({ body: z.string().trim().min(2).max(2000), kind: z.enum(['note', 'escalation', 'notification']).default('note'), status: z.enum(['open', 'investigating', 'mitigated', 'resolved', 'closed']).optional() });
const RetentionBody = z.object({ retainMonths: z.number().int().min(1).max(600), note: z.string().trim().max(300).default('') });

/**
 * Governance: the business rule registry (versioned, four-eyes approved, effective-dated), the incident register with
 * its timeline and breach clock, and file retention per category (PRD sections 70, 75, 77, 82).
 */
@Controller('v1/governance')
export class GovernanceController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly tasks: TasksService,
    private readonly events: EventBus,
  ) {}

  // ----- business rules ------------------------------------------------------------------------

  /** Starts a new draft version of a rule (version numbers count up per domain and key). */
  @Post('rules')
  @Auth('user', GOVERNANCE_ROLES)
  createRule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RuleBody)) b: z.infer<typeof RuleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${businessRules.version}), 0)::int` }).from(businessRules).where(and(eq(businessRules.domain, b.domain), eq(businessRules.key, b.key)));
      const [row] = await tx.insert(businessRules).values({ ...b, tenantId: p.tenantId, version: v + 1, authorId: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'rule.drafted', subjectType: 'business_rule', subjectId: row.id, data: { domain: b.domain, key: b.key, version: row.version } });
      return row;
    });
  }

  @Get('rules')
  @Auth('user', GOVERNANCE_ROLES)
  listRules(@Query('domain') domain?: string, @Query('status') status?: string, @CurrentPrincipal() p?: UserPrincipal) {
    return this.db.withTenant(p!.tenantId, (tx) => {
      const where = [domain ? eq(businessRules.domain, domain) : undefined, status ? eq(businessRules.status, status) : undefined].filter((x) => x !== undefined);
      return tx.select().from(businessRules).where(where.length ? and(...where) : undefined).orderBy(asc(businessRules.domain), asc(businessRules.key), desc(businessRules.version)).limit(500);
    });
  }

  /** The version in force on a date (today by default). Any signed-in staff member can ask, because modules and people read rules. */
  @Get('rules/resolve')
  @Auth('user', TASK_ROLES)
  resolveRule(@CurrentPrincipal() p: UserPrincipal, @Query('domain') domain: string, @Query('key') key: string, @Query('on') on?: string) {
    const day = on && iso.safeParse(on).success ? on : this.clock.now().toISOString().slice(0, 10);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(businessRules).where(and(eq(businessRules.domain, domain), eq(businessRules.key, key)));
      const hit = ruleInForce(rows, day);
      if (!hit) throw new NotFoundException(`No approved rule "${domain}/${key}" is in force on ${day}`);
      return hit;
    });
  }

  @Put('rules/:id')
  @Auth('user', GOVERNANCE_ROLES)
  editRule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RuleEdit)) b: z.infer<typeof RuleEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(businessRules).where(eq(businessRules.id, id)).for('update');
      if (!before) throw new NotFoundException('Rule not found');
      if (before.status !== 'draft') throw new ConflictException('Only a draft can be edited; start a new version instead');
      const [row] = await tx.update(businessRules).set(b).where(eq(businessRules.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'rule.edited', subjectType: 'business_rule', subjectId: id, changes: changesOf(before, row, ['title', 'description', 'params', 'effectiveFrom']) });
      return row;
    });
  }

  /** draft to in_review, in_review back to draft, approved to retired. Approval is a separate call that needs a second person. */
  @Post('rules/:id/move')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  moveRule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ to: z.enum(['draft', 'in_review', 'retired']) }))) b: { to: 'draft' | 'in_review' | 'retired' }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(businessRules).where(eq(businessRules.id, id)).for('update');
      if (!r) throw new NotFoundException('Rule not found');
      if (!canMoveRule(r.status, b.to)) throw new ConflictException(`A rule that is ${r.status} cannot become ${b.to}`);
      const [row] = await tx.update(businessRules).set({ status: b.to, effectiveTo: b.to === 'retired' ? this.clock.now().toISOString().slice(0, 10) : r.effectiveTo }).where(eq(businessRules.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `rule.${b.to}`, subjectType: 'business_rule', subjectId: id, changes: { status: { before: r.status, after: b.to } } });
      if (b.to === 'in_review') {
        await this.tasks.createForRole(tx, p.tenantId, ['principal', 'tenant_admin'], { ownerId: p.userId, title: `Approve rule ${r.domain}/${r.key} v${r.version}`, description: r.title, sourceModule: 'business_rules', sourceId: id, priority: 'normal', slaHours: 72, escalateRole: 'tenant_admin' });
      }
      return row;
    });
  }

  /** A second person approves the rule. The version before it ends the day before this one starts. */
  @Post('rules/:id/approve')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  approveRule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
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
    });
  }

  /** Every version of one rule, newest first, with who wrote and approved each. */
  @Get('rules/history')
  @Auth('user', GOVERNANCE_ROLES)
  ruleHistory(@CurrentPrincipal() p: UserPrincipal, @Query('domain') domain: string, @Query('key') key: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(businessRules).where(and(eq(businessRules.domain, domain), eq(businessRules.key, key))).orderBy(desc(businessRules.version));
      const ids = [...new Set(rows.flatMap((r) => [r.authorId, r.approverId]).filter((x): x is string => !!x))];
      const names = ids.length ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids)) : [];
      const nm = new Map(names.map((n) => [n.id, n.name]));
      return rows.map((r) => ({ ...r, authorName: nm.get(r.authorId) ?? null, approverName: r.approverId ? nm.get(r.approverId) ?? null : null }));
    });
  }

  // ----- incidents -----------------------------------------------------------------------------

  /** Anyone on staff can report an incident. Severity 1 and 2 and personal-data incidents raise a task with an SLA. */
  @Post('incidents')
  @Auth('user', TASK_ROLES)
  reportIncident(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IncidentBody)) b: z.infer<typeof IncidentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const detectedAt = b.detectedAt ?? this.clock.now();
      const [row] = await tx.insert(incidents).values({ ...b, detectedAt, tenantId: p.tenantId, reportedBy: p.userId }).returning();
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
    });
  }

  @Get('incidents')
  @Auth('user', GOVERNANCE_ROLES)
  listIncidents(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(incidents).where(status === 'active' ? inArray(incidents.status, ['open', 'investigating', 'mitigated']) : status ? eq(incidents.status, status) : undefined).orderBy(desc(incidents.detectedAt)).limit(300);
      return rows.map((r) => ({ ...r, regulatorDeadline: breachDeadline(r.detectedAt, r.personalDataInvolved), regulatorOverdue: r.personalDataInvolved && !r.regulatorNotifiedAt && breachDeadline(r.detectedAt, true)! < this.clock.now() }));
    });
  }

  @Get('incidents/:id')
  @Auth('user', GOVERNANCE_ROLES)
  incident(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(incidents).where(eq(incidents.id, id));
      if (!row) throw new NotFoundException('Incident not found');
      const timeline = await tx.select({ u: incidentUpdates, author: users.fullName }).from(incidentUpdates).innerJoin(users, eq(users.id, incidentUpdates.authorId)).where(eq(incidentUpdates.incidentId, id)).orderBy(asc(incidentUpdates.createdAt));
      return { ...row, regulatorDeadline: breachDeadline(row.detectedAt, row.personalDataInvolved), timeline: timeline.map((t) => ({ ...t.u, author: t.author })) };
    });
  }

  /** Owner, impact, root cause, corrective actions and the regulator notification. */
  @Put('incidents/:id')
  @Auth('user', GOVERNANCE_ROLES)
  editIncident(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(IncidentEdit)) b: z.infer<typeof IncidentEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(incidents).where(eq(incidents.id, id)).for('update');
      if (!before) throw new NotFoundException('Incident not found');
      const { regulatorNotified, ...rest } = b;
      const [row] = await tx.update(incidents).set({ ...rest, ...(regulatorNotified ? { regulatorNotifiedAt: before.regulatorNotifiedAt ?? this.clock.now() } : {}), updatedAt: this.clock.now() }).where(eq(incidents.id, id)).returning();
      if (regulatorNotified && !before.regulatorNotifiedAt) await tx.insert(incidentUpdates).values({ tenantId: p.tenantId, incidentId: id, kind: 'notification', body: 'Data Protection Board notified', authorId: p.userId });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'incident.edited', subjectType: 'incident', subjectId: id, changes: changesOf(before, row, ['ownerId', 'impact', 'rootCause', 'correctiveActions', 'regulatorNotifiedAt']) });
      return row;
    });
  }

  /** A note on the timeline, optionally moving the incident to a new status. */
  @Post('incidents/:id/updates')
  @Auth('user', GOVERNANCE_ROLES)
  updateIncident(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(UpdateBody)) b: z.infer<typeof UpdateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inc] = await tx.select().from(incidents).where(eq(incidents.id, id)).for('update');
      if (!inc) throw new NotFoundException('Incident not found');
      if (b.status) {
        const move = canMoveIncident(inc.status, b.status, inc);
        if (!move.ok) throw new BadRequestException(move.reason);
        await tx.update(incidents).set({ status: b.status, resolvedAt: b.status === 'resolved' || b.status === 'closed' ? inc.resolvedAt ?? this.clock.now() : null, updatedAt: this.clock.now() }).where(eq(incidents.id, id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'incident.status', subjectType: 'incident', subjectId: id, changes: { status: { before: inc.status, after: b.status } } });
      }
      const [row] = await tx.insert(incidentUpdates).values({ tenantId: p.tenantId, incidentId: id, kind: b.status ? 'status' : b.kind, body: b.body, statusAfter: b.status ?? null, authorId: p.userId }).returning();
      return row;
    });
  }

  // ----- retention -----------------------------------------------------------------------------

  @Get('retention')
  @Auth('user', GOVERNANCE_ROLES)
  policies(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(documentRetentionPolicies).orderBy(asc(documentRetentionPolicies.category)));
  }

  @Put('retention/:category')
  @Auth('user', GOVERNANCE_ROLES)
  setPolicy(@CurrentPrincipal() p: UserPrincipal, @Param('category') category: string, @Body(new ZodBody(RetentionBody)) b: z.infer<typeof RetentionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(documentRetentionPolicies).where(eq(documentRetentionPolicies.category, category));
      const [row] = await tx
        .insert(documentRetentionPolicies)
        .values({ tenantId: p.tenantId, category, ...b, createdBy: p.userId })
        .onConflictDoUpdate({ target: [documentRetentionPolicies.tenantId, documentRetentionPolicies.category], set: { retainMonths: b.retainMonths, note: b.note } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'retention.set', subjectType: 'document_retention_policy', subjectId: row.id, data: { category }, changes: changesOf(before ?? {}, row, ['retainMonths', 'note']) });
      return row;
    });
  }

  @Delete('retention/:category')
  @HttpCode(204)
  @Auth('user', GOVERNANCE_ROLES)
  removePolicy(@CurrentPrincipal() p: UserPrincipal, @Param('category') category: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.delete(documentRetentionPolicies).where(eq(documentRetentionPolicies.category, category));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'retention.removed', subjectType: 'document_retention_policy', data: { category } });
    });
  }

  /** Files past their category's retention (not on legal hold, not yet archived). */
  @Get('retention/due')
  @Auth('user', GOVERNANCE_ROLES)
  due(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.dueFiles(tx));
  }

  /** Archives every file that is due. Archiving hides the file and keeps it and its audit trail, as in the vault. */
  @Post('retention/run')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  run(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const files = await this.dueFiles(tx);
      if (files.length) await tx.update(vaultDocuments).set({ archivedAt: this.clock.now() }).where(inArray(vaultDocuments.id, files.map((f) => f.id)));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'retention.archived', subjectType: 'vault_document', data: { count: files.length } });
      return { archived: files.length };
    });
  }

  @Post('documents/:id/hold')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  hold(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ hold: z.boolean() }))) b: { hold: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(vaultDocuments).set({ legalHold: b.hold }).where(eq(vaultDocuments.id, id)).returning({ id: vaultDocuments.id, legalHold: vaultDocuments.legalHold });
      if (!row) throw new NotFoundException('Document not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.hold ? 'vault.legal_hold_set' : 'vault.legal_hold_cleared', subjectType: 'vault_document', subjectId: id });
      return row;
    });
  }

  /** All versions of a document (the chain of "replaces"), oldest first. */
  @Get('documents/:id/versions')
  @Auth('user', GOVERNANCE_ROLES)
  versions(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pick = { id: vaultDocuments.id, title: vaultDocuments.title, version: vaultDocuments.version, replacesId: vaultDocuments.replacesId, sizeBytes: vaultDocuments.sizeBytes, uploadedBy: vaultDocuments.uploadedBy, createdAt: vaultDocuments.createdAt, archivedAt: vaultDocuments.archivedAt };
      const [start] = await tx.select(pick).from(vaultDocuments).where(eq(vaultDocuments.id, id));
      if (!start) throw new NotFoundException('Document not found');
      const chain = [start];
      for (let cur = start; cur.replacesId && chain.length < 100; ) {
        const [prev] = await tx.select(pick).from(vaultDocuments).where(eq(vaultDocuments.id, cur.replacesId));
        if (!prev) break;
        chain.unshift(prev);
        cur = prev;
      }
      for (let cur = start; chain.length < 100; ) {
        const [next] = await tx.select(pick).from(vaultDocuments).where(eq(vaultDocuments.replacesId, cur.id));
        if (!next) break;
        chain.push(next);
        cur = next;
      }
      return chain;
    });
  }

  private async dueFiles(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0]) {
    const policies = await tx.select().from(documentRetentionPolicies);
    if (!policies.length) return [];
    const files = await tx
      .select({ id: vaultDocuments.id, title: vaultDocuments.title, category: vaultDocuments.category, ownerType: vaultDocuments.ownerType, createdAt: vaultDocuments.createdAt, legalHold: vaultDocuments.legalHold, archivedAt: vaultDocuments.archivedAt })
      .from(vaultDocuments)
      .where(and(isNull(vaultDocuments.archivedAt), inArray(vaultDocuments.category, policies.map((x) => x.category))));
    const months = new Map(policies.map((x) => [x.category, x.retainMonths]));
    const now = this.clock.now();
    return files.filter((f) => retentionDue(f, months.get(f.category)!, now)).map((f) => ({ id: f.id, title: f.title, category: f.category, ownerType: f.ownerType, createdAt: f.createdAt, retainMonths: months.get(f.category)! }));
  }
}
