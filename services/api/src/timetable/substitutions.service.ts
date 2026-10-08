import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { departmentStaff, leaveRequests, rooms, sections, subjects, teacherSubstitutions, tenants, timetableSlots, userRoles, users } from '../db/schema.js';

export interface SubActor {
  tenantId: string;
  userId: string;
}

export type SubstituteMatch = 'subject' | 'department';

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/**
 * Substitute teachers: who covers a period when its teacher is on leave. A substitute must be free
 * (no regular period, no other substitution, not on leave) at that time; suggestions put teachers
 * of the same subject first, then the same department.
 */
@Injectable()
export class SubstitutionsService {
  constructor(private readonly clock: Clock) {}

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  private async slot(tx: Tx, slotId: string) {
    const [row] = await tx
      .select({ slot: timetableSlots, subjectName: subjects.name, departmentId: subjects.departmentId, sectionName: sections.displayName })
      .from(timetableSlots)
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(and(eq(timetableSlots.id, slotId), isNull(timetableSlots.archivedAt)));
    if (!row) throw new NotFoundException('Period not found');
    return row;
  }

  /** The approved leave covering `date` for a teacher, if any. */
  async leaveOn(tx: Tx, userId: string, date: string) {
    const [l] = await tx
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'approved'), lte(leaveRequests.fromDate, date), gte(leaveRequests.toDate, date)))
      .limit(1);
    return l ?? null;
  }

  /** Why a teacher cannot cover `slot` on `date`, or null when they are free. */
  async busyReason(tx: Tx, teacherId: string, slot: { id: string; dayOfWeek: number; startsAt: string; endsAt: string }, date: string): Promise<string | null> {
    if (await this.leaveOn(tx, teacherId, date)) return 'is on leave that day';
    const subbed = await tx
      .select({ slotId: teacherSubstitutions.slotId })
      .from(teacherSubstitutions)
      .where(and(eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.status, 'assigned')));
    const coveredElsewhere = new Set(subbed.map((s) => s.slotId));
    const regular = await tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.dayOfWeek, slot.dayOfWeek), isNull(timetableSlots.archivedAt), lt(timetableSlots.startsAt, slot.endsAt), gt(timetableSlots.endsAt, slot.startsAt), ne(timetableSlots.id, slot.id)));
    // A period that someone else is covering that day is no longer this teacher's.
    if (regular.some((r) => !coveredElsewhere.has(r.id))) return 'already has a period at that time';
    const other = await tx
      .select({ id: teacherSubstitutions.id })
      .from(teacherSubstitutions)
      .innerJoin(timetableSlots, eq(timetableSlots.id, teacherSubstitutions.slotId))
      .where(and(eq(teacherSubstitutions.substituteTeacherId, teacherId), eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.status, 'assigned'), lt(timetableSlots.startsAt, slot.endsAt), gt(timetableSlots.endsAt, slot.startsAt), ne(timetableSlots.id, slot.id)))
      .limit(1);
    if (other.length) return 'is already covering another period at that time';
    return null;
  }

  /** Free teachers of the same subject, then the same department, for a period on a date. */
  async suggest(tx: Tx, slotId: string, date: string) {
    const { slot, departmentId, subjectName, sectionName } = await this.slot(tx, slotId);
    if (weekdayOf(date) !== slot.dayOfWeek) throw new BadRequestException('This period is not on that day');
    const staff = await tx
      .selectDistinct({ id: users.id, fullName: users.fullName })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(inArray(userRoles.role, ['teacher', 'hod']), eq(users.status, 'active'), ne(users.id, slot.teacherId)))
      .orderBy(asc(users.fullName));
    if (staff.length === 0) return { slotId, date, subject: subjectName, section: sectionName, candidates: [] };
    const ids = staff.map((s) => s.id);
    const taught = await tx.select({ teacherId: timetableSlots.teacherId, subjectId: timetableSlots.subjectId, departmentId: subjects.departmentId }).from(timetableSlots).innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId)).where(and(inArray(timetableSlots.teacherId, ids), isNull(timetableSlots.archivedAt)));
    const members = departmentId ? await tx.select({ userId: departmentStaff.userId }).from(departmentStaff).where(and(eq(departmentStaff.departmentId, departmentId), inArray(departmentStaff.userId, ids))) : [];
    const inDept = new Set([...members.map((m) => m.userId), ...taught.filter((t) => departmentId && t.departmentId === departmentId).map((t) => t.teacherId)]);
    const sameSubject = new Set(taught.filter((t) => t.subjectId === slot.subjectId).map((t) => t.teacherId));
    const candidates: { id: string; fullName: string; match: SubstituteMatch; periodsThatDay: number }[] = [];
    for (const s of staff) {
      const match: SubstituteMatch | null = sameSubject.has(s.id) ? 'subject' : inDept.has(s.id) ? 'department' : null;
      if (!match) continue;
      if (await this.busyReason(tx, s.id, slot, date)) continue;
      const day = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, s.id), eq(timetableSlots.dayOfWeek, slot.dayOfWeek), isNull(timetableSlots.archivedAt)));
      candidates.push({ id: s.id, fullName: s.fullName, match, periodsThatDay: day.length });
    }
    // Same subject first, then the lightest day.
    candidates.sort((a, b) => (a.match === b.match ? 0 : a.match === 'subject' ? -1 : 1) || a.periodsThatDay - b.periodsThatDay || a.fullName.localeCompare(b.fullName));
    return { slotId, date, subject: subjectName, section: sectionName, candidates };
  }

  /** Records the substitute for one period on one date. */
  async assign(tx: Tx, actor: SubActor, input: { slotId: string; date: string; substituteTeacherId: string; reason: string }) {
    const { slot } = await this.slot(tx, input.slotId);
    if (weekdayOf(input.date) !== slot.dayOfWeek) throw new BadRequestException('This period is not on that day');
    const today = await this.today(tx);
    if (input.date < today) throw new BadRequestException('A substitute cannot be assigned for a day that has passed');
    if (input.substituteTeacherId === slot.teacherId) throw new BadRequestException('The substitute must be a different teacher');
    const [teacher] = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(users.id, input.substituteTeacherId), eq(users.status, 'active'), inArray(userRoles.role, ['teacher', 'hod', 'principal'])))
      .limit(1);
    if (!teacher) throw new BadRequestException('Choose a member of the teaching staff');
    const leave = await this.leaveOn(tx, slot.teacherId, input.date);
    if (!leave && input.reason.trim().length < 3) throw new BadRequestException('The teacher is not on approved leave that day: give a reason for the substitution');
    const [taken] = await tx.select({ id: teacherSubstitutions.id }).from(teacherSubstitutions).where(and(eq(teacherSubstitutions.slotId, slot.id), eq(teacherSubstitutions.date, input.date), eq(teacherSubstitutions.status, 'assigned')));
    if (taken) throw new ConflictException('This period already has a substitute that day: cancel it first');
    const busy = await this.busyReason(tx, input.substituteTeacherId, slot, input.date);
    if (busy) throw new ConflictException({ statusCode: 409, message: `This teacher ${busy}`, error: 'Conflict', code: 'SUBSTITUTE_BUSY' });
    const [row] = await tx
      .insert(teacherSubstitutions)
      .values({ tenantId: actor.tenantId, slotId: slot.id, date: input.date, originalTeacherId: slot.teacherId, substituteTeacherId: input.substituteTeacherId, reason: input.reason.trim(), leaveRequestId: leave?.id ?? null, createdBy: actor.userId })
      .returning();
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'timetable.substitution_assigned', subjectType: 'timetable_slot', subjectId: slot.id, data: { date: input.date, substituteTeacherId: input.substituteTeacherId, originalTeacherId: slot.teacherId, leaveRequestId: leave?.id ?? null } });
    return this.view(tx, row.id);
  }

  async cancel(tx: Tx, actor: SubActor, id: string) {
    const [row] = await tx.select().from(teacherSubstitutions).where(eq(teacherSubstitutions.id, id));
    if (!row) throw new NotFoundException('Substitution not found');
    if (row.status === 'cancelled') throw new BadRequestException('This substitution is already cancelled');
    await tx.update(teacherSubstitutions).set({ status: 'cancelled' }).where(eq(teacherSubstitutions.id, id));
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'timetable.substitution_cancelled', subjectType: 'timetable_slot', subjectId: row.slotId, data: { date: row.date } });
    return this.view(tx, id);
  }

  private select(tx: Tx) {
    const original = users;
    return tx
      .select({
        id: teacherSubstitutions.id,
        slotId: teacherSubstitutions.slotId,
        date: teacherSubstitutions.date,
        status: teacherSubstitutions.status,
        reason: teacherSubstitutions.reason,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
        section: { id: sections.id, displayName: sections.displayName },
        subject: { id: subjects.id, code: subjects.code, name: subjects.name },
        room: rooms.name,
        originalTeacherId: teacherSubstitutions.originalTeacherId,
        substituteTeacherId: teacherSubstitutions.substituteTeacherId,
        originalTeacher: original.fullName,
        createdAt: teacherSubstitutions.createdAt,
      })
      .from(teacherSubstitutions)
      .innerJoin(timetableSlots, eq(timetableSlots.id, teacherSubstitutions.slotId))
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(original, eq(original.id, teacherSubstitutions.originalTeacherId))
      .leftJoin(rooms, eq(rooms.id, timetableSlots.roomId))
      .$dynamic();
  }

  async view(tx: Tx, id: string) {
    const [row] = await this.select(tx).where(eq(teacherSubstitutions.id, id));
    const [sub] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, row.substituteTeacherId));
    return { ...row, substituteTeacher: sub?.fullName ?? null };
  }

  /** Substitutions in a date range, for the office. */
  async list(tx: Tx, from: string, to: string) {
    const rows = await this.select(tx).where(and(gte(teacherSubstitutions.date, from), lte(teacherSubstitutions.date, to))).orderBy(asc(teacherSubstitutions.date), asc(timetableSlots.startsAt));
    const ids = [...new Set(rows.map((r) => r.substituteTeacherId))];
    const names = ids.length ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids)) : [];
    const byId = new Map(names.map((n) => [n.id, n.name]));
    return rows.map((r) => ({ ...r, substituteTeacher: byId.get(r.substituteTeacherId) ?? null }));
  }

  /** The periods a teacher covers for others from `from` to `to`: what the Teacher App shows. */
  async mine(tx: Tx, userId: string, from: string, to: string) {
    return this.select(tx)
      .where(and(eq(teacherSubstitutions.substituteTeacherId, userId), eq(teacherSubstitutions.status, 'assigned'), gte(teacherSubstitutions.date, from), lte(teacherSubstitutions.date, to)))
      .orderBy(asc(teacherSubstitutions.date), asc(timetableSlots.startsAt));
  }

  /** Periods of teachers on approved leave that day which nobody covers yet. */
  async needed(tx: Tx, date: string) {
    const weekday = weekdayOf(date);
    const onLeave = await tx
      .select({ userId: leaveRequests.userId, leaveRequestId: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.status, 'approved'), lte(leaveRequests.fromDate, date), gte(leaveRequests.toDate, date)));
    if (onLeave.length === 0) return [];
    const slots = await tx
      .select({ slotId: timetableSlots.id, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt, teacherId: timetableSlots.teacherId, teacher: users.fullName, section: sections.displayName, subject: subjects.name })
      .from(timetableSlots)
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .where(and(inArray(timetableSlots.teacherId, onLeave.map((l) => l.userId)), eq(timetableSlots.dayOfWeek, weekday), isNull(timetableSlots.archivedAt)))
      .orderBy(asc(timetableSlots.startsAt));
    const covered = await tx.select({ slotId: teacherSubstitutions.slotId }).from(teacherSubstitutions).where(and(eq(teacherSubstitutions.date, date), eq(teacherSubstitutions.status, 'assigned')));
    const done = new Set(covered.map((c) => c.slotId));
    return slots.filter((s) => !done.has(s.slotId)).map((s) => ({ ...s, date, leaveRequestId: onLeave.find((l) => l.userId === s.teacherId)?.leaveRequestId ?? null }));
  }
}
