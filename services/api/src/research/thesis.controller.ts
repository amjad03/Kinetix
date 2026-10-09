import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { researchScholars, students, userRoles, users } from '../db/schema.js';
import { similarityChecks, supervisorAllocations, supervisorCapacity, thesisEvents, thesisRecords, thesisVivas } from '../db/schema-pathways.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './research.controller.js';
import { MIN_EXAMINERS, SIMILARITY_LIMIT_PERCENT, canMoveThesis, hasCapacity, internalSimilarity } from './thesis-rules.js';

const hasRole = (p: UserPrincipal, roles: readonly string[]) => p.roles.some((r) => roles.includes(r));
const ThesisBody = z.object({ title: z.string().trim().min(3).max(300), abstract: z.string().trim().max(5000).default('') });
const ThesisPatch = z.object({ title: z.string().trim().min(3).max(300).optional(), abstract: z.string().trim().max(5000).optional(), contentText: z.string().max(400_000).optional() });
const StageBody = z.object({ to: z.enum(['draft', 'submitted', 'examination', 'viva', 'awarded']), note: z.string().trim().max(500).default(''), overrideSimilarity: z.boolean().default(false) });
const ExaminersBody = z.object({ examiners: z.array(z.object({ name: z.string().trim().min(1).max(120), affiliation: z.string().trim().max(160).default(''), verdict: z.enum(['accept', 'revise', 'reject']).optional() })).max(6) });
const VivaBody = z.object({ kind: z.enum(['pre_submission', 'open_defence']).default('open_defence'), scheduledAt: z.coerce.date(), venue: z.string().trim().max(120).default(''), panel: z.array(z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(60).default('examiner') })).min(1).max(8) });
const VivaResult = z.object({ outcome: z.enum(['passed', 'revise', 'failed']), remarks: z.string().trim().max(1000).default('') });
const CapacityBody = z.object({ maxScholars: z.number().int().min(0).max(30), areas: z.array(z.string().trim().min(1).max(60)).max(12).default([]) });
const AllocateBody = z.object({ supervisorUserId: z.uuid(), role: z.enum(['supervisor', 'co_supervisor']).default('supervisor'), reason: z.string().trim().max(300).default('') });

