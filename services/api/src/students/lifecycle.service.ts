import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionsEvents, LOGIN_DISABLED_STATUSES, READMIT_FROM, STUDENT_APPROVER_STATUSES, STUDENT_TRANSITIONS, transitionProblem, type StudentStatus } from '@kinetix/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, certificateTemplates, certificates, guardians, programs, promotionBatches, sections, studentLifecycleEvents, students, tenants, userRoles, users } from '../db/schema.js';

export interface LifecycleActor {
  tenantId: string;
  userId: string;
}

export interface PromotionMapping {
  fromSectionId: string;
  /** The class they move to; null graduates a final-term class (students become alumni). */
  toSectionId: string | null;
}

/**
 * The student lifecycle: status changes with their rules, reasons and permanent record, section
 * moves, bulk promotion and guardians. Everything goes through here so the record is complete.
 */
@Injectable()
export class LifecycleService {
  constructor(private readonly clock: Clock) {}

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.timezone ?? 'Asia/Kolkata').date;
  }

  /** The student with their class and program; `finalTerm` is whether the class is the program's last term. */
  async load(tx: Tx, studentId: string, lock = false) {
    const q = tx
      .select({ student: students, section: sections, termCount: programs.termCount, programName: programs.name, programId: programs.id })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(students.id, studentId));
    const [row] = await (lock ? q.for('update', { of: students }) : q);
    if (!row) throw new NotFoundException('Student not found');
    return { ...row, finalTerm: row.section.term >= row.termCount };
  }

  /** The statuses this student may move to now, for showing only valid actions. */
  allowedStatuses(status: string, finalTerm: boolean): StudentStatus[] {
    const from = status as StudentStatus;
    return (STUDENT_TRANSITIONS[from] ?? []).filter((to) => transitionProblem(from, to, { reason: 'x'.repeat(3), finalTerm }) === null);
  }

  async addEvent(tx: Tx, a: LifecycleActor, e: Partial<typeof studentLifecycleEvents.$inferInsert> & { studentId: string; kind: 'status' | 'promotion' | 'section' | 'guardian' }) {
    await tx.insert(studentLifecycleEvents).values({ actorId: a.userId, ...e, effectiveOn: e.effectiveOn ?? (await this.today(tx)), tenantId: a.tenantId });
  }

  /**
   * Changes a student's status. Validates the move, records the event (with reason, effective date,
   * approver and, where they apply, the return date and transfer certificate) and audits it.
   */
  async changeStatus(
    tx: Tx,
    actor: LifecycleActor,
    studentId: string,
    to: StudentStatus,
    opts: { reason?: string | null; effectiveOn?: string; batchId?: string; kind?: 'status' | 'promotion'; returnOn?: string | null; approverId?: string | null; certificateId?: string | null } = {},
  ) {
    const ctx = await this.load(tx, studentId, true);
    const from = ctx.student.status as StudentStatus;
    const problem = transitionProblem(from, to, { reason: opts.reason, finalTerm: ctx.finalTerm });
    if (problem) throw new BadRequestException(problem);
    const effectiveOn = opts.effectiveOn ?? (await this.today(tx));
    if (to === 'on_leave' && !opts.returnOn) throw new BadRequestException('Give the date the student returns from leave');
    if (opts.returnOn && opts.returnOn < effectiveOn) throw new BadRequestException('The return date cannot be before the leave starts');
    const approverId = STUDENT_APPROVER_STATUSES.includes(to) ? await this.approver(tx, opts.approverId ?? actor.userId) : null;
    const certificateId = to === 'transferred' ? await this.transferCertificate(tx, studentId, opts.certificateId ?? null) : null;
    await tx.update(students).set({ status: to, statusChangedAt: this.clockNow(), updatedAt: this.clockNow() }).where(eq(students.id, studentId));
    await this.addEvent(tx, actor, {
      studentId,
      kind: opts.kind ?? 'status',
      fromStatus: from,
      toStatus: to,
      fromSectionId: ctx.student.sectionId,
      toSectionId: ctx.student.sectionId,
      reason: opts.reason?.trim() || null,
      effectiveOn,
      returnOn: to === 'on_leave' || to === 'suspended' ? (opts.returnOn ?? null) : null,
      approverId,
      certificateId,
      batchId: opts.batchId,
    });
    // A student who has left cannot sign in; a graduate (alumni) keeps their account.
    if (LOGIN_DISABLED_STATUSES.includes(to) && ctx.student.userId) await this.disableIfOnlyStudent(tx, ctx.student.userId);
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: AdmissionsEvents.StudentStatusChanged, subjectType: 'student', subjectId: studentId, data: { from, to, reason: opts.reason ?? null, batchId: opts.batchId ?? null, effectiveOn, returnOn: opts.returnOn ?? null, approverId, certificateId } });
    return { id: studentId, from, to, effectiveOn, approverId, certificateId, returnOn: opts.returnOn ?? null };
  }

  /**
   * Readmits a student who dropped out, was transferred out or was expelled: they become active
   * again, in their old class or another class of the same program. Needs a reason and an approver.
   */
  async readmit(tx: Tx, actor: LifecycleActor, studentId: string, input: { reason: string; sectionId?: string; effectiveOn?: string; approverId?: string | null }) {
    const ctx = await this.load(tx, studentId, true);
    const from = ctx.student.status as StudentStatus;
    if (!READMIT_FROM.includes(from)) throw new BadRequestException(`A student who is ${from.replace('_', ' ')} cannot be readmitted`);
    if (input.reason.trim().length < 3) throw new BadRequestException('Give a reason for the readmission');
    let sectionId = ctx.student.sectionId;
    if (input.sectionId && input.sectionId !== sectionId) {
      const [target] = await tx.select().from(sections).where(eq(sections.id, input.sectionId));
      if (!target) throw new NotFoundException('Class not found');
      if (target.programId !== ctx.section.programId) throw new BadRequestException('Choose a class of the same program');
      sectionId = target.id;
    }
    const approverId = await this.approver(tx, input.approverId ?? actor.userId);
    const effectiveOn = input.effectiveOn ?? (await this.today(tx));
    const rollNo = sectionId === ctx.student.sectionId ? ctx.student.rollNo : await this.freeRollNo(tx, sectionId, ctx.student.rollNo);
    await tx.update(students).set({ status: 'active', sectionId, rollNo, statusChangedAt: this.clockNow(), updatedAt: this.clockNow() }).where(eq(students.id, studentId));
    await this.addEvent(tx, actor, { studentId, kind: 'status', fromStatus: from, toStatus: 'active', fromSectionId: ctx.student.sectionId, toSectionId: sectionId, reason: input.reason.trim(), effectiveOn, approverId, data: { readmission: true, rollNo } });
    if (ctx.student.userId) {
      const [u] = await tx.select({ status: users.status }).from(users).where(eq(users.id, ctx.student.userId));
      if (u?.status === 'disabled') await tx.update(users).set({ status: 'active', updatedAt: this.clockNow() }).where(eq(users.id, ctx.student.userId));
    }
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'students.readmitted.v1', subjectType: 'student', subjectId: studentId, data: { from, reason: input.reason, sectionId, approverId } });
    return { id: studentId, from, to: 'active' as const, sectionId, rollNo, approverId };
  }

  /** The approver must be a staff member of the institution, not a student or guardian. */
  private async approver(tx: Tx, userId: string): Promise<string> {
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.userId, userId), eq(users.status, 'active')));
    if (roles.length === 0 || roles.every((r) => r.role === 'student' || r.role === 'guardian')) throw new BadRequestException('Choose a staff member as the approver');
    return userId;
  }

  /** Validates the linked transfer certificate, or finds the student's latest issued one. */
  private async transferCertificate(tx: Tx, studentId: string, certificateId: string | null): Promise<string | null> {
    const q = tx
      .select({ id: certificates.id, status: certificates.status, studentId: certificates.studentId, kind: certificateTemplates.kind })
      .from(certificates)
      .innerJoin(certificateTemplates, eq(certificateTemplates.id, certificates.templateId));
    if (certificateId) {
      const [c] = await q.where(eq(certificates.id, certificateId));
      if (!c || c.studentId !== studentId) throw new BadRequestException('That certificate does not belong to this student');
      if (c.kind !== 'transfer_certificate') throw new BadRequestException('Link a transfer certificate');
      if (c.status !== 'issued') throw new BadRequestException('The transfer certificate has not been issued yet');
      return c.id;
    }
    const [latest] = await q.where(and(eq(certificates.studentId, studentId), eq(certificates.status, 'issued'), eq(certificateTemplates.kind, 'transfer_certificate'))).orderBy(desc(certificates.issuedAt)).limit(1);
    return latest?.id ?? null;
  }

  /** Status changes of one student, newest first: reason, effective date, approver, return date, linked TC. */
  async statusHistory(tx: Tx, studentId: string) {
    await this.load(tx, studentId);
    const rows = await tx
      .select({ e: studentLifecycleEvents, approverName: users.fullName, serial: certificates.serialNo })
      .from(studentLifecycleEvents)
      .leftJoin(users, eq(users.id, studentLifecycleEvents.approverId))
      .leftJoin(certificates, eq(certificates.id, studentLifecycleEvents.certificateId))
      .where(and(eq(studentLifecycleEvents.studentId, studentId), eq(studentLifecycleEvents.kind, 'status')))
      .orderBy(desc(studentLifecycleEvents.createdAt), desc(studentLifecycleEvents.id));
    const actorIds = [...new Set(rows.map((r) => r.e.actorId).filter((x): x is string => !!x))];
    const actors = actorIds.length ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, actorIds)) : [];
    const name = new Map(actors.map((a) => [a.id, a.name]));
    return rows.map(({ e, approverName, serial }) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      reason: e.reason,
      effectiveOn: e.effectiveOn,
      returnOn: e.returnOn,
      approverName,
      certificateId: e.certificateId,
      certificateSerial: serial,
      readmission: (e.data as { readmission?: boolean } | null)?.readmission === true,
      recordedBy: e.actorId ? (name.get(e.actorId) ?? null) : null,
      at: e.createdAt.toISOString(),
    }));
  }

  /** Students on a leave of absence or suspended now, with the day they are due back (overdue when past). */
  async absences(tx: Tx) {
    const today = await this.today(tx);
    const rows = await tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, status: students.status, className: sections.displayName })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(inArray(students.status, ['on_leave', 'suspended']))
      .orderBy(asc(sections.displayName), asc(students.rollNo));
    if (rows.length === 0) return [];
    const events = await tx
      .select({ studentId: studentLifecycleEvents.studentId, toStatus: studentLifecycleEvents.toStatus, returnOn: studentLifecycleEvents.returnOn, effectiveOn: studentLifecycleEvents.effectiveOn, reason: studentLifecycleEvents.reason })
      .from(studentLifecycleEvents)
      .where(and(inArray(studentLifecycleEvents.studentId, rows.map((r) => r.id)), eq(studentLifecycleEvents.kind, 'status')))
      .orderBy(desc(studentLifecycleEvents.createdAt), desc(studentLifecycleEvents.id));
    return rows.map((r) => {
      const e = events.find((x) => x.studentId === r.id && x.toStatus === r.status);
      return { ...r, since: e?.effectiveOn ?? null, returnOn: e?.returnOn ?? null, reason: e?.reason ?? null, overdue: !!e?.returnOn && e.returnOn < today };
    });
  }

  private clockNow() {
    return this.clock.now();
  }

  private async disableIfOnlyStudent(tx: Tx, userId: string) {
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    if (roles.length > 0 && roles.every((r) => r.role === 'student')) await tx.update(users).set({ status: 'disabled', updatedAt: this.clockNow() }).where(eq(users.id, userId));
  }

  /** Moves a student to another class of the same program (a section change, not a promotion). */
  async changeSection(tx: Tx, actor: LifecycleActor, studentId: string, sectionId: string, reason: string) {
    const ctx = await this.load(tx, studentId, true);
    if (!['enrolled', 'active', 'on_leave', 'detained', 'promoted'].includes(ctx.student.status)) throw new BadRequestException('This student is no longer on the roll');
    if (sectionId === ctx.student.sectionId) throw new BadRequestException('The student is already in this class');
    const [target] = await tx.select().from(sections).where(eq(sections.id, sectionId));
    if (!target) throw new NotFoundException('Class not found');
    if (target.programId !== ctx.section.programId) throw new BadRequestException('Choose a class of the same program');
    const rollNo = await this.freeRollNo(tx, sectionId, ctx.student.rollNo);
    await tx.update(students).set({ sectionId, rollNo, updatedAt: this.clockNow() }).where(eq(students.id, studentId));
    await this.addEvent(tx, actor, { studentId, kind: 'section', fromSectionId: ctx.student.sectionId, toSectionId: sectionId, reason, data: { rollNo, previousRollNo: ctx.student.rollNo } });
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'students.section_changed.v1', subjectType: 'student', subjectId: studentId, data: { from: ctx.student.sectionId, to: sectionId, reason } });
    return { sectionId, rollNo };
  }

  /** The roll number to keep in a class: the same if free, otherwise the next number after the highest. */
  async freeRollNo(tx: Tx, sectionId: string, preferred?: string): Promise<string> {
    const rows = await tx.select({ rollNo: students.rollNo }).from(students).where(eq(students.sectionId, sectionId));
    const used = new Set(rows.map((r) => r.rollNo));
    if (preferred && !used.has(preferred)) return preferred;
    const max = rows.reduce((m, r) => (/^\d+$/.test(r.rollNo) ? Math.max(m, Number(r.rollNo)) : m), 0);
    return String(max + 1);
  }

  /**
   * Bulk promotion. For each mapping, the class's active students move to the next class (a
   * promotion event, still `active`), unless listed in `detain` (they stay, status `detained`);
   * a final-term class with no target graduates (`alumni`). Everything is one transaction; with
   * `dryRun` it computes the outcome and rolls nothing forward.
   */
  async promote(tx: Tx, actor: LifecycleActor, input: { label: string; mappings: PromotionMapping[]; detain: { studentId: string; reason: string }[]; dryRun: boolean }) {
    const ids = [...new Set(input.mappings.flatMap((m) => [m.fromSectionId, m.toSectionId].filter((x): x is string => !!x)))];
    const secRows = ids.length ? await tx.select({ s: sections, termCount: programs.termCount, year: academicYears.label }).from(sections).innerJoin(programs, eq(programs.id, sections.programId)).innerJoin(academicYears, eq(academicYears.id, sections.academicYearId)).where(inArray(sections.id, ids)) : [];
    const byId = new Map(secRows.map((r) => [r.s.id, r]));
    const froms = input.mappings.map((m) => m.fromSectionId);
    if (new Set(froms).size !== froms.length) throw new BadRequestException('A class appears twice');
    const detain = new Map(input.detain.map((d) => [d.studentId, d.reason.trim()]));
    for (const [id, reason] of detain) if (reason.length < 3) throw new BadRequestException(`Give a reason for detaining student ${id}`);

    const plan: { fromSectionId: string; toSectionId: string | null; from: string; to: string | null; promote: string[]; detain: string[]; graduate: string[]; skipped: number }[] = [];
    for (const m of input.mappings) {
      const from = byId.get(m.fromSectionId);
      if (!from) throw new NotFoundException('Class not found');
      const to = m.toSectionId ? byId.get(m.toSectionId) : null;
      const final = from.s.term >= from.termCount;
      if (m.toSectionId) {
        if (!to) throw new NotFoundException('Class not found');
        if (final) throw new BadRequestException(`${from.s.displayName} is the final term: graduate it instead of promoting`);
        if (to.s.programId !== from.s.programId || to.s.term !== from.s.term + 1) throw new BadRequestException(`${to.s.displayName} is not the next class after ${from.s.displayName}`);
      } else if (!final) throw new BadRequestException(`${from.s.displayName} is not a final-term class: choose where it goes`);
      const roster = await tx.select({ id: students.id, status: students.status }).from(students).where(eq(students.sectionId, m.fromSectionId)).orderBy(asc(students.rollNo));
      const active = roster.filter((r) => r.status === 'active');
      const det = active.filter((r) => detain.has(r.id)).map((r) => r.id);
      const rest = active.filter((r) => !detain.has(r.id)).map((r) => r.id);
      plan.push({ fromSectionId: m.fromSectionId, toSectionId: m.toSectionId, from: from.s.displayName, to: to?.s.displayName ?? null, promote: m.toSectionId ? rest : [], detain: det, graduate: m.toSectionId ? [] : rest, skipped: roster.length - active.length });
    }
    const planned = new Set(plan.flatMap((p) => [...p.promote, ...p.detain, ...p.graduate]));
    for (const id of detain.keys()) if (!planned.has(id)) throw new BadRequestException('A student to detain is not an active student of the chosen classes');

    const summary = {
      promoted: plan.reduce((n, p) => n + p.promote.length, 0),
      detained: plan.reduce((n, p) => n + p.detain.length, 0),
      graduated: plan.reduce((n, p) => n + p.graduate.length, 0),
      skipped: plan.reduce((n, p) => n + p.skipped, 0),
      sections: plan.map((p) => ({ from: p.from, to: p.to })),
    };
    if (input.dryRun) return { dryRun: true as const, batchId: null, ...summary };

    const [batch] = await tx.insert(promotionBatches).values({ tenantId: actor.tenantId, label: input.label, summary, runBy: actor.userId }).returning();
    const today = await this.today(tx);
    for (const p of plan) {
      for (const id of p.detain) await this.changeStatus(tx, actor, id, 'detained', { reason: detain.get(id), batchId: batch.id, effectiveOn: today });
      for (const id of p.graduate) await this.changeStatus(tx, actor, id, 'alumni', { reason: input.label, batchId: batch.id, effectiveOn: today });
      for (const id of p.promote) {
        const [st] = await tx.select().from(students).where(eq(students.id, id)).for('update');
        const rollNo = await this.freeRollNo(tx, p.toSectionId!, st.rollNo);
        await tx.update(students).set({ sectionId: p.toSectionId!, rollNo, updatedAt: this.clockNow() }).where(eq(students.id, id));
        await this.addEvent(tx, actor, { studentId: id, kind: 'promotion', fromStatus: 'active', toStatus: 'active', fromSectionId: p.fromSectionId, toSectionId: p.toSectionId, reason: input.label, effectiveOn: today, batchId: batch.id, data: { rollNo, previousRollNo: st.rollNo } });
      }
    }
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: AdmissionsEvents.StudentsPromoted, subjectType: 'promotion_batch', subjectId: batch.id, data: summary });
    return { dryRun: false as const, batchId: batch.id, ...summary };
  }

  // ---- guardians ------------------------------------------------------------------------------

  async linkGuardian(tx: Tx, actor: LifecycleActor, studentId: string, g: { fullName: string; phone: string; email?: string | null; relation: string; isPrimary?: boolean; isEmergencyContact?: boolean }) {
    await this.load(tx, studentId);
    const guardianUser = await this.guardianUser(tx, actor.tenantId, g);
    const [existing] = await tx.select().from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, guardianUser.id)));
    if (existing) throw new ConflictException('This guardian is already linked to the student');
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(guardians).where(eq(guardians.studentId, studentId));
    const primary = g.isPrimary ?? count.n === 0;
    if (primary) await tx.update(guardians).set({ isPrimary: false }).where(and(eq(guardians.studentId, studentId), eq(guardians.isPrimary, true)));
    const [row] = await tx.insert(guardians).values({ tenantId: actor.tenantId, userId: guardianUser.id, studentId, relation: g.relation, isPrimary: primary, isEmergencyContact: g.isEmergencyContact ?? false }).returning();
    await this.addEvent(tx, actor, { studentId, kind: 'guardian', reason: `Linked ${guardianUser.fullName} (${g.relation})`, data: { guardianId: row.id, action: 'linked' } });
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: AdmissionsEvents.GuardianLinked, subjectType: 'student', subjectId: studentId, data: { guardianId: row.id, userId: guardianUser.id, relation: g.relation } });
    return row;
  }

  async updateGuardian(tx: Tx, actor: LifecycleActor, studentId: string, guardianId: string, patch: { relation?: string; isPrimary?: boolean; isEmergencyContact?: boolean }) {
    const [row] = await tx.select().from(guardians).where(and(eq(guardians.id, guardianId), eq(guardians.studentId, studentId)));
    if (!row) throw new NotFoundException('Guardian not found');
    if (patch.isPrimary === false && row.isPrimary) throw new BadRequestException('Make another guardian the primary contact instead');
    if (patch.isPrimary) await tx.update(guardians).set({ isPrimary: false }).where(and(eq(guardians.studentId, studentId), eq(guardians.isPrimary, true)));
    const [upd] = await tx.update(guardians).set(patch).where(eq(guardians.id, guardianId)).returning();
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: AdmissionsEvents.GuardianUpdated, subjectType: 'student', subjectId: studentId, data: { guardianId, patch } });
    return upd;
  }

  async unlinkGuardian(tx: Tx, actor: LifecycleActor, studentId: string, guardianId: string) {
    const [row] = await tx.select().from(guardians).where(and(eq(guardians.id, guardianId), eq(guardians.studentId, studentId)));
    if (!row) throw new NotFoundException('Guardian not found');
    const all = await tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.studentId, studentId));
    if (all.length === 1) throw new BadRequestException('A student needs at least one guardian: add the new one first');
    await tx.delete(guardians).where(eq(guardians.id, guardianId));
    // The primary contact passes to the earliest remaining guardian.
    if (row.isPrimary) {
      const [next] = await tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.studentId, studentId)).orderBy(asc(guardians.createdAt)).limit(1);
      if (next) await tx.update(guardians).set({ isPrimary: true }).where(eq(guardians.id, next.id));
    }
    await this.addEvent(tx, actor, { studentId, kind: 'guardian', reason: 'Guardian unlinked', data: { guardianId, action: 'unlinked', relation: row.relation } });
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: AdmissionsEvents.GuardianUnlinked, subjectType: 'student', subjectId: studentId, data: { guardianId, userId: row.userId } });
  }

  /** The guardian's user, found by phone or created with the guardian role. */
  async guardianUser(tx: Tx, tenantId: string, g: { fullName: string; phone: string; email?: string | null }) {
    const [found] = await tx.select().from(users).where(eq(users.phone, g.phone));
    let user = found;
    if (!user) {
      const email = g.email?.trim().toLowerCase() || null;
      const [mailTaken] = email ? await tx.select({ id: users.id }).from(users).where(eq(users.email, email)) : [];
      [user] = await tx.insert(users).values({ tenantId, fullName: g.fullName, phone: g.phone, email: mailTaken ? null : email }).returning();
    }
    const [has] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.role, 'guardian'))).limit(1);
    if (!has) await tx.insert(userRoles).values({ tenantId, userId: user.id, role: 'guardian', campusId: null });
    return user;
  }
}
