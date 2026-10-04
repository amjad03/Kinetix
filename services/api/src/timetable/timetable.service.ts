import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { sections, tenants, timetableSlots } from '../db/schema.js';
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
    const rows = await tx
      .select({ slot: timetableSlots, programId: sections.programId })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(
        and(
          eq(timetableSlots.teacherId, teacherId),
          eq(timetableSlots.dayOfWeek, now.isoWeekday),
          isNull(timetableSlots.archivedAt),
          lte(timetableSlots.startsAt, now.time),
          gt(timetableSlots.endsAt, now.time),
        ),
      )
      .orderBy(asc(timetableSlots.startsAt));
    // No class on a holiday: the teacher can still use the board as a free session.
    const holidays = await this.calendar.holidays(tx, now.date, now.date);
    const slots = rows.filter((r) => !holidays.on(now.date, r.programId)).map((r) => r.slot);
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
