import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, attendanceRecords, sections, students, tenants } from '../db/schema.js';
import { coCurricularGrades, learningOutcomes, masteryRecords, pucCombinations, pucEnrollments, pucMarks, pucStreams, reportCardLines, reportCards } from '../db/schema-curriculum.js';
import { found } from '../placements/placements.access.js';
import { gradeFor, reportCardPdf } from './documents.js';

const STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
const ADMINS: RoleName[] = ['tenant_admin', 'principal'];
const VIEW: RoleName[] = ['student', 'guardian', ...STAFF];

const Mark = z.number().min(0).max(1000);
const ReportCardBody = z.object({
  studentId: z.uuid(),
  academicYearId: z.uuid(),
  termLabel: z.string().trim().min(2).max(60),
  remarks: z.string().trim().max(1500).default(''),
  behaviourGrade: z.string().trim().max(10).nullish(),
  promotionStatus: z.enum(['pending', 'promoted', 'promoted_with_grace', 'detained']).default('pending'),
  promotedTo: z.string().trim().max(60).nullish(),
  lines: z.array(z.object({ subjectName: z.string().trim().min(1).max(100), marks: Mark, maxMarks: Mark.refine((v) => v > 0, 'Maximum marks must be above zero'), grade: z.string().trim().max(6).nullish(), remark: z.string().trim().max(200).default('') }).refine((l) => l.marks <= l.maxMarks, 'Marks cannot be above the maximum')).max(30).default([]),
  coCurricular: z.array(z.object({ activity: z.string().trim().min(1).max(100), grade: z.string().trim().min(1).max(6), remark: z.string().trim().max(200).default('') })).max(20).default([]),
});
const StreamBody = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(100) });
const CombinationBody = z.object({
  streamId: z.uuid(),
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  seats: z.number().int().min(1).max(2000).optional(),
  subjects: z.array(z.object({ name: z.string().trim().min(1).max(80), theoryMax: z.number().min(0).max(200), practicalMax: z.number().min(0).max(100).default(0), internalMax: z.number().min(0).max(100).default(0) })).min(3).max(8),
});
const EnrolBody = z.object({ studentId: z.uuid(), academicYearId: z.uuid(), combinationId: z.uuid() });
const PucMarkBody = z.object({ studentId: z.uuid(), academicYearId: z.uuid(), subjectName: z.string().trim().min(1).max(80), theory: Mark.optional(), practical: Mark.optional(), internal: Mark.optional() });
const OutcomeBody = z.object({ kind: z.enum(['outcome', 'competency']).default('outcome'), grade: z.number().int().min(1).max(12), subjectName: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(30), statement: z.string().trim().min(5).max(500) });
export const MASTERY_LEVELS = ['beginning', 'developing', 'proficient', 'mastery'] as const;
const MasteryBody = z.object({ studentId: z.uuid(), outcomeId: z.uuid(), level: z.enum(MASTERY_LEVELS), evidence: z.string().trim().max(500).default(''), assessedOn: Day.optional() });

/** Attendance for a student across a window: days present (present or late) out of days marked. Whole-day records when they exist, else period records. */
async function attendanceFor(tx: Tx, studentId: string, from: string, to: string) {
  const rows = await tx
    .select({ status: attendanceRecords.status, n: sql<number>`count(*)::int`, whole: sql<boolean>`${attendanceRecords.timetableSlotId} is null` })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, from), lte(attendanceRecords.date, to)))
    .groupBy(attendanceRecords.status, sql`${attendanceRecords.timetableSlotId} is null`);
  const useWhole = rows.some((r) => r.whole);
  const pick = rows.filter((r) => r.whole === useWhole);
  const total = pick.reduce((s, r) => s + r.n, 0);
  const present = pick.filter((r) => r.status === 'present' || r.status === 'late').reduce((s, r) => s + r.n, 0);
  return { total, present, percent: total ? Math.round((present / total) * 1000) / 10 : null };
}

/** School mode: report cards with remarks, PUC streams and combinations, and learning-outcome mastery. */
@Controller('v1/school')
export class SchoolAcademicsController {
  constructor(private readonly db: DbService) {}

  // ---- Report cards ----

