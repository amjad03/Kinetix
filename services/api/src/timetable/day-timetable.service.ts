import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '../db/db.service.js';
import { electiveBasketSubjects, specialClasses, studentBatches } from '../db/schema-academic-ops.js';
import { teachingLogs } from '../db/schema-academics-pass.js';
import { courseOfferings, courseRegistrations, rooms, sections, students, subjects, teacherSubstitutions, timetableSlots, users } from '../db/schema.js';
import { CalendarService } from './calendar.service.js';

/** One period as a class (or a student of it, or a room) actually has it on a date. */
export interface DayPeriod {
  slotId: string | null;
  specialClassId: string | null;
  sectionId: string;
  section: string;
  subjectId: string;
  subjectCode: string;
  subject: string;
  teacherId: string;
  teacher: string;
  /** The teacher whose period this is, when a substitute takes it. */
  usualTeacher: string | null;
  room: string | null;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  batch: string | null;
  /** timetable | special (an extra, remedial or make-up class) */
  kind: 'timetable' | 'special';
  /** An option of an elective basket. */
  elective: boolean;
  /** The teaching diary has an entry for it (topics taken). */
  logged: boolean;
}

export interface Day {
  date: string;
  weekday: number;
  /** The weekday whose timetable meets (a compensatory working day follows another). */
  follows: number;
  holiday: string | null;
  periods: DayPeriod[];
}

const hhmm = (t: string) => t.slice(0, 5);
const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/**
 * The timetable as it is on given dates: the weekly periods of the weekday that meets (compensatory working days
 * follow another weekday), none on a holiday, the substitute teacher where a period is covered, and special classes.
 * For a student: only their lab batch's periods and the elective options they registered for.
 */
@Injectable()
export class DayTimetableService {
  constructor(private readonly calendar: CalendarService) {}

