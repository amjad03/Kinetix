import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { disciplineActions, disciplineAppeals, disciplineIncidents, students } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { DISCIPLINE_DECIDERS, DISCIPLINE_VIEW, INCIDENT_REPORTERS } from './welfare.access.js';
import { WelfareService } from './welfare.service.js';
import { needsPrincipal, withinAppealWindow } from './welfare-rules.js';

const IncidentBody = z.object({ studentId: z.uuid(), incidentOn: Day, kind: z.string().trim().min(2).max(80), severity: z.enum(['minor', 'major', 'severe']).default('minor'), description: z.string().trim().min(5).max(4000), grievanceId: z.uuid().optional() });
const ActionBody = z
  .object({ action: z.enum(['warning', 'fine', 'community_service', 'counselling_referral', 'suspension', 'expulsion']), detail: z.string().trim().max(2000).default(''), startsOn: Day.optional(), endsOn: Day.optional(), finePaise: Paise.optional() })
  .refine((v) => v.action !== 'fine' || !!v.finePaise, { message: 'A fine needs an amount', path: ['finePaise'] })
  .refine((v) => v.action !== 'suspension' || (!!v.startsOn && !!v.endsOn && v.endsOn >= v.startsOn), { message: 'A suspension needs a start and an end date', path: ['endsOn'] });

