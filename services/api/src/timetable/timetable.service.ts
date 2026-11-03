import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { sections, teacherSubstitutions, tenants, timetableSlots } from '../db/schema.js';
import { CalendarService } from './calendar.service.js';

export interface CurrentSlot {
  id: string;
  sectionId: string;
  subjectId: string;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  /** End of the period as an instant. */
  endsAtInstant: Date;
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
  ) {}

  async tenantTimezone(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return t?.tz ?? 'Asia/Kolkata';
  }

  /**
   * The period the teacher is teaching right now. If they have two overlapping slots
   * (rare, but timetables are messy) the one in the board's room wins.
   */
  async currentSlotForTeacher(tx: Tx, teacherId: string, roomId: string | null): Promise<CurrentSlot | null> {
    const tz = await this.tenantTimezone(tx);
    const now = localParts(this.clock.now(), tz);
    // The teacher's own periods now and the ones they cover for a colleague today; a period a colleague covers is theirs.
    const subs = await tx
      .select({ slotId: teacherSubstitutions.slotId, substitute: teacherSubstitutions.substituteTeacherId })
      .from(teacherSubstitutions)
      .where(and(eq(teacherSubstitutions.date, now.date), eq(teacherSubstitutions.status, 'assigned'), or(eq(teacherSubstitutions.substituteTeacherId, teacherId), eq(teacherSubstitutions.originalTeacherId, teacherId))));
    const covering = subs.filter((x) => x.substitute === teacherId).map((x) => x.slotId);
    const coveredByOthers = new Set(subs.filter((x) => x.substitute !== teacherId).map((x) => x.slotId));
    const rows = await tx
      .select({ slot: timetableSlots, programId: sections.programId })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(
        and(
          covering.length ? or(eq(timetableSlots.teacherId, teacherId), inArray(timetableSlots.id, covering)) : eq(timetableSlots.teacherId, teacherId),
          isNull(timetableSlots.archivedAt),
          lte(timetableSlots.startsAt, now.time),
          gt(timetableSlots.endsAt, now.time),
        ),
      )
      .orderBy(asc(timetableSlots.startsAt));
    // A compensatory working day follows another weekday's timetable; no class on a holiday (the board is then a free session).
    const orders = await this.calendar.dayOrders(tx, now.date, now.date);
    const holidays = await this.calendar.holidays(tx, now.date, now.date);
    const slots = rows
      .filter((r) => (covering.includes(r.slot.id) || orders.weekday(now.date, r.programId) === r.slot.dayOfWeek) && !holidays.on(now.date, r.programId) && !coveredByOthers.has(r.slot.id))
      .map((r) => r.slot);
    const slot = slots.find((s) => roomId && s.roomId === roomId) ?? slots[0];
    if (!slot) return null;
    return {
      id: slot.id,
      sectionId: slot.sectionId,
      subjectId: slot.subjectId,
      roomId: slot.roomId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      endsAtInstant: zonedToInstant(now.date, slot.endsAt, tz),
    };
  }
}
