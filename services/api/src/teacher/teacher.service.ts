import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AttendanceCounts, AttendanceStatus, Homework, TeacherPeriod, TeacherTimetableResponse } from '@kinetix/shared';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { attendanceRecords, homework, lessonPlans, rooms, sections, students, subjects, teacherSubstitutions, timetableSlots, users } from '../db/schema.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates YYYY-MM-DD and that it is a real calendar date. */
export function parseDate(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new BadRequestException(`${field} must be a date like 2026-10-05`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} is not a valid date`);
  return value;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

/** Principals and admins can see every class; teachers only the ones they are timetabled for. */
export function isSchoolAdmin(p: UserPrincipal): boolean {
  return p.roles.some((r) => r === 'principal' || r === 'tenant_admin');
}

@Injectable()
export class TeacherService {
  constructor(
    private readonly timetable: TimetableService,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
  ) {}

  async localNow(tx: Tx) {
    return localParts(this.clock.now(), await this.timetable.tenantTimezone(tx));
  }

  async timetableFor(tx: Tx, teacherId: string, date: string | undefined): Promise<TeacherTimetableResponse> {
    const now = await this.localNow(tx);
    const day = date ? parseDate(date) : now.date;
    const weekday = isoWeekday(day);

    const all = await tx
      .select({
        slot: timetableSlots,
        section: { id: sections.id, displayName: sections.displayName },
        programId: sections.programId,
        subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        room: { id: rooms.id, name: rooms.name },
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.dayOfWeek, weekday), isNull(timetableSlots.archivedAt)))
      .orderBy(asc(timetableSlots.startsAt));
    // Holidays cancel the day's classes (for everyone, or for some programs).
    const holidays = await this.calendar.holidays(tx, day, addDays(day, 31));
    const rows = all.filter((r) => !holidays.on(day, r.programId));
    const holiday = holidays.forAll(day) ?? (all.length > 0 && rows.length === 0 ? holidays.on(day, all[0].programId) : null);

    const taken = new Set<string>();
    if (rows.length) {
      const marked = await tx
        .selectDistinct({ slotId: attendanceRecords.timetableSlotId })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.date, day), inArray(attendanceRecords.timetableSlotId, rows.map((r) => r.slot.id))));
      for (const m of marked) if (m.slotId) taken.add(m.slotId);
    }

    const planned = new Set<string>();
    if (rows.length) {
      const lp = await tx
        .select({ slotId: lessonPlans.timetableSlotId })
        .from(lessonPlans)
        .where(and(eq(lessonPlans.date, day), inArray(lessonPlans.timetableSlotId, rows.map((r) => r.slot.id))));
      for (const r of lp) planned.add(r.slotId);
    }

    const periods: TeacherPeriod[] = rows.map((r) => ({
      slotId: r.slot.id,
      startsAt: r.slot.startsAt,
      endsAt: r.slot.endsAt,
      section: r.section,
      subject: r.subject,
      room: r.room?.id ? { id: r.room.id, name: r.room.name } : null,
      isNow: day === now.date && r.slot.startsAt <= now.time && now.time < r.slot.endsAt,
      attendanceTaken: taken.has(r.slot.id),
      lessonPlanned: planned.has(r.slot.id),
    }));

    // The next day with classes (not cancelled by a holiday), so an empty Sunday can point at Monday.
    const week = await tx
      .select({ day: timetableSlots.dayOfWeek, programId: sections.programId })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(and(eq(timetableSlots.teacherId, teacherId), isNull(timetableSlots.archivedAt)));
    let nextTeachingDate: string | null = null;
    for (let i = 1; i <= 7; i++) {
      const candidate = addDays(day, i);
      const wd = isoWeekday(candidate);
      if (week.some((w) => w.day === wd && !holidays.on(candidate, w.programId))) {
        nextTeachingDate = candidate;
        break;
      }
    }

    return { date: day, today: now.date, isoWeekday: weekday, periods, nextTeachingDate, holiday: holiday ? { title: holiday.title } : null };
  }

  /** The section, looked up under RLS (so ids from other tenants are simply not found). */
  async section(tx: Tx, sectionId: string) {
    const [s] = await tx.select().from(sections).where(eq(sections.id, sectionId));
    if (!s) throw new NotFoundException('Class not found');
    return s;
  }

  async teachesSection(tx: Tx, teacherId: string, sectionId: string): Promise<boolean> {
    const [slot] = await tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.sectionId, sectionId)))
      .limit(1);
    if (slot) return true;
    // A teacher covering a period for a colleague can see that class.
    const [covering] = await tx
      .select({ id: teacherSubstitutions.id })
      .from(teacherSubstitutions)
      .innerJoin(timetableSlots, eq(timetableSlots.id, teacherSubstitutions.slotId))
      .where(and(eq(teacherSubstitutions.substituteTeacherId, teacherId), eq(teacherSubstitutions.status, 'assigned'), eq(timetableSlots.sectionId, sectionId)))
      .limit(1);
    return !!covering;
  }

  async assertCanSeeSection(tx: Tx, p: UserPrincipal, sectionId: string) {
    const section = await this.section(tx, sectionId);
    if (!isSchoolAdmin(p) && !(await this.teachesSection(tx, p.userId, sectionId))) {
      throw new ForbiddenException('You do not teach this class');
    }
    return section;
  }

  /** The slot under RLS. Teachers may only use their own periods; principals and admins any. */
  async slotFor(tx: Tx, p: UserPrincipal, slotId: string, date?: string) {
    const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, slotId));
    if (!slot) throw new NotFoundException('Period not found');
    if (slot.teacherId !== p.userId && !isSchoolAdmin(p)) {
      // The substitute for that day may take the period's attendance.
      const [sub] = date
        ? await tx.select({ id: teacherSubstitutions.id }).from(teacherSubstitutions).where(and(eq(teacherSubstitutions.slotId, slotId), eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.substituteTeacherId, p.userId), eq(teacherSubstitutions.status, 'assigned')))
        : [];
      if (!sub) throw new ForbiddenException('This is not your period');
    }
    return slot;
  }

  async attendanceSheet(tx: Tx, slotId: string, date: string) {
    const records = await tx
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.timetableSlotId, slotId), eq(attendanceRecords.date, date)));
    const counts: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of records) counts[r.status as AttendanceStatus]++;
    return { slotId, date, taken: records.length > 0, records, counts };
  }

  async homeworkList(tx: Tx, where: SQL | undefined, order: 'due' | 'created'): Promise<Homework[]> {
    const rows = await tx
      .select({
        hw: homework,
        section: { id: sections.id, displayName: sections.displayName },
        subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        createdBy: { id: users.id, fullName: users.fullName },
      })
      .from(homework)
      .innerJoin(sections, eq(sections.id, homework.sectionId))
      .innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .innerJoin(users, eq(users.id, homework.createdBy))
      .where(where)
      .orderBy(order === 'due' ? desc(homework.dueOn) : desc(homework.createdAt), desc(homework.createdAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.hw.id,
      title: r.hw.title,
      instructions: r.hw.instructions,
      dueOn: r.hw.dueOn,
      createdAt: r.hw.createdAt.toISOString(),
      section: r.section,
      subject: r.subject,
      createdBy: r.createdBy,
      boardSessionId: r.hw.boardSessionId,
    }));
  }

  /** Students of a section, looked up under RLS: the ids that are really in this class. */
  async studentsInSection(tx: Tx, sectionId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const found = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.sectionId, sectionId), inArray(students.id, ids), sql`${students.status} = 'active'`));
    return new Set(found.map((s) => s.id));
  }
}
