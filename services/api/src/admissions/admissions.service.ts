import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdmissionsEvents,
  APPLICATION_REASON_REQUIRED,
  canMoveApplication,
  eligibilityFailures,
  meritScore,
  rankMerit,
  type AdmissionDocumentSpec,
  type AdmissionFormField,
  type ApplicationStatus,
  type EligibilityRules,
  type MeritRule,
} from '@kinetix/shared';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, admissionCycles, applicationDocuments, applications, enquiries, meritLists, programs, sections, students, userRoles, users } from '../db/schema.js';
import { LifecycleService } from '../students/lifecycle.service.js';
import { addDays, auditActor, type Actor } from './enquiries.service.js';

export type Cycle = typeof admissionCycles.$inferSelect;
export type Application = typeof applications.$inferSelect;

/** Statuses that hold a seat: an offer is out, accepted or enrolled. */
const SEAT_HOLDING: ApplicationStatus[] = ['offered', 'accepted', 'enrolled'];
const TERMINAL: ApplicationStatus[] = ['rejected', 'withdrawn', 'declined', 'enrolled'];

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(24).toString('base64url');

export interface CycleConfig {
  formFields: AdmissionFormField[];
  documents: AdmissionDocumentSpec[];
  eligibility: EligibilityRules;
  meritRules: MeritRule[];
}
export const cycleConfig = (c: Cycle): CycleConfig => ({
  formFields: c.formFields as AdmissionFormField[],
  documents: c.documents as AdmissionDocumentSpec[],
  eligibility: c.eligibility as EligibilityRules,
  meritRules: c.meritRules as MeritRule[],
});

/** Problems with a cycle's configuration: rules that name questions that do not exist, and so on. */
export function configProblems(cfg: CycleConfig): string[] {
  const out: string[] = [];
  const keys = cfg.formFields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) out.push('Two questions share a key');
  const byKey = new Map(cfg.formFields.map((f) => [f.key, f]));
  for (const f of cfg.formFields) if (f.type === 'select' && !(f.options && f.options.length >= 2)) out.push(`${f.key}: a choice needs at least two options`);
  const docKeys = cfg.documents.map((d) => d.key);
  if (new Set(docKeys).size !== docKeys.length) out.push('Two documents share a key');
  for (const m of cfg.eligibility.minimums ?? []) if (byKey.get(m.field)?.type !== 'number') out.push(`Eligibility: ${m.field} is not a number question`);
  for (const a of cfg.eligibility.allowed ?? []) if (byKey.get(a.field)?.type !== 'select') out.push(`Eligibility: ${a.field} is not a choice question`);
  for (const r of cfg.meritRules) if (byKey.get(r.field)?.type !== 'number') out.push(`Merit: ${r.field} is not a number question`);
  return out;
}

@Injectable()
export class AdmissionsService {
  constructor(private readonly lifecycle: LifecycleService) {}

  // ---- cycles ------------------------------------------------------------------------------

  async cycle(tx: Tx, id: string): Promise<Cycle> {
    const [c] = await tx.select().from(admissionCycles).where(eq(admissionCycles.id, id));
    if (!c) throw new NotFoundException('Admission cycle not found');
    return c;
  }

