import { governedParams, quotaSeatsFromRule } from '../governance/rule-params.js';
import { studentAcademicIds } from '../db/schema-integrations.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdmissionsEvents,
  allocateSeats,
  APPLICATION_REASON_REQUIRED,
  canMoveApplication,
  ENTRANCE_SCORE_FIELD,
  eligibilityFailures,
  meritScore,
  rankMerit,
  seatAvailable,
  type AdmissionDocumentSpec,
  type AdmissionFormField,
  type ApplicationStatus,
  type EligibilityRules,
  type MeritRule,
  type SeatQuota,
} from '@kinetix/shared';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { DomainEvents, EventBus } from '../events/events.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, admissionCycles, admissionQuotas, applicationDocuments, applications, enquiries, entranceSeats, entranceTests, meritLists, programs, sections, students, userRoles, users } from '../db/schema.js';
import { studentPriorEducation } from '../db/schema-g1.js';
import { feedCalendar } from '../scheduling/calendar-feed.js';
import { findDuplicates } from './dedupe.js';
import { LifecycleService } from '../students/lifecycle.service.js';
import { addDays, auditActor, type Actor } from './enquiries.service.js';
import { accrueCommission } from './agents.service.js';
import { INTERVIEW_SCORE_FIELD, interviewResults } from './interviews.service.js';

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
  for (const r of cfg.meritRules) if (r.field !== ENTRANCE_SCORE_FIELD && r.field !== INTERVIEW_SCORE_FIELD && byKey.get(r.field)?.type !== 'number') out.push(`Merit: ${r.field} is not a number question`);
  return out;
}

