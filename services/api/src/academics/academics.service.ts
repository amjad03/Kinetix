import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { academicRequests, academicSettings, auditLog, guardians, rooms, sections, students, timetableSlots, userRoles, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LifecycleService } from '../students/lifecycle.service.js';
import { SubstitutionsService } from '../timetable/substitutions.service.js';
import { ACADEMIC_WORKFLOWS, canDecideStep, canRaise, decide, formatSeries, initialSteps, nextRoll, SETTINGS_DEFAULTS, SETTINGS_SCHEMAS, settingsProblem, type RequestKind, type Series, type Settings, type SettingsKind } from './academics-rules.js';

/** Settings, numbering, notifications and the approval engine shared by the academics controllers. */
@Injectable()
export class AcademicsService {
  constructor(
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: LifecycleService,
    private readonly subs: SubstitutionsService,
  ) {}

  now() {
    return this.clock.now();
  }

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  /** The tenant's settings of one kind, filled in from the defaults for anything not saved yet. */
  async settings<K extends SettingsKind>(tx: Tx, kind: K): Promise<Settings<K>> {
    const [row] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, kind));
    const merged = { ...SETTINGS_DEFAULTS[kind], ...(row?.value ?? {}) };
    const parsed = SETTINGS_SCHEMAS[kind].safeParse(merged);
    return (parsed.success ? parsed.data : SETTINGS_DEFAULTS[kind]) as Settings<K>;
  }

  async saveSettings(tx: Tx, p: UserPrincipal, kind: SettingsKind, value: unknown) {
    // Values a form does not send keep what is saved (a form made before a setting was added does not reset it).
    const current = await this.settings(tx, kind);
    const parsed = SETTINGS_SCHEMAS[kind].safeParse(value && typeof value === 'object' && !Array.isArray(value) ? { ...current, ...value } : value);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Check the settings');
    const problem = settingsProblem(kind, parsed.data as Record<string, unknown>);
    if (problem) throw new BadRequestException(problem);
    const v = parsed.data as Record<string, unknown>;
    await tx
      .insert(academicSettings)
      .values({ tenantId: p.tenantId, kind, value: v, updatedBy: p.userId })
      .onConflictDoUpdate({ target: [academicSettings.tenantId, academicSettings.kind], set: { value: v, updatedBy: p.userId, updatedAt: this.now() } });
    await auditUser(tx, p, 'academics.settings_saved', 'academic_settings', undefined, { kind });
    return this.settings(tx, kind);
  }

  /** Takes the next number of a series and moves the series on (the settings row is locked meanwhile). */
  async takeNumber(tx: Tx, tenantId: string, key: 'admission' | 'tc' | 'request'): Promise<string> {
    const [row] = await tx.select().from(academicSettings).where(eq(academicSettings.kind, 'numbering')).for('update');
    const cur = await this.settings(tx, 'numbering');
    const s: Series = cur[key];
    const out = formatSeries(s, this.now());
    const value = { ...cur, [key]: { ...s, next: s.next + 1 } };
    if (row) await tx.update(academicSettings).set({ value }).where(eq(academicSettings.id, row.id));
    else await tx.insert(academicSettings).values({ tenantId, kind: 'numbering', value });
    return out;
  }

  async rollFor(tx: Tx, sectionId: string): Promise<string> {
    const n = await this.settings(tx, 'numbering');
    const rows = await tx.select({ r: students.rollNo }).from(students).where(eq(students.sectionId, sectionId));
    return nextRoll(rows.map((x) => x.r), n.roll);
  }

  async usersWithRole(tx: Tx, roles: string[]): Promise<string[]> {
    const rows = await tx.select({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles as (typeof userRoles.role.enumValues)[number][]));
    return [...new Set(rows.map((r) => r.id))];
  }

  async family(tx: Tx, studentId: string): Promise<string[]> {
    const [s] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
    const g = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId));
    return [...new Set([s?.userId, ...g.map((x) => x.userId)].filter((x): x is string => !!x))];
  }

  async notify(tx: Tx, userIds: string[], title: string, body: string, key: string, data: Record<string, string>) {
    await this.notifications.notifyUsers(tx, [...new Set(userIds)], { kind: 'task', text: { title, body }, data, dedupeKey: key });
  }

  /** Audit history of one record, newest first, with the actor's name. */
  async activity(tx: Tx, subjectIds: string[], limit = 60) {
    if (subjectIds.length === 0) return [];
    return tx
      .select({ id: auditLog.id, action: auditLog.action, at: auditLog.at, actor: users.fullName, data: auditLog.data })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(inArray(auditLog.subjectId, subjectIds))
      .orderBy(desc(auditLog.at))
      .limit(limit);
  }

  // -------------------------------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------------------------------

  async raise(tx: Tx, p: UserPrincipal, kind: RequestKind, input: { studentId?: string; reason: string; payload: Record<string, unknown> }) {
    if (!canRaise(kind, p.roles)) throw new ForbiddenException('You cannot raise this request');
    const title = await this.validate(tx, p, kind, input.studentId ?? null, input.payload);
    if (input.studentId) {
      const [open] = await tx.select({ id: academicRequests.id }).from(academicRequests).where(and(eq(academicRequests.studentId, input.studentId), eq(academicRequests.kind, kind), eq(academicRequests.status, 'pending')));
      if (open) throw new ConflictException('This student already has an open request of this kind');
    }
    const number = await this.takeNumber(tx, p.tenantId, 'request');
    const [row] = await tx
      .insert(academicRequests)
      .values({ tenantId: p.tenantId, number, kind, studentId: input.studentId ?? null, title, reason: input.reason.trim(), payload: input.payload, steps: initialSteps(kind), requestedBy: p.userId })
      .returning();
    await auditUser(tx, p, 'academics.request_raised', 'academic_request', row.id, { kind, number });
    const roles = ACADEMIC_WORKFLOWS[kind].steps[0].roles;
    await this.notify(tx, (await this.usersWithRole(tx, roles)).filter((u) => u !== p.userId), `Approval needed: ${number}`, title, `acad:${row.id}:0`, { requestId: row.id });
    return row;
  }

  /** Checks a request's payload against the records and returns its title. */
  private async validate(tx: Tx, p: UserPrincipal, kind: RequestKind, studentId: string | null, payload: Record<string, unknown>): Promise<string> {
    const student = studentId ? (await tx.select().from(students).where(eq(students.id, studentId)))[0] : undefined;
    if (studentId && !student) throw new NotFoundException('Student not found');
    if (p.roles.includes('guardian') && !p.roles.some((r) => r !== 'guardian' && r !== 'student')) {
      if (!studentId || !(await this.family(tx, studentId)).includes(p.userId)) throw new ForbiddenException('You can only raise requests for your own child');
    }
    const section = async (id: unknown) => {
      const [s] = typeof id === 'string' ? await tx.select().from(sections).where(eq(sections.id, id)) : [];
      if (!s) throw new BadRequestException('Choose a class');
      return s;
    };
    switch (kind) {
      case 'admission_handover': {
        if (!student) throw new BadRequestException('Choose the student');
        if (student.status !== 'enrolled') throw new ConflictException('Only an enrolled student can be handed over');
        const s = await section(payload.sectionId ?? student.sectionId);
        return `Handover of ${student.fullName} to ${s.displayName}`;
      }
      case 'section_change': {
        if (!student) throw new BadRequestException('Choose the student');
        const s = await section(payload.sectionId);
        if (s.id === student.sectionId) throw new BadRequestException('The student is already in this class');
        return `${student.fullName}: move to ${s.displayName}`;
      }
      case 'withdrawal': {
        if (!student) throw new BadRequestException('Choose the student');
        if (!['active', 'enrolled', 'on_leave', 'detained'].includes(student.status)) throw new ConflictException('This student is not on the rolls');
        if (payload.outcome !== 'transferred' && payload.outcome !== 'dropped') throw new BadRequestException('Choose transfer or withdrawal');
        if (typeof payload.lastDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.lastDay)) throw new BadRequestException('Give the last day');
        return `${payload.outcome === 'transferred' ? 'Transfer certificate' : 'Withdrawal'}: ${student.fullName}`;
      }
      case 'timetable_change': {
        const slot = await this.slot(tx, payload.slotId);
        const day = payload.dayOfWeek ?? slot.dayOfWeek;
        if (typeof day !== 'number' || day < 1 || day > 7) throw new BadRequestException('Choose a day');
        for (const k of ['startsAt', 'endsAt'] as const) if (payload[k] !== undefined && (typeof payload[k] !== 'string' || !/^\d{2}:\d{2}$/.test(payload[k] as string))) throw new BadRequestException('Give times as HH:MM');
        if (!p.roles.some((r) => r !== 'teacher') && slot.teacherId !== p.userId) throw new ForbiddenException('You can only ask to change your own periods');
        return `Timetable change: ${slot.section} ${slot.subject}`;
      }
      case 'substitution': {
        const slot = await this.slot(tx, payload.slotId);
        if (typeof payload.date !== 'string' || typeof payload.substituteTeacherId !== 'string') throw new BadRequestException('Give the date and the substitute');
        return `Substitute for ${slot.section} ${slot.subject} on ${payload.date}`;
      }
    }
  }

  private async slot(tx: Tx, id: unknown) {
    if (typeof id !== 'string') throw new BadRequestException('Choose the period');
    const [s] = await tx
      .select({ id: timetableSlots.id, teacherId: timetableSlots.teacherId, dayOfWeek: timetableSlots.dayOfWeek, startsAt: timetableSlots.startsAt, endsAt: timetableSlots.endsAt, roomId: timetableSlots.roomId, section: sections.displayName, subject: sql<string>`(select name from subjects where id = ${timetableSlots.subjectId})` })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(and(eq(timetableSlots.id, id), isNull(timetableSlots.archivedAt)));
    if (!s) throw new BadRequestException('That period is not on the timetable');
    return s;
  }

  async decide(tx: Tx, p: UserPrincipal, id: string, decision: 'approve' | 'reject', note: string | undefined, extra: Record<string, unknown> = {}) {
    const [cur] = await tx.select().from(academicRequests).where(eq(academicRequests.id, id)).for('update');
    if (!cur) throw new NotFoundException('Request not found');
    if (cur.status !== 'pending') throw new ConflictException('This request is already closed');
    const kind = cur.kind as RequestKind;
    if (!canDecideStep(kind, cur.steps, p.roles)) throw new ForbiddenException('This step is not yours to decide');
    const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, p.userId));
    let next: ReturnType<typeof decide>;
    try {
      next = decide(cur.steps, decision, { id: p.userId, name: me?.name ?? '', at: this.now().toISOString(), note });
    } catch {
      throw new BadRequestException('Give a reason for rejecting');
    }
    const payload = { ...cur.payload, ...extra };
    const outcome = next.status === 'approved' ? await this.apply(tx, p, cur.kind as RequestKind, cur.studentId, payload, cur.reason) : null;
    const [row] = await tx
      .update(academicRequests)
      .set({ steps: next.steps, status: next.status, payload, outcome, decidedAt: next.status === 'pending' ? null : this.now(), version: cur.version + 1, updatedAt: this.now() })
      .where(eq(academicRequests.id, id))
      .returning();
    await auditUser(tx, p, `academics.request_${decision === 'approve' ? (next.status === 'approved' ? 'approved' : 'step_approved') : 'rejected'}`, 'academic_request', id, { kind, note: note ?? null, outcome });
    // Tell the requester at every step; the family hears the outcome of decisions about their child.
    const label = next.status === 'pending' ? 'moved to the next approval' : next.status;
    const to = [cur.requestedBy, ...(next.status !== 'pending' && cur.studentId && kind !== 'admission_handover' ? await this.family(tx, cur.studentId) : [])].filter((u) => u !== p.userId);
    await this.notify(tx, to, `${cur.number}: ${label}`, cur.title, `acad:${id}:${row.version}`, { requestId: id });
    if (next.status === 'pending') {
      const step = ACADEMIC_WORKFLOWS[kind].steps.find((s) => s.key === next.steps.find((x) => x.state === 'current')?.key);
      if (step) await this.notify(tx, (await this.usersWithRole(tx, step.roles)).filter((u) => u !== p.userId), `Approval needed: ${cur.number}`, cur.title, `acad:${id}:${row.version}:next`, { requestId: id });
    }
    return row;
  }

  /** What an approved request changes in the records. */
  private async apply(tx: Tx, p: UserPrincipal, kind: RequestKind, studentId: string | null, payload: Record<string, unknown>, reason: string): Promise<Record<string, unknown>> {
    switch (kind) {
      case 'admission_handover': {
        const [s] = await tx.select().from(students).where(eq(students.id, studentId!));
        const sectionId = (payload.sectionId as string | undefined) ?? s.sectionId;
        if (sectionId !== s.sectionId) await this.lifecycle.changeSection(tx, p, s.id, sectionId, reason || 'Class allotted at handover');
        const rollNo = await this.rollFor(tx, sectionId);
        const admissionNo = await this.takeNumber(tx, p.tenantId, 'admission');
        await tx.update(students).set({ rollNo, enrolledOn: s.enrolledOn ?? (await this.today(tx)) }).where(eq(students.id, s.id));
        await this.lifecycle.changeStatus(tx, p, s.id, 'active', { reason: 'Admission handover complete' });
        return { rollNo, admissionNo, sectionId };
      }
      case 'section_change': {
        await this.lifecycle.changeSection(tx, p, studentId!, payload.sectionId as string, reason || 'Section change approved');
        return { sectionId: payload.sectionId };
      }
      case 'withdrawal': {
        const tcNumber = payload.outcome === 'transferred' ? await this.takeNumber(tx, p.tenantId, 'tc') : null;
        await this.lifecycle.changeStatus(tx, p, studentId!, payload.outcome as 'transferred' | 'dropped', { reason: reason || 'Withdrawn on request', effectiveOn: payload.lastDay as string });
        return { tcNumber, status: payload.outcome, lastDay: payload.lastDay };
      }
      case 'timetable_change': {
        const slot = await this.slot(tx, payload.slotId);
        const patch = {
          dayOfWeek: (payload.dayOfWeek as number | undefined) ?? slot.dayOfWeek,
          startsAt: (payload.startsAt as string | undefined) ?? slot.startsAt,
          endsAt: (payload.endsAt as string | undefined) ?? slot.endsAt,
          teacherId: (payload.teacherId as string | undefined) ?? slot.teacherId,
          roomId: payload.roomId === undefined ? slot.roomId : (payload.roomId as string | null),
        };
        if (patch.endsAt <= patch.startsAt) throw new BadRequestException('The period must end after it starts');
        const overlap = and(eq(timetableSlots.dayOfWeek, patch.dayOfWeek), isNull(timetableSlots.archivedAt), ne(timetableSlots.id, slot.id), sql`${timetableSlots.startsAt} < ${patch.endsAt}::time and ${timetableSlots.endsAt} > ${patch.startsAt}::time`);
        const [teacherBusy] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(overlap, eq(timetableSlots.teacherId, patch.teacherId)));
        if (teacherBusy) throw new ConflictException('The teacher already has a period at that time');
        if (patch.roomId) {
          const [roomBusy] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(overlap, eq(timetableSlots.roomId, patch.roomId)));
          if (roomBusy) throw new ConflictException('The room is taken at that time');
          const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, patch.roomId));
          if (!room) throw new BadRequestException('Unknown room');
        }
        await tx.update(timetableSlots).set(patch).where(eq(timetableSlots.id, slot.id));
        await auditUser(tx, p, 'timetable.slot_changed', 'timetable_slot', slot.id, { from: slot, to: patch });
        return patch;
      }
      case 'substitution': {
        const sub = await this.subs.assign(tx, p, { slotId: payload.slotId as string, date: payload.date as string, substituteTeacherId: payload.substituteTeacherId as string, reason: reason || 'Approved substitution' });
        await this.notify(tx, [payload.substituteTeacherId as string], 'You are covering a period', `${payload.date}`, `acad:sub:${sub.id}`, { substitutionId: sub.id });
        return { substitutionId: sub.id };
      }
    }
  }
}
