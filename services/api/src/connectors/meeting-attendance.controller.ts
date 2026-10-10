import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceRecords, classMeetings, guardians, meetingAttendanceProposals, students, tenants, timetableSlots, users } from '../db/schema.js';
import { ConnectorAdapters, type MeetingParticipant } from './adapters.js';
import { ConnectorsService } from './connectors.service.js';

const TEACHING: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
const ADMINS: RoleName[] = ['tenant_admin', 'principal'];
const ConfirmBody = z.object({ entries: z.array(z.object({ studentId: z.uuid(), status: z.enum(['present', 'absent', 'late', 'excused']) })).min(1).max(500) });

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Suggested status for one student from the participant report: present for at least half the class, late if they joined after the first ten minutes. */
export function proposeStatus(p: MeetingParticipant | undefined, meeting: { startsAt: Date; durationMin: number }): { status: 'present' | 'absent' | 'late'; minutes: number } {
  if (!p) return { status: 'absent', minutes: 0 };
  if (p.minutes * 2 < meeting.durationMin) return { status: 'absent', minutes: p.minutes };
  const late = !!p.joinedAt && Date.parse(p.joinedAt) > meeting.startsAt.getTime() + 10 * 60_000;
  return { status: late ? 'late' : 'present', minutes: p.minutes };
}

