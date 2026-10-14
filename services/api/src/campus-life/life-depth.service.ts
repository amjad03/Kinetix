import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { attendanceRecords, campusEvents, eventRegistrations, studentLeaveRequests, tenants } from '../db/schema.js';
import { eventDutyLeaves, eventExternalRegistrations } from '../db/schema-life.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { KitCtx } from '../records/entity.js';
import { CampusLifeService } from './campus-life.service.js';

/** The local dates an event covers, in the institution's time zone. */
export function eventDates(startsAt: Date, endsAt: Date, timeZone: string): { from: string; to: string } {
  return { from: localParts(startsAt, timeZone).date, to: localParts(new Date(endsAt.getTime() - 1), timeZone).date };
}

/**
 * Who wins a post: the `seats` candidates with the most votes. A tie at the last seat elects nobody for that seat
 * and is reported, so the committee can hold a run-off.
 */
export function electedOf(candidates: { id: string; votes: number }[], seats: number): { elected: string[]; tie: boolean } {
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  if (sorted.length <= seats) return { elected: sorted.filter((c) => c.votes > 0).map((c) => c.id), tie: false };
  const cut = sorted[seats - 1].votes;
  const tie = sorted[seats].votes === cut;
  const elected = sorted.filter((c, i) => i < seats && c.votes > 0 && (!tie || c.votes > cut)).map((c) => c.id);
  return { elected, tie };
}

/** Event cancellation with refunds, and duty leave for participants. */
@Injectable()
export class CampusDepthService {
  constructor(
    private readonly svc: CampusLifeService,
    private readonly notifications: NotificationsService,
  ) {}

  async timezone(tx: Tx): Promise<string> {
    return (await tx.select({ tz: tenants.timezone }).from(tenants))[0]?.tz ?? 'Asia/Kolkata';
  }

  /**
   * Cancels an event: registrations stay (for the record), everyone who paid is marked for a refund and every
   * registered student's family and the external registrants' list are told. Returns a note for the report.
   */
  async cancelEvent(ctx: KitCtx, id: string, reason: string): Promise<string> {
    const { tx, p } = ctx;
    const [ev] = await tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update');
    if (!ev) throw new ConflictException('Event not found');
    if (ev.status === 'cancelled') throw new ConflictException('This event is already cancelled');
    await tx.update(campusEvents).set({ status: 'cancelled', cancelReason: reason }).where(eq(campusEvents.id, id));
    const internal = await tx.update(eventRegistrations).set({ refundStatus: 'due' }).where(and(eq(eventRegistrations.eventId, id), gt(eventRegistrations.paidPaise, 0), eq(eventRegistrations.refundStatus, 'none'))).returning({ id: eventRegistrations.id });
    const external = await tx.update(eventExternalRegistrations).set({ refundStatus: 'due' }).where(and(eq(eventExternalRegistrations.eventId, id), gt(eventExternalRegistrations.paidPaise, 0), eq(eventExternalRegistrations.refundStatus, 'none'))).returning({ id: eventExternalRegistrations.id });
    const regs = await tx.select({ studentId: eventRegistrations.studentId }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), inArray(eventRegistrations.status, ['registered', 'waitlisted'])));
    if (regs.length) {
      const people = await tx.execute<{ user_id: string }>(
        sql`select g.user_id from guardians g where g.student_id in (${sql.join(regs.map((r) => sql`${r.studentId}::uuid`), sql`, `)}) union select s.user_id from students s where s.id in (${sql.join(regs.map((r) => sql`${r.studentId}::uuid`), sql`, `)}) and s.user_id is not null`,
      );
      await this.notifications.notifyUsers(tx, people.rows.map((r) => r.user_id), { kind: 'calendar', text: { title: `${ev.title} is cancelled`, body: reason || (internal.length ? 'Fees paid will be refunded.' : 'We are sorry for the change.') }, data: { eventId: id }, dedupeKey: `event-cancel:${id}` });
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.cancelled', subjectType: 'event', subjectId: id, changes: { status: { before: ev.status, after: 'cancelled' } }, data: { reason, refundsDue: internal.length + external.length } });
    const n = internal.length + external.length;
    return n ? `${n} refund${n === 1 ? '' : 's'} due` : '';
  }

  /**
   * Duty leave for students taking part in or volunteering at an event: an approved leave request for the event's
   * dates, and any absence already marked on those dates becomes excused. Returns the new grants.
   */
  async grantDutyLeave(ctx: KitCtx, eventId: string, studentIds: string[], role: string) {
    const { tx, p } = ctx;
    const [ev] = await tx.select().from(campusEvents).where(eq(campusEvents.id, eventId));
    if (!ev) throw new ConflictException('Event not found');
    if (ev.status === 'cancelled') throw new ConflictException('A cancelled event gives no duty leave');
    const { from, to } = eventDates(ev.startsAt, ev.endsAt, await this.timezone(tx));
    const already = new Set((await tx.select({ s: eventDutyLeaves.studentId }).from(eventDutyLeaves).where(eq(eventDutyLeaves.eventId, eventId))).map((r) => r.s));
    const out: { studentId: string; excused: number }[] = [];
    for (const sid of [...new Set(studentIds)].filter((s) => !already.has(s))) {
      const [leave] = await tx
        .insert(studentLeaveRequests)
        .values({ tenantId: p.tenantId, studentId: sid, fromDate: from, toDate: to, reason: `Duty leave: ${ev.title} (${role})`, status: 'approved', requestedBy: p.userId, decidedBy: p.userId, decidedAt: this.svc.now(), decisionNote: 'Granted from the event' })
        .returning({ id: studentLeaveRequests.id });
      const excused = await tx
        .update(attendanceRecords)
        .set({ status: 'excused' })
        .where(and(eq(attendanceRecords.studentId, sid), eq(attendanceRecords.status, 'absent'), sql`${attendanceRecords.date} between ${from}::date and ${to}::date`))
        .returning({ id: attendanceRecords.id });
      await tx.insert(eventDutyLeaves).values({ tenantId: p.tenantId, eventId, studentId: sid, fromDate: from, toDate: to, role, leaveRequestId: leave.id, excusedCount: excused.length, grantedBy: p.userId });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'event.duty_leave_granted', subjectType: 'event', subjectId: eventId, data: { studentId: sid, from, to, role, excused: excused.length } });
      out.push({ studentId: sid, excused: excused.length });
    }
    return { from, to, granted: out, skipped: studentIds.length - out.length };
  }
}
