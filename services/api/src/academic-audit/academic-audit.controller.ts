import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { headedDepartmentIds } from '../departments/departments.controller.js';
import { academicAudits, academicAuditResults, auditNonConformities, auditTemplateItems, auditTemplates, departments, userRoles, users } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';

/** Quality-cell leaders write the templates and see every department. */
const LEADERS: RoleName[] = ['tenant_admin', 'principal'];
/** A head of department audits (and sees) their own departments. */
const AUDITORS: RoleName[] = [...LEADERS, 'hod'];
const day = z.iso.date();

type Audit = typeof academicAudits.$inferSelect;
type Nc = typeof auditNonConformities.$inferSelect;

/** Share of answered items that comply: compliant counts 1, partial one half. */
export function compliancePct(r: { compliant: number; partial: number; nonCompliant: number }): number | null {
  const n = r.compliant + r.partial + r.nonCompliant;
  return n === 0 ? null : Math.round(((r.compliant + r.partial / 2) / n) * 100);
}

/** Academic audit: templates, department audits, findings and non-conformities with corrective action (spec section 30). */
@Controller('v1/academic-audit')
export class AcademicAuditController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private isLeader(p: UserPrincipal) {
    return hasRole(p, LEADERS);
  }

  /** Whether `p` may run and read this audit: a leader, or the head of its department. */
  private async canManage(tx: Tx, p: UserPrincipal, a: Audit) {
    if (this.isLeader(p)) return true;
    return hasRole(p, ['hod']) && (await headedDepartmentIds(tx, p.userId)).includes(a.departmentId);
  }

  private async managed(tx: Tx, p: UserPrincipal, id: string, lock = false) {
    const q = tx.select().from(academicAudits).where(eq(academicAudits.id, id));
    const a = found((await (lock ? q.for('update') : q))[0], 'Audit');
    if (!(await this.canManage(tx, p, a))) throw new NotFoundException('Audit not found');
    return a;
  }

  /** Departments the caller may audit, and the staff who can own a corrective action. */
  @Get('options')
  @Auth('user', AUDITORS)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const headed = this.isLeader(p) ? null : await headedDepartmentIds(tx, p.userId);
      const depts = (await tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name))).filter((d) => headed === null || headed.includes(d.id));
      const owners = await tx.selectDistinct({ id: users.id, fullName: users.fullName }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(inArray(userRoles.role, ['teacher', 'hod', 'principal', 'librarian', 'accountant', 'hr_manager', 'admissions_officer'])).orderBy(asc(users.fullName));
      return { departments: depts, owners };
    });
  }

  // ----- templates ----------------------------------------------------------------------------

  @Post('templates')
  @Auth('user', LEADERS)
  createTemplate(
    @CurrentPrincipal() p: UserPrincipal,
    @Body(new ZodBody(z.object({ name: z.string().trim().min(3).max(200), description: z.string().trim().max(2000).default(''), items: z.array(z.object({ category: z.string().trim().max(100).default(''), text: z.string().trim().min(3).max(1000) })).min(1).max(200) })))
    b: { name: string; description: string; items: { category: string; text: string }[] },
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.insert(auditTemplates).values({ tenantId: p.tenantId, name: b.name, description: b.description, createdBy: p.userId }).returning();
      const items = await tx.insert(auditTemplateItems).values(b.items.map((i, n) => ({ tenantId: p.tenantId, templateId: t.id, ord: n + 1, category: i.category, text: i.text }))).returning();
      await auditUser(tx, p, 'academic_audit.template_created', 'audit_template', t.id, { items: items.length });
      return { ...t, items: items.sort((a, c) => a.ord - c.ord) };
    });
  }

  @Get('templates')
  @Auth('user', AUDITORS)
  templates(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(auditTemplates).orderBy(desc(auditTemplates.createdAt));
      const counts = new Map((await tx.select({ id: auditTemplateItems.templateId, n: sql<number>`count(*)::int` }).from(auditTemplateItems).groupBy(auditTemplateItems.templateId)).map((c) => [c.id, c.n]));
      return rows.map((t) => ({ ...t, itemCount: counts.get(t.id) ?? 0 }));
    });
  }

  @Get('templates/:id')
  @Auth('user', AUDITORS)
  template(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = found((await tx.select().from(auditTemplates).where(eq(auditTemplates.id, id)))[0], 'Template');
      return { ...t, items: await tx.select().from(auditTemplateItems).where(eq(auditTemplateItems.templateId, id)).orderBy(asc(auditTemplateItems.ord)) };
    });
  }

  /** Retires a template; audits already made from it keep their copy of the checklist. */
  @Post('templates/:id/archive')
  @Auth('user', LEADERS)
  @HttpCode(200)
  archive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: auditTemplates.id }).from(auditTemplates).where(eq(auditTemplates.id, id)))[0], 'Template');
      const [row] = await tx.update(auditTemplates).set({ active: false }).where(eq(auditTemplates.id, id)).returning();
      await auditUser(tx, p, 'academic_audit.template_archived', 'audit_template', id);
      return row;
    });
  }

  // ----- audits -------------------------------------------------------------------------------

  /** Starts an audit: the template's checklist is copied so later edits to the template do not change it. */
  @Post('audits')
  @Auth('user', AUDITORS)
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ templateId: z.uuid(), departmentId: z.uuid(), academicTermId: z.uuid().optional(), title: z.string().trim().min(3).max(200).optional(), conductedOn: day.optional() }))) b: { templateId: string; departmentId: string; academicTermId?: string; title?: string; conductedOn?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const tpl = found((await tx.select().from(auditTemplates).where(eq(auditTemplates.id, b.templateId)))[0], 'Template');
      if (!tpl.active) throw new ConflictException('This template has been archived');
      const dept = found((await tx.select().from(departments).where(eq(departments.id, b.departmentId)))[0], 'Department');
      if (!this.isLeader(p) && !(await headedDepartmentIds(tx, p.userId)).includes(dept.id)) throw new ForbiddenException('You can audit only the departments you head');
      const today = await tenantToday(tx, this.clock);
      const [a] = await tx.insert(academicAudits).values({ tenantId: p.tenantId, templateId: tpl.id, departmentId: dept.id, academicTermId: b.academicTermId ?? null, title: b.title ?? `${tpl.name} - ${dept.name}`, auditorUserId: p.userId, conductedOn: b.conductedOn ?? today }).returning();
      const items = await tx.select().from(auditTemplateItems).where(eq(auditTemplateItems.templateId, tpl.id)).orderBy(asc(auditTemplateItems.ord));
      await tx.insert(academicAuditResults).values(items.map((i) => ({ tenantId: p.tenantId, auditId: a.id, ord: i.ord, category: i.category, itemText: i.text })));
      await auditUser(tx, p, 'academic_audit.started', 'academic_audit', a.id, { departmentId: dept.id });
      return a;
    });
  }

  @Get('audits')
  @Auth('user', AUDITORS)
  audits(@CurrentPrincipal() p: UserPrincipal, @Query('departmentId') departmentId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const scope = this.isLeader(p) ? undefined : inArray(academicAudits.departmentId, await headedDepartmentIds(tx, p.userId));
      if (!this.isLeader(p) && (await headedDepartmentIds(tx, p.userId)).length === 0) return [];
      return tx
        .select({ audit: academicAudits, department: departments.name, auditor: users.fullName })
        .from(academicAudits)
        .innerJoin(departments, eq(departments.id, academicAudits.departmentId))
        .innerJoin(users, eq(users.id, academicAudits.auditorUserId))
        .where(and(scope, departmentId ? eq(academicAudits.departmentId, departmentId) : undefined, status ? eq(academicAudits.status, status) : undefined))
        .orderBy(desc(academicAudits.createdAt));
    });
  }

  @Get('audits/:id')
  @Auth('user', AUDITORS)
  audit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.managed(tx, p, id);
      const results = await tx.select().from(academicAuditResults).where(eq(academicAuditResults.auditId, id)).orderBy(asc(academicAuditResults.ord));
      const ncs = await tx.select().from(auditNonConformities).where(eq(auditNonConformities.auditId, id)).orderBy(asc(auditNonConformities.createdAt));
      return { ...a, results, nonConformities: ncs };
    });
  }

  @Put('audits/:id/results/:resultId')
  @Auth('user', AUDITORS)
  record(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resultId', ParseUUIDPipe) resultId: string,
    @Body(new ZodBody(z.object({ result: z.enum(['compliant', 'partial', 'non_compliant']), remark: z.string().trim().max(2000).default('') }))) b: { result: string; remark: string },
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.managed(tx, p, id, true);
      if (a.status === 'completed') throw new ConflictException('This audit is complete');
      found((await tx.select({ id: academicAuditResults.id }).from(academicAuditResults).where(and(eq(academicAuditResults.id, resultId), eq(academicAuditResults.auditId, id))))[0], 'Item');
      if (b.result !== 'compliant' && !b.remark) throw new ConflictException('Add a remark for a partial or non-compliant finding');
      const [row] = await tx.update(academicAuditResults).set({ result: b.result, remark: b.remark, updatedAt: this.clock.now() }).where(eq(academicAuditResults.id, resultId)).returning();
      await auditUser(tx, p, 'academic_audit.item_recorded', 'academic_audit', id, { resultId, result: b.result });
      return row;
    });
  }

  /** Every item must be answered and every non-compliant item needs a non-conformity before the audit closes. */
  @Post('audits/:id/complete')
  @Auth('user', AUDITORS)
  @HttpCode(200)
  complete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.managed(tx, p, id, true);
      if (a.status === 'completed') throw new ConflictException('This audit is already complete');
      const results = await tx.select().from(academicAuditResults).where(eq(academicAuditResults.auditId, id));
      const pending = results.filter((r) => r.result === 'pending').length;
      if (pending) throw new ConflictException(`${pending} checklist items are still unanswered`);
      const linked = new Set((await tx.select({ r: auditNonConformities.resultId }).from(auditNonConformities).where(eq(auditNonConformities.auditId, id))).map((n) => n.r));
      const missing = results.filter((r) => r.result === 'non_compliant' && !linked.has(r.id)).length;
      if (missing) throw new ConflictException(`${missing} non-compliant items have no non-conformity yet`);
      const [row] = await tx.update(academicAudits).set({ status: 'completed', completedAt: this.clock.now() }).where(eq(academicAudits.id, id)).returning();
      await auditUser(tx, p, 'academic_audit.completed', 'academic_audit', id);
      return row;
    });
  }

  // ----- non-conformities ---------------------------------------------------------------------

  @Post('audits/:id/non-conformities')
  @Auth('user', AUDITORS)
  raise(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(z.object({ resultId: z.uuid().optional(), description: z.string().trim().min(3).max(2000), severity: z.enum(['minor', 'major']).default('minor'), correctiveAction: z.string().trim().max(2000).default(''), ownerUserId: z.uuid().optional(), dueOn: day.optional() })))
    b: { resultId?: string; description: string; severity: string; correctiveAction: string; ownerUserId?: string; dueOn?: string },
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.managed(tx, p, id);
      if (b.resultId) {
        const r = found((await tx.select().from(academicAuditResults).where(and(eq(academicAuditResults.id, b.resultId), eq(academicAuditResults.auditId, id))))[0], 'Item');
        if (r.result !== 'non_compliant' && r.result !== 'partial') throw new ConflictException('Only a partial or non-compliant item can have a non-conformity');
      }
      if (b.ownerUserId) found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.ownerUserId)))[0], 'Owner');
      const [row] = await tx.insert(auditNonConformities).values({ tenantId: p.tenantId, auditId: id, resultId: b.resultId ?? null, description: b.description, severity: b.severity, correctiveAction: b.correctiveAction, ownerUserId: b.ownerUserId ?? null, dueOn: b.dueOn ?? null }).returning();
      await auditUser(tx, p, 'academic_audit.nc_raised', 'audit_nc', row.id, { auditId: id, severity: b.severity });
      return row;
    });
  }

  /** Managers see all in their scope; anyone else sees only what is assigned to them. */
  @Get('non-conformities')
  @Auth('user')
  async ncs(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('auditId') auditId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const headed = hasRole(p, ['hod']) ? await headedDepartmentIds(tx, p.userId) : [];
      const rows = await tx
        .select({ nc: auditNonConformities, audit: academicAudits.title, departmentId: academicAudits.departmentId, department: departments.name, owner: users.fullName })
        .from(auditNonConformities)
        .innerJoin(academicAudits, eq(academicAudits.id, auditNonConformities.auditId))
        .innerJoin(departments, eq(departments.id, academicAudits.departmentId))
        .leftJoin(users, eq(users.id, auditNonConformities.ownerUserId))
        .where(and(status ? inArray(auditNonConformities.status, status.split(',')) : undefined, auditId ? eq(auditNonConformities.auditId, auditId) : undefined))
        .orderBy(asc(auditNonConformities.dueOn), desc(auditNonConformities.createdAt));
      return rows
        .filter((r) => this.isLeader(p) || headed.includes(r.departmentId) || r.nc.ownerUserId === p.userId)
        .map((r) => ({ ...r.nc, audit: r.audit, department: r.department, ownerName: r.owner, overdue: r.nc.status !== 'closed' && r.nc.dueOn !== null && r.nc.dueOn < today }));
    });
  }

  /** The owner or a manager of the department. */
  private async ncAccess(tx: Tx, p: UserPrincipal, id: string) {
    const nc = found((await tx.select().from(auditNonConformities).where(eq(auditNonConformities.id, id)).for('update'))[0], 'Non-conformity');
    const [a] = await tx.select().from(academicAudits).where(eq(academicAudits.id, nc.auditId));
    const manager = await this.canManage(tx, p, a);
    if (!manager && nc.ownerUserId !== p.userId) throw new NotFoundException('Non-conformity not found');
    if (nc.status === 'closed') throw new ConflictException('This non-conformity is closed');
    return { nc, manager };
  }

  /** Managers set the owner and due date; the owner records the corrective action and progress. */
  @Put('non-conformities/:id')
  @Auth('user')
  update(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(z.object({ correctiveAction: z.string().trim().max(2000).optional(), ownerUserId: z.uuid().optional(), dueOn: day.optional(), status: z.enum(['open', 'in_progress']).optional() })))
    b: { correctiveAction?: string; ownerUserId?: string; dueOn?: string; status?: 'open' | 'in_progress' },
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { nc, manager } = await this.ncAccess(tx, p, id);
      if (!manager && (b.ownerUserId !== undefined || b.dueOn !== undefined)) throw new ForbiddenException('Only the department head can change the owner or the due date');
      if (b.ownerUserId) found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.ownerUserId)))[0], 'Owner');
      const [row] = await tx
        .update(auditNonConformities)
        .set({ correctiveAction: b.correctiveAction ?? nc.correctiveAction, ownerUserId: b.ownerUserId ?? nc.ownerUserId, dueOn: b.dueOn ?? nc.dueOn, status: b.status ?? (b.correctiveAction ? 'in_progress' : nc.status) })
        .where(eq(auditNonConformities.id, id))
        .returning();
      await auditUser(tx, p, 'academic_audit.nc_updated', 'audit_nc', id);
      return row;
    });
  }

  @Post('non-conformities/:id/close')
  @Auth('user')
  @HttpCode(200)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ closureNote: z.string().trim().min(5).max(2000) }))) b: { closureNote: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { nc } = await this.ncAccess(tx, p, id);
      if (!nc.correctiveAction) throw new ConflictException('Record the corrective action before closing');
      const [row] = await tx.update(auditNonConformities).set({ status: 'closed', closureNote: b.closureNote, closedBy: p.userId, closedAt: this.clock.now() }).where(eq(auditNonConformities.id, id)).returning();
      await auditUser(tx, p, 'academic_audit.nc_closed', 'audit_nc', id);
      return row;
    });
  }

  // ----- summary ------------------------------------------------------------------------------

  /** Per department: audits, compliance of the answered items, and non-conformities (open, overdue, closed). */
  @Get('summary')
  @Auth('user', AUDITORS)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const headed = this.isLeader(p) ? null : await headedDepartmentIds(tx, p.userId);
      const depts = (await tx.select().from(departments).orderBy(asc(departments.name))).filter((d) => headed === null || headed.includes(d.id));
      const audits = await tx.select({ id: academicAudits.id, departmentId: academicAudits.departmentId, status: academicAudits.status }).from(academicAudits);
      const results = await tx.select({ auditId: academicAuditResults.auditId, result: academicAuditResults.result, n: sql<number>`count(*)::int` }).from(academicAuditResults).groupBy(academicAuditResults.auditId, academicAuditResults.result);
      const ncs = await tx.select({ auditId: auditNonConformities.auditId, status: auditNonConformities.status, dueOn: auditNonConformities.dueOn }).from(auditNonConformities);
      return depts.map((d) => {
        const mine = audits.filter((a) => a.departmentId === d.id);
        const ids = new Set(mine.map((a) => a.id));
        const count = (r: string) => results.filter((x) => ids.has(x.auditId) && x.result === r).reduce((s, x) => s + x.n, 0);
        const own = ncs.filter((n) => ids.has(n.auditId)) as Pick<Nc, 'status' | 'dueOn'>[];
        const compliant = count('compliant');
        const partial = count('partial');
        const nonCompliant = count('non_compliant');
        return {
          departmentId: d.id,
          department: d.name,
          audits: mine.length,
          completed: mine.filter((a) => a.status === 'completed').length,
          compliant,
          partial,
          nonCompliant,
          compliancePct: compliancePct({ compliant, partial, nonCompliant }),
          ncOpen: own.filter((n) => n.status !== 'closed').length,
          ncOverdue: own.filter((n) => n.status !== 'closed' && n.dueOn !== null && n.dueOn < today).length,
          ncClosed: own.filter((n) => n.status === 'closed').length,
        };
      });
    });
  }
}
