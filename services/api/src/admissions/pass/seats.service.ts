import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type AdmissionFormField } from '@zynetix/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { resolveAffiliation } from '../../affiliation/resolve.js';
import { audit } from '../../common/audit.js';
import type { Tx } from '../../db/db.service.js';
import { admissionSeatConversions } from '../../db/schema-admissions-pass.js';
import { admissionAllotments, admissionCycles, admissionRounds, admissionSeatMatrix, applicationIndexMarks, applicationPreferences, applications } from '../../db/schema.js';
import { AdmissionsService, categoryOf, configProblems, cycleConfig, hashToken, newToken } from '../admissions.service.js';
import { DepthService, seatTypeOf } from '../depth/depth.service.js';
import { INDEX_PRESETS } from '../depth/index-mark.js';
import { auditActor, type Actor } from '../enquiries.service.js';
import { ELIGIBILITY_PRESETS, FACT_FIELDS, presetByKey, presetsFor, QUALIFYING_LABELS } from './eligibility-profile.js';
import {
  buildSeatPlan,
  categoryKey,
  dereserve,
  HORIZONTAL_KINDS,
  KARNATAKA_CATEGORIES,
  KARNATAKA_DERESERVE,
  MERIT,
  PLAN_PRESETS,
  planProblems,
  SEAT_TYPE_LABELS,
  SEAT_TYPES,
  SUPERNUMERARY_KINDS,
  TFW_INCOME_LIMIT_PAISE,
  type DereserveRules,
  type SeatPlanInput,
} from './reservation.js';

/** Applications still in the running for a seat (the rest have left or been refused). */
const ALIVE = ['submitted', 'under_review', 'eligible', 'waitlisted', 'offered', 'accepted'] as const;
const HOLDING = ['pending', 'freeze', 'float', 'slide'];

/** Which answer key an entrance-test score feeds, per exam, when the cycle's formula has that component. */
const SCORE_KEY: Record<string, string> = { kcet: 'cet_pcm', neet: 'neet', pgcet: 'pgcet', kmat: 'kmat' };
/** The formula key a rank feeds for rank-based exams. */
const RANK_KEY: Record<string, string> = { kcet: 'kcet_rank', comedk: 'comedk_rank', jee_main: 'jee_crl_rank' };
export const EXAMS = ['kcet', 'comedk', 'neet', 'jee_main', 'pgcet', 'kmat', 'dcet', 'cat', 'mat', 'cmat'] as const;

export interface EntranceRow {
  applicationNo?: string;
  rollNo?: string;
  rank?: number;
  score?: number;
}

export interface ExternalAllotmentRow {
  allotmentRef: string;
  rollNo: string;
  rank: number;
  name: string;
  dateOfBirth?: string;
  gender?: 'female' | 'male' | 'other';
  phone: string;
  email?: string;
  guardianName: string;
  guardianPhone: string;
  category: string;
  option?: string;
  claims?: { horizontal?: string[]; supernumerary?: string[] };
}

/**
 * The reservation matrix and everything that feeds it: the seat plan from a preset, de-reservation between rounds,
 * verified claims, entrance-test results, seats allotted by KEA or COMEDK, and eligibility from the university profile.
 */