/** Online classes: who may join, the participant report as suggested attendance, and the teacher's confirmation. */
@Controller('v1/connectors/video')
export class MeetingAttendanceController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ConnectorsService,
    private readonly adapters: ConnectorAdapters,
  ) {}

  /** The online classes a signed-in person can join: a teacher's own, a student's section's, or their children's. */
  @Get('mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const isTeacher = p.roles.some((r) => TEACHING.includes(r));
      let sectionIds: string[] = [];
      if (!isTeacher) {
        const own = await tx.select({ s: students.sectionId }).from(students).where(eq(students.userId, p.userId));
        const kids = await tx.select({ s: students.sectionId }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(guardians.userId, p.userId));
        sectionIds = [...new Set([...own, ...kids].map((x) => x.s))];
        if (!sectionIds.length) return [];
      }
      return this.listFor(tx, isTeacher ? { teacherId: p.userId, all: p.roles.some((r) => ADMINS.includes(r)) } : { sectionIds }, !isTeacher);
    });
  }

  /** The paired teacher's online classes for the smartboard. */
  @Get('board')
  @Auth('board')
  board(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.listFor(tx, { teacherId: p.teacherId, all: false }, false));
  }

  private async listFor(tx: Tx, who: { teacherId: string; all: boolean } | { sectionIds: string[] }, hideHost: boolean) {
    const from = new Date(Date.now() - 3 * 3600_000);
    const to = new Date(Date.now() + 7 * 86_400_000);
    const rows = await tx
      .select({ m: classMeetings, sectionId: timetableSlots.sectionId, slotTeacher: timetableSlots.teacherId })
      .from(classMeetings)
      .leftJoin(timetableSlots, eq(timetableSlots.id, classMeetings.slotId))
      .where(and(gte(classMeetings.startsAt, from), lte(classMeetings.startsAt, to)))
      .orderBy(asc(classMeetings.startsAt))
      .limit(200);
    return rows
      .filter((r) => ('sectionIds' in who ? !!r.sectionId && who.sectionIds.includes(r.sectionId) : who.all || r.m.createdBy === who.teacherId || r.slotTeacher === who.teacherId))
      .map((r) => ({ id: r.m.id, provider: r.m.provider, topic: r.m.topic, startsAt: r.m.startsAt, durationMin: r.m.durationMin, joinUrl: r.m.joinUrl, hostUrl: hideHost ? null : r.m.hostUrl, slotId: r.m.slotId }));
  }

  /** Pulls the provider's participant report and suggests attendance for the section. Nothing is marked until the teacher confirms. */
  @Post('meetings/:id/participants/pull')
  @Auth('user', TEACHING)
  async pull(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const { meeting, conn } = await this.db.withTenant(p.tenantId, async (tx) => {
      const meeting = await this.ownMeeting(tx, p, id);
      if (!meeting.slotId) throw new BadRequestException('Only a class from the timetable can be turned into attendance');
      return { meeting, conn: await this.svc.resolve(tx, p.tenantId, 'lms_video', meeting.connectorId ?? undefined) };
    });
    // The provider call happens outside the transaction.
    const participants = await this.adapters.meetingParticipants(conn.config, { externalId: meeting.externalId, joinUrl: meeting.joinUrl });
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.update(classMeetings).set({ participants, participantsPulledAt: new Date() }).where(eq(classMeetings.id, id));
      const [slot] = await tx.select({ sectionId: timetableSlots.sectionId }).from(timetableSlots).where(eq(timetableSlots.id, meeting.slotId!));
      const roster = await tx
        .select({ id: students.id, fullName: students.fullName, email: users.email })
        .from(students)
        .leftJoin(users, eq(users.id, students.userId))
        .where(and(eq(students.sectionId, slot.sectionId), eq(students.status, 'active')));
      const byEmail = new Map(participants.filter((x) => x.email).map((x) => [x.email!.toLowerCase(), x]));
      const byName = new Map(participants.map((x) => [norm(x.name), x]));
      const used = new Set<MeetingParticipant>();
      await tx.delete(meetingAttendanceProposals).where(and(eq(meetingAttendanceProposals.meetingId, id)));
      const proposals = roster.map((s) => {
        const hit = (s.email ? byEmail.get(s.email.toLowerCase()) : undefined) ?? byName.get(norm(s.fullName));
        if (hit) used.add(hit);
        const prop = proposeStatus(hit, meeting);
        return { tenantId: p.tenantId, meetingId: id, studentId: s.id, status: prop.status, minutes: prop.minutes, sourceName: hit?.name ?? null };
      });
      if (proposals.length) await tx.insert(meetingAttendanceProposals).values(proposals);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'meeting.participants_pulled', subjectType: 'class_meeting', subjectId: id, data: { participants: participants.length, students: roster.length } });
      return this.proposalView(tx, id, participants, used);
    });
  }

  @Get('meetings/:id/attendance')
  @Auth('user', TEACHING)
  proposals(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.ownMeeting(tx, p, id);
      return this.proposalView(tx, id, m.participants ?? [], new Set());
    });
  }

  /** The teacher's decision: these marks are written to the section's attendance for that class. */
  @Post('meetings/:id/attendance/confirm')
  @Auth('user', TEACHING)
  confirm(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConfirmBody)) b: z.infer<typeof ConfirmBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.ownMeeting(tx, p, id);
      if (!m.slotId) throw new BadRequestException('Only a class from the timetable can be turned into attendance');
      const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, m.slotId));
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
      const date = localParts(m.startsAt, tenant?.timezone ?? 'Asia/Kolkata').date;
      const ids = b.entries.map((e) => e.studentId);
      const roster = new Set((await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, slot.sectionId), inArray(students.id, ids)))).map((s) => s.id));
      if (ids.some((x) => !roster.has(x))) throw new BadRequestException('A student is not in this class');
      const now = new Date();
      for (const e of b.entries) {
        await tx
          .insert(attendanceRecords)
          .values({ tenantId: p.tenantId, studentId: e.studentId, sectionId: slot.sectionId, date, timetableSlotId: slot.id, status: e.status, markedBy: p.userId, occurredAt: now })
          .onConflictDoUpdate({ target: [attendanceRecords.studentId, attendanceRecords.date, attendanceRecords.timetableSlotId], set: { status: e.status, markedBy: p.userId, occurredAt: now, updatedAt: now } });
        await tx.update(meetingAttendanceProposals).set({ confirmedStatus: e.status, confirmedBy: p.userId, confirmedAt: now }).where(and(eq(meetingAttendanceProposals.meetingId, id), eq(meetingAttendanceProposals.studentId, e.studentId)));
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'meeting.attendance_confirmed', subjectType: 'class_meeting', subjectId: id, data: { date, marked: b.entries.length } });
      return { marked: b.entries.length, date };
    });
  }

  private async ownMeeting(tx: Tx, p: UserPrincipal, id: string) {
    const [row] = await tx
      .select({ m: classMeetings, teacherId: timetableSlots.teacherId })
      .from(classMeetings)
      .leftJoin(timetableSlots, eq(timetableSlots.id, classMeetings.slotId))
      .where(and(eq(classMeetings.id, id), p.roles.some((r) => ADMINS.includes(r)) ? undefined : or(eq(classMeetings.createdBy, p.userId), eq(timetableSlots.teacherId, p.userId))));
    if (!row) throw new NotFoundException('Meeting not found');
    return row.m;
  }

  private async proposalView(tx: Tx, meetingId: string, participants: MeetingParticipant[], used: Set<MeetingParticipant>) {
    const rows = await tx
      .select({ studentId: meetingAttendanceProposals.studentId, name: students.fullName, rollNo: students.rollNo, status: meetingAttendanceProposals.status, minutes: meetingAttendanceProposals.minutes, sourceName: meetingAttendanceProposals.sourceName, confirmedStatus: meetingAttendanceProposals.confirmedStatus })
      .from(meetingAttendanceProposals)
      .innerJoin(students, eq(students.id, meetingAttendanceProposals.studentId))
      .where(eq(meetingAttendanceProposals.meetingId, meetingId))
      .orderBy(asc(students.rollNo));
    const matchedNames = new Set(rows.map((r) => r.sourceName).filter(Boolean));
    return { meetingId, proposals: rows, unmatched: participants.filter((x) => !used.has(x) && !matchedNames.has(x.name)) };
  }
}
