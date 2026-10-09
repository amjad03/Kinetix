import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, departments, invigilationDuties, payrollRuns, payslips, salaryComponents, salaryStructureLines, salaryStructures, staffProfiles, students, subjects, tenants, timetableSlots, users } from '../db/schema.js';
import { payrollAdjustments, payrollTaxProfile, staffQualifications, tdsChallans, teachingEvaluations } from '../db/schema-depth.js';
import { form16Pdf } from './form16-pdf.js';
import { hasAnyRole, HR_ROLES, isHr, isPayrollStaff, PAYROLL_APPROVERS, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { compositeScore, EVAL_CRITERIA, financialYearOf, fyMonths, loadBand, monthsBetween, overtimeAmount, quarterOf, RATER_KINDS, ratingAverage, slotHours, type KindSummary, type RaterKind } from './hr-depth.logic.js';

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const FY = z.string().regex(/^\d{4}-\d{2}$/, 'Use a financial year like 2026-27');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const QualBody = z.object({ userId: z.uuid().optional(), kind: z.enum(['degree', 'certification', 'skill', 'experience']), title: z.string().trim().min(2).max(200), institution: z.string().trim().max(200).default(''), year: z.number().int().min(1950).max(2100).nullish(), level: z.string().trim().max(60).default('') });
const EvalBody = z.object({
  staffUserId: z.uuid(),
  raterKind: z.enum(RATER_KINDS),
  subjectId: z.uuid().nullish(),
  scores: z.record(z.enum(EVAL_CRITERIA), z.number().int().min(1).max(5)).refine((s) => Object.keys(s).length === EVAL_CRITERIA.length, 'Rate every question'),
  comment: z.string().trim().max(1000).default(''),
});
const AdjBody = z.object({ userId: z.uuid(), kind: z.enum(['overtime', 'arrear', 'bonus', 'recovery']), payMonth: Month, hours: z.number().min(0).max(300).nullish(), ratePaise: z.number().int().min(0).nullish(), amountPaise: z.number().int().min(1).nullish(), reason: z.string().trim().min(3).max(300) });
const TaxProfileBody = z.object({ tan: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{5}[A-Z]$/, 'A TAN looks like BLRA12345B'), pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN looks like ABCDE1234F'), deductorName: z.string().trim().min(2).max(200), deductorAddress: z.string().trim().max(400).default(''), responsiblePerson: z.string().trim().max(120).default(''), responsibleDesignation: z.string().trim().max(120).default('') });
const ChallanBody = z.object({ payMonth: Month, section: z.string().trim().max(10).default('192'), bsrCode: z.string().trim().regex(/^\d{7}$/, 'A BSR code has seven digits'), challanSerial: z.string().trim().min(1).max(20), depositedOn: Day, tdsPaise: z.number().int().min(1), interestPaise: z.number().int().min(0).default(0) });

/** Qualifications, workload, teaching evaluation, overtime and arrears, and Form 16 (PRD sections 31 and 33). */
@Controller('v1/hr')
export class HrDepthController {
  constructor(private readonly db: DbService) {}

  private async today(tx: Tx) {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return new Intl.DateTimeFormat('en-CA', { timeZone: t?.tz ?? 'Asia/Kolkata' }).format(new Date());
  }

  // ---- qualifications and skills --------------------------------------------------------------------------

  /** A staff member's qualifications and skills. HR sees anyone's; staff see their own. */
  @Get('qualifications')
  @Auth('user', STAFF_ROLES)
  qualifications(@CurrentPrincipal() p: UserPrincipal, @Query('userId') userId?: string) {
    const who = isHr(p) ? (userId && z.uuid().safeParse(userId).success ? userId : undefined) : p.userId;
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx.select({ q: staffQualifications, name: users.fullName }).from(staffQualifications).innerJoin(users, eq(users.id, staffQualifications.userId)).where(who ? eq(staffQualifications.userId, who) : undefined).orderBy(asc(users.fullName), asc(staffQualifications.kind), desc(staffQualifications.year)).limit(500)
        .then((rows) => rows.map((r) => ({ ...r.q, fullName: r.name }))),
    );
  }

  @Post('qualifications')
  @Auth('user', STAFF_ROLES)
  addQualification(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(QualBody)) b: z.infer<typeof QualBody>) {
    if (b.userId && b.userId !== p.userId && !isHr(p)) throw new ForbiddenException('You can add qualifications to your own record only');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const userId = b.userId ?? p.userId;
      const [u] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
      if (!u) throw new NotFoundException('Staff member not found');
      const [row] = await tx.insert(staffQualifications).values({ tenantId: p.tenantId, userId, kind: b.kind, title: b.title, institution: b.institution, year: b.year ?? null, level: b.level, ...(isHr(p) ? { verifiedBy: p.userId, verifiedAt: new Date() } : {}) }).returning();
      await auditUser(tx, p, 'hr.qualification_added', 'staff_qualification', row.id, { userId });
      return row;
    });
  }

  @Delete('qualifications/:id')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  removeQualification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [q] = await tx.select().from(staffQualifications).where(eq(staffQualifications.id, id));
      if (!q || (q.userId !== p.userId && !isHr(p))) throw new NotFoundException('Qualification not found');
      await tx.delete(staffQualifications).where(eq(staffQualifications.id, id));
      await auditUser(tx, p, 'hr.qualification_removed', 'staff_qualification', id);
      return { removed: true };
    });
  }

  @Post('qualifications/:id/verify')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  verifyQualification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(staffQualifications).set({ verifiedBy: p.userId, verifiedAt: new Date() }).where(eq(staffQualifications.id, id)).returning();
      if (!row) throw new NotFoundException('Qualification not found');
      await auditUser(tx, p, 'hr.qualification_verified', 'staff_qualification', id);
      return row;
    });
  }

  /** Find staff by a word in a qualification or skill ("PhD", "Tally", "robotics"). */
  @Get('qualifications/search')
  @Auth('user', HR_ROLES)
  searchQualifications(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '') {
    const term = q.trim().slice(0, 60);
    if (term.length < 2) throw new BadRequestException('Type at least two letters');
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx.select({ userId: users.id, fullName: users.fullName, kind: staffQualifications.kind, title: staffQualifications.title, level: staffQualifications.level, institution: staffQualifications.institution }).from(staffQualifications).innerJoin(users, eq(users.id, staffQualifications.userId)).where(sql`(${staffQualifications.title} ilike ${'%' + term.replace(/[%_]/g, '') + '%'} or ${staffQualifications.institution} ilike ${'%' + term.replace(/[%_]/g, '') + '%'})`).orderBy(asc(users.fullName)).limit(100),
    );
  }

  // ---- workload ------------------------------------------------------------------------------------------------

  /** Weekly teaching hours per teacher against the norm, with classes, subjects and invigilation duties. A head of department sees their own department. */
  @Get('workload')
  @Auth('user', ['tenant_admin', 'principal', 'hr_manager', 'hod'])
  workload(@CurrentPrincipal() p: UserPrincipal, @Query('norm') normQ?: string) {
    const norm = Math.min(60, Math.max(1, Number(normQ) || 16));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      const slots = year
        ? await tx.select({ teacherId: timetableSlots.teacherId, sectionId: timetableSlots.sectionId, subjectId: timetableSlots.subjectId, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt }).from(timetableSlots).where(and(eq(timetableSlots.academicYearId, year.id), isNull(timetableSlots.archivedAt)))
        : [];
      const duty = await tx.select({ userId: invigilationDuties.staffId, n: sql<number>`count(*)::int` }).from(invigilationDuties).groupBy(invigilationDuties.staffId).catch(() => [] as { userId: string; n: number }[]);
      let staff = await tx.select({ userId: staffProfiles.userId, name: users.fullName, code: staffProfiles.employeeCode, departmentId: staffProfiles.departmentId, department: departments.name }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).where(eq(staffProfiles.status, 'active')).orderBy(asc(users.fullName));
      if (!hasAnyRole(p, ['tenant_admin', 'principal', 'hr_manager'])) {
        const mine = new Set((await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, p.userId))).map((d) => d.id));
        staff = staff.filter((s) => s.departmentId && mine.has(s.departmentId));
      }
      const rows = staff
        .map((s) => {
          const mine = slots.filter((x) => x.teacherId === s.userId);
          const hours = Math.round(mine.reduce((a, x) => a + slotHours(x.startsAt, x.endsAt), 0) * 10) / 10;
          return { userId: s.userId, fullName: s.name, employeeCode: s.code, department: s.department, hoursPerWeek: hours, periods: mine.length, classes: new Set(mine.map((x) => x.sectionId)).size, subjects: new Set(mine.map((x) => x.subjectId)).size, invigilationDuties: duty.find((d) => d.userId === s.userId)?.n ?? 0, norm, load: loadBand(hours, norm) };
        })
        .filter((r) => r.periods > 0 || r.invigilationDuties > 0 || staff.length < 60);
      return { norm, teachers: rows, summary: { under: rows.filter((r) => r.load === 'under').length, within: rows.filter((r) => r.load === 'within').length, over: rows.filter((r) => r.load === 'over').length, totalHours: Math.round(rows.reduce((a, r) => a + r.hoursPerWeek, 0) * 10) / 10 } };
    });
  }

  // ---- teaching evaluation -----------------------------------------------------------------------------------------

  @Get('evaluations/criteria')
  @Auth('user')
  criteria() {
    return { criteria: EVAL_CRITERIA, scale: { min: 1, max: 5 } };
  }

  /** The teachers of the signed-in student's class, and whether they have been rated this year. */
  @Get('evaluations/to-rate')
  @Auth('user', ['student'])
  toRate(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!st) return [];
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!year) return [];
      const rows = await tx.select({ staffUserId: timetableSlots.teacherId, name: users.fullName, subjectId: timetableSlots.subjectId, subject: subjects.name }).from(timetableSlots).innerJoin(users, eq(users.id, timetableSlots.teacherId)).innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId)).where(and(eq(timetableSlots.sectionId, st.sectionId), eq(timetableSlots.academicYearId, year.id), isNull(timetableSlots.archivedAt)));
      const done = await tx.select({ staffUserId: teachingEvaluations.staffUserId, subjectId: teachingEvaluations.subjectId }).from(teachingEvaluations).where(and(eq(teachingEvaluations.raterUserId, p.userId), eq(teachingEvaluations.academicYearId, year.id), eq(teachingEvaluations.raterKind, 'student')));
      const seen = new Set<string>();
      return rows.filter((r) => (seen.has(`${r.staffUserId}:${r.subjectId}`) ? false : (seen.add(`${r.staffUserId}:${r.subjectId}`), true))).map((r) => ({ ...r, rated: done.some((d) => d.staffUserId === r.staffUserId && (d.subjectId === null || d.subjectId === r.subjectId)) }));
    });
  }

  /** One rating. A student rates teachers of their own class; a head of department rates their department's teachers; peers rate each other; a teacher rates themselves. */
  @Post('evaluations')
  @Auth('user')
  rate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EvalBody)) b: z.infer<typeof EvalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!year) throw new ConflictException('There is no current academic year');
      const [staff] = await tx.select({ userId: staffProfiles.userId, departmentId: staffProfiles.departmentId }).from(staffProfiles).where(eq(staffProfiles.userId, b.staffUserId));
      if (!staff) throw new NotFoundException('Teacher not found');
      const kind: RaterKind = b.raterKind;
      if (kind === 'self') {
        if (b.staffUserId !== p.userId) throw new ForbiddenException('A self-rating is about yourself');
      } else if (b.staffUserId === p.userId) throw new ForbiddenException('Rate yourself with the self-rating');
      if (kind === 'student') {
        const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
        if (!st || !p.roles.includes('student')) throw new ForbiddenException('Only students give student ratings');
        const [teaches] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, st.sectionId), eq(timetableSlots.teacherId, b.staffUserId), isNull(timetableSlots.archivedAt)));
        if (!teaches) throw new ForbiddenException('You can rate only teachers who teach your class');
      }
      if (kind === 'hod') {
        const [head] = staff.departmentId ? await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, staff.departmentId), eq(departments.headUserId, p.userId))) : [];
        if (!head && !hasAnyRole(p, ['principal'])) throw new ForbiddenException('Only the head of department or the principal gives this rating');
      }
      if (kind === 'peer' && !hasAnyRole(p, ['teacher', 'hod', 'principal'])) throw new ForbiddenException('Only teachers give peer ratings');
      const [dup] = await tx.select({ id: teachingEvaluations.id }).from(teachingEvaluations).where(and(eq(teachingEvaluations.staffUserId, b.staffUserId), eq(teachingEvaluations.academicYearId, year.id), eq(teachingEvaluations.raterKind, kind), eq(teachingEvaluations.raterUserId, p.userId), b.subjectId ? eq(teachingEvaluations.subjectId, b.subjectId) : isNull(teachingEvaluations.subjectId)));
      if (dup) throw new ConflictException('You have already rated this teacher this year');
      const [row] = await tx.insert(teachingEvaluations).values({ tenantId: p.tenantId, staffUserId: b.staffUserId, academicYearId: year.id, subjectId: b.subjectId ?? null, raterKind: kind, raterUserId: p.userId, scores: b.scores as Record<string, number>, average: ratingAverage(b.scores as Record<string, number>), comment: b.comment }).returning({ id: teachingEvaluations.id, average: teachingEvaluations.average });
      await auditUser(tx, p, 'hr.teaching_evaluation_given', 'staff_profile', b.staffUserId, { kind });
      return row;
    });
  }

  /** A teacher's evaluation: the average by kind of rater, the composite, and the comments without the names of the raters. */
  @Get('evaluations/report')
  @Auth('user', STAFF_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Query('staffUserId') staffUserId?: string) {
    const target = staffUserId && z.uuid().safeParse(staffUserId).success ? staffUserId : p.userId;
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (target !== p.userId && !hasAnyRole(p, ['tenant_admin', 'principal', 'hr_manager'])) {
        const [s] = await tx.select({ d: staffProfiles.departmentId }).from(staffProfiles).where(eq(staffProfiles.userId, target));
        const [head] = s?.d ? await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, s.d), eq(departments.headUserId, p.userId))) : [];
        if (!head) throw new ForbiddenException('You can read your own evaluation, or your department\'s as its head');
      }
      const [year] = await tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!year) throw new ConflictException('There is no current academic year');
      const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, target));
      const rows = await tx.select().from(teachingEvaluations).where(and(eq(teachingEvaluations.staffUserId, target), eq(teachingEvaluations.academicYearId, year.id)));
      const kinds: KindSummary[] = RATER_KINDS.map((kind) => {
        const mine = rows.filter((r) => r.raterKind === kind);
        return { kind, count: mine.length, average: mine.length ? Math.round((mine.reduce((a, r) => a + r.average, 0) / mine.length) * 100) / 100 : 0 };
      });
      const perCriterion = EVAL_CRITERIA.map((c) => ({ criterion: c, average: rows.length ? Math.round((rows.reduce((a, r) => a + (r.scores[c] ?? 0), 0) / rows.length) * 100) / 100 : null }));
      return { staffUserId: target, fullName: u?.name ?? '', year: year.label, kinds, composite: compositeScore(kinds), perCriterion, comments: rows.filter((r) => r.comment).map((r) => ({ kind: r.raterKind, comment: r.comment })) };
    });
  }

  // ---- overtime, arrears and other pay adjustments ---------------------------------------------------------------------

  /** Active staff to choose from on the payroll screens. */
  @Get('payroll/staff-options')
  @Auth('user', PAYROLL_ROLES)
  staffOptions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: staffProfiles.userId, fullName: users.fullName, employeeCode: staffProfiles.employeeCode }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(eq(staffProfiles.status, 'active')).orderBy(asc(users.fullName)));
  }

  @Get('payroll/adjustments')
  @Auth('user', PAYROLL_ROLES)
  adjustments(@CurrentPrincipal() p: UserPrincipal, @Query('month') month?: string) {
    if (month && !Month.safeParse(month).success) throw new BadRequestException('Use a month like 2026-10');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ a: payrollAdjustments, name: users.fullName }).from(payrollAdjustments).innerJoin(users, eq(users.id, payrollAdjustments.userId)).where(month ? eq(payrollAdjustments.payMonth, month) : undefined).orderBy(desc(payrollAdjustments.createdAt)).limit(300);
      return rows.map((r) => ({ ...r.a, fullName: r.name }));
    });
  }

  private async monthlyEarning(tx: Tx, userId: string, month: string): Promise<{ structureId: string; effectiveFrom: string; total: number } | null> {
    const [s] = await tx.select().from(salaryStructures).where(and(eq(salaryStructures.userId, userId), lte(salaryStructures.effectiveFrom, `${month}-28`))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1);
    if (!s) return null;
    return { structureId: s.id, effectiveFrom: s.effectiveFrom, total: await this.structureTotal(tx, s.id) };
  }

  private async structureTotal(tx: Tx, structureId: string) {
    const [r] = await tx.select({ t: sql<number>`coalesce(sum(${salaryStructureLines.monthlyPaise}), 0)::bigint`.mapWith(Number) }).from(salaryStructureLines).innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureLines.componentId)).where(and(eq(salaryStructureLines.structureId, structureId), eq(salaryComponents.kind, 'earning')));
    return r?.t ?? 0;
  }

  /** Overtime (hours at double the hourly rate unless a rate is given), arrears, bonuses and recoveries wait for approval, then go on that month's payslip. */
  @Post('payroll/adjustments')
  @Auth('user', PAYROLL_ROLES)
  addAdjustment(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AdjBody)) b: z.infer<typeof AdjBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [run] = await tx.select({ status: payrollRuns.status }).from(payrollRuns).where(eq(payrollRuns.month, b.payMonth));
      if (run?.status === 'locked') throw new ConflictException('That month\'s payroll is locked');
      const [sp] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, b.userId));
      if (!sp) throw new NotFoundException('Staff member not found');
      let amount = b.amountPaise ?? 0;
      if (b.kind === 'overtime') {
        if (!b.hours) throw new BadRequestException('Give the overtime hours');
        if (b.ratePaise) amount = Math.round(b.hours * b.ratePaise);
        else {
          const e = await this.monthlyEarning(tx, b.userId, b.payMonth);
          if (!e) throw new ConflictException('This staff member has no salary structure to work the rate from');
          amount = overtimeAmount(e.total, b.hours);
        }
      }
      if (amount <= 0) throw new BadRequestException('Give an amount');
      const [row] = await tx.insert(payrollAdjustments).values({ tenantId: p.tenantId, userId: b.userId, kind: b.kind, payMonth: b.payMonth, hours: b.hours ?? null, ratePaise: b.ratePaise ?? null, amountPaise: amount, reason: b.reason, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'payroll.adjustment_added', 'payroll_adjustment', row.id, { kind: b.kind, amountPaise: amount });
      return row;
    });
  }

  /** Works out the arrears owed after a salary revision: the rise on the latest structure for each month it applied but was not paid. */
  @Post('payroll/adjustments/revision-arrears')
  @Auth('user', PAYROLL_ROLES)
  revisionArrears(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ userId: z.uuid(), payMonth: Month }))) b: { userId: string; payMonth: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [run] = await tx.select({ status: payrollRuns.status }).from(payrollRuns).where(eq(payrollRuns.month, b.payMonth));
      if (run?.status === 'locked') throw new ConflictException('That month\'s payroll is locked');
      const list = await tx.select().from(salaryStructures).where(and(eq(salaryStructures.userId, b.userId), lte(salaryStructures.effectiveFrom, `${b.payMonth}-28`))).orderBy(desc(salaryStructures.effectiveFrom)).limit(2);
      if (list.length < 2) throw new ConflictException('There is no earlier salary structure to compare with');
      const [now, before] = list;
      const rise = (await this.structureTotal(tx, now.id)) - (await this.structureTotal(tx, before.id));
      const months = monthsBetween(now.effectiveFrom.slice(0, 7), b.payMonth);
      if (rise <= 0) throw new ConflictException('The revision did not raise pay');
      if (months <= 0) throw new ConflictException('The revision starts in the pay month; there are no arrears');
      const reason = `Revision arrears: ${months} month(s) from ${now.effectiveFrom}`;
      const [dup] = await tx.select({ id: payrollAdjustments.id }).from(payrollAdjustments).where(and(eq(payrollAdjustments.userId, b.userId), eq(payrollAdjustments.payMonth, b.payMonth), eq(payrollAdjustments.kind, 'arrear'), eq(payrollAdjustments.reason, reason)));
      if (dup) throw new ConflictException('These arrears are already recorded');
      const [row] = await tx.insert(payrollAdjustments).values({ tenantId: p.tenantId, userId: b.userId, kind: 'arrear', payMonth: b.payMonth, hours: null, ratePaise: rise, amountPaise: rise * months, reason, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'payroll.arrears_computed', 'payroll_adjustment', row.id, { months, risePaise: rise });
      return row;
    });
  }

  @Post('payroll/adjustments/:id/decide')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  decideAdjustment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ approve: z.boolean() }))) b: { approve: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, id)).for('update');
      if (!a) throw new NotFoundException('Adjustment not found');
      if (a.status !== 'pending') throw new ConflictException(`This adjustment is already ${a.status}`);
      const [run] = await tx.select({ status: payrollRuns.status }).from(payrollRuns).where(eq(payrollRuns.month, a.payMonth));
      if (run?.status === 'locked') throw new ConflictException('That month\'s payroll is locked');
      const [row] = await tx.update(payrollAdjustments).set({ status: b.approve ? 'approved' : 'rejected', decidedBy: p.userId, decidedAt: new Date() }).where(eq(payrollAdjustments.id, id)).returning();
      await auditUser(tx, p, 'payroll.adjustment_decided', 'payroll_adjustment', id, { approve: b.approve });
      return row;
    });
  }

  // ---- tax profile, challans and Form 16 ----------------------------------------------------------------------------------

  @Get('payroll/tax-profile')
  @Auth('user', PAYROLL_ROLES)
  taxProfile(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(payrollTaxProfile))[0] ?? null);
  }

  @Put('payroll/tax-profile')
  @Auth('user', PAYROLL_APPROVERS)
  saveTaxProfile(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TaxProfileBody)) b: z.infer<typeof TaxProfileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(payrollTaxProfile).values({ tenantId: p.tenantId, ...b }).onConflictDoUpdate({ target: payrollTaxProfile.tenantId, set: { ...b, updatedAt: new Date() } }).returning();
      await auditUser(tx, p, 'payroll.tax_profile_saved', 'payroll_tax_profile', row.id);
      return row;
    });
  }

  @Get('payroll/challans')
  @Auth('user', PAYROLL_ROLES)
  challans(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fy?: string) {
    if (fy && !FY.safeParse(fy).success) throw new BadRequestException('Use a financial year like 2026-27');
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(tdsChallans).where(fy ? eq(tdsChallans.financialYear, fy) : undefined).orderBy(asc(tdsChallans.payMonth), asc(tdsChallans.depositedOn)));
  }

  @Post('payroll/challans')
  @Auth('user', PAYROLL_ROLES)
  addChallan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ChallanBody)) b: z.infer<typeof ChallanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: tdsChallans.id }).from(tdsChallans).where(and(eq(tdsChallans.bsrCode, b.bsrCode), eq(tdsChallans.challanSerial, b.challanSerial)));
      if (dup) throw new ConflictException('That challan is already recorded');
      const [row] = await tx.insert(tdsChallans).values({ tenantId: p.tenantId, financialYear: financialYearOf(b.payMonth), payMonth: b.payMonth, section: b.section, bsrCode: b.bsrCode, challanSerial: b.challanSerial, depositedOn: b.depositedOn, tdsPaise: b.tdsPaise, interestPaise: b.interestPaise, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'payroll.challan_recorded', 'tds_challan', row.id, { tdsPaise: b.tdsPaise });
      return row;
    });
  }

  /** TDS deducted on payslips against challans deposited, month by month; a short deposit is flagged. */
  @Get('payroll/tds-summary')
  @Auth('user', PAYROLL_ROLES)
  tdsSummary(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fy?: string) {
    const year = fy ?? financialYearOf(new Date().toISOString().slice(0, 7));
    if (!FY.safeParse(year).success) throw new BadRequestException('Use a financial year like 2026-27');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const months = fyMonths(year);
      const ded = await tx.select({ month: payrollRuns.month, tds: sql<number>`coalesce(sum(${payslips.tdsPaise}), 0)::bigint`.mapWith(Number) }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(and(eq(payrollRuns.status, 'locked'), inArray(payrollRuns.month, months))).groupBy(payrollRuns.month);
      const dep = await tx.select({ month: tdsChallans.payMonth, tds: sql<number>`coalesce(sum(${tdsChallans.tdsPaise}), 0)::bigint`.mapWith(Number) }).from(tdsChallans).where(eq(tdsChallans.financialYear, year)).groupBy(tdsChallans.payMonth);
      const rows = months.map((m) => {
        const d = ded.find((x) => x.month === m)?.tds ?? 0;
        const c = dep.find((x) => x.month === m)?.tds ?? 0;
        return { month: m, quarter: quarterOf(m), deductedPaise: d, depositedPaise: c, shortPaise: Math.max(0, d - c) };
      });
      return { fy: year, months: rows, deductedPaise: rows.reduce((a, r) => a + r.deductedPaise, 0), depositedPaise: rows.reduce((a, r) => a + r.depositedPaise, 0), shortMonths: rows.filter((r) => r.shortPaise > 0).map((r) => r.month) };
    });
  }

  /** The year's salary and tax statement for one employee, with the challans: payroll staff for anyone, staff for themselves. */
  @Get('payroll/form16/:userId')
  @Auth('user', STAFF_ROLES)
  async form16(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Query('fy') fy: string | undefined, @Res() res: Response) {
    if (userId !== p.userId && !isPayrollStaff(p)) throw new ForbiddenException('You can download your own Form 16 only');
    const year = fy ?? financialYearOf(new Date().toISOString().slice(0, 7));
    if (!FY.safeParse(year).success) throw new BadRequestException('Use a financial year like 2026-27');
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const [profile] = await tx.select().from(payrollTaxProfile);
      if (!profile) throw new ConflictException('Record the institution\'s TAN and PAN first');
      const [emp] = await tx.select({ name: users.fullName, code: staffProfiles.employeeCode, pan: staffProfiles.pan }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(eq(staffProfiles.userId, userId));
      if (!emp) throw new NotFoundException('Staff member not found');
      const months = fyMonths(year);
      const slips = await tx.select({ month: payrollRuns.month, gross: payslips.grossPaise, taxable: payslips.taxableGrossPaise, pt: payslips.ptPaise, pf: payslips.employeePfPaise, tds: payslips.tdsPaise }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(and(eq(payslips.userId, userId), eq(payrollRuns.status, 'locked'), inArray(payrollRuns.month, months))).orderBy(asc(payrollRuns.month));
      if (slips.length === 0) throw new NotFoundException('No locked payroll for this year');
      const ch = await tx.select().from(tdsChallans).where(eq(tdsChallans.financialYear, year)).orderBy(asc(tdsChallans.payMonth));
      const allDed = await tx.select({ month: payrollRuns.month, tds: sql<number>`coalesce(sum(${payslips.tdsPaise}), 0)::bigint`.mapWith(Number) }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(and(eq(payrollRuns.status, 'locked'), inArray(payrollRuns.month, months))).groupBy(payrollRuns.month);
      // The employee's tax counts as deposited for a month when the institution's challans for that month cover everything it deducted.
      const covered = (m: string) => {
        const ded = allDed.find((d) => d.month === m)?.tds ?? 0;
        return ded > 0 && ch.filter((c) => c.payMonth === m).reduce((a, c) => a + c.tdsPaise, 0) >= ded;
      };
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => ({ quarter: q, deductedPaise: slips.filter((s) => quarterOf(s.month) === q).reduce((a, s) => a + s.tds, 0), depositedPaise: slips.filter((s) => quarterOf(s.month) === q && covered(s.month)).reduce((a, s) => a + s.tds, 0) }));
      await auditUser(tx, p, 'payroll.form16_downloaded', 'staff_profile', userId, { fy: year });
      return form16Pdf({ fy: year, deductor: { name: profile.deductorName, address: profile.deductorAddress, tan: profile.tan, pan: profile.pan, responsible: profile.responsiblePerson, designation: profile.responsibleDesignation }, employee: emp, months: slips.map((s) => ({ month: s.month, grossPaise: s.gross, taxablePaise: s.taxable, ptPaise: s.pt, pfPaise: s.pf, tdsPaise: s.tds })), challans: ch.map((c) => ({ month: c.payMonth, bsr: c.bsrCode, serial: c.challanSerial, depositedOn: c.depositedOn, tdsPaise: c.tdsPaise })), quarters });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="form16-${year}.pdf"`);
    res.end(pdf);
  }
}