@Injectable()
export class SeatsService {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly depth: DepthService,
  ) {}

  /** The fixed lists the screens choose from. */
  catalog() {
    return {
      seatTypes: SEAT_TYPES.map((k) => ({ key: k, label: SEAT_TYPE_LABELS[k] })),
      categories: [{ key: MERIT, label: 'General merit (GM)', percent: null }, ...KARNATAKA_CATEGORIES],
      horizontalKinds: HORIZONTAL_KINDS,
      supernumeraryKinds: SUPERNUMERARY_KINDS,
      planPresets: PLAN_PRESETS,
      eligibilityPresets: ELIGIBILITY_PRESETS.map((p) => ({ key: p.key, label: p.label, profiles: p.profiles, source: p.source })),
      entrancePresets: Object.entries(INDEX_PRESETS).filter(([, v]) => v.formula.exam).map(([key, v]) => ({ key, label: v.label, exam: v.formula.exam })),
      exams: EXAMS,
      tfwIncomeLimitPaise: TFW_INCOME_LIMIT_PAISE,
    };
  }

  // ---- seat plan -----------------------------------------------------------------------------------------------

  private async assertNoRounds(tx: Tx, cycleId: string) {
    const [started] = await tx.select({ id: admissionRounds.id }).from(admissionRounds).where(eq(admissionRounds.cycleId, cycleId)).limit(1);
    if (started) throw new ConflictException('Counselling rounds have started; the seat matrix is locked (use de-reservation between rounds)');
  }

  /** Replaces the cycle's matrix with the rows a plan builds. The approved intake must fit the cycle's seats. */
  async applyPlan(tx: Tx, actor: Actor, cycleId: string, plan: SeatPlanInput) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    const problems = planProblems(plan);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    const intake = plan.options.reduce((n, o) => n + o.intake, 0);
    if (intake > cycle.seats) throw new BadRequestException(`The options have ${intake} seats but the cycle has only ${cycle.seats}`);
    await this.assertNoRounds(tx, cycleId);
    const rows = buildSeatPlan(plan);
    await tx.delete(admissionSeatMatrix).where(eq(admissionSeatMatrix.cycleId, cycleId));
    if (rows.length) {
      await tx.insert(admissionSeatMatrix).values(rows.map((r, i) => ({ tenantId: actor.tenantId, cycleId, optionLabel: r.option, seatType: r.seatType, category: r.category, seats: r.seats, horizontal: r.horizontal, supernumerary: r.supernumerary, sortOrder: i })));
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.seat_plan_applied.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { options: plan.options, seatTypes: plan.seatTypes, rows: rows.length, intake, supernumerary: rows.filter((r) => r.supernumerary).reduce((n, r) => n + r.seats, 0) } });
    return this.matrix(tx, cycleId);
  }

  /**
   * The matrix with live fill: seats held in counselling (pending, frozen, floating) and seats taken by applications
   * placed outside the rounds (KEA / COMEDK allotments and enrolled students), per row; totals per seat type and category.
   */
  async matrix(tx: Tx, cycleId: string) {
    await this.admissions.cycle(tx, cycleId);
    const status = await this.depth.seatStatus(tx, cycleId);
    const placed = await tx
      .select({ option: applications.allottedOption, seatType: applications.seatType, category: applications.seatCategory, n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.cycleId, cycleId), inArray(applications.status, ['accepted', 'enrolled']), sql`${applications.externalAllotmentRef} is not null`))
      .groupBy(applications.allottedOption, applications.seatType, applications.seatCategory);
    const rows = status.map((r) => {
      const outside = placed.find((p) => p.option === r.option && p.seatType === r.seatType && p.category === r.category)?.n ?? 0;
      return { ...r, outside, left: r.left - outside };
    });
    const conversions = await tx.select().from(admissionSeatConversions).where(eq(admissionSeatConversions.cycleId, cycleId)).orderBy(asc(admissionSeatConversions.createdAt));
    const intake = rows.filter((r) => !r.supernumerary);
    const totals = {
      intake: intake.reduce((n, r) => n + r.seats, 0),
      supernumerary: rows.filter((r) => r.supernumerary).reduce((n, r) => n + r.seats, 0),
      held: rows.reduce((n, r) => n + r.held + r.outside, 0),
      left: rows.reduce((n, r) => n + Math.max(0, r.left), 0),
      bySeatType: Object.fromEntries([...new Set(rows.map((r) => r.seatType))].map((t) => [t, { seats: rows.filter((r) => r.seatType === t).reduce((n, r) => n + r.seats, 0), left: rows.filter((r) => r.seatType === t).reduce((n, r) => n + Math.max(0, r.left), 0) }])),
    };
    return { cycleId, rows, totals, conversions };
  }

  /**
   * Between rounds: converts seats nobody can take (SC ↔ ST where a candidate of the other waits, then reserved rows
   * to GM, and optionally a seat type's leftovers to another), records each move and changes the matrix.
   */
  async dereserve(tx: Tx, actor: Actor, cycleId: string, rules: DereserveRules = KARNATAKA_DERESERVE) {
    await this.admissions.cycle(tx, cycleId);
    const [last] = await tx.select().from(admissionRounds).where(eq(admissionRounds.cycleId, cycleId)).orderBy(desc(admissionRounds.roundNo)).limit(1);
    if (!last) throw new BadRequestException('Run at least one round before converting seats');
    if (last.status !== 'closed') throw new ConflictException(`Close round ${last.roundNo} first`);
    const view = await this.matrix(tx, cycleId);
    // Who is still waiting: in the running, holding no seat, with a preference for the option.
    const latest = await tx
      .select({ applicationId: admissionAllotments.applicationId, response: admissionAllotments.response, roundNo: admissionRounds.roundNo })
      .from(admissionAllotments)
      .innerJoin(admissionRounds, eq(admissionRounds.id, admissionAllotments.roundId))
      .where(eq(admissionAllotments.cycleId, cycleId))
      .orderBy(asc(admissionRounds.roundNo));
    const lastResponse = new Map(latest.map((l) => [l.applicationId, l.response]));
    const pool = await tx
      .select({ a: applications, p: applicationPreferences })
      .from(applications)
      .innerJoin(applicationPreferences, eq(applicationPreferences.applicationId, applications.id))
      .innerJoin(applicationIndexMarks, eq(applicationIndexMarks.applicationId, applications.id))
      .where(and(eq(applications.cycleId, cycleId), inArray(applications.status, [...ALIVE]), sql`${applicationIndexMarks.overallRank} is not null`));
    const waiting = new Set<string>();
    for (const r of pool) {
      const resp = lastResponse.get(r.a.id);
      if (resp && (HOLDING.includes(resp) || resp === 'reject' || resp === 'forfeit')) continue;
      for (const o of r.p.options) waiting.add(`${o}|${seatTypeOf(r.a.quota)}|${categoryKey(categoryOf(r.a))}`);
    }
    const remaining = view.rows.map((r) => ({ option: r.option, seatType: r.seatType, category: r.category, seats: Math.max(0, r.left), horizontal: {}, supernumerary: r.supernumerary }));
    const { moves } = dereserve(remaining, waiting, rules);
    for (const m of moves) {
      const [from] = await tx.select().from(admissionSeatMatrix).where(and(eq(admissionSeatMatrix.cycleId, cycleId), eq(admissionSeatMatrix.optionLabel, m.option), eq(admissionSeatMatrix.seatType, m.seatType), eq(admissionSeatMatrix.category, m.from)));
      await tx.update(admissionSeatMatrix).set({ seats: from.seats - m.seats }).where(eq(admissionSeatMatrix.id, from.id));
      await tx
        .insert(admissionSeatMatrix)
        .values({ tenantId: actor.tenantId, cycleId, optionLabel: m.option, seatType: m.toSeatType, category: m.to, seats: m.seats, sortOrder: 999 })
        .onConflictDoUpdate({ target: [admissionSeatMatrix.cycleId, admissionSeatMatrix.optionLabel, admissionSeatMatrix.seatType, admissionSeatMatrix.category], set: { seats: sql`${admissionSeatMatrix.seats} + ${m.seats}` } });
      await tx.insert(admissionSeatConversions).values({ tenantId: actor.tenantId, cycleId, afterRound: last.roundNo, optionLabel: m.option, fromSeatType: m.seatType, fromCategory: m.from, toSeatType: m.toSeatType, toCategory: m.to, seats: m.seats, reason: m.why, createdBy: actor.userId });
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.seats_dereserved.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { afterRound: last.roundNo, moves } });
    return { afterRound: last.roundNo, moves, matrix: await this.matrix(tx, cycleId) };
  }

  // ---- claims and entrance results -----------------------------------------------------------------------------------

  /** The office records the claims it has verified on the certificates. TFW needs a family income under Rs 8 lakh. */
  async setClaims(tx: Tx, actor: Actor, applicationId: string, input: { horizontal: string[]; supernumerary: string[]; familyIncomePaise?: number | null }) {
    const a = await this.admissions.application(tx, applicationId, true);
    if (input.supernumerary.includes('tfw') && !(typeof input.familyIncomePaise === 'number' && input.familyIncomePaise < TFW_INCOME_LIMIT_PAISE)) throw new BadRequestException('The tuition fee waiver needs a family income below Rs 8,00,000 a year');
    if (input.supernumerary.includes('foreign') && a.nationality === 'indian') throw new BadRequestException('The foreign-national seats are for NRI, PIO and foreign applicants only');
    const claims = { horizontal: [...new Set(input.horizontal)], supernumerary: [...new Set(input.supernumerary)], ...(typeof input.familyIncomePaise === 'number' ? { familyIncomePaise: input.familyIncomePaise } : {}), verifiedBy: actor.userId ?? undefined, verifiedAt: new Date().toISOString() };
    await tx.update(applications).set({ claims, updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await audit(tx, { ...auditActor(actor), action: 'admissions.claims_verified.v1', subjectType: 'application', subjectId: applicationId, before: { claims: a.claims }, after: { claims }, data: {} });
    return claims;
  }

  /**
   * Entrance results for a cycle, matched by application number or entrance roll number. The rank or score is kept on
   * the application and, when the cycle's index formula reads that test, entered as its mark (the rank list then rebuilds).
   */
  async importEntrance(tx: Tx, actor: Actor, cycleId: string, exam: string, rows: EntranceRow[]) {
    await this.admissions.cycle(tx, cycleId);
    const apps = await tx.select({ id: applications.id, no: applications.applicationNo, roll: applications.entranceRollNo }).from(applications).where(eq(applications.cycleId, cycleId));
    const byNo = new Map(apps.map((a) => [a.no.toUpperCase(), a.id]));
    const byRoll = new Map(apps.filter((a) => a.roll).map((a) => [a.roll!.toUpperCase(), a.id]));
    let formula: Awaited<ReturnType<DepthService['formula']>> | null = null;
    try {
      formula = await this.depth.formula(tx, cycleId);
    } catch {
      formula = null;
    }
    const out = { updated: 0, marked: 0, unmatched: [] as string[], errors: [] as string[] };
    for (const r of rows) {
      const key = (r.applicationNo ?? r.rollNo ?? '').trim().toUpperCase();
      const id = (r.applicationNo && byNo.get(r.applicationNo.trim().toUpperCase())) || (r.rollNo && byRoll.get(r.rollNo.trim().toUpperCase()));
      if (!id) {
        out.unmatched.push(key || '(blank)');
        continue;
      }
      await tx.update(applications).set({ entranceExam: exam, ...(r.rollNo ? { entranceRollNo: r.rollNo.trim() } : {}), ...(r.rank !== undefined ? { entranceRank: r.rank } : {}), ...(r.score !== undefined ? { entranceScore: r.score } : {}), updatedAt: new Date() }).where(eq(applications.id, id));
      out.updated++;
      if (formula) {
        const marks: Record<string, number> = {};
        if (formula.rankBy && r.rank !== undefined && formula.rankBy.key === RANK_KEY[exam]) marks[formula.rankBy.key] = r.rank;
        if (r.score !== undefined && SCORE_KEY[exam] && formula.components.some((c) => c.key === SCORE_KEY[exam])) marks[SCORE_KEY[exam]] = r.score;
        if (Object.keys(marks).length) {
          try {
            await this.depth.setMarks(tx, actor, id, marks);
            out.marked++;
          } catch (e) {
            out.errors.push(`${key}: ${(e as Error).message}`);
          }
        }
      }
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_results_imported.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { exam, rows: rows.length, updated: out.updated, marked: out.marked, unmatched: out.unmatched.length } });
    return out;
  }

  /**
   * Candidates the counselling authority (KEA for government seats, COMEDK) allotted to the college: each becomes an
   * accepted application holding that seat, ready for the checklist and enrolment. The allotment reference makes the
   * import safe to repeat.
   */
  async importExternalAllotments(tx: Tx, actor: Actor, cycleId: string, authority: 'kea' | 'comedk', rows: ExternalAllotmentRow[]) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    const seatType = authority === 'kea' ? MERIT : 'comedk';
    const exam = authority === 'kea' ? 'kcet' : 'comedk';
    const out = { created: 0, skipped: [] as string[], applications: [] as { applicationNo: string; name: string; allotmentRef: string }[] };
    for (const r of rows) {
      const ref = `${authority.toUpperCase()}:${r.allotmentRef.trim().toUpperCase()}`;
      const [dup] = await tx.select({ no: applications.applicationNo }).from(applications).where(eq(applications.externalAllotmentRef, ref));
      if (dup) {
        out.skipped.push(`${r.allotmentRef}: already imported as ${dup.no}`);
        continue;
      }
      const applicationNo = await this.admissions.nextApplicationNo(tx, cycle);
      const [a] = await tx
        .insert(applications)
        .values({
          tenantId: actor.tenantId,
          cycleId,
          applicationNo,
          applicantName: r.name,
          dateOfBirth: r.dateOfBirth ?? null,
          gender: r.gender ?? null,
          phone: r.phone,
          email: r.email ?? null,
          guardianName: r.guardianName,
          guardianPhone: r.guardianPhone,
          answers: {},
          status: 'accepted',
          statusReason: `Allotted by ${authority.toUpperCase()} (${r.allotmentRef})`,
          feeStatus: 'none',
          category: r.category,
          quota: seatType,
          seatType,
          seatCategory: categoryKey(r.category),
          allottedOption: r.option ?? null,
          entranceExam: exam,
          entranceRollNo: r.rollNo,
          entranceRank: r.rank,
          claims: r.claims ?? {},
          externalAllotmentRef: ref,
          accessTokenHash: hashToken(newToken()),
        })
        .returning();
      await audit(tx, { ...auditActor(actor), action: 'admissions.application.allotted_externally.v1', subjectType: 'application', subjectId: a.id, data: { authority, allotmentRef: r.allotmentRef, rank: r.rank, category: r.category, option: r.option ?? null } });
      out.created++;
      out.applications.push({ applicationNo, name: r.name, allotmentRef: r.allotmentRef });
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.external_allotments_imported.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { authority, rows: rows.length, created: out.created, skipped: out.skipped.length } });
    return out;
  }

  // ---- eligibility from the university profile ---------------------------------------------------------------------

  /** The presets that fit the cycle's programme (by its affiliation profile), and the one chosen. */
  async eligibilityOptions(tx: Tx, cycleId: string) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    const aff = await resolveAffiliation(tx, cycle.programId);
    const chosen = (cycle.eligibility as { profilePreset?: string }).profilePreset ?? null;
    return {
      profile: aff ? { code: aff.profile.code, name: aff.profile.name, scheme: aff.scheme.code, registerNumber: aff.rules.registerNumber } : null,
      presets: presetsFor(aff?.profile.code ?? null).map((p) => ({ ...p, qualifyingLabels: p.qualifying.map((q) => QUALIFYING_LABELS[q]) })),
      chosen: chosen ? (presetByKey(chosen) ?? null) : null,
    };
  }

  /** Chooses a preset for the cycle and adds the questions it reads to the cycle's form (those already there stay). */
  async setEligibilityPreset(tx: Tx, actor: Actor, cycleId: string, key: string | null) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    const cfg = cycleConfig(cycle);
    const eligibility = { ...(cycle.eligibility as Record<string, unknown>) };
    let formFields = cfg.formFields;
    if (key === null) delete eligibility.profilePreset;
    else {
      const p = presetByKey(key);
      if (!p) throw new NotFoundException('Unknown eligibility preset');
      eligibility.profilePreset = key;
      const have = new Set(formFields.map((f) => f.key));
      const added: AdmissionFormField[] = p.fields.filter((k) => !have.has(k)).map((k) => ({ key: k, label: FACT_FIELDS[k].label, type: FACT_FIELDS[k].type, required: k !== 'entrance_percentile', ...(FACT_FIELDS[k].options ? { options: FACT_FIELDS[k].options } : {}), ...(FACT_FIELDS[k].min !== undefined ? { min: FACT_FIELDS[k].min, max: FACT_FIELDS[k].max } : {}) }) as AdmissionFormField);
      if (added.length) {
        const [got] = await tx.select({ n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.cycleId, cycleId));
        if (got.n > 0) throw new ConflictException(`Applications have been received, so the form cannot gain the questions this rule reads (${added.map((f) => f.label).join(', ')}). Choose it before the cycle opens, or use a preset whose questions the form already has.`);
      }
      formFields = [...formFields, ...added];
    }
    const problems = configProblems({ ...cfg, formFields });
    if (problems.length) throw new BadRequestException(problems.join('; '));
    const [row] = await tx.update(admissionCycles).set({ eligibility, formFields, updatedAt: new Date() }).where(eq(admissionCycles.id, cycleId)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.eligibility_preset_set.v1', subjectType: 'admission_cycle', subjectId: cycleId, before: { profilePreset: (cycle.eligibility as { profilePreset?: string }).profilePreset ?? null }, after: { profilePreset: key }, data: {} });
    return row;
  }
}
