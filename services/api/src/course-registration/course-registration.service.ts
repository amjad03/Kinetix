import { governedParams, overlayCreditLimits } from '../governance/rule-params.js';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { randomUUID } from 'node:crypto';
import { attendanceSettings, overallAttendance } from '../attendance-governance/eligibility.js';
import { academicTerms, courseOfferings, courseRegistrations, departments, examResultLines, feeInvoices, examResults, registrationWindows, sections, students, subjects, timetableSlots } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { allocationOrder, type Applicant, type OfferingFacts, REFUSAL_TEXT, refusal, type Refusal, type StudentFacts, totalCredits } from './registration-rules.js';

export type Offering = typeof courseOfferings.$inferSelect;
export type Registration = typeof courseRegistrations.$inferSelect;
export type Window = typeof registrationWindows.$inferSelect;

export interface StudentProfile extends StudentFacts {
  studentId: string;
  fullName: string;
  rollNo: string;
  cgpa: number;
}

const refuse = (r: Refusal) => new ConflictException({ statusCode: 409, error: 'Conflict', code: r, message: REFUSAL_TEXT[r] });

/** The engine behind course registration: rules, seats, waitlist promotion, preference allocation and approval. */
@Injectable()
export class CourseRegistrationService {
  constructor(
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  now() {
    return this.clock.now();
  }

  /** The student record signed in as `p`. */
  async ownStudent(tx: Tx, p: UserPrincipal): Promise<string> {
    const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    if (!s) throw new NotFoundException('Student not found');
    return s.id;
  }

  async profile(tx: Tx, studentId: string): Promise<StudentProfile> {
    const [s] = await tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, programId: sections.programId, semester: sections.term })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const passed = await tx
      .select({ subjectId: examResultLines.subjectId })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .where(and(eq(examResults.studentId, studentId), eq(examResultLines.passed, true)));
    const [last] = await tx.select({ cgpa: examResults.cgpa }).from(examResults).where(eq(examResults.studentId, studentId)).orderBy(desc(examResults.computedAt)).limit(1);
    return { studentId, fullName: s.fullName, rollNo: s.rollNo, programId: s.programId, semester: s.semester, passedSubjectIds: new Set(passed.map((x) => x.subjectId)), cgpa: last?.cgpa ?? 0 };
  }

  /** Offerings with their timetable slot times resolved, ready for the rules. */
  async facts(tx: Tx, rows: Offering[]): Promise<Map<string, OfferingFacts>> {
    const slotIds = [...new Set(rows.flatMap((r) => r.slotIds))];
    const slots = slotIds.length ? await tx.select().from(timetableSlots).where(inArray(timetableSlots.id, slotIds)) : [];
    const byId = new Map(slots.map((s) => [s.id, { day: s.dayOfWeek, starts: s.startsAt, ends: s.endsAt }]));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          subjectId: r.subjectId,
          category: r.category,
          credits: r.credits,
          seatCap: r.seatCap,
          status: r.status,
          eligibleProgramIds: r.eligibleProgramIds,
          eligibleSemesters: r.eligibleSemesters,
          prerequisiteSubjectId: r.prerequisiteSubjectId,
          slots: r.slotIds.flatMap((id) => byId.get(id) ?? []),
        },
      ]),
    );
  }

  /** The window that governs a program in a term: its own, else the all-programs one. */
  async windowFor(tx: Tx, termId: string, programId: string): Promise<Window | null> {
    const rows = await tx.select().from(registrationWindows).where(eq(registrationWindows.termId, termId));
    const w = rows.find((x) => x.programId === programId) ?? rows.find((x) => x.programId === null) ?? null;
    return w ? overlayCreditLimits(w, await governedParams(tx, 'credits', 'minimum-per-semester')) : null;
  }

  async seatsTaken(tx: Tx, offeringId: string): Promise<number> {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, offeringId), eq(courseRegistrations.status, 'registered')));
    return r?.n ?? 0;
  }

  /** The offerings the student currently holds a seat in for the term. */
  async held(tx: Tx, studentId: string, termId: string): Promise<{ regs: Registration[]; facts: OfferingFacts[] }> {
    const regs = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.termId, termId), eq(courseRegistrations.status, 'registered')));
    const offs = regs.length ? await tx.select().from(courseOfferings).where(inArray(courseOfferings.id, regs.map((r) => r.offeringId))) : [];
    const f = await this.facts(tx, offs);
    return { regs, facts: [...f.values()] };
  }

  private async lockOffering(tx: Tx, id: string): Promise<Offering> {
    const [o] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, id)).for('update');
    if (!o) throw new NotFoundException('Course offering not found');
    return o;
  }

  private requireWindow(w: Window | null, now: Date, phase: 'register' | 'rank' | 'drop'): Window {
    if (!w) throw new ConflictException('Registration is not open for your programme this term');
    const until = phase === 'rank' ? w.closesAt : w.addDropUntil;
    if (now < w.opensAt) throw new ConflictException('Registration has not opened yet');
    if (now > until) throw new ConflictException(phase === 'drop' ? 'The add/drop deadline has passed' : 'Registration has closed');
    return w;
  }

  /** Adds the mandatory core courses of the term that the student is eligible for. Idempotent. */
  async enrollCore(tx: Tx, tenantId: string, studentId: string, termId: string, prof?: StudentProfile): Promise<Registration[]> {
    const me = prof ?? (await this.profile(tx, studentId));
    const cores = await tx.select().from(courseOfferings).where(and(eq(courseOfferings.termId, termId), eq(courseOfferings.category, 'core'), eq(courseOfferings.status, 'open')));
    const have = new Set((await tx.select({ o: courseRegistrations.offeringId }).from(courseRegistrations).where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.termId, termId)))).map((r) => r.o));
    const facts = await this.facts(tx, cores);
    const added: Registration[] = [];
    for (const o of cores) {
      const f = facts.get(o.id)!;
      if (have.has(o.id) || refusal(f, me, [], 0, Number.MAX_SAFE_INTEGER, { ignoreSeats: true, ignoreCredits: true })) continue;
      const [row] = await tx
        .insert(courseRegistrations)
        .values({ tenantId, offeringId: o.id, studentId, termId, status: 'registered', autoCore: true, approval: 'approved', decidedAt: this.now() })
        .onConflictDoNothing()
        .returning();
      if (!row) continue;
      added.push(row);
      await this.emitApproved(tx, tenantId, row, o, null);
    }
    return added;
  }

  /** Registers the student for one offering, checking every rule. */
  async register(tx: Tx, tenantId: string, studentId: string, offeringId: string, opts: { actor?: UserPrincipal } = {}): Promise<Registration> {
    const o = await this.lockOffering(tx, offeringId);
    const me = await this.profile(tx, studentId);
    const w = this.requireWindow(await this.windowFor(tx, o.termId, me.programId), this.now(), 'register');
    await this.enrollCore(tx, tenantId, studentId, o.termId, me);
    const [existing] = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, offeringId), eq(courseRegistrations.studentId, studentId)));
    if (existing?.status === 'registered') return existing;
    const f = (await this.facts(tx, [o])).get(o.id)!;
    const held = await this.held(tx, studentId, o.termId);
    const why = refusal(f, me, held.facts, await this.seatsTaken(tx, offeringId), w.maxCredits);
    if (why) throw refuse(why);
    const patch = { status: 'registered' as const, approval: 'pending' as const, preferenceRank: null, waitlistPos: null, decidedBy: null, decidedAt: null, decisionNote: null, updatedAt: this.now() };
    const [row] = existing
      ? await tx.update(courseRegistrations).set({ ...patch, version: existing.version + 1 }).where(eq(courseRegistrations.id, existing.id)).returning()
      : await tx.insert(courseRegistrations).values({ tenantId, offeringId, studentId, termId: o.termId, ...patch }).returning();
    if (opts.actor) await auditUser(tx, opts.actor, 'course_registration.registered', 'course_registration', row.id, { offeringId, studentId });
    return row;
  }

  /** Drops a registration, preference or waitlist spot, then gives a freed seat to the waitlist. */
  async drop(tx: Tx, p: UserPrincipal, studentId: string, offeringId: string): Promise<Registration> {
    const [row] = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, offeringId), eq(courseRegistrations.studentId, studentId))).for('update');
    if (!row || row.status === 'dropped') throw new NotFoundException('Registration not found');
    const o = await this.lockOffering(tx, offeringId);
    if (o.category === 'core') throw new ConflictException('Core courses are mandatory and cannot be dropped');
    const me = await this.profile(tx, studentId);
    if (row.status === 'registered') this.requireWindow(await this.windowFor(tx, o.termId, me.programId), this.now(), 'drop');
    const [out] = await tx.update(courseRegistrations).set({ status: 'dropped', preferenceRank: null, waitlistPos: null, updatedAt: this.now(), version: row.version + 1 }).where(eq(courseRegistrations.id, row.id)).returning();
    await auditUser(tx, p, 'course_registration.dropped', 'course_registration', row.id, { offeringId, studentId, was: row.status });
    if (row.status === 'registered') await this.promote(tx, o);
    return out;
  }

  /** Fills free seats from the waitlist, in waitlist order, skipping anyone who no longer fits the rules. */
  async promote(tx: Tx, o: Offering): Promise<number> {
    const waiting = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, o.id), eq(courseRegistrations.status, 'waitlisted'))).orderBy(asc(courseRegistrations.waitlistPos), asc(courseRegistrations.createdAt));
    if (waiting.length === 0) return 0;
    const f = (await this.facts(tx, [o])).get(o.id)!;
    let taken = await this.seatsTaken(tx, o.id);
    let promoted = 0;
    for (const w of waiting) {
      if (taken >= o.seatCap) break;
      const me = await this.profile(tx, w.studentId);
      const win = await this.windowFor(tx, o.termId, me.programId);
      if (!win) continue;
      const held = await this.held(tx, w.studentId, o.termId);
      if (refusal(f, me, held.facts, taken, win.maxCredits)) continue;
      await tx.update(courseRegistrations).set({ status: 'registered', waitlistPos: null, approval: 'pending', updatedAt: this.now(), version: w.version + 1 }).where(eq(courseRegistrations.id, w.id));
      taken += 1;
      promoted += 1;
    }
    return promoted;
  }

  /** Replaces the student's ranked preferences for a term (first = most wanted). */
  async setPreferences(tx: Tx, p: UserPrincipal, studentId: string, termId: string, offeringIds: string[]): Promise<Registration[]> {
    const me = await this.profile(tx, studentId);
    this.requireWindow(await this.windowFor(tx, termId, me.programId), this.now(), 'rank');
    await this.enrollCore(tx, p.tenantId, studentId, termId, me);
    const rows = offeringIds.length ? await tx.select().from(courseOfferings).where(and(inArray(courseOfferings.id, offeringIds), eq(courseOfferings.termId, termId))) : [];
    if (rows.length !== offeringIds.length) throw new NotFoundException('Course offering not found');
    const facts = await this.facts(tx, rows);
    for (const o of rows) {
      if (o.category === 'core') throw new ConflictException('Core courses are added for you; rank only electives');
      const why = refusal(facts.get(o.id)!, me, [], 0, Number.MAX_SAFE_INTEGER, { ignoreSeats: true, ignoreCredits: true });
      if (why) throw refuse(why);
    }
    const mine = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.termId, termId)));
    const byOffering = new Map(mine.map((r) => [r.offeringId, r]));
    for (const id of offeringIds) if (byOffering.get(id)?.status === 'registered') throw new ConflictException('You already hold a seat in one of these courses');
    for (const r of mine) {
      if (r.status === 'preference' && !offeringIds.includes(r.offeringId)) await tx.update(courseRegistrations).set({ status: 'dropped', preferenceRank: null, updatedAt: this.now() }).where(eq(courseRegistrations.id, r.id));
    }
    const out: Registration[] = [];
    for (const [i, id] of offeringIds.entries()) {
      const cur = byOffering.get(id);
      const patch = { status: 'preference' as const, preferenceRank: i + 1, waitlistPos: null, approval: 'pending' as const, updatedAt: this.now() };
      const [row] = cur
        ? await tx.update(courseRegistrations).set({ ...patch, version: cur.version + 1 }).where(eq(courseRegistrations.id, cur.id)).returning()
        : await tx.insert(courseRegistrations).values({ tenantId: p.tenantId, offeringId: id, studentId, termId, ...patch }).returning();
      out.push(row);
    }
    await auditUser(tx, p, 'course_registration.preferences_set', 'course_registration', studentId, { termId, offeringIds });
    return out;
  }

  /**
   * Turns ranked preferences into seats. Students are served in CGPA order (or request order, per the
   * window's rule); each gets their best-ranked courses that still pass every rule, up to `perStudent`.
   * Full courses a student ranked above what they got put them on the waitlist.
   */
  async allocate(tx: Tx, p: UserPrincipal, termId: string, opts: { programId?: string; perStudent: number }) {
    const [term] = await tx.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, termId));
    if (!term) throw new NotFoundException('Term not found');
    const prefs = await tx.select().from(courseRegistrations).where(and(eq(courseRegistrations.termId, termId), eq(courseRegistrations.status, 'preference')));
    const offs = await tx.select().from(courseOfferings).where(eq(courseOfferings.termId, termId));
    const offById = new Map(offs.map((o) => [o.id, o]));
    const facts = await this.facts(tx, offs);
    for (const o of offs) await this.lockOffering(tx, o.id);
    const seats = new Map<string, number>();
    for (const o of offs) seats.set(o.id, await this.seatsTaken(tx, o.id));

    const byStudent = new Map<string, Registration[]>();
    for (const r of prefs) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
    const result = { allocated: 0, waitlisted: 0, notAllotted: 0, students: 0 };
    const profiles = new Map<string, StudentProfile>();
    const windows = new Map<string, Window | null>();
    for (const sid of byStudent.keys()) {
      const me = await this.profile(tx, sid);
      if (opts.programId && me.programId !== opts.programId) continue;
      profiles.set(sid, me);
      windows.set(sid, await this.windowFor(tx, termId, me.programId));
    }
    const customIds = [...profiles.keys()].filter((sid) => windows.get(sid)?.allocationRule === 'custom');
    const attendance = customIds.length ? await overallAttendance(tx, customIds, (await attendanceSettings(tx)).thresholdPct) : new Map<string, { pct: number | null }>();
    const applicants = (rule: 'cgpa' | 'time' | 'custom'): Applicant[] =>
      [...profiles.keys()]
        .filter((sid) => windows.get(sid)?.allocationRule === rule)
        .map((sid) => ({
          studentId: sid,
          cgpa: profiles.get(sid)!.cgpa,
          at: Math.min(...byStudent.get(sid)!.map((r) => r.createdAt.getTime())),
          attendance: attendance.get(sid)?.pct ?? 0,
          semester: profiles.get(sid)!.semester,
          weights: windows.get(sid)?.ruleConfig ?? undefined,
        }));
    const order = [...allocationOrder('custom', applicants('custom')), ...allocationOrder('cgpa', applicants('cgpa')), ...allocationOrder('time', applicants('time'))];
    const waitPos = new Map<string, number>();
    for (const o of offs) {
      const [m] = await tx.select({ n: sql<number>`coalesce(max(${courseRegistrations.waitlistPos}), 0)::int` }).from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, o.id), eq(courseRegistrations.status, 'waitlisted')));
      waitPos.set(o.id, m?.n ?? 0);
    }

    for (const a of order) {
      const me = profiles.get(a.studentId)!;
      const w = windows.get(a.studentId)!;
      const held = (await this.held(tx, a.studentId, termId)).facts;
      let got = 0;
      let worstGot = 0;
      const outcome = new Map<string, Refusal | 'granted' | 'skipped'>();
      const ranked = byStudent.get(a.studentId)!.sort((x, y) => (x.preferenceRank ?? 99) - (y.preferenceRank ?? 99));
      for (const r of ranked) {
        if (got >= opts.perStudent || !offById.has(r.offeringId)) {
          outcome.set(r.id, 'skipped');
          continue;
        }
        const f = facts.get(r.offeringId)!;
        const why = refusal(f, me, held, seats.get(r.offeringId) ?? 0, w.maxCredits);
        if (why) {
          outcome.set(r.id, why);
          continue;
        }
        outcome.set(r.id, 'granted');
        held.push(f);
        seats.set(r.offeringId, (seats.get(r.offeringId) ?? 0) + 1);
        got += 1;
        worstGot = Math.max(worstGot, r.preferenceRank ?? 0);
      }
      for (const r of ranked) {
        const out = outcome.get(r.id)!;
        let patch: Partial<typeof courseRegistrations.$inferInsert>;
        if (out === 'granted') {
          patch = { status: 'registered', preferenceRank: r.preferenceRank, approval: 'pending' };
          result.allocated += 1;
        } else if (out === 'seats_full' && (got < opts.perStudent || (r.preferenceRank ?? 0) < worstGot)) {
          const pos = (waitPos.get(r.offeringId) ?? 0) + 1;
          waitPos.set(r.offeringId, pos);
          patch = { status: 'waitlisted', waitlistPos: pos };
          result.waitlisted += 1;
        } else {
          patch = { status: 'not_allotted' };
          result.notAllotted += 1;
        }
        await tx.update(courseRegistrations).set({ ...patch, updatedAt: this.now(), version: r.version + 1 }).where(eq(courseRegistrations.id, r.id));
      }
      result.students += 1;
    }
    await auditUser(tx, p, 'course_registration.allocated', 'term', termId, result);
    return result;
  }

  /** A head of department may only decide on courses of their own department. */
  async checkDepartment(tx: Tx, p: UserPrincipal, subjectIds: string[]): Promise<void> {
    if (p.roles.some((r) => r === 'principal' || r === 'tenant_admin')) return;
    const rows = await tx
      .select({ head: departments.headUserId })
      .from(subjects)
      .leftJoin(departments, eq(departments.id, subjects.departmentId))
      .where(inArray(subjects.id, subjectIds));
    if (rows.some((r) => r.head && r.head !== p.userId)) throw new ForbiddenException('This course belongs to another department');
  }

  /** A course with a fee puts an invoice on the student's account when the registration is approved (once). */
  private async chargeFee(tx: Tx, p: UserPrincipal, reg: Registration, o: Offering) {
    if (!o.feePaise || o.feePaise <= 0 || reg.feeInvoiceId) return;
    const [stu] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, reg.studentId));
    const [sub] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, o.subjectId));
    if (!stu) return;
    const dueOn = new Date(this.now().getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    const [inv] = await tx
      .insert(feeInvoices)
      .values({ tenantId: p.tenantId, studentId: reg.studentId, sectionId: stu.sectionId, batchId: randomUUID(), title: `Course fee: ${sub?.code ?? ''} ${sub?.name ?? ''}`.trim(), amountPaise: o.feePaise, dueOn, createdBy: p.userId })
      .returning({ id: feeInvoices.id });
    await tx.update(courseRegistrations).set({ feeInvoiceId: inv.id }).where(eq(courseRegistrations.id, reg.id));
    reg.feeInvoiceId = inv.id;
    await auditUser(tx, p, 'course_registration.fee_charged', 'course_registration', reg.id, { invoiceId: inv.id, amountPaise: o.feePaise });
  }

  private emitApproved(tx: Tx, tenantId: string, reg: Registration, o: Offering, actorId: string | null) {
    return this.events.emit(tx, tenantId, {
      type: DomainEvents.CourseRegistrationApproved,
      aggregateType: 'course_registration',
      aggregateId: reg.id,
      actorId: actorId ?? undefined,
      payload: { studentId: reg.studentId, offeringId: reg.offeringId, subjectId: o.subjectId, termId: reg.termId, credits: o.credits, category: o.category },
    });
  }

  /** HOD/principal decision on registrations. Approval needs the student to reach the term's minimum credits. */
  async decide(tx: Tx, p: UserPrincipal, ids: string[], decision: 'approved' | 'rejected', note: string | undefined) {
    const rows = await tx.select().from(courseRegistrations).where(inArray(courseRegistrations.id, ids)).for('update');
    if (rows.length !== ids.length) throw new NotFoundException('Registration not found');
    if (rows.some((r) => r.status !== 'registered' || r.approval !== 'pending')) throw new ConflictException('Only registrations waiting for approval can be decided');
    const offs = await tx.select().from(courseOfferings).where(inArray(courseOfferings.id, [...new Set(rows.map((r) => r.offeringId))]));
    const offById = new Map(offs.map((o) => [o.id, o]));
    await this.checkDepartment(tx, p, offs.map((o) => o.subjectId));
    if (decision === 'approved') {
      for (const sid of new Set(rows.map((r) => r.studentId))) {
        const termIds = new Set(rows.filter((r) => r.studentId === sid).map((r) => r.termId));
        for (const termId of termIds) {
          const me = await this.profile(tx, sid);
          const w = await this.windowFor(tx, termId, me.programId);
          const { facts } = await this.held(tx, sid, termId);
          if (w && totalCredits(facts) < w.minCredits) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'below_min_credits', message: `${me.fullName} has ${totalCredits(facts)} credits registered; the minimum for the term is ${w.minCredits}` });
        }
      }
    }
    const out: Registration[] = [];
    for (const r of rows) {
      const o = offById.get(r.offeringId)!;
      const [row] = await tx
        .update(courseRegistrations)
        .set(decision === 'approved' ? { approval: 'approved', decidedBy: p.userId, decidedAt: this.now(), decisionNote: note ?? null, version: r.version + 1, updatedAt: this.now() } : { approval: 'rejected', status: 'dropped', decidedBy: p.userId, decidedAt: this.now(), decisionNote: note ?? null, version: r.version + 1, updatedAt: this.now() })
        .where(eq(courseRegistrations.id, r.id))
        .returning();
      out.push(row);
      await auditUser(tx, p, `course_registration.${decision}`, 'course_registration', r.id, { studentId: r.studentId, offeringId: r.offeringId });
      if (decision === 'approved') await this.chargeFee(tx, p, row, o);
      if (decision === 'approved') await this.emitApproved(tx, p.tenantId, row, o, p.userId);
      else await this.promote(tx, o);
    }
    return out;
  }
}