/** Quota categories are compared without case or stray spaces. */
export const normCategory = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** The category an application is counted under: the office's setting, else the form answer `category`. */
export const categoryOf = (a: Pick<Application, 'category' | 'answers'>): string | null => {
  const raw = a.category ?? (typeof a.answers?.category === 'string' ? a.answers.category : null);
  return normCategory(raw) || null;
};

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly events: EventBus,
  ) {}

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
      const reserved = (await this.quotas(tx, id)).reduce((n, q) => n + q.reservedSeats, 0);
      if (patch.seats < reserved) throw new BadRequestException(`${reserved} seats are reserved by quotas`);
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
    if (actor.userId) await feedCalendar(tx, actor.tenantId, actor.userId);
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
      if (!opts.skipSeatCheck) {
        if ((await this.seatsLeft(tx, cycle)) < 1) throw new ConflictException('No seats are left in this cycle');
        // Seat quotas: a category's reserved seats, then the general seats.
        const category = categoryOf(a);
        if (!seatAvailable(cycle.seats, await this.seatQuotas(tx, cycle.id), await this.heldByCategory(tx, cycle.id), category)) {
          throw new ConflictException(category ? `No seat is left for the ${category} category` : 'No general seats are left in this cycle');
        }
      }
      offerExpiresOn = addDays(await this.lifecycle.today(tx), cycle.offerValidDays);
    }
    if (to === 'accepted' && a.offerExpiresOn && a.offerExpiresOn < (await this.lifecycle.today(tx))) throw new BadRequestException('This offer has expired');
    const [row] = await tx
      .update(applications)
      .set({
        status: to,
        statusReason: reason?.trim() || null,
        updatedAt: new Date(),
        ...(offerExpiresOn !== undefined ? { offerExpiresOn } : {}),
        // Each correction round keeps what was asked (the items and due date are added by the correction endpoint).
        ...(to === 'correction_requested' ? { correctionNotes: [...a.correctionNotes, { at: new Date().toISOString(), by: actor.userId ?? null, notes: reason?.trim() ?? '', items: [] }] } : {}),
      })
      .where(eq(applications.id, id))
      .returning();
    const event = to === 'offered' ? AdmissionsEvents.ApplicationStatusChanged : to === 'accepted' ? AdmissionsEvents.OfferAccepted : to === 'declined' ? AdmissionsEvents.OfferDeclined : AdmissionsEvents.ApplicationStatusChanged;
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.ApplicationStatusChanged, subjectType: 'application', subjectId: id, data: { from, to, reason: reason ?? null, by: opts.by ?? (actor.userId ? 'staff' : 'applicant') } });
    if (event !== AdmissionsEvents.ApplicationStatusChanged) await audit(tx, { ...auditActor(actor), action: event, subjectType: 'application', subjectId: id, data: { by: opts.by ?? (actor.userId ? 'staff' : 'applicant') } });
    return row;
  }

  /** The cycle's category quotas (categories normalised) with the display name. */
  async quotas(tx: Tx, cycleId: string) {
    const rows = await tx.select().from(admissionQuotas).where(eq(admissionQuotas.cycleId, cycleId)).orderBy(asc(admissionQuotas.category));
    return rows;
  }

  /** Reserved seats per category: the approved `quota/admission-seats` rule in the registry when one is in force, else the cycle's own quotas. */
  async seatQuotas(tx: Tx, cycleId: string): Promise<SeatQuota[]> {
    const governed = quotaSeatsFromRule(await governedParams(tx, 'quota', 'admission-seats'), (await this.cycle(tx, cycleId)).seats);
    if (governed) return governed.map((q) => ({ category: normCategory(q.category), reservedSeats: q.reservedSeats }));
    return (await this.quotas(tx, cycleId)).map((q) => ({ category: normCategory(q.category), reservedSeats: q.reservedSeats }));
  }

  /** Seats held (offered, accepted, enrolled) per category; '' counts those with no category. */
  async heldByCategory(tx: Tx, cycleId: string): Promise<Record<string, number>> {
    const rows = await tx.select({ category: applications.category, answers: applications.answers }).from(applications).where(and(eq(applications.cycleId, cycleId), inArray(applications.status, SEAT_HOLDING)));
    const held: Record<string, number> = {};
    for (const r of rows) {
      const k = categoryOf(r) ?? '';
      held[k] = (held[k] ?? 0) + 1;
    }
    return held;
  }

  /** Replaces the cycle's category quotas. Reserved seats can never exceed the cycle's seats. */
  async setQuotas(tx: Tx, actor: Actor, cycleId: string, input: { category: string; reservedSeats: number }[]) {
    const cycle = await this.cycle(tx, cycleId);
    const keys = input.map((q) => normCategory(q.category));
    if (keys.some((k) => !k)) throw new BadRequestException('Give each quota a category');
    if (new Set(keys).size !== keys.length) throw new BadRequestException('A category appears twice');
    const reserved = input.reduce((n, q) => n + q.reservedSeats, 0);
    if (reserved > cycle.seats) throw new BadRequestException(`The quotas reserve ${reserved} seats but the cycle has only ${cycle.seats}`);
    const held = await this.heldByCategory(tx, cycleId);
    const general = cycle.seats - reserved;
    const reservedBy = new Map(input.map((q) => [normCategory(q.category), q.reservedSeats]));
    const overflow = Object.entries(held).reduce((n, [k, v]) => n + Math.max(0, v - (reservedBy.get(k) ?? 0)), 0);
    if (overflow > general) throw new ConflictException('Offers already made would not fit these quotas');
    await tx.delete(admissionQuotas).where(eq(admissionQuotas.cycleId, cycleId));
    if (input.length) await tx.insert(admissionQuotas).values(input.map((q) => ({ tenantId: actor.tenantId, cycleId, category: q.category.trim(), reservedSeats: q.reservedSeats })));
    await audit(tx, { ...auditActor(actor), action: 'admissions.quotas_set.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { quotas: input } });
    return this.quotaView(tx, cycleId);
  }

  /** Quotas with how many seats are taken, and the general seats left. */
  async quotaView(tx: Tx, cycleId: string) {
    const cycle = await this.cycle(tx, cycleId);
    const quotas = await this.quotas(tx, cycleId);
    const held = await this.heldByCategory(tx, cycleId);
    const reservedBy = new Map(quotas.map((q) => [normCategory(q.category), q.reservedSeats]));
    const reserved = quotas.reduce((n, q) => n + q.reservedSeats, 0);
    const generalUsed = Object.entries(held).reduce((n, [k, v]) => n + Math.max(0, v - (reservedBy.get(k) ?? 0)), 0);
    return {
      seats: cycle.seats,
      generalSeats: cycle.seats - reserved,
      generalLeft: cycle.seats - reserved - generalUsed,
      quotas: quotas.map((q) => ({ category: q.category, reservedSeats: q.reservedSeats, taken: held[normCategory(q.category)] ?? 0, left: Math.max(0, q.reservedSeats - (held[normCategory(q.category)] ?? 0)) })),
    };
  }

  /** Sets (or clears) the category an application counts under for seat quotas. */
  async setCategory(tx: Tx, actor: Actor, id: string, category: string | null) {
    const a = await this.application(tx, id, true);
    if (a.status === 'enrolled') throw new BadRequestException('This applicant is already enrolled');
    const [row] = await tx.update(applications).set({ category: category?.trim() || null, updatedAt: new Date() }).where(eq(applications.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.category_set.v1', subjectType: 'application', subjectId: id, data: { category: row.category } });
    return row;
  }

  /** Entrance test result per application of a cycle: the best score, and whether to leave them out of the merit list. */
  async entranceResults(tx: Tx, cycleId: string) {
    const rows = await tx
      .select({ applicationId: entranceSeats.applicationId, score: entranceSeats.score, absent: entranceSeats.absent, passScore: entranceTests.passScore })
      .from(entranceSeats)
      .innerJoin(entranceTests, eq(entranceTests.id, entranceSeats.testId))
      .where(eq(entranceTests.cycleId, cycleId));
    const out = new Map<string, { score: number; absent: boolean; failed: boolean; pending: boolean }>();
    for (const r of rows) {
      const prev = out.get(r.applicationId);
      const score = r.score ?? 0;
      const failed = !r.absent && r.score != null && r.passScore != null && r.score < r.passScore;
      const pending = !r.absent && r.score == null;
      // Several tests: the applicant is judged on their best one.
      if (!prev || score > prev.score) out.set(r.applicationId, { score, absent: r.absent, failed, pending });
    }
    return out;
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
    const entrance = await this.entranceResults(tx, cycleId);
    const interviews = await interviewResults(tx, cycleId);
    const out = { eligible: 0, ineligible: 0, waiting: 0 };
    for (const a of apps) {
      const failures = eligibilityFailures(rules, { dateOfBirth: a.dateOfBirth, answers: a.answers }, today);
      const gaps = await this.documentGaps(tx, a, cycle);
      const score = meritScore(cfg.meritRules, { ...a.answers, [ENTRANCE_SCORE_FIELD]: entrance.get(a.id)?.score ?? 0, [INTERVIEW_SCORE_FIELD]: interviews.get(a.id)?.score ?? 0 });
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
    const entrance = await this.entranceResults(tx, cycleId);
    const interviews = await interviewResults(tx, cycleId);
    // Candidates who missed the entrance test or fell below its pass mark are not ranked; scores must be in first.
    const pending = pool.filter((a) => entrance.get(a.id)?.pending);
    if (pending.length) throw new ConflictException(`Enter the entrance test scores first: ${pending.length} candidate${pending.length === 1 ? ' has' : 's have'} no score`);
    const sat = pool.filter((a) => {
      const e = entrance.get(a.id);
      return !e?.absent && !e?.failed && !interviews.get(a.id)?.rejected;
    });
    if (sat.length === 0) throw new BadRequestException('No candidates cleared the entrance test');
    const byId = new Map(sat.map((a) => [a.id, a]));
    const order = rankMerit(sat.map((a) => ({ id: a.id, score: meritScore(rules, { ...a.answers, [ENTRANCE_SCORE_FIELD]: entrance.get(a.id)?.score ?? 0, [INTERVIEW_SCORE_FIELD]: interviews.get(a.id)?.score ?? 0 }), submittedAt: a.submittedAt })), sat.length);
    const decisions = allocateSeats(order.map((o) => ({ category: categoryOf(byId.get(o.id)!) })), cycle.seats, await this.seatQuotas(tx, cycleId), await this.heldByCategory(tx, cycleId));
    const ranked = order.map((o, i) => ({ ...o, decision: decisions[i] }));
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
    if (actor.userId) await feedCalendar(tx, actor.tenantId, actor.userId);
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
  async enroll(tx: Tx, actor: Actor & { userId: string }, id: string, input: { sectionId?: string; rollNo?: string; activate: boolean; duplicateOverride?: string }) {
    const a = await this.application(tx, id, true);
    if (a.status !== 'accepted') throw new BadRequestException(a.status === 'enrolled' ? 'This applicant is already enrolled' : 'Only an accepted offer can be enrolled');
    const cycle = await this.cycle(tx, a.cycleId);
    if (!['none', 'paid', 'waived'].includes(a.feeStatus)) throw new BadRequestException('The application fee has not been paid');
    const gaps = await this.documentGaps(tx, a, cycle);
    if (gaps.length) throw new BadRequestException(`Documents outstanding: ${gaps.join(', ')}`);
    // One person, one record: a likely duplicate stops enrolment until the office says why it is not.
    const duplicates = await findDuplicates(tx, a);
    if (duplicates.length) {
      if (!input.duplicateOverride) throw new ConflictException({ code: 'DUPLICATE_PERSON', message: `This applicant looks like someone already on record: ${duplicates.map((d) => `${d.label} (${d.reasons.join(', ').toLowerCase()})`).join('; ')}. Check them, then enrol again with a reason.`, duplicates });
      await audit(tx, { ...auditActor(actor), action: 'admissions.duplicate.overridden', subjectType: 'application', subjectId: id, data: { reason: input.duplicateOverride, duplicates } });
    }

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
    await tx.update(studentPriorEducation).set({ studentId: st.id }).where(eq(studentPriorEducation.applicationId, a.id));
    // APAAR / ABC ids typed on the application form carry over to the student (DigiLocker, NAD and credit files use them).
    const idOf = (...keys: string[]) => keys.map((k) => String(a.answers?.[k] ?? '').replace(/\s|-/g, '')).find((v) => /^\d{12}$/.test(v)) ?? null;
    const apaarId = idOf('apaar_id', 'apaarId', 'apaar');
    const abcId = idOf('abc_id', 'abcId', 'abc');
    if (apaarId || abcId) await tx.insert(studentAcademicIds).values({ tenantId: actor.tenantId, studentId: st.id, apaarId, abcId, source: 'admission', capturedBy: actor.userId });
    await this.lifecycle.addEvent(tx, actor, { studentId: st.id, kind: 'status', fromStatus: 'applicant', toStatus: 'enrolled', toSectionId: section.id, reason: `Admitted: ${a.applicationNo}`, effectiveOn: today, data: { applicationId: a.id, rollNo } });
    await this.lifecycle.linkGuardian(tx, actor, st.id, { fullName: a.guardianName, phone: a.guardianPhone, email: a.guardianEmail, relation: a.guardianRelation, isPrimary: true, isEmergencyContact: true });
    if (input.activate) await this.lifecycle.changeStatus(tx, actor, st.id, 'active', { reason: 'Joined the class', effectiveOn: today });

    await tx.update(applications).set({ status: 'enrolled', studentId: st.id, statusReason: null, updatedAt: new Date() }).where(eq(applications.id, id));
    if (a.enquiryId) await tx.update(enquiries).set({ stage: 'converted', applicationId: a.id, updatedAt: new Date() }).where(eq(enquiries.id, a.enquiryId));
    await accrueCommission(tx, actor.tenantId, a);
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.ApplicationEnrolled, subjectType: 'application', subjectId: id, data: { studentId: st.id, sectionId: section.id, rollNo } });
    await this.events.emit(tx, actor.tenantId, { type: DomainEvents.StudentEnrolled, aggregateType: 'student', aggregateId: st.id, actorId: actor.userId, payload: { applicationId: id, sectionId: section.id, rollNo } });
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
