import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { Day } from '../common/zod-fields.js';
import { DbService, type Tx } from '../db/db.service.js';
import { parseBiometricCsv } from '../hr/biometric-csv.js';
import { validateSlot, Time } from '../admin/timetable-rules.js';
import { assertTermFits, termCovers } from '../terms/terms.js';
import { LifecycleService } from '../students/lifecycle.service.js';
import { studentBiometricIds, subjectFrequency } from '../db/schema-g1.js';
import { pucCombinations, pucEnrollments } from '../db/schema-curriculum.js';
import {
  academicTerms,
  academicYears,
  admissionCycles,
  attendanceRecords,
  calendarEvents,
  examSessions,
  meritLists,
  programs,
  sections,
  students,
  subjects,
  timetableSlots,
} from '../db/schema.js';
import { feedCalendar } from './calendar-feed.js';
import { frequencyStatus, generateTimetable, isLatePunch, rollUp, splitYear, TERM_PRESETS, type Busy, type Demand } from './scheduling-logic.js';

const PresetBody = z.object({ academicYearId: z.uuid(), preset: z.enum(['semester', 'trimester', 'quarter', 'annual']), programIds: z.array(z.uuid()).min(1).max(100).nullable().optional() });
const FrequencyBody = z.object({ minPerWeek: z.number().int().min(0).max(40), maxPerWeek: z.number().int().min(1).max(40), maxPerDay: z.number().int().min(1).max(10) }).refine((b) => b.minPerWeek <= b.maxPerWeek, { message: 'The minimum cannot exceed the maximum', path: ['minPerWeek'] });
const GenerateBody = z.object({
  sectionId: z.uuid(),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
  periods: z.array(z.object({ startsAt: Time, endsAt: Time }).refine((p) => p.startsAt < p.endsAt, 'A period must end after it starts')).min(1).max(12),
  assignments: z.array(z.object({ subjectId: z.uuid(), teacherId: z.uuid(), roomId: z.uuid().nullable().optional(), perWeek: z.number().int().min(1).max(20).optional() })).max(60).default([]),
  /** Archive the class's current periods first and build the week from scratch. */
  replace: z.boolean().default(false),
  /** false = a proposal only. */
  apply: z.boolean().default(false),
});
const MappingBody = z.object({ mappings: z.array(z.object({ studentId: z.uuid(), deviceUserId: z.string().trim().min(1).max(40) })).min(1).max(2000) });
const ImportBody = z.object({ csv: z.string().min(10).max(2_000_000), lateAfter: Time.default('09:30') });
const PucBody = z.object({ academicYearId: z.uuid(), programId: z.uuid(), term: z.number().int().min(1).max(20) });
const DEFAULT_PER_WEEK = 3;

/** The scheduling desk: term presets, calendars fed from other modules, subject frequency, timetable generation, attendance roll-ups, student biometric punches and PUC class sections. */
@Controller('v1/scheduling')
export class SchedulingController {
  constructor(
    private readonly db: DbService,
    private readonly lifecycle: LifecycleService,
  ) {}

  // ---- term presets -------------------------------------------------------------------------------------------------------------------

  @Get('term-presets')
  @Auth('user', STAFF_ADMIN_ROLES)
  presets() {
    return Object.entries(TERM_PRESETS).map(([key, v]) => ({ key, count: v.count, label: v.label }));
  }