/** Discipline incidents with actions and appeals (docs/architecture/placements-research-welfare.md). */
@Controller('v1/discipline')
export class DisciplineController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WelfareService,
  ) {}

  @Post('incidents')
  @Auth('user', INCIDENT_REPORTERS)
  report(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IncidentBody)) b: z.infer<typeof IncidentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      const [row] = await tx.insert(disciplineIncidents).values({ tenantId: p.tenantId, reportedBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'discipline.incident_reported', 'incident', row.id, { studentId: b.studentId, severity: b.severity });
      return row;
    });
  }

  @Get('incidents')
  @Auth('user', INCIDENT_REPORTERS)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ i: disciplineIncidents, fullName: students.fullName, rollNo: students.rollNo })
        .from(disciplineIncidents)
        .innerJoin(students, eq(students.id, disciplineIncidents.studentId))
        .where(and(hasRole(p, DISCIPLINE_VIEW) ? undefined : eq(disciplineIncidents.reportedBy, p.userId), studentId ? eq(disciplineIncidents.studentId, studentId) : undefined, status ? eq(disciplineIncidents.status, status) : undefined))
        .orderBy(desc(disciplineIncidents.incidentOn));
      return rows.map((r) => ({ ...r.i, fullName: r.fullName, rollNo: r.rollNo }));
    });
  }

  /** One student's record: the student and their parents see incidents, actions and appeal outcomes (not who reported them). */
  @Get('students/:studentId')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, DISCIPLINE_VIEW);
      const staff = hasRole(p, DISCIPLINE_VIEW);
      const incidents = await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.studentId, studentId)).orderBy(desc(disciplineIncidents.incidentOn));
      const ids = incidents.map((i) => i.id);
      const actions = ids.length ? await tx.select().from(disciplineActions).where(inArray(disciplineActions.incidentId, ids)).orderBy(asc(disciplineActions.createdAt)) : [];
      const appeals = ids.length ? await tx.select().from(disciplineAppeals).where(inArray(disciplineAppeals.incidentId, ids)).orderBy(asc(disciplineAppeals.createdAt)) : [];
      return incidents.map(({ reportedBy, grievanceId, ...i }) => ({
        ...i,
        ...(staff ? { reportedBy, grievanceId } : {}),
        actions: actions.filter((a) => a.incidentId === i.id).map(({ decidedBy, ...a }) => ({ ...a, ...(staff ? { decidedBy } : {}), appeals: appeals.filter((x) => x.actionId === a.id).map(({ appellantUserId: _u, decidedBy: _d, ...x }) => x) })),
      }));
    });
  }

  @Post('incidents/:id/review')
  @Auth('user', DISCIPLINE_DECIDERS)
  @HttpCode(200)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.id, id)).for('update'))[0], 'Incident');
      if (cur.status !== 'reported') throw new ConflictException(`A ${cur.status} incident cannot be put under review`);
      const [row] = await tx.update(disciplineIncidents).set({ status: 'under_review', version: cur.version + 1 }).where(eq(disciplineIncidents.id, id)).returning();
      await auditUser(tx, p, 'discipline.under_review', 'incident', id);
      return row;
    });
  }

  /** Records an action. Suspension and expulsion are the principal's decision; the family is told. */
  @Post('incidents/:id/actions')
  @Auth('user', DISCIPLINE_DECIDERS)
  addAction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActionBody)) b: z.infer<typeof ActionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.id, id)).for('update'))[0], 'Incident');
      if (needsPrincipal(b.action) && !hasRole(p, ['principal'])) throw new ForbiddenException('Only the principal can suspend or expel');
      if (['closed', 'appealed'].includes(cur.status)) throw new ConflictException(`A ${cur.status} incident cannot take a new action`);
      if (b.action === 'expulsion' && cur.severity !== 'severe') throw new ConflictException('Expulsion is only for severe incidents');
      const [row] = await tx.insert(disciplineActions).values({ tenantId: p.tenantId, incidentId: id, decidedBy: p.userId, ...b }).returning();
      await tx.update(disciplineIncidents).set({ status: 'action_taken', version: cur.version + 1 }).where(eq(disciplineIncidents.id, id));
      await auditUser(tx, p, 'discipline.action_recorded', 'incident', id, { action: b.action, actionId: row.id });
      await this.svc.notify(tx, await this.svc.family(tx, cur.studentId), 'grievance', 'A disciplinary decision was recorded', `You can read it and appeal within 15 days.`, `discipline:action:${row.id}`, { studentId: cur.studentId });
      return row;
    });
  }

  @Post('incidents/:id/close')
  @Auth('user', DISCIPLINE_DECIDERS)
  @HttpCode(200)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.id, id)).for('update'))[0], 'Incident');
      if (cur.status === 'closed') return cur;
      if (cur.status === 'appealed') throw new ConflictException('Decide the pending appeal first');
      const [row] = await tx.update(disciplineIncidents).set({ status: 'closed', version: cur.version + 1 }).where(eq(disciplineIncidents.id, id)).returning();
      await auditUser(tx, p, 'discipline.closed', 'incident', id);
      return row;
    });
  }

  // ---- appeals ------------------------------------------------------------------------------

  /** The student or a parent appeals an action within 15 days; one pending appeal per action. */
  @Post('actions/:actionId/appeals')
  @Auth('user', ['student', 'guardian'])
  appeal(@CurrentPrincipal() p: UserPrincipal, @Param('actionId', ParseUUIDPipe) actionId: string, @Body(new ZodBody(z.object({ grounds: z.string().trim().min(10).max(3000) }))) b: { grounds: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(disciplineActions).where(eq(disciplineActions.id, actionId)))[0], 'Action');
      const inc = found((await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.id, a.incidentId)).for('update'))[0], 'Incident');
      if (!(await this.svc.familyStudents(tx, p)).includes(inc.studentId)) throw new NotFoundException('Action not found');
      if (a.status === 'revoked') throw new ConflictException('This action was already revoked');
      if (!withinAppealWindow(a.createdAt, this.svc.now())) throw new ConflictException({ message: 'The 15-day appeal window has passed', code: 'APPEAL_WINDOW_CLOSED' });
      const [pending] = await tx.select({ id: disciplineAppeals.id }).from(disciplineAppeals).where(and(eq(disciplineAppeals.actionId, actionId), eq(disciplineAppeals.status, 'pending')));
      if (pending) throw new ConflictException('There is already an appeal pending for this action');
      const [row] = await tx.insert(disciplineAppeals).values({ tenantId: p.tenantId, incidentId: inc.id, actionId, appellantUserId: p.userId, grounds: b.grounds }).returning();
      await tx.update(disciplineIncidents).set({ status: 'appealed', version: inc.version + 1 }).where(eq(disciplineIncidents.id, inc.id));
      await auditUser(tx, p, 'discipline.appealed', 'incident', inc.id, { actionId });
      await this.svc.notify(tx, await this.svc.usersWithRole(tx, ['principal', 'tenant_admin']), 'grievance', 'A disciplinary appeal was filed', 'It needs a decision from someone other than the original decision-maker.', `discipline:appeal:${row.id}`, { appealId: row.id });
      return row;
    });
  }

  @Get('appeals')
  @Auth('user', DISCIPLINE_DECIDERS)
  appeals(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(disciplineAppeals).where(status ? eq(disciplineAppeals.status, status) : undefined).orderBy(desc(disciplineAppeals.createdAt)));
  }

  /** Decided by someone other than whoever took the action. Revoking cancels the action; reducing marks it reduced. */
  @Post('appeals/:id/decision')
  @Auth('user', DISCIPLINE_DECIDERS)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ decision: z.enum(['upheld', 'reduced', 'revoked']), note: z.string().trim().min(5).max(2000) }))) b: { decision: string; note: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ap = found((await tx.select().from(disciplineAppeals).where(eq(disciplineAppeals.id, id)).for('update'))[0], 'Appeal');
      if (ap.status !== 'pending') throw new ConflictException(`This appeal is already ${ap.status}`);
      const action = found((await tx.select().from(disciplineActions).where(eq(disciplineActions.id, ap.actionId)))[0], 'Action');
      if (action.decidedBy === p.userId) throw new ForbiddenException('An appeal must be decided by someone other than the person who took the action');
      if (ap.appellantUserId === p.userId) throw new BadRequestException('Cannot decide your own appeal');
      const [row] = await tx.update(disciplineAppeals).set({ status: b.decision, decisionNote: b.note, decidedBy: p.userId, decidedAt: this.svc.now() }).where(eq(disciplineAppeals.id, id)).returning();
      if (b.decision !== 'upheld') await tx.update(disciplineActions).set({ status: b.decision === 'revoked' ? 'revoked' : 'reduced' }).where(eq(disciplineActions.id, action.id));
      await tx.update(disciplineIncidents).set({ status: 'closed' }).where(eq(disciplineIncidents.id, ap.incidentId));
      await auditUser(tx, p, `discipline.appeal_${b.decision}`, 'incident', ap.incidentId, { appealId: id });
      const [inc] = await tx.select({ studentId: disciplineIncidents.studentId }).from(disciplineIncidents).where(eq(disciplineIncidents.id, ap.incidentId));
      await this.svc.notify(tx, await this.svc.family(tx, inc.studentId), 'grievance', 'Your appeal was decided', `Outcome: ${b.decision}`, `discipline:appeal-decision:${id}`, { appealId: id });
      return row;
    });
  }
}
