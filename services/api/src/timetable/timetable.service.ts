import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { tenants, timetableSlots } from '../db/schema.js';

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
  constructor(private readonly clock: Clock) {}

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
    const slots = await tx
      .select()
      .from(timetableSlots)
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