/** Thesis workflow from synopsis to award, the viva, an internal originality check, and supervisor allocation with load caps. */
@Controller('v1/research')
export class ThesisController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** The thesis with its scholar, if the caller is research staff, the supervisor, or the scholar. */
  private async load(tx: Tx, p: UserPrincipal, id: string) {
    const [row] = await tx.select({ t: thesisRecords, s: researchScholars, scholarUserId: students.userId }).from(thesisRecords).innerJoin(researchScholars, eq(researchScholars.id, thesisRecords.scholarId)).leftJoin(students, eq(students.id, researchScholars.studentId)).where(eq(thesisRecords.id, id));
    if (!row) throw new NotFoundException('Thesis not found');
    const office = hasRole(p, RESEARCH_VIEW_ROLES);
    const supervisor = row.s.supervisorUserId === p.userId;
    const own = row.scholarUserId === p.userId;
    if (!office && !supervisor && !own) throw new NotFoundException('Thesis not found');
    return { ...row, office: hasRole(p, RESEARCH_ROLES), supervisor, own };
  }

  private async log(tx: Tx, p: UserPrincipal, thesisId: string, stage: string, note: string) {
    await tx.insert(thesisEvents).values({ tenantId: p.tenantId, thesisId, stage, note, actorId: p.userId });
  }

  @Get('theses')
  @Auth('user', FACULTY_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: thesisRecords.id, scholarId: thesisRecords.scholarId, title: thesisRecords.title, stage: thesisRecords.stage, scholar: researchScholars.fullName, programme: researchScholars.programme, supervisorUserId: researchScholars.supervisorUserId, supervisor: users.fullName, submittedOn: thesisRecords.submittedOn })
        .from(thesisRecords)
        .innerJoin(researchScholars, eq(researchScholars.id, thesisRecords.scholarId))
        .innerJoin(users, eq(users.id, researchScholars.supervisorUserId))
        .orderBy(desc(thesisRecords.updatedAt));
      return hasRole(p, RESEARCH_VIEW_ROLES) ? rows : rows.filter((r) => r.supervisorUserId === p.userId);
    });
  }

  /** The scholar's own thesis, for the student app. */
  @Get('theses/mine')
  @Auth('user', ['student'])
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: thesisRecords.id })
        .from(thesisRecords)
        .innerJoin(researchScholars, eq(researchScholars.id, thesisRecords.scholarId))
        .innerJoin(students, eq(students.id, researchScholars.studentId))
        .where(eq(students.userId, p.userId));
      return row ? this.detail(tx, p, row.id) : { id: null };
    });
  }

  private async detail(tx: Tx, p: UserPrincipal, id: string) {
    const { t, s } = await this.load(tx, p, id);
    const events = await tx.select().from(thesisEvents).where(eq(thesisEvents.thesisId, id)).orderBy(asc(thesisEvents.createdAt));
    const vivas = await tx.select().from(thesisVivas).where(eq(thesisVivas.thesisId, id)).orderBy(desc(thesisVivas.scheduledAt));
    const [check] = await tx.select().from(similarityChecks).where(eq(similarityChecks.thesisId, id)).orderBy(desc(similarityChecks.createdAt)).limit(1);
    const { contentText, ...rest } = t;
    return { ...rest, hasText: contentText.length > 0, scholar: { id: s.id, fullName: s.fullName, programme: s.programme, supervisorUserId: s.supervisorUserId }, events, vivas, similarity: check ?? null, similarityLimitPercent: SIMILARITY_LIMIT_PERCENT };
  }

  @Get('theses/:id')
  @Auth('user', [...FACULTY_ROLES, 'student'])
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.detail(tx, p, id));
  }

  @Post('scholars/:id/thesis')
  @Auth('user', FACULTY_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) scholarId: string, @Body(new ZodBody(ThesisBody)) b: z.infer<typeof ThesisBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(researchScholars).where(eq(researchScholars.id, scholarId));
      if (!s || (!hasRole(p, RESEARCH_ROLES) && s.supervisorUserId !== p.userId)) throw new NotFoundException('Scholar not found');
      const [have] = await tx.select({ id: thesisRecords.id }).from(thesisRecords).where(eq(thesisRecords.scholarId, scholarId));
      if (have) throw new ConflictException('This scholar already has a thesis record');
      const [row] = await tx.insert(thesisRecords).values({ tenantId: p.tenantId, scholarId, title: b.title, abstract: b.abstract }).returning();
      await tx.update(researchScholars).set({ thesisTitle: b.title }).where(eq(researchScholars.id, scholarId));
      await this.log(tx, p, row.id, 'synopsis', 'Thesis record opened');
      await auditUser(tx, p, 'thesis.created', 'thesis', row.id, { scholarId });
      return row;
    });
  }

  @Put('theses/:id')
  @Auth('user', FACULTY_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ThesisPatch)) b: z.infer<typeof ThesisPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, office, supervisor } = await this.load(tx, p, id);
      if (!office && !supervisor) throw new NotFoundException('Thesis not found');
      if (!['synopsis', 'draft'].includes(t.stage)) throw new ConflictException('A thesis cannot be edited once it is submitted');
      const [row] = await tx.update(thesisRecords).set({ ...b, version: t.version + 1, updatedAt: sql`now()` }).where(eq(thesisRecords.id, id)).returning({ id: thesisRecords.id, title: thesisRecords.title, stage: thesisRecords.stage, version: thesisRecords.version });
      return row;
    });
  }

  @Put('theses/:id/examiners')
  @Auth('user', RESEARCH_ROLES)
  examiners(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ExaminersBody)) b: z.infer<typeof ExaminersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.load(tx, p, id);
      const [row] = await tx.update(thesisRecords).set({ examiners: b.examiners }).where(eq(thesisRecords.id, id)).returning({ examiners: thesisRecords.examiners });
      await auditUser(tx, p, 'thesis.examiners_set', 'thesis', id, { count: b.examiners.length });
      return row;
    });
  }

  /** Compares the thesis text with the other theses of the institution and keeps the result. */
  @Post('theses/:id/similarity')
  @HttpCode(200)
  @Auth('user', FACULTY_ROLES)
  similarity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, office, supervisor } = await this.load(tx, p, id);
      if (!office && !supervisor) throw new NotFoundException('Thesis not found');
      if (t.contentText.trim().length < 200) throw new BadRequestException('Add the thesis text (at least 200 characters) before checking it');
      const others = await tx.select({ id: thesisRecords.id, scholarId: thesisRecords.scholarId, title: thesisRecords.title, text: thesisRecords.contentText }).from(thesisRecords).where(and(ne(thesisRecords.id, id), ne(thesisRecords.contentText, '')));
      const r = internalSimilarity(t.contentText, others);
      const [row] = await tx.insert(similarityChecks).values({ tenantId: p.tenantId, thesisId: id, scorePercent: r.scorePercent, matches: r.matches, checkedBy: p.userId }).returning();
      await auditUser(tx, p, 'thesis.similarity_checked', 'thesis', id, { scorePercent: r.scorePercent });
      return { ...row, limitPercent: SIMILARITY_LIMIT_PERCENT, withinLimit: r.scorePercent <= SIMILARITY_LIMIT_PERCENT, engine: 'internal', note: 'Compared with the other theses of this institution only.' };
    });
  }

  @Post('theses/:id/stage')
  @HttpCode(200)
  @Auth('user', FACULTY_ROLES)
  stage(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StageBody)) b: z.infer<typeof StageBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, s, office, supervisor } = await this.load(tx, p, id);
      if (!office && !supervisor) throw new NotFoundException('Thesis not found');
      if (!canMoveThesis(t.stage, b.to)) throw new ConflictException(`A thesis in ${t.stage} cannot move to ${b.to}`);
      // Examination, viva and award are decisions of the research office.
      if (['examination', 'viva', 'awarded'].includes(b.to) && !office) throw new NotFoundException('Thesis not found');
      if (b.to === 'submitted' && t.contentText.trim().length < 200) throw new ConflictException('Add the thesis text before submitting');
      if (b.to === 'examination') {
        if (t.examiners.length < MIN_EXAMINERS) throw new ConflictException(`Appoint at least ${MIN_EXAMINERS} examiners first`);
        const [check] = await tx.select().from(similarityChecks).where(eq(similarityChecks.thesisId, id)).orderBy(desc(similarityChecks.createdAt)).limit(1);
        if (!check) throw new ConflictException('Run the similarity check first');
        if (check.scorePercent > SIMILARITY_LIMIT_PERCENT && !b.overrideSimilarity) throw new ConflictException(`Similarity is ${check.scorePercent}%, above the ${SIMILARITY_LIMIT_PERCENT}% limit. The research office can override with a reason.`);
        if (check.scorePercent > SIMILARITY_LIMIT_PERCENT && !b.note) throw new BadRequestException('Give a reason for the override');
      }
      const today = await tenantToday(tx, this.clock);
      await tx.update(thesisRecords).set({ stage: b.to, submittedOn: b.to === 'submitted' ? today : t.submittedOn, version: t.version + 1, updatedAt: sql`now()` }).where(eq(thesisRecords.id, id));
      if (b.to === 'submitted') await tx.update(researchScholars).set({ status: 'thesis_submitted' }).where(eq(researchScholars.id, s.id));
      if (b.to === 'awarded') await tx.update(researchScholars).set({ status: 'awarded', completedOn: today }).where(eq(researchScholars.id, s.id));
      await this.log(tx, p, id, b.to, b.note);
      await auditUser(tx, p, 'thesis.stage', 'thesis', id, { from: t.stage, to: b.to });
      if (s.studentId) {
        const [stu] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, s.studentId));
        if (stu?.userId) await this.notifications.notifyUsers(tx, [stu.userId], { kind: 'task', text: { title: 'Thesis update', body: `Your thesis is now at the ${b.to} stage` }, data: { thesisId: id }, dedupeKey: `thesis-stage:${id}:${b.to}:${t.version}` });
      }
      return { id, stage: b.to };
    });
  }

  @Post('theses/:id/vivas')
  @Auth('user', RESEARCH_ROLES)
  scheduleViva(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VivaBody)) b: z.infer<typeof VivaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t } = await this.load(tx, p, id);
      if (b.kind === 'open_defence' && t.stage !== 'viva') throw new ConflictException('Move the thesis to the viva stage before scheduling the open defence');
      const [row] = await tx.insert(thesisVivas).values({ tenantId: p.tenantId, thesisId: id, ...b, createdBy: p.userId }).returning();
      await this.log(tx, p, id, t.stage, `${b.kind.replace('_', ' ')} scheduled`);
      return row;
    });
  }

  @Post('thesis-vivas/:vivaId/result')
  @HttpCode(200)
  @Auth('user', RESEARCH_ROLES)
  vivaResult(@CurrentPrincipal() p: UserPrincipal, @Param('vivaId', ParseUUIDPipe) vivaId: string, @Body(new ZodBody(VivaResult)) b: z.infer<typeof VivaResult>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(thesisVivas).where(eq(thesisVivas.id, vivaId));
      if (!v) throw new NotFoundException('Viva not found');
      if (v.status !== 'scheduled') throw new ConflictException('This viva was already recorded');
      const { t, s } = await this.load(tx, p, v.thesisId);
      await tx.update(thesisVivas).set({ status: 'held', outcome: b.outcome, remarks: b.remarks }).where(eq(thesisVivas.id, vivaId));
      let stage = t.stage;
      if (v.kind === 'open_defence' && t.stage === 'viva') {
        if (b.outcome === 'passed') {
          stage = 'awarded';
          const today = await tenantToday(tx, this.clock);
          await tx.update(researchScholars).set({ status: 'awarded', completedOn: today }).where(eq(researchScholars.id, s.id));
        } else if (b.outcome === 'revise') stage = 'draft';
        if (stage !== t.stage) await tx.update(thesisRecords).set({ stage, version: t.version + 1, updatedAt: sql`now()` }).where(eq(thesisRecords.id, t.id));
      }
      await this.log(tx, p, t.id, stage, `${v.kind.replace('_', ' ')}: ${b.outcome}`);
      await auditUser(tx, p, 'thesis.viva_recorded', 'thesis', t.id, { vivaId, outcome: b.outcome });
      return { id: vivaId, outcome: b.outcome, thesisStage: stage };
    });
  }

  // ---- supervisors -----------------------------------------------------------------------------

  /** Faculty who can supervise, with their cap, research areas and the scholars they have now. */
  @Get('supervisors')
  @Auth('user', RESEARCH_VIEW_ROLES)
  supervisors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const faculty = await tx.select({ id: users.id, fullName: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(sql`${userRoles.role} in ('teacher', 'hod', 'principal')`).groupBy(users.id);
      const caps = await tx.select().from(supervisorCapacity);
      const loads = await tx.select({ id: researchScholars.supervisorUserId, n: sql<number>`count(*)::int` }).from(researchScholars).where(sql`${researchScholars.status} in ('enrolled', 'thesis_submitted')`).groupBy(researchScholars.supervisorUserId);
      return faculty
        .map((f) => {
          const cap = caps.find((c) => c.userId === f.id);
          const load = loads.find((l) => l.id === f.id)?.n ?? 0;
          const max = cap?.maxScholars ?? 8;
          return { userId: f.id, fullName: f.fullName, maxScholars: max, areas: cap?.areas ?? [], load, available: Math.max(0, max - load) };
        })
        .sort((a, b) => b.available - a.available || a.fullName.localeCompare(b.fullName));
    });
  }

  @Put('supervisors/:userId')
  @Auth('user', RESEARCH_ROLES)
  setCapacity(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(CapacityBody)) b: z.infer<typeof CapacityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, userId), sql`${userRoles.role} in ('teacher', 'hod', 'principal')`));
      if (!r) throw new ConflictException('That person is not a faculty member');
      const [row] = await tx.insert(supervisorCapacity).values({ tenantId: p.tenantId, userId, ...b }).onConflictDoUpdate({ target: [supervisorCapacity.tenantId, supervisorCapacity.userId], set: b }).returning();
      return row;
    });
  }

  /** Allocates (or changes) a scholar's supervisor, refusing a supervisor who is at their cap. */
  @Post('scholars/:id/allocate')
  @HttpCode(200)
  @Auth('user', RESEARCH_ROLES)
  allocate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) scholarId: string, @Body(new ZodBody(AllocateBody)) b: z.infer<typeof AllocateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(researchScholars).where(eq(researchScholars.id, scholarId)).for('update');
      if (!s) throw new NotFoundException('Scholar not found');
      const [fac] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, b.supervisorUserId), sql`${userRoles.role} in ('teacher', 'hod', 'principal')`));
      if (!fac) throw new ConflictException('That person is not a faculty member');
      if (b.role === 'supervisor' && s.supervisorUserId === b.supervisorUserId) throw new ConflictException('That person already supervises this scholar');
      const [cap] = await tx.select().from(supervisorCapacity).where(eq(supervisorCapacity.userId, b.supervisorUserId));
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(researchScholars).where(and(eq(researchScholars.supervisorUserId, b.supervisorUserId), sql`${researchScholars.status} in ('enrolled', 'thesis_submitted')`));
      if (b.role === 'supervisor' && !hasCapacity(n, cap?.maxScholars ?? 8)) throw new ConflictException(`That supervisor already has ${n} scholars, the most they can take`);
      const today = await tenantToday(tx, this.clock);
      if (b.role === 'supervisor') {
        await tx.update(supervisorAllocations).set({ endedOn: today }).where(and(eq(supervisorAllocations.scholarId, scholarId), eq(supervisorAllocations.role, 'supervisor'), isNull(supervisorAllocations.endedOn)));
        await tx.update(researchScholars).set({ supervisorUserId: b.supervisorUserId }).where(eq(researchScholars.id, scholarId));
      }
      const [row] = await tx.insert(supervisorAllocations).values({ tenantId: p.tenantId, scholarId, supervisorUserId: b.supervisorUserId, role: b.role, allocatedOn: today, reason: b.reason }).returning();
      await this.notifications.notifyUsers(tx, [b.supervisorUserId], { kind: 'task', text: { title: 'New research scholar', body: `${s.fullName} has been allocated to you as ${b.role.replace('_', '-')}` }, data: { scholarId }, dedupeKey: `supervisor-alloc:${row.id}` });
      await auditUser(tx, p, 'research.supervisor_allocated', 'research_scholar', scholarId, { supervisorUserId: b.supervisorUserId, role: b.role });
      return row;
    });
  }

  @Get('scholars/:id/allocations')
  @Auth('user', FACULTY_ROLES)
  allocations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) scholarId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(researchScholars).where(eq(researchScholars.id, scholarId));
      if (!s || (!hasRole(p, RESEARCH_VIEW_ROLES) && s.supervisorUserId !== p.userId)) throw new NotFoundException('Scholar not found');
      return tx
        .select({ id: supervisorAllocations.id, role: supervisorAllocations.role, supervisor: users.fullName, allocatedOn: supervisorAllocations.allocatedOn, endedOn: supervisorAllocations.endedOn, reason: supervisorAllocations.reason })
        .from(supervisorAllocations)
        .innerJoin(users, eq(users.id, supervisorAllocations.supervisorUserId))
        .where(eq(supervisorAllocations.scholarId, scholarId))
        .orderBy(asc(supervisorAllocations.allocatedOn), asc(supervisorAllocations.createdAt));
    });
  }
}