  /** Creates the year's terms from a preset (semesters, trimesters, quarters or one annual term). Terms that already exist are left alone. */
  @Post('term-presets')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  applyPreset(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PresetBody)) b: z.infer<typeof PresetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [year] = await tx.select().from(academicYears).where(eq(academicYears.id, b.academicYearId));
      if (!year) throw new NotFoundException('Academic year not found');
      let parts: ReturnType<typeof splitYear>;
      try {
        parts = splitYear(year.startsOn, year.endsOn, b.preset);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      const have = new Set((await tx.select({ name: academicTerms.name }).from(academicTerms).where(eq(academicTerms.academicYearId, year.id))).map((t) => t.name));
      const created: string[] = [];
      const skipped: string[] = [];
      for (const part of parts) {
        if (have.has(part.name)) {
          skipped.push(part.name);
          continue;
        }
        await assertTermFits(tx, { academicYearId: year.id, startsOn: part.startsOn, endsOn: part.endsOn, programIds: b.programIds ?? null });
        await tx.insert(academicTerms).values({ tenantId: p.tenantId, academicYearId: year.id, name: part.name, startsOn: part.startsOn, endsOn: part.endsOn, programIds: b.programIds ?? null });
        created.push(part.name);
      }
      await auditUser(tx, p, 'term.preset.applied', 'academic_year', year.id, { preset: b.preset, created, skipped });
      return { created, skipped };
    });
  }

  // ---- calendar fed from admissions and exams ----------------------------------------------------------------------------------

  /** Puts admission windows and results, exam sessions and result days on the calendar. Safe to run again: entries are updated, not repeated. */
  @Post('calendar/sync')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  syncCalendar(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const out = await feedCalendar(tx, p.tenantId, p.userId);
      await auditUser(tx, p, 'calendar.synced', 'tenant', p.tenantId, { entries: out.synced });
      return out;
    });
  }

  // ---- subject frequency ---------------------------------------------------------------------------------------------------------

  /** Each subject of a class with its weekly rule and how many periods the class has now. */
  @Get('frequency')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hod'])
  frequency(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sec = await this.section(tx, sectionId);
      const subs = await tx.select().from(subjects).where(and(eq(subjects.programId, sec.programId), eq(subjects.term, sec.term))).orderBy(asc(subjects.name));
      const rules = new Map((await tx.select().from(subjectFrequency)).map((r) => [r.subjectId, r]));
      const counts = new Map((await tx.select({ subjectId: timetableSlots.subjectId, n: sql<number>`count(*)::int` }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt))).groupBy(timetableSlots.subjectId)).map((r) => [r.subjectId, r.n]));
      return subs.map((s) => {
        const r = rules.get(s.id);
        const n = counts.get(s.id) ?? 0;
        return { subjectId: s.id, code: s.code, name: s.name, rule: r ? { minPerWeek: r.minPerWeek, maxPerWeek: r.maxPerWeek, maxPerDay: r.maxPerDay } : null, periods: n, status: r ? frequencyStatus(r, n) : null };
      });
    });
  }

  @Put('frequency/:subjectId')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveFrequency(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body(new ZodBody(FrequencyBody)) b: z.infer<typeof FrequencyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId));
      if (!s) throw new NotFoundException('Subject not found');
      await tx.insert(subjectFrequency).values({ tenantId: p.tenantId, subjectId, ...b }).onConflictDoUpdate({ target: [subjectFrequency.tenantId, subjectFrequency.subjectId], set: b });
      await auditUser(tx, p, 'timetable.frequency.saved', 'subject', subjectId, b);
      return { subjectId, ...b };
    });
  }

  // ---- timetable generation ---------------------------------------------------------------------------------------------------------

  /**
   * Builds a class's week from the subjects' frequency rules without a clash, and returns it as a proposal; with
   * `apply: true` it saves the periods. A subject's teacher is the one named, else the one already teaching it elsewhere.
   */
  @Post('timetable/generate')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  generate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GenerateBody)) b: z.infer<typeof GenerateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sec = await this.section(tx, b.sectionId);
      const subs = await tx.select().from(subjects).where(and(eq(subjects.programId, sec.programId), eq(subjects.term, sec.term))).orderBy(asc(subjects.name));
      const rules = new Map((await tx.select().from(subjectFrequency)).map((r) => [r.subjectId, r]));
      const active = await tx.select().from(timetableSlots).where(isNull(timetableSlots.archivedAt));
      const mine = active.filter((s) => s.sectionId === b.sectionId);
      if (b.replace && b.apply && mine.length) await tx.update(timetableSlots).set({ archivedAt: new Date() }).where(inArray(timetableSlots.id, mine.map((s) => s.id)));
      const keep = b.replace ? [] : mine;
      const others = active.filter((s) => s.sectionId !== b.sectionId);
      const teacherBusy = new Map<string, Busy[]>();
      const roomBusy = new Map<string, Busy[]>();
      for (const s of others) {
        const cell = { dayOfWeek: s.dayOfWeek, startsAt: s.startsAt.slice(0, 5), endsAt: s.endsAt.slice(0, 5) };
        teacherBusy.set(s.teacherId, [...(teacherBusy.get(s.teacherId) ?? []), cell]);
        if (s.roomId) roomBusy.set(s.roomId, [...(roomBusy.get(s.roomId) ?? []), cell]);
      }
      const teacherOf = new Map<string, string>();
      const tally = new Map<string, Map<string, number>>();
      for (const s of active) {
        const m = tally.get(s.subjectId) ?? new Map<string, number>();
        m.set(s.teacherId, (m.get(s.teacherId) ?? 0) + 1);
        tally.set(s.subjectId, m);
      }
      for (const [sid, m] of tally) teacherOf.set(sid, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]);
      const picked = new Map(b.assignments.map((a) => [a.subjectId, a]));
      const demands: Demand[] = [];
      const noTeacher: string[] = [];
      const alreadyHave = new Map<string, number>();
      for (const s of keep) alreadyHave.set(s.subjectId, (alreadyHave.get(s.subjectId) ?? 0) + 1);
      for (const s of subs) {
        const a = picked.get(s.id);
        const rule = rules.get(s.id);
        const teacherId = a?.teacherId ?? teacherOf.get(s.id);
        if (!teacherId) {
          noTeacher.push(s.name);
          continue;
        }
        const want = a?.perWeek ?? rule?.minPerWeek ?? DEFAULT_PER_WEEK;
        const need = want - (alreadyHave.get(s.id) ?? 0);
        if (need > 0) demands.push({ subjectId: s.id, subjectName: s.name, teacherId, roomId: a?.roomId ?? null, perWeek: need, maxPerDay: rule?.maxPerDay ?? 2 });
      }
      const sectionBusy = keep.map((s) => ({ dayOfWeek: s.dayOfWeek, startsAt: s.startsAt.slice(0, 5), endsAt: s.endsAt.slice(0, 5) }));
      const out = generateTimetable({ days: b.days, periods: b.periods, demands, teacherBusy, roomBusy, sectionBusy });
      if (b.apply) {
        for (const pl of out.placements) {
          const values = await validateSlot(tx, { sectionId: b.sectionId, subjectId: pl.subjectId, teacherId: pl.teacherId, roomId: pl.roomId, dayOfWeek: pl.dayOfWeek, startsAt: pl.startsAt, endsAt: pl.endsAt }, null);
          await tx.insert(timetableSlots).values({ tenantId: p.tenantId, ...values });
        }
        await auditUser(tx, p, 'timetable.generated', 'section', b.sectionId, { placed: out.placements.length, unplaced: out.unplaced.length, replaced: b.replace });
      }
      return { applied: b.apply, placed: out.placements.length, placements: out.placements, unplaced: out.unplaced, noTeacher };
    });
  }

  // ---- attendance roll-up ----------------------------------------------------------------------------------------------------------

  /** Attendance of a class grouped by subject, day, month or academic term. */
  @Get('attendance/rollup')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hod', 'teacher'])
  rollup(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('by') byQ?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const by = z.enum(['subject', 'day', 'month', 'term']).catch('subject').parse(byQ);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sec = await this.section(tx, sectionId);
      const cond = [eq(attendanceRecords.sectionId, sectionId)];
      if (from) cond.push(gte(attendanceRecords.date, Day.parse(from)));
      if (to) cond.push(lte(attendanceRecords.date, Day.parse(to)));
      const rows = await tx
        .select({ date: attendanceRecords.date, status: attendanceRecords.status, subjectId: timetableSlots.subjectId, subject: subjects.name, n: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .leftJoin(timetableSlots, eq(timetableSlots.id, attendanceRecords.timetableSlotId))
        .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(and(...cond))
        .groupBy(attendanceRecords.date, attendanceRecords.status, timetableSlots.subjectId, subjects.name);
      const terms = (await tx.select().from(academicTerms).where(eq(academicTerms.academicYearId, sec.academicYearId)).orderBy(asc(academicTerms.startsOn))).filter((t) => termCovers(t, sec.programId));
      const termOf = (d: string) => terms.find((t) => t.startsOn <= d && d <= t.endsOn)?.name ?? '-';
      const keyed = rows
        .filter((r) => by !== 'subject' || r.subjectId)
        .map((r) => {
          const [key, label] = by === 'subject' ? [r.subjectId!, r.subject ?? ''] : by === 'day' ? [r.date, r.date] : by === 'month' ? [r.date.slice(0, 7), r.date.slice(0, 7)] : [termOf(r.date), termOf(r.date)];
          return { key, label, status: r.status, n: r.n };
        });
      return { by, groups: rollUp(keyed).sort((a, b) => a.key.localeCompare(b.key)) };
    });
  }

  // ---- student biometric punches -------------------------------------------------------------------------------------------------

  @Get('biometric/mappings')
  @Auth('user', STAFF_ADMIN_ROLES)
  mappings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ studentId: studentBiometricIds.studentId, deviceUserId: studentBiometricIds.deviceUserId, fullName: students.fullName, rollNo: students.rollNo })
        .from(studentBiometricIds)
        .innerJoin(students, eq(students.id, studentBiometricIds.studentId))
        .orderBy(asc(students.fullName)),
    );
  }

  @Put('biometric/mappings')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveMappings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MappingBody)) b: z.infer<typeof MappingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const found = await tx.select({ id: students.id }).from(students).where(inArray(students.id, b.mappings.map((m) => m.studentId)));
      if (found.length !== new Set(b.mappings.map((m) => m.studentId)).size) throw new BadRequestException('Some students were not found');
      for (const m of b.mappings) {
        await tx.delete(studentBiometricIds).where(and(eq(studentBiometricIds.studentId, m.studentId)));
        await tx.insert(studentBiometricIds).values({ tenantId: p.tenantId, ...m }).onConflictDoUpdate({ target: [studentBiometricIds.tenantId, studentBiometricIds.deviceUserId], set: { studentId: m.studentId } });
      }
      await auditUser(tx, p, 'attendance.biometric.mapped', 'tenant', p.tenantId, { count: b.mappings.length });
      return { saved: b.mappings.length };
    });
  }

  /**
   * Reads a device export (`employee_code,date,in_time,out_time`, where the code is the student's device id) and marks
   * the day: present, or late after the cut-off. A mark a teacher already made for the day stands.
   */
  @Post('biometric/import')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  importPunches(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    const parsed = parseBiometricCsv(b.csv);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const map = new Map((await tx.select().from(studentBiometricIds)).map((m) => [m.deviceUserId, m.studentId]));
      const roll = new Map((await tx.select({ id: students.id, sectionId: students.sectionId, status: students.status }).from(students)).map((s) => [s.id, s]));
      let marked = 0;
      let late = 0;
      let kept = 0;
      const unknown = new Set<string>();
      for (const d of parsed.days) {
        const sid = map.get(d.employeeCode);
        const st = sid ? roll.get(sid) : undefined;
        if (!sid || !st) {
          unknown.add(d.employeeCode);
          continue;
        }
        const status = isLatePunch(d.inTime, b.lateAfter) ? 'late' : 'present';
        const [row] = await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId: sid, sectionId: st.sectionId, date: d.date, timetableSlotId: null, status, markedBy: p.userId, occurredAt: new Date(`${d.date}T${d.inTime.length === 5 ? `${d.inTime}:00` : d.inTime}+05:30`) })
          .onConflictDoNothing()
          .returning({ id: attendanceRecords.id });
        if (!row) kept++;
        else if (status === 'late') late++;
        else marked++;
      }
      await auditUser(tx, p, 'attendance.biometric.imported', 'tenant', p.tenantId, { marked, late, kept, unknown: unknown.size });
      return { marked, late, alreadyMarked: kept, unknownDevices: [...unknown], errors: parsed.errors };
    });
  }

  // ---- PUC class sections per combination ------------------------------------------------------------------------------------------

  @Get('puc/sections')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hod'])
  pucSections(@CurrentPrincipal() p: UserPrincipal, @Query('academicYearId', ParseUUIDPipe) academicYearId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: sections.id, displayName: sections.displayName, term: sections.term, combinationId: sections.combinationId, code: pucCombinations.code, students: sql<number>`(select count(*)::int from students st where st.section_id = ${sections.id})` })
        .from(sections)
        .innerJoin(pucCombinations, eq(pucCombinations.id, sections.combinationId))
        .where(eq(sections.academicYearId, academicYearId))
        .orderBy(asc(sections.displayName));
      return rows;
    });
  }

  /** Makes a class for each stream combination that has students enrolled, and moves those students into it. Running it again only moves late joiners. */
  @Post('puc/sections')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  buildPucSections(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PucBody)) b: z.infer<typeof PucBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [prog] = await tx.select().from(programs).where(eq(programs.id, b.programId));
      if (!prog) throw new NotFoundException('Programme not found');
      const enrol = await tx
        .select({ studentId: pucEnrollments.studentId, combinationId: pucEnrollments.combinationId, code: pucCombinations.code, sectionId: students.sectionId })
        .from(pucEnrollments)
        .innerJoin(pucCombinations, eq(pucCombinations.id, pucEnrollments.combinationId))
        .innerJoin(students, eq(students.id, pucEnrollments.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(and(eq(pucEnrollments.academicYearId, b.academicYearId), eq(sections.programId, b.programId), eq(sections.term, b.term), eq(students.status, 'active')));
      const created: string[] = [];
      let moved = 0;
      for (const code of [...new Set(enrol.map((e) => e.code))].sort()) {
        const combinationId = enrol.find((e) => e.code === code)!.combinationId;
        let [sec] = await tx.select().from(sections).where(and(eq(sections.combinationId, combinationId), eq(sections.academicYearId, b.academicYearId), eq(sections.programId, b.programId), eq(sections.term, b.term)));
        if (!sec) {
          [sec] = await tx.insert(sections).values({ tenantId: p.tenantId, programId: b.programId, academicYearId: b.academicYearId, term: b.term, name: code, displayName: `${prog.name} ${b.term} ${code}`, combinationId }).returning();
          created.push(sec.displayName);
        }
        for (const e of enrol.filter((x) => x.code === code && x.sectionId !== sec.id)) {
          await this.lifecycle.changeSection(tx, p, e.studentId, sec.id, `Class for combination ${code}`);
          moved++;
        }
      }
      await auditUser(tx, p, 'puc.sections.built', 'program', b.programId, { created, moved });
      return { created, moved };
    });
  }

  private async section(tx: Tx, id: string) {
    const [s] = await tx.select().from(sections).where(eq(sections.id, id));
    if (!s) throw new NotFoundException('Class not found');
    return s;
  }
}