  /** A class's days from `from` to `to` (at most 14), optionally as one of its students sees them. */
  async forSection(tx: Tx, sectionId: string, from: string, to: string, studentId?: string | null): Promise<Day[]> {
    const [sec] = await tx.select({ id: sections.id, programId: sections.programId }).from(sections).where(eq(sections.id, sectionId));
    if (!sec) return [];
    const slots = await this.slots(tx, or(eq(timetableSlots.sectionId, sectionId), sql`${sectionId}::uuid = any(${timetableSlots.combinedSectionIds})`)!);
    let keep = (_s: (typeof slots)[number]) => true;
    if (studentId) {
      const [b] = await tx.select({ batch: studentBatches.batch }).from(studentBatches).where(and(eq(studentBatches.sectionId, sectionId), eq(studentBatches.studentId, studentId)));
      // Electives: the options the student is registered for (all options while they have registered for none).
      const basketSubjects = new Set((await tx.select({ id: electiveBasketSubjects.subjectId }).from(electiveBasketSubjects)).map((r) => r.id));
      const mine = new Set(
        (
          await tx
            .select({ subjectId: courseOfferings.subjectId })
            .from(courseRegistrations)
            .innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId))
            .where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.status, 'registered')))
        ).map((r) => r.subjectId),
      );
      const registeredElective = [...mine].some((id) => basketSubjects.has(id));
      keep = (s) => (!s.batch || !b || s.batch === b.batch) && (!basketSubjects.has(s.subjectId) || !registeredElective || mine.has(s.subjectId));
    }
    return this.days(tx, slots.filter(keep), from, to, () => sec.programId, { sectionIds: [sectionId] });
  }

  /** A room's days (for the smart board in the room). */
  async forRoom(tx: Tx, roomId: string, from: string, to: string): Promise<Day[]> {
    const slots = await this.slots(tx, eq(timetableSlots.roomId, roomId));
    return this.days(tx, slots, from, to, (s) => s.programId, { roomId });
  }

  private async slots(tx: Tx, where: SQL) {
    const basket = new Set((await tx.select({ id: electiveBasketSubjects.subjectId }).from(electiveBasketSubjects)).map((r) => r.id));
    const rows = await tx
      .select({
        id: timetableSlots.id,
        sectionId: timetableSlots.sectionId,
        section: sections.displayName,
        programId: sections.programId,
        subjectId: timetableSlots.subjectId,
        subjectCode: subjects.code,
        subject: subjects.name,
        teacherId: timetableSlots.teacherId,
        teacher: users.fullName,
        roomId: timetableSlots.roomId,
        room: rooms.name,
        dayOfWeek: timetableSlots.dayOfWeek,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
        batch: timetableSlots.batch,
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .where(and(isNull(timetableSlots.archivedAt), where))
      .orderBy(asc(timetableSlots.startsAt));
    return rows.map((r) => ({ ...r, elective: basket.has(r.subjectId) }));
  }

  private async days(tx: Tx, slots: Awaited<ReturnType<DayTimetableService['slots']>>, from: string, to: string, programOf: (s: { programId: string }) => string, where: { sectionIds?: string[]; roomId?: string }): Promise<Day[]> {
    const dates: string[] = [];
    for (let d = from; d <= to && dates.length < 14; d = addDays(d, 1)) dates.push(d);
    const orders = await this.calendar.dayOrders(tx, from, to);
    const holidays = await this.calendar.holidays(tx, from, to);
    const sub = alias(users, 'substitute');
    const subs = slots.length
      ? await tx
          .select({ slotId: teacherSubstitutions.slotId, date: teacherSubstitutions.date, id: sub.id, name: sub.fullName })
          .from(teacherSubstitutions)
          .innerJoin(sub, eq(sub.id, teacherSubstitutions.substituteTeacherId))
          .where(and(inArray(teacherSubstitutions.slotId, slots.map((s) => s.id)), gte(teacherSubstitutions.date, from), lte(teacherSubstitutions.date, to), eq(teacherSubstitutions.status, 'assigned')))
      : [];
    const special = await tx
      .select({
        id: specialClasses.id,
        sectionId: specialClasses.sectionId,
        section: sections.displayName,
        programId: sections.programId,
        subjectId: specialClasses.subjectId,
        subjectCode: subjects.code,
        subject: subjects.name,
        teacherId: specialClasses.teacherId,
        teacher: users.fullName,
        roomId: specialClasses.roomId,
        room: rooms.name,
        date: specialClasses.date,
        startsAt: specialClasses.startsAt,
        endsAt: specialClasses.endsAt,
        batch: specialClasses.batch,
      })
      .from(specialClasses)
      .innerJoin(sections, eq(sections.id, specialClasses.sectionId))
      .innerJoin(subjects, eq(subjects.id, specialClasses.subjectId))
      .innerJoin(users, eq(users.id, specialClasses.teacherId))
      .leftJoin(rooms, eq(rooms.id, specialClasses.roomId))
      .where(and(gte(specialClasses.date, from), lte(specialClasses.date, to), ne(specialClasses.status, 'cancelled'), where.sectionIds ? inArray(specialClasses.sectionId, where.sectionIds) : eq(specialClasses.roomId, where.roomId!)));
    const logs = await tx
      .select({ slotId: teachingLogs.timetableSlotId, specialId: teachingLogs.specialClassId, date: teachingLogs.date })
      .from(teachingLogs)
      .where(and(gte(teachingLogs.date, from), lte(teachingLogs.date, to), where.sectionIds ? inArray(teachingLogs.sectionId, where.sectionIds) : undefined));
    const logged = new Set(logs.map((l) => `${l.slotId ?? l.specialId}|${l.date}`));
    return dates.map((date) => {
      const all = holidays.forAll(date);
      const periods: DayPeriod[] = all
        ? []
        : slots
            .filter((s) => orders.weekday(date, programOf(s)) === s.dayOfWeek && !holidays.on(date, programOf(s)))
            .map((s) => {
              const cover = subs.find((x) => x.slotId === s.id && x.date === date);
              return {
                slotId: s.id,
                specialClassId: null,
                sectionId: s.sectionId,
                section: s.section,
                subjectId: s.subjectId,
                subjectCode: s.subjectCode,
                subject: s.subject,
                teacherId: cover?.id ?? s.teacherId,
                teacher: cover?.name ?? s.teacher,
                usualTeacher: cover ? s.teacher : null,
                room: s.room,
                roomId: s.roomId,
                startsAt: hhmm(s.startsAt),
                endsAt: hhmm(s.endsAt),
                batch: s.batch,
                kind: 'timetable' as const,
                elective: s.elective,
                logged: logged.has(`${s.id}|${date}`),
              };
            });
      for (const c of special.filter((x) => x.date === date)) {
        periods.push({ slotId: null, specialClassId: c.id, sectionId: c.sectionId, section: c.section, subjectId: c.subjectId, subjectCode: c.subjectCode, subject: c.subject, teacherId: c.teacherId, teacher: c.teacher, usualTeacher: null, room: c.room, roomId: c.roomId, startsAt: hhmm(c.startsAt), endsAt: hhmm(c.endsAt), batch: c.batch, kind: 'special', elective: false, logged: logged.has(`${c.id}|${date}`) });
      }
      periods.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.section.localeCompare(b.section));
      const off = all ?? (slots.length && periods.length === 0 ? holidays.on(date, programOf(slots[0])) : null);
      return { date, weekday: weekdayOf(date), follows: orders.weekday(date, slots[0] ? programOf(slots[0]) : null), holiday: off?.title ?? null, periods };
    });
  }

  /** The student record behind a login (null for anyone else). */
  async studentOf(tx: Tx, userId: string) {
    const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, userId));
    return s ?? null;
  }
}