  async createCycle(tx: Tx, actor: Actor, input: Omit<typeof admissionCycles.$inferInsert, 'id' | 'tenantId'>) {
    const [prog] = await tx.select({ termCount: programs.termCount }).from(programs).where(eq(programs.id, input.programId));
    if (!prog) throw new BadRequestException('Program not found');
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, input.academicYearId));
    if (!year) throw new BadRequestException('Academic year not found');
    if ((input.entryTerm ?? 1) > prog.termCount) throw new BadRequestException(`${input.name}: the program has only ${prog.termCount} terms`);
    if (input.closesOn < input.opensOn) throw new BadRequestException('The cycle cannot close before it opens');
    const problems = configProblems({ formFields: (input.formFields ?? []) as AdmissionFormField[], documents: (input.documents ?? []) as AdmissionDocumentSpec[], eligibility: (input.eligibility ?? {}) as EligibilityRules, meritRules: (input.meritRules ?? []) as MeritRule[] });
    if (problems.length) throw new BadRequestException(problems.join('; '));
    const [row] = await tx.insert(admissionCycles).values({ ...input, tenantId: actor.tenantId, createdBy: actor.userId }).returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.CycleCreated, subjectType: 'admission_cycle', subjectId: row.id, data: { name: row.name, seats: row.seats } });
    return row;
  }

  async updateCycle(tx: Tx, actor: Actor, id: string, patch: Partial<typeof admissionCycles.$inferInsert>) {
    const c = await this.cycle(tx, id);
    const [n] = await tx.select({ n: count() }).from(applications).where(eq(applications.cycleId, id));
    // The form and documents are what applicants already answered: they are fixed once someone applies.
    if (n.n > 0 && (patch.formFields !== undefined || patch.documents !== undefined)) throw new ConflictException('Applications have been received: the form and documents can no longer change');
    const next = { ...c, ...patch };
    const problems = configProblems(cycleConfig(next));
    if (problems.length) throw new BadRequestException(problems.join('; '));
    if (next.closesOn < next.opensOn) throw new BadRequestException('The cycle cannot close before it opens');
    if (patch.seats !== undefined) {
      const [held] = await tx.select({ n: count() }).from(applications).where(and(eq(applications.cycleId, id), inArray(applications.status, SEAT_HOLDING)));
      if (patch.seats < held.n) throw new BadRequestException(`${held.n} seats are already offered or taken`);
    }
    const [row] = await tx.update(admissionCycles).set({ ...patch, updatedAt: new Date() }).where(eq(admissionCycles.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.CycleUpdated, subjectType: 'admission_cycle', subjectId: id, data: { fields: Object.keys(patch) } });
    return row;
  }

  async setCycleStatus(tx: Tx, actor: Actor, id: string, status: 'open' | 'closed' | 'draft') {
    const c = await this.cycle(tx, id);
    if (c.status === status) return c;
    if (status === 'draft' && c.status !== 'draft') {
      const [n] = await tx.select({ n: count() }).from(applications).where(eq(applications.cycleId, id));
      if (n.n > 0) throw new ConflictException('Applications have been received: close the cycle instead');
    }
    if (status === 'open') {
      const [prog] = await tx.select({ id: sections.id }).from(sections).where(and(eq(sections.programId, c.programId), eq(sections.academicYearId, c.academicYearId), eq(sections.term, c.entryTerm))).limit(1);
      if (!prog) throw new BadRequestException('Create a class for this program, year and term first: admitted students need one to join');
    }
    const [row] = await tx.update(admissionCycles).set({ status, updatedAt: new Date() }).where(eq(admissionCycles.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.CycleUpdated, subjectType: 'admission_cycle', subjectId: id, data: { status } });
    return row;
  }

  // ---- applications ----------------------------------------------------------------------------

  async application(tx: Tx, id: string, lock = false): Promise<Application> {
    const q = tx.select().from(applications).where(eq(applications.id, id));
    const [a] = await (lock ? q.for('update') : q);
    if (!a) throw new NotFoundException('Application not found');
    return a;
  }

  /** "APP/2026-27/00012": numbered per institution and academic year. */
  async nextApplicationNo(tx: Tx, cycle: Cycle): Promise<string> {
    await tx.select({ id: admissionCycles.id }).from(admissionCycles).where(eq(admissionCycles.academicYearId, cycle.academicYearId)).orderBy(asc(admissionCycles.id)).for('update');
    const [y] = await tx.select({ label: academicYears.label }).from(academicYears).where(eq(academicYears.id, cycle.academicYearId));
    const prefix = `APP/${y.label}/`;
    const [n] = await tx.select({ n: count() }).from(applications).where(sql`${applications.applicationNo} like ${prefix + '%'}`);
    return `${prefix}${String(n.n + 1).padStart(5, '0')}`;
  }

  /**
   * Moves an application. `actor` null means the applicant (or the system). Enforces the allowed
   * moves, written reasons and that the application fee is settled before review.
   */
  async setStatus(tx: Tx, actor: Actor, id: string, to: ApplicationStatus, reason?: string | null, opts: { skipSeatCheck?: boolean; by?: string } = {}) {
    const a = await this.application(tx, id, true);
    const from = a.status as ApplicationStatus;
    if (from === to) throw new BadRequestException('The application already has this status');
    if (!canMoveApplication(from, to)) throw new BadRequestException(`An application that is ${from.replace('_', ' ')} cannot become ${to.replace('_', ' ')}`);
    if (APPLICATION_REASON_REQUIRED.includes(to) && !(reason && reason.trim().length >= 3)) throw new BadRequestException('Give a reason for this change');
    if (to === 'under_review' && !['none', 'paid', 'waived'].includes(a.feeStatus)) throw new BadRequestException('The application fee has not been paid');
    const cycle = await this.cycle(tx, a.cycleId);
    let offerExpiresOn: string | null | undefined;
    if (to === 'offered') {
      if (!opts.skipSeatCheck && (await this.seatsLeft(tx, cycle)) < 1) throw new ConflictException('No seats are left in this cycle');
      offerExpiresOn = addDays(await this.lifecycle.today(tx), cycle.offerValidDays);
    }
    if (to === 'accepted' && a.offerExpiresOn && a.offerExpiresOn < (await this.lifecycle.today(tx))) throw new BadRequestException('This offer has expired');
    const [row] = await tx
      .update(applications)
      .set({ status: to, statusReason: reason?.trim() || null, updatedAt: new Date(), ...(offerExpiresOn !== undefined ? { offerExpiresOn } : {}) })
      .where(eq(applications.id, id))
      .returning();
    const event = to === 'offered' ? AdmissionsEvents.ApplicationStatusChanged : to === 'accepted' ? AdmissionsEvents.OfferAccepted : to === 'declined' ? AdmissionsEvents.OfferDeclined : AdmissionsEvents.ApplicationStatusChanged;
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.ApplicationStatusChanged, subjectType: 'application', subjectId: id, data: { from, to, reason: reason ?? null, by: opts.by ?? (actor.userId ? 'staff' : 'applicant') } });
    if (event !== AdmissionsEvents.ApplicationStatusChanged) await audit(tx, { ...auditActor(actor), action: event, subjectType: 'application', subjectId: id, data: { by: opts.by ?? (actor.userId ? 'staff' : 'applicant') } });
    return row;
  }

  async seatsLeft(tx: Tx, cycle: Cycle): Promise<number> {
    const [held] = await tx.select({ n: count() }).from(applications).where(and(eq(applications.cycleId, cycle.id), inArray(applications.status, SEAT_HOLDING)));
    return cycle.seats - held.n;
  }

  /** Required documents that are missing or not yet verified. */
  async documentGaps(tx: Tx, a: Application, cycle: Cycle): Promise<string[]> {
    const docs = await tx.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, a.id));
    const by = new Map(docs.map((d) => [d.docKey, d]));
    return cycleConfig(cycle)
      .documents.filter((d) => d.required)
      .flatMap((d) => {
        const got = by.get(d.key);
        return !got ? [`${d.label} not uploaded`] : got.status !== 'verified' ? [`${d.label} not verified`] : [];
      });
  }

  /**
   * Checks every application under review against the cycle's eligibility rules and required
   * documents. Eligible ones move on; clear failures become ineligible; incomplete ones wait
   * (their notes say why). Also scores every one for merit.
   */
  async evaluate(tx: Tx, actor: Actor, cycleId: string) {
    const cycle = await this.cycle(tx, cycleId);
    const cfg = cycleConfig(cycle);
    const [y] = await tx.select({ startsOn: academicYears.startsOn }).from(academicYears).where(eq(academicYears.id, cycle.academicYearId));
    const rules: EligibilityRules = { ...cfg.eligibility, ageOn: cfg.eligibility.ageOn ?? y.startsOn };
    const today = await this.lifecycle.today(tx);
    const apps = await tx.select().from(applications).where(and(eq(applications.cycleId, cycleId), eq(applications.status, 'under_review')));
    const out = { eligible: 0, ineligible: 0, waiting: 0 };
    for (const a of apps) {
      const failures = eligibilityFailures(rules, { dateOfBirth: a.dateOfBirth, answers: a.answers }, today);
      const gaps = await this.documentGaps(tx, a, cycle);
      const score = meritScore(cfg.meritRules, a.answers);
      await tx.update(applications).set({ meritScore: score, eligibilityNotes: [...failures, ...gaps], updatedAt: new Date() }).where(eq(applications.id, a.id));
      if (failures.length) {
        await this.setStatus(tx, actor, a.id, 'ineligible', failures.join('; '), { by: 'eligibility_rules' });
        out.ineligible++;
      } else if (gaps.length) out.waiting++;
      else {
        await this.setStatus(tx, actor, a.id, 'eligible', 'Meets the eligibility rules and documents are verified', { by: 'eligibility_rules' });
        out.eligible++;
      }
    }
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.EligibilityEvaluated, subjectType: 'admission_cycle', subjectId: cycleId, data: out });
    return out;
  }

  // ---- merit lists --------------------------------------------------------------------------------

  /** Ranks the cycle's eligible and waitlisted applications; the top ones fill the seats still free. */
  async generateMeritList(tx: Tx, actor: Actor, cycleId: string) {
    const cycle = await this.cycle(tx, cycleId);
    const rules = cycleConfig(cycle).meritRules;
    if (rules.length === 0) throw new BadRequestException('Set merit rules for this cycle first');
    const pool = await tx.select().from(applications).where(and(eq(applications.cycleId, cycleId), inArray(applications.status, ['eligible', 'waitlisted'])));
    if (pool.length === 0) throw new BadRequestException('No eligible applications to rank');
    const seats = Math.max(0, await this.seatsLeft(tx, cycle));
    const ranked = rankMerit(pool.map((a) => ({ id: a.id, score: meritScore(rules, a.answers), submittedAt: a.submittedAt })), seats);
    const [last] = await tx.select({ v: meritLists.version }).from(meritLists).where(eq(meritLists.cycleId, cycleId)).orderBy(desc(meritLists.version)).limit(1);
    const entries = ranked.map((r) => ({ applicationId: r.id, rank: r.rank, score: r.score, decision: r.decision }));
    const [list] = await tx.insert(meritLists).values({ tenantId: actor.tenantId, cycleId, version: (last?.v ?? 0) + 1, seats, entries, generatedBy: actor.userId }).returning();
    for (const e of entries) await tx.update(applications).set({ meritScore: e.score, meritRank: e.rank }).where(eq(applications.id, e.applicationId));
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.MeritListGenerated, subjectType: 'merit_list', subjectId: list.id, data: { cycleId, version: list.version, seats, ranked: entries.length } });
    return list;
  }

  /** Publishing makes the offers: top ranks are offered (with the cycle's validity), the rest waitlisted. */
  async publishMeritList(tx: Tx, actor: Actor, listId: string) {
    const [list] = await tx.select().from(meritLists).where(eq(meritLists.id, listId)).for('update');
    if (!list) throw new NotFoundException('Merit list not found');
    if (list.publishedAt) throw new ConflictException('This merit list is already published');
    const [latest] = await tx.select({ v: meritLists.version }).from(meritLists).where(eq(meritLists.cycleId, list.cycleId)).orderBy(desc(meritLists.version)).limit(1);
    if (latest.v !== list.version) throw new ConflictException('A newer merit list exists: publish that one');
    const cycle = await this.cycle(tx, list.cycleId);
    const offers = list.entries.filter((e) => e.decision === 'offer');
    if (offers.length > (await this.seatsLeft(tx, cycle))) throw new ConflictException('Seats have changed since this list was made: generate it again');
    let offered = 0;
    let waitlisted = 0;
    for (const e of list.entries) {
      const a = await this.application(tx, e.applicationId, true);
      if (a.status !== 'eligible' && a.status !== 'waitlisted') continue; // changed since the list was made
      if (e.decision === 'offer') {
        await this.setStatus(tx, actor, a.id, 'offered', `Merit rank ${e.rank}`, { skipSeatCheck: true, by: 'merit_list' });
        offered++;
      } else if (a.status === 'eligible') {
        await this.setStatus(tx, actor, a.id, 'waitlisted', `Merit rank ${e.rank}`, { by: 'merit_list' });
        waitlisted++;
      }
    }
    const [row] = await tx.update(meritLists).set({ publishedAt: new Date() }).where(eq(meritLists.id, listId)).returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.MeritListPublished, subjectType: 'merit_list', subjectId: listId, data: { cycleId: list.cycleId, offered, waitlisted } });
    return { ...row, offered, waitlisted };
  }

  /** Offers past their last day lapse (declined), freeing the seat for the next on the waitlist. */
  async expireOffers(tx: Tx, actor: Actor, cycleId: string) {
    const today = await this.lifecycle.today(tx);
    const late = await tx.select({ id: applications.id }).from(applications).where(and(eq(applications.cycleId, cycleId), eq(applications.status, 'offered'), sql`${applications.offerExpiresOn} < ${today}`));
    for (const a of late) await this.setStatus(tx, actor, a.id, 'declined', null, { by: 'offer_expired' });
    return { expired: late.length };
  }

  // ---- enrolment ------------------------------------------------------------------------------------

  /** Turns an accepted application into an enrolled student: user, student, guardian and class. */
  async enroll(tx: Tx, actor: Actor & { userId: string }, id: string, input: { sectionId?: string; rollNo?: string; activate: boolean }) {
    const a = await this.application(tx, id, true);
    if (a.status !== 'accepted') throw new BadRequestException(a.status === 'enrolled' ? 'This applicant is already enrolled' : 'Only an accepted offer can be enrolled');
    const cycle = await this.cycle(tx, a.cycleId);
    if (!['none', 'paid', 'waived'].includes(a.feeStatus)) throw new BadRequestException('The application fee has not been paid');
    const gaps = await this.documentGaps(tx, a, cycle);
    if (gaps.length) throw new BadRequestException(`Documents outstanding: ${gaps.join(', ')}`);

    const candidates = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.programId, cycle.programId), eq(sections.academicYearId, cycle.academicYearId), eq(sections.term, cycle.entryTerm)))
      .orderBy(asc(sections.name));
    let section = input.sectionId ? candidates.find((s) => s.id === input.sectionId) : undefined;
    if (input.sectionId && !section) throw new BadRequestException("That class is not one of this cycle's classes");
    if (!section) {
      if (candidates.length === 0) throw new BadRequestException('There is no class for this program, year and term');
      // The emptiest class keeps the sections balanced.
      const sizes = await tx.select({ id: students.sectionId, n: count() }).from(students).where(inArray(students.sectionId, candidates.map((s) => s.id))).groupBy(students.sectionId);
      const size = new Map(sizes.map((s) => [s.id, s.n]));
      section = [...candidates].sort((x, y) => (size.get(x.id) ?? 0) - (size.get(y.id) ?? 0))[0];
    }
    const rollNo = input.rollNo ?? (await this.lifecycle.freeRollNo(tx, section.id));
    const [clash] = await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, section.id), eq(students.rollNo, rollNo)));
    if (clash) throw new ConflictException(`Roll number ${rollNo} is taken in ${section.displayName}`);

    // The student's own login, when their phone or email is free; families sign in with the guardian's phone.
    const studentUserId = await this.studentUser(tx, actor.tenantId, a);
    const today = await this.lifecycle.today(tx);
    const [st] = await tx
      .insert(students)
      .values({ tenantId: actor.tenantId, userId: studentUserId, sectionId: section.id, rollNo, fullName: a.applicantName, status: 'enrolled', statusChangedAt: new Date(), enrolledOn: today, applicationId: a.id })
      .returning();
    await this.lifecycle.addEvent(tx, actor, { studentId: st.id, kind: 'status', fromStatus: 'applicant', toStatus: 'enrolled', toSectionId: section.id, reason: `Admitted: ${a.applicationNo}`, effectiveOn: today, data: { applicationId: a.id, rollNo } });
    await this.lifecycle.linkGuardian(tx, actor, st.id, { fullName: a.guardianName, phone: a.guardianPhone, email: a.guardianEmail, relation: a.guardianRelation, isPrimary: true, isEmergencyContact: true });
    if (input.activate) await this.lifecycle.changeStatus(tx, actor, st.id, 'active', { reason: 'Joined the class', effectiveOn: today });

    await tx.update(applications).set({ status: 'enrolled', studentId: st.id, statusReason: null, updatedAt: new Date() }).where(eq(applications.id, id));
    if (a.enquiryId) await tx.update(enquiries).set({ stage: 'converted', applicationId: a.id, updatedAt: new Date() }).where(eq(enquiries.id, a.enquiryId));
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.ApplicationEnrolled, subjectType: 'application', subjectId: id, data: { studentId: st.id, sectionId: section.id, rollNo } });
    return { studentId: st.id, sectionId: section.id, className: section.displayName, rollNo, status: input.activate ? 'active' : 'enrolled' };
  }

  private async studentUser(tx: Tx, tenantId: string, a: Application): Promise<string | null> {
    const email = a.email?.trim().toLowerCase() || null;
    const [phoneTaken] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, a.phone));
    if (phoneTaken || a.phone === a.guardianPhone) return null;
    const [mailTaken] = email ? await tx.select({ id: users.id }).from(users).where(eq(users.email, email)) : [];
    const [u] = await tx.insert(users).values({ tenantId, fullName: a.applicantName, phone: a.phone, email: mailTaken ? null : email, status: 'active' }).returning();
    await tx.insert(userRoles).values({ tenantId, userId: u.id, role: 'student', campusId: null });
    return u.id;
  }

  today(tx: Tx) {
    return this.lifecycle.today(tx);
  }

  isTerminal(s: ApplicationStatus) {
    return TERMINAL.includes(s);
  }
}