  @Put('report-cards')
  @Auth('user', STAFF)
  saveReportCard(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReportCardBody)) b: z.infer<typeof ReportCardBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      found((await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, b.academicYearId)))[0], 'Academic year');
      // Promotion decisions belong to the principal; a teacher can fill in everything else but leaves the status alone.
      const [existing] = await tx.select().from(reportCards).where(and(eq(reportCards.studentId, b.studentId), eq(reportCards.academicYearId, b.academicYearId), eq(reportCards.termLabel, b.termLabel)));
      const mayPromote = p.roles.some((r) => ADMINS.includes(r));
      if (!mayPromote && b.promotionStatus !== (existing?.promotionStatus ?? 'pending')) throw new ConflictException('Only the principal can set the promotion status');
      const values = { remarks: b.remarks, behaviourGrade: b.behaviourGrade ?? null, promotionStatus: b.promotionStatus, promotedTo: b.promotedTo ?? null, updatedAt: new Date() };
      const [card] = existing
        ? await tx.update(reportCards).set(values).where(eq(reportCards.id, existing.id)).returning()
        : await tx.insert(reportCards).values({ tenantId: p.tenantId, studentId: b.studentId, academicYearId: b.academicYearId, termLabel: b.termLabel, createdBy: p.userId, ...values }).returning();
      await tx.delete(reportCardLines).where(eq(reportCardLines.reportCardId, card.id));
      await tx.delete(coCurricularGrades).where(eq(coCurricularGrades.reportCardId, card.id));
      if (b.lines.length) await tx.insert(reportCardLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, reportCardId: card.id, subjectName: l.subjectName, marks: l.marks, maxMarks: l.maxMarks, grade: l.grade || gradeFor((l.marks / l.maxMarks) * 100), remark: l.remark })));
      if (b.coCurricular.length) await tx.insert(coCurricularGrades).values(b.coCurricular.map((c) => ({ tenantId: p.tenantId, reportCardId: card.id, ...c })));
      await auditUser(tx, p, 'school.report_card_saved', 'report_card', card.id, { studentId: b.studentId, term: b.termLabel, promotion: b.promotionStatus });
      return card;
    });
  }

  private async cardData(tx: Tx, id: string) {
    const card = found((await tx.select().from(reportCards).where(eq(reportCards.id, id)))[0], 'Report card');
    const [st] = await tx.select({ name: students.fullName, rollNo: students.rollNo, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, card.studentId));
    const [year] = await tx.select().from(academicYears).where(eq(academicYears.id, card.academicYearId));
    const lines = await tx.select().from(reportCardLines).where(eq(reportCardLines.reportCardId, id));
    const co = await tx.select().from(coCurricularGrades).where(eq(coCurricularGrades.reportCardId, id));
    const attendance = await attendanceFor(tx, card.studentId, year.startsOn, year.endsOn);
    return { card, st, year, lines, co, attendance };
  }

  /** A student's report cards (all terms), for staff, the student or a guardian. */
  @Get('report-cards')
  @Auth('user', VIEW)
  listReportCards(@CurrentPrincipal() p: UserPrincipal, @Query('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      return tx.select({ id: reportCards.id, academicYearId: reportCards.academicYearId, termLabel: reportCards.termLabel, promotionStatus: reportCards.promotionStatus, updatedAt: reportCards.updatedAt }).from(reportCards).where(eq(reportCards.studentId, studentId)).orderBy(asc(reportCards.updatedAt));
    });
  }

  @Get('report-cards/:id')
  @Auth('user', VIEW)
  reportCard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.cardData(tx, id);
      await assertCanSeeStudent(tx, p, d.card.studentId, STAFF);
      return { ...d.card, student: d.st, lines: d.lines, coCurricular: d.co, attendance: d.attendance };
    });
  }

  @Get('report-cards/:id/pdf')
  @Auth('user', VIEW)
  async reportCardPdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.cardData(tx, id);
      await assertCanSeeStudent(tx, p, d.card.studentId, STAFF);
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return reportCardPdf({
        institution: t.name,
        student: d.st.name,
        rollNo: d.st.rollNo,
        className: d.st.className,
        yearLabel: d.year.label,
        termLabel: d.card.termLabel,
        lines: d.lines.map((l) => ({ subject: l.subjectName, marks: l.marks, maxMarks: l.maxMarks, grade: l.grade ?? '', remark: l.remark })),
        coCurricular: d.co.map((c) => ({ activity: c.activity, grade: c.grade, remark: c.remark })),
        attendance: d.attendance,
        behaviourGrade: d.card.behaviourGrade,
        remarks: d.card.remarks,
        promotionStatus: d.card.promotionStatus,
        promotedTo: d.card.promotedTo,
      });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="report-card.pdf"');
    res.end(pdf);
  }

  // ---- PUC streams, combinations, practical and internal marks ----

  @Get('puc/streams')
  @Auth('user', STAFF)
  streams(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const streams = await tx.select().from(pucStreams).orderBy(asc(pucStreams.code));
      const combos = await tx.select({ combo: pucCombinations, enrolled: sql<number>`(select count(*)::int from puc_enrollments e where e.combination_id = puc_combinations.id)` }).from(pucCombinations).orderBy(asc(pucCombinations.code));
      return streams.map((s) => ({ ...s, combinations: combos.filter((c) => c.combo.streamId === s.id).map((c) => ({ ...c.combo, enrolled: c.enrolled })) }));
    });
  }

  @Post('puc/streams')
  @Auth('user', ADMINS)
  addStream(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StreamBody)) b: z.infer<typeof StreamBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: pucStreams.id }).from(pucStreams).where(eq(pucStreams.code, b.code));
      if (dup) throw new ConflictException('A stream with this code already exists');
      const [row] = await tx.insert(pucStreams).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'school.puc_stream_added', 'puc_stream', row.id, { code: b.code });
      return row;
    });
  }

  @Post('puc/combinations')
  @Auth('user', ADMINS)
  addCombination(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CombinationBody)) b: z.infer<typeof CombinationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: pucStreams.id }).from(pucStreams).where(eq(pucStreams.id, b.streamId)))[0], 'Stream');
      const [dup] = await tx.select({ id: pucCombinations.id }).from(pucCombinations).where(eq(pucCombinations.code, b.code));
      if (dup) throw new ConflictException('A combination with this code already exists');
      if (new Set(b.subjects.map((s) => s.name.toLowerCase())).size !== b.subjects.length) throw new BadRequestException('A subject is listed twice');
      const [row] = await tx.insert(pucCombinations).values({ tenantId: p.tenantId, ...b, seats: b.seats ?? null }).returning();
      await auditUser(tx, p, 'school.puc_combination_added', 'puc_combination', row.id, { code: b.code });
      return row;
    });
  }

  /** Puts a student in a combination for the year (changing it replaces the earlier choice); the seat limit is enforced. */
  @Post('puc/enrollments')
  @HttpCode(200)
  @Auth('user', ADMINS)
  enrol(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EnrolBody)) b: z.infer<typeof EnrolBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      const combo = found((await tx.select().from(pucCombinations).where(eq(pucCombinations.id, b.combinationId)))[0], 'Combination');
      const [mine] = await tx.select().from(pucEnrollments).where(and(eq(pucEnrollments.studentId, b.studentId), eq(pucEnrollments.academicYearId, b.academicYearId)));
      if (combo.seats && mine?.combinationId !== combo.id) {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(pucEnrollments).where(and(eq(pucEnrollments.combinationId, combo.id), eq(pucEnrollments.academicYearId, b.academicYearId)));
        if (n >= combo.seats) throw new ConflictException(`The ${combo.code} combination is full`);
      }
      const [row] = mine
        ? await tx.update(pucEnrollments).set({ combinationId: combo.id }).where(eq(pucEnrollments.id, mine.id)).returning()
        : await tx.insert(pucEnrollments).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'school.puc_enrolled', 'puc_enrollment', row.id, { studentId: b.studentId, combination: combo.code });
      return row;
    });
  }

  /** Records theory, practical and internal marks for one subject, checked against the combination's maximums. */
  @Put('puc/marks')
  @Auth('user', STAFF)
  setMarks(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PucMarkBody)) b: z.infer<typeof PucMarkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [enr] = await tx.select().from(pucEnrollments).where(and(eq(pucEnrollments.studentId, b.studentId), eq(pucEnrollments.academicYearId, b.academicYearId)));
      if (!enr) throw new BadRequestException('This student has no subject combination for the year');
      const combo = found((await tx.select().from(pucCombinations).where(eq(pucCombinations.id, enr.combinationId)))[0], 'Combination');
      const subject = combo.subjects.find((s) => s.name.toLowerCase() === b.subjectName.toLowerCase());
      if (!subject) throw new BadRequestException(`${b.subjectName} is not in the ${combo.code} combination`);
      for (const [part, max] of [['theory', subject.theoryMax], ['practical', subject.practicalMax], ['internal', subject.internalMax]] as const) {
        const v = b[part];
        if (v === undefined) continue;
        if (max === 0) throw new BadRequestException(`${subject.name} has no ${part} component`);
        if (v > max) throw new BadRequestException(`${part[0].toUpperCase()}${part.slice(1)} marks for ${subject.name} cannot be above ${max}`);
      }
      const set = { ...(b.theory !== undefined && { theory: b.theory }), ...(b.practical !== undefined && { practical: b.practical }), ...(b.internal !== undefined && { internal: b.internal }), enteredBy: p.userId, updatedAt: new Date() };
      const [row] = await tx
        .insert(pucMarks)
        .values({ tenantId: p.tenantId, studentId: b.studentId, academicYearId: b.academicYearId, subjectName: subject.name, theory: b.theory ?? null, practical: b.practical ?? null, internal: b.internal ?? null, enteredBy: p.userId })
        .onConflictDoUpdate({ target: [pucMarks.tenantId, pucMarks.studentId, pucMarks.academicYearId, pucMarks.subjectName], set })
        .returning();
      await auditUser(tx, p, 'school.puc_marks_saved', 'puc_marks', row.id, { studentId: b.studentId, subject: subject.name });
      return row;
    });
  }

  /** A student's combination and marks with totals per subject and overall. */
  @Get('puc/students/:studentId')
  @Auth('user', VIEW)
  pucStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const [enr] = await tx.select().from(pucEnrollments).where(and(eq(pucEnrollments.studentId, studentId), eq(pucEnrollments.academicYearId, academicYearId)));
      if (!enr) return { enrolled: false as const };
      const combo = found((await tx.select().from(pucCombinations).where(eq(pucCombinations.id, enr.combinationId)))[0], 'Combination');
      const marks = await tx.select().from(pucMarks).where(and(eq(pucMarks.studentId, studentId), eq(pucMarks.academicYearId, academicYearId)));
      const rows = combo.subjects.map((s) => {
        const m = marks.find((x) => x.subjectName === s.name);
        const max = s.theoryMax + s.practicalMax + s.internalMax;
        const got = (m?.theory ?? 0) + (m?.practical ?? 0) + (m?.internal ?? 0);
        const complete = (s.theoryMax === 0 || m?.theory != null) && (s.practicalMax === 0 || m?.practical != null) && (s.internalMax === 0 || m?.internal != null);
        return { subject: s.name, theory: m?.theory ?? null, practical: m?.practical ?? null, internal: m?.internal ?? null, theoryMax: s.theoryMax, practicalMax: s.practicalMax, internalMax: s.internalMax, total: got, max, complete };
      });
      const total = rows.reduce((n, r) => n + r.total, 0);
      const max = rows.reduce((n, r) => n + r.max, 0);
      return { enrolled: true as const, combination: { code: combo.code, name: combo.name }, subjects: rows, total, max, percent: max ? Math.round((total / max) * 1000) / 10 : 0, complete: rows.every((r) => r.complete) };
    });
  }

  // ---- Learning outcomes and competency mastery ----

  @Get('outcomes')
  @Auth('user', STAFF)
  outcomes(@CurrentPrincipal() p: UserPrincipal, @Query('grade') grade?: string, @Query('subject') subject?: string) {
    return this.db.withTenant(p.tenantId, (tx) => {
      const g = Number(grade);
      const conds = [Number.isInteger(g) && grade ? eq(learningOutcomes.grade, g) : undefined, subject ? eq(learningOutcomes.subjectName, subject) : undefined].filter((c) => !!c);
      return tx.select().from(learningOutcomes).where(conds.length ? and(...conds) : undefined).orderBy(asc(learningOutcomes.grade), asc(learningOutcomes.subjectName), asc(learningOutcomes.code));
    });
  }

  @Post('outcomes')
  @Auth('user', [...ADMINS, 'hod'])
  addOutcome(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OutcomeBody)) b: z.infer<typeof OutcomeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: learningOutcomes.id }).from(learningOutcomes).where(eq(learningOutcomes.code, b.code));
      if (dup) throw new ConflictException('An outcome with this code already exists');
      const [row] = await tx.insert(learningOutcomes).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'school.outcome_added', 'learning_outcome', row.id, { code: b.code });
      return row;
    });
  }

  /** Records where a student stands on an outcome. The latest assessment replaces the earlier one. */
  @Put('mastery')
  @Auth('user', STAFF)
  setMastery(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MasteryBody)) b: z.infer<typeof MasteryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      found((await tx.select({ id: learningOutcomes.id }).from(learningOutcomes).where(eq(learningOutcomes.id, b.outcomeId)))[0], 'Outcome');
      const on = b.assessedOn ?? new Date().toISOString().slice(0, 10);
      const [row] = await tx
        .insert(masteryRecords)
        .values({ tenantId: p.tenantId, studentId: b.studentId, outcomeId: b.outcomeId, level: b.level, evidence: b.evidence, assessedBy: p.userId, assessedOn: on })
        .onConflictDoUpdate({ target: [masteryRecords.tenantId, masteryRecords.studentId, masteryRecords.outcomeId], set: { level: b.level, evidence: b.evidence, assessedBy: p.userId, assessedOn: on, updatedAt: new Date() } })
        .returning();
      await auditUser(tx, p, 'school.mastery_recorded', 'mastery_record', row.id, { studentId: b.studentId, level: b.level });
      return row;
    });
  }

  @Get('mastery/students/:studentId')
  @Auth('user', VIEW)
  studentMastery(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const rows = await tx
        .select({ outcomeId: learningOutcomes.id, code: learningOutcomes.code, kind: learningOutcomes.kind, subjectName: learningOutcomes.subjectName, grade: learningOutcomes.grade, statement: learningOutcomes.statement, level: masteryRecords.level, evidence: masteryRecords.evidence, assessedOn: masteryRecords.assessedOn })
        .from(masteryRecords)
        .innerJoin(learningOutcomes, eq(learningOutcomes.id, masteryRecords.outcomeId))
        .where(eq(masteryRecords.studentId, studentId))
        .orderBy(asc(learningOutcomes.subjectName), asc(learningOutcomes.code));
      const bySubject = new Map<string, { assessed: number; proficient: number }>();
      for (const r of rows) {
        const s = bySubject.get(r.subjectName) ?? { assessed: 0, proficient: 0 };
        s.assessed += 1;
        if (r.level === 'proficient' || r.level === 'mastery') s.proficient += 1;
        bySubject.set(r.subjectName, s);
      }
      return { outcomes: rows, subjects: [...bySubject].map(([subject, s]) => ({ subject, ...s, percent: Math.round((s.proficient / s.assessed) * 100) })) };
    });
  }

  /** How a section stands on each outcome: the count at every level. */
  @Get('mastery/sections/:sectionId')
  @Auth('user', STAFF)
  sectionMastery(@CurrentPrincipal() p: UserPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = await tx.select({ id: students.id }).from(students).where(eq(students.sectionId, sectionId));
      if (!kids.length) throw new NotFoundException('No students in this section');
      const rows = await tx
        .select({ outcomeId: masteryRecords.outcomeId, level: masteryRecords.level, n: sql<number>`count(*)::int` })
        .from(masteryRecords)
        .where(inArray(masteryRecords.studentId, kids.map((k) => k.id)))
        .groupBy(masteryRecords.outcomeId, masteryRecords.level);
      const outs = await tx.select().from(learningOutcomes).where(inArray(learningOutcomes.id, [...new Set(rows.map((r) => r.outcomeId))].length ? [...new Set(rows.map((r) => r.outcomeId))] : ['00000000-0000-0000-0000-000000000000']));
      return { students: kids.length, outcomes: outs.map((o) => ({ code: o.code, subjectName: o.subjectName, statement: o.statement, levels: Object.fromEntries(MASTERY_LEVELS.map((l) => [l, rows.find((r) => r.outcomeId === o.id && r.level === l)?.n ?? 0])) })) };
    });
  }
}
