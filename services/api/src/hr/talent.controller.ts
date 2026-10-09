import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { appraisalCycles, appraisals, departments, departmentStaff, jobApplicants, jobOpenings, offerLetters, onboardingItems, staffProfiles, tenants, trainingRecords, users } from '../db/schema.js';
import { APPRAISAL_CATEGORIES, APPRAISAL_MAX, gradeFor, percentOf, scoreProblems } from './appraisal-math.js';
import { addDays } from './dates.js';
import { hasAnyRole, HR_ROLES, isHr, PAYROLL_APPROVERS, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { offerLetterPdf } from './letters-pdf.js';
import { ONBOARDING_CHECKLIST } from './onboarding-checklist.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Scores = z.record(z.string(), z.object({ score: z.number().min(0).max(1000), evidence: z.string().trim().max(1000).optional() }));
const CycleBody = z.object({ period: z.string().trim().min(4).max(20), opensOn: Day, closesOn: Day });
const SelfBody = z.object({ cycleId: z.uuid(), scores: Scores, submit: z.boolean().default(false) });
const HodBody = z.object({ scores: Scores, remarks: z.string().trim().max(2000).default('') });
const FinaliseBody = z.object({ finalPercent: z.number().min(0).max(100).optional(), remarks: z.string().trim().max(2000).default('') });
const TrainingBody = z.object({
  userId: z.uuid().optional(),
  title: z.string().trim().min(3).max(200),
  kind: z.enum(['fdp', 'workshop', 'conference', 'course']).default('fdp'),
  organiser: z.string().trim().max(200).nullable().optional(),
  startsOn: Day,
  endsOn: Day,
  hours: z.number().min(0).max(1000),
  certificateRef: z.string().trim().max(200).nullable().optional(),
});
const OfferBody = z.object({ position: z.string().trim().min(2).max(120).optional(), annualCtcPaise: z.number().int().min(1).max(10_000_000_000), joiningOn: Day, validUntil: Day, terms: z.string().trim().max(3000).default('') });
const OfferStatus = z.object({ status: z.enum(['accepted', 'declined', 'withdrawn']) });
const OnboardingAdd = z.object({ title: z.string().trim().min(3).max(200), owner: z.string().trim().min(2).max(40).default('HR'), dueOn: Day.nullable().optional() });


/** Faculty appraisal, training records, offer letters and the onboarding checklist. */
@Controller('v1/hr')
export class TalentController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
  ) {}

  private act = (p: UserPrincipal) => ({ tenantId: p.tenantId, actorType: 'user' as const, actorId: p.userId });

  /** True when `hodId` heads a department the staff member belongs to. */
  private async headsDepartmentOf(tx: Tx, hodId: string, staffId: string): Promise<boolean> {
    const [hit] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.headUserId, hodId), or(inArray(departments.id, tx.select({ d: departmentStaff.departmentId }).from(departmentStaff).where(eq(departmentStaff.userId, staffId))), inArray(departments.id, tx.select({ d: staffProfiles.departmentId }).from(staffProfiles).where(eq(staffProfiles.userId, staffId))))));
    return !!hit;
  }

  // ---- appraisal ---------------------------------------------------------------------------------------

  @Get('appraisal-categories')
  @Auth('user', STAFF_ROLES)
  categories() {
    return { categories: APPRAISAL_CATEGORIES, max: APPRAISAL_MAX };
  }

  @Get('appraisal-cycles')
  @Auth('user', STAFF_ROLES)
  cycles(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(appraisalCycles).orderBy(desc(appraisalCycles.opensOn)));
  }

  @Post('appraisal-cycles')
  @Auth('user', HR_ROLES)
  createCycle(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CycleBody)) b: z.infer<typeof CycleBody>) {
    if (b.closesOn < b.opensOn) throw new BadRequestException('The cycle cannot close before it opens');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: appraisalCycles.id }).from(appraisalCycles).where(eq(appraisalCycles.period, b.period));
      if (dup) throw new ConflictException('There is already a cycle for that period');
      const [row] = await tx.insert(appraisalCycles).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { ...this.act(p), action: 'hr.appraisal_cycle_created.v1', subjectType: 'appraisal_cycle', subjectId: row.id, data: { period: b.period } });
      return row;
    });
  }

  @Post('appraisal-cycles/:id/close')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  closeCycle(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(appraisalCycles).set({ status: 'closed' }).where(eq(appraisalCycles.id, id)).returning();
      if (!row) throw new NotFoundException('Cycle not found');
      await audit(tx, { ...this.act(p), action: 'hr.appraisal_cycle_closed.v1', subjectType: 'appraisal_cycle', subjectId: id, data: {} });
      return row;
    });
  }

  private shape(a: typeof appraisals.$inferSelect, fullName?: string) {
    return { ...a, fullName: fullName ?? null, selfPercent: percentOf(a.selfScores), hodPercent: percentOf(a.hodScores) };
  }

  /** The caller's own appraisal for a cycle (null until they start one). */
  @Get('appraisals/me')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('cycleId', ParseUUIDPipe) cycleId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(appraisals).where(and(eq(appraisals.cycleId, cycleId), eq(appraisals.userId, p.userId)));
      return a ? this.shape(a) : null;
    });
  }

  /** Save (or submit) the caller's self-appraisal while the cycle is open. A submitted form is locked. */
  @Put('appraisals/me')
  @Auth('user', STAFF_ROLES)
  saveSelf(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SelfBody)) b: z.infer<typeof SelfBody>) {
    const problems = scoreProblems(b.scores);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cycle] = await tx.select().from(appraisalCycles).where(eq(appraisalCycles.id, b.cycleId));
      if (!cycle) throw new NotFoundException('Cycle not found');
      const today = await this.hr.today(tx);
      if (cycle.status !== 'open' || today > cycle.closesOn) throw new ConflictException('This appraisal cycle is closed');
      if (today < cycle.opensOn) throw new ConflictException(`This appraisal cycle opens on ${cycle.opensOn}`);
      const [have] = await tx.select().from(appraisals).where(and(eq(appraisals.cycleId, b.cycleId), eq(appraisals.userId, p.userId))).for('update');
      if (have && have.status !== 'draft') throw new ConflictException('Your appraisal has been submitted and can no longer be changed');
      const status = b.submit ? 'self_submitted' : 'draft';
      const [row] = have
        ? await tx.update(appraisals).set({ selfScores: b.scores, status, updatedAt: new Date() }).where(eq(appraisals.id, have.id)).returning()
        : await tx.insert(appraisals).values({ tenantId: p.tenantId, cycleId: b.cycleId, userId: p.userId, selfScores: b.scores, status }).returning();
      await audit(tx, { ...this.act(p), action: b.submit ? 'hr.appraisal_self_submitted.v1' : 'hr.appraisal_self_saved.v1', subjectType: 'appraisal', subjectId: row.id, data: { percent: percentOf(b.scores) } });
      return this.shape(row);
    });
  }

  /** Appraisals of a cycle: HR and the principal see everyone; a head of department sees their own department. */
  @Get('appraisals')
  @Auth('user', [...HR_ROLES, 'hod'])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('cycleId', ParseUUIDPipe) cycleId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ a: appraisals, name: users.fullName }).from(appraisals).innerJoin(users, eq(users.id, appraisals.userId)).where(eq(appraisals.cycleId, cycleId)).orderBy(asc(users.fullName));
      const out = [];
      for (const r of rows) if (isHr(p) || (await this.headsDepartmentOf(tx, p.userId, r.a.userId))) out.push(this.shape(r.a, r.name));
      return out;
    });
  }

  @Get('appraisals/:id')
  @Auth('user', STAFF_ROLES)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select({ a: appraisals, name: users.fullName }).from(appraisals).innerJoin(users, eq(users.id, appraisals.userId)).where(eq(appraisals.id, id));
      if (!r) throw new NotFoundException('Appraisal not found');
      if (r.a.userId !== p.userId && !isHr(p) && !(await this.headsDepartmentOf(tx, p.userId, r.a.userId))) throw new ForbiddenException('Not your appraisal');
      return this.shape(r.a, r.name);
    });
  }

  /** The head of the staff member's department scores each category and adds remarks. */
  @Put('appraisals/:id/hod-review')
  @Auth('user', [...HR_ROLES, 'hod'])
  hodReview(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(HodBody)) b: z.infer<typeof HodBody>) {
    const problems = scoreProblems(b.scores);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(appraisals).where(eq(appraisals.id, id)).for('update');
      if (!a) throw new NotFoundException('Appraisal not found');
      if (a.userId === p.userId) throw new ForbiddenException('You cannot review your own appraisal');
      if (!isHr(p) && !(await this.headsDepartmentOf(tx, p.userId, a.userId))) throw new ForbiddenException('Only the head of their department can review this appraisal');
      if (a.status !== 'self_submitted' && a.status !== 'hod_reviewed') throw new ConflictException(a.status === 'draft' ? 'The teacher has not submitted the self-appraisal yet' : 'This appraisal is already finalised');
      const [row] = await tx.update(appraisals).set({ hodScores: b.scores, hodRemarks: b.remarks, hodId: p.userId, status: 'hod_reviewed', updatedAt: new Date() }).where(eq(appraisals.id, id)).returning();
      await audit(tx, { ...this.act(p), action: 'hr.appraisal_hod_reviewed.v1', subjectType: 'appraisal', subjectId: id, data: { percent: percentOf(b.scores) } });
      return this.shape(row);
    });
  }

  /** The principal's final score: the HoD's total unless they enter their own percentage, then graded. */
  @Put('appraisals/:id/finalise')
  @Auth('user', PAYROLL_APPROVERS)
  finalise(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FinaliseBody)) b: z.infer<typeof FinaliseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(appraisals).where(eq(appraisals.id, id)).for('update');
      if (!a) throw new NotFoundException('Appraisal not found');
      if (a.userId === p.userId) throw new ForbiddenException('You cannot finalise your own appraisal');
      if (a.status !== 'hod_reviewed') throw new ConflictException(a.status === 'finalised' ? 'This appraisal is already finalised' : 'The head of department has not reviewed it yet');
      const final = b.finalPercent ?? percentOf(a.hodScores);
      const [row] = await tx.update(appraisals).set({ finalScore: final, grade: gradeFor(final), principalRemarks: b.remarks, principalId: p.userId, status: 'finalised', updatedAt: new Date() }).where(eq(appraisals.id, id)).returning();
      await audit(tx, { ...this.act(p), action: 'hr.appraisal_finalised.v1', subjectType: 'appraisal', subjectId: id, data: { final, grade: row.grade } });
      return this.shape(row);
    });
  }

  // ---- training and FDP records ------------------------------------------------------------------------

  @Get('training-records')
  @Auth('user', STAFF_ROLES)
  trainingList(@CurrentPrincipal() p: UserPrincipal, @Query('userId') userId?: string) {
    const who = isHr(p) && userId && z.uuid().safeParse(userId).success ? userId : isHr(p) ? undefined : p.userId;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ r: trainingRecords, name: users.fullName }).from(trainingRecords).innerJoin(users, eq(users.id, trainingRecords.userId)).where(who ? eq(trainingRecords.userId, who) : undefined).orderBy(desc(trainingRecords.startsOn)).limit(500);
      return rows.map(({ r, name }) => {
        const { certificateKey, ...rest } = r;
        return { ...rest, hasCertificate: !!certificateKey, fullName: name };
      });
    });
  }

  /** Hours per staff member (verified records only) for one calendar year. */
  @Get('training-summary')
  @Auth('user', HR_ROLES)
  trainingSummary(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    const y = /^\d{4}$/.test(year ?? '') ? year! : String(new Date().getUTCFullYear());
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ userId: trainingRecords.userId, fullName: users.fullName, programmes: sql<number>`count(*)::int`, hours: sql<number>`coalesce(sum(${trainingRecords.hours}), 0)::float8` })
        .from(trainingRecords)
        .innerJoin(users, eq(users.id, trainingRecords.userId))
        .where(and(eq(trainingRecords.verified, true), sql`extract(year from ${trainingRecords.startsOn}) = ${Number(y)}`))
        .groupBy(trainingRecords.userId, users.fullName)
        .orderBy(users.fullName),
    );
  }

  @Post('training-records')
  @Auth('user', STAFF_ROLES)
  trainingAdd(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TrainingBody)) b: z.infer<typeof TrainingBody>) {
    if (b.endsOn < b.startsOn) throw new BadRequestException('The programme cannot end before it starts');
    if (b.userId && b.userId !== p.userId && !isHr(p)) throw new ForbiddenException('Only HR can add records for someone else');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const userId = b.userId ?? p.userId;
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!u) throw new NotFoundException('Staff member not found');
      // HR entries come from the certificate on file, so they are verified on the spot.
      const [row] = await tx.insert(trainingRecords).values({ tenantId: p.tenantId, userId, title: b.title, kind: b.kind, organiser: b.organiser ?? null, startsOn: b.startsOn, endsOn: b.endsOn, hours: b.hours, certificateRef: b.certificateRef ?? null, verified: isHr(p) }).returning();
      await audit(tx, { ...this.act(p), action: 'hr.training_added.v1', subjectType: 'training_record', subjectId: row.id, data: { userId, hours: b.hours } });
      return row;
    });
  }

  @Post('training-records/:id/verify')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  trainingVerify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(trainingRecords).set({ verified: true }).where(eq(trainingRecords.id, id)).returning();
      if (!row) throw new NotFoundException('Record not found');
      await audit(tx, { ...this.act(p), action: 'hr.training_verified.v1', subjectType: 'training_record', subjectId: id, data: {} });
      return row;
    });
  }

  @Delete('training-records/:id')
  @Auth('user', STAFF_ROLES)
  trainingDelete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(trainingRecords).where(eq(trainingRecords.id, id));
      if (!r) throw new NotFoundException('Record not found');
      if (!isHr(p) && (r.userId !== p.userId || r.verified)) throw new ForbiddenException('Only your own unverified records can be removed');
      await tx.delete(trainingRecords).where(eq(trainingRecords.id, id));
      await audit(tx, { ...this.act(p), action: 'hr.training_removed.v1', subjectType: 'training_record', subjectId: id, data: {} });
      return { id };
    });
  }

  // ---- offer letters -----------------------------------------------------------------------------------

  private async offerData(tx: Tx, id: string) {
    const [r] = await tx
      .select({ o: offerLetters, name: jobApplicants.fullName, dept: departments.name })
      .from(offerLetters)
      .innerJoin(jobApplicants, eq(jobApplicants.id, offerLetters.applicantId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId))
      .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
      .where(eq(offerLetters.id, id));
    if (!r) throw new NotFoundException('Offer not found');
    return r;
  }

  /** Issues an offer to a recruitment applicant and moves them to the "offer" stage. */
  @Post('applicants/:id/offer')
  @Auth('user', HR_ROLES)
  issueOffer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OfferBody)) b: z.infer<typeof OfferBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ a: jobApplicants, title: jobOpenings.title }).from(jobApplicants).innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId)).where(eq(jobApplicants.id, id)).for('update', { of: jobApplicants });
      if (!a) throw new NotFoundException('Applicant not found');
      if (['rejected', 'withdrawn', 'hired'].includes(a.a.stage)) throw new ConflictException(`This applicant is already ${a.a.stage}`);
      const today = await this.hr.today(tx);
      if (b.validUntil < today) throw new BadRequestException('The offer would already have expired');
      if (b.joiningOn < today) throw new BadRequestException('The joining date is in the past');
      const [live] = await tx.select({ id: offerLetters.id }).from(offerLetters).where(and(eq(offerLetters.applicantId, id), eq(offerLetters.status, 'issued')));
      if (live) throw new ConflictException('An offer is already out to this applicant: withdraw it first');
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(offerLetters).where(sql`${offerLetters.offerNo} like ${`OFR/${today.slice(0, 4)}/%`}`);
      const offerNo = `OFR/${today.slice(0, 4)}/${String(n.n + 1).padStart(4, '0')}`;
      const [row] = await tx.insert(offerLetters).values({ tenantId: p.tenantId, applicantId: id, offerNo, position: b.position ?? a.title, annualCtcPaise: b.annualCtcPaise, joiningOn: b.joiningOn, validUntil: b.validUntil, terms: b.terms, issuedBy: p.userId }).returning();
      if (a.a.stage !== 'offer') {
        const history = [...a.a.stageHistory, { stage: 'offer', at: new Date().toISOString(), by: p.userId, note: `Offer ${offerNo}` }];
        await tx.update(jobApplicants).set({ stage: 'offer', stageHistory: history }).where(eq(jobApplicants.id, id));
      }
      await audit(tx, { ...this.act(p), action: 'recruitment.offer_issued', subjectType: 'job_applicant', subjectId: id, data: { offerNo, annualCtcPaise: b.annualCtcPaise } });
      return row;
    });
  }

  @Get('applicants/:id/offers')
  @Auth('user', HR_ROLES)
  offers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(offerLetters).where(eq(offerLetters.applicantId, id)).orderBy(desc(offerLetters.createdAt)));
  }

  /** The candidate's answer. Accepting marks the applicant hired. */
  @Put('offers/:id/status')
  @Auth('user', HR_ROLES)
  offerStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OfferStatus)) b: z.infer<typeof OfferStatus>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { o } = await this.offerData(tx, id);
      if (o.status !== 'issued') throw new ConflictException(`This offer is already ${o.status}`);
      const [row] = await tx.update(offerLetters).set({ status: b.status }).where(eq(offerLetters.id, id)).returning();
      if (b.status === 'accepted') {
        const [a] = await tx.select().from(jobApplicants).where(eq(jobApplicants.id, o.applicantId));
        await tx.update(jobApplicants).set({ stage: 'hired', stageHistory: [...a.stageHistory, { stage: 'hired', at: new Date().toISOString(), by: p.userId, note: `Accepted ${o.offerNo}` }] }).where(eq(jobApplicants.id, o.applicantId));
      }
      await audit(tx, { ...this.act(p), action: 'recruitment.offer_status.v1', subjectType: 'offer_letter', subjectId: id, data: { status: b.status } });
      return row;
    });
  }

  @Get('offers/:id/pdf')
  @Auth('user', HR_ROLES)
  async offerPdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const data = await this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.offerData(tx, id);
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { r, institution: t?.name ?? '' };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="offer-${data.r.o.offerNo.replace(/\//g, '-')}.pdf"`);
    const { o, name, dept } = data.r;
    return new StreamableFile(offerLetterPdf({ institution: data.institution, offerNo: o.offerNo, issuedOn: o.createdAt.toISOString().slice(0, 10), candidateName: name, position: o.position, department: dept, annualCtcPaise: o.annualCtcPaise, joiningOn: o.joiningOn, validUntil: o.validUntil, terms: o.terms }));
  }

  // ---- onboarding checklist ----------------------------------------------------------------------------

  /** Progress of every staff member who has an onboarding checklist. */
  @Get('onboarding')
  @Auth('user', HR_ROLES)
  onboardingOverview(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ userId: onboardingItems.userId, fullName: users.fullName, total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${onboardingItems.done})::int` })
        .from(onboardingItems)
        .innerJoin(users, eq(users.id, onboardingItems.userId))
        .groupBy(onboardingItems.userId, users.fullName)
        .orderBy(users.fullName),
    );
  }

  @Get('staff/:userId/onboarding')
  @Auth('user', STAFF_ROLES)
  onboarding(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    if (userId !== p.userId && !isHr(p)) throw new ForbiddenException('Not your checklist');
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(onboardingItems).where(eq(onboardingItems.userId, userId)).orderBy(asc(onboardingItems.dueOn), asc(onboardingItems.createdAt)));
  }

  /** Creates the standard joining checklist for a new staff member, dated from their joining date. */
  @Post('staff/:userId/onboarding/start')
  @Auth('user', HR_ROLES)
  startOnboarding(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!u) throw new NotFoundException('Staff member not found');
      const [have] = await tx.select({ id: onboardingItems.id }).from(onboardingItems).where(eq(onboardingItems.userId, userId)).limit(1);
      if (have) throw new ConflictException('This person already has an onboarding checklist');
      const [sp] = await tx.select({ doj: staffProfiles.dateOfJoining }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
      const base = sp?.doj ?? (await this.hr.today(tx));
      const rows = await tx.insert(onboardingItems).values(ONBOARDING_CHECKLIST.map(([title, owner, days]) => ({ tenantId: p.tenantId, userId, title, owner, dueOn: addDays(base, days) }))).returning();
      await audit(tx, { ...this.act(p), action: 'hr.onboarding_started.v1', subjectType: 'user', subjectId: userId, data: { items: rows.length } });
      return rows;
    });
  }

  @Post('staff/:userId/onboarding')
  @Auth('user', HR_ROLES)
  addOnboardingItem(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(OnboardingAdd)) b: z.infer<typeof OnboardingAdd>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(onboardingItems).values({ tenantId: p.tenantId, userId, title: b.title, owner: b.owner, dueOn: b.dueOn ?? null }).returning();
      await audit(tx, { ...this.act(p), action: 'hr.onboarding_item_added.v1', subjectType: 'onboarding_item', subjectId: row.id, data: { userId } });
      return row;
    });
  }

  /** Ticks (or unticks) an item. HR can do any; staff can tick the items that are theirs ("Employee"). */
  @Put('onboarding/:id/done')
  @Auth('user', STAFF_ROLES)
  tick(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ done: z.boolean() }))) b: { done: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [it] = await tx.select().from(onboardingItems).where(eq(onboardingItems.id, id));
      if (!it) throw new NotFoundException('Item not found');
      if (!hasAnyRole(p, HR_ROLES) && !(it.userId === p.userId && it.owner === 'Employee')) throw new ForbiddenException('This item is not yours to tick');
      const [row] = await tx.update(onboardingItems).set({ done: b.done, doneAt: b.done ? new Date() : null, doneBy: b.done ? p.userId : null }).where(eq(onboardingItems.id, id)).returning();
      await audit(tx, { ...this.act(p), action: 'hr.onboarding_item_ticked.v1', subjectType: 'onboarding_item', subjectId: id, data: { done: b.done } });
      return row;
    });
  }
}
