import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../../common/audit.js';
import type { Tx } from '../../db/db.service.js';
import {
  admissionAgents,
  admissionAllotments,
  admissionIndexFormulas,
  admissionRounds,
  admissionSeatMatrix,
  agentCommissionRules,
  agentCommissions,
  agentPayouts,
  applicationIndexMarks,
  applicationPreferences,
  applications,
} from '../../db/schema.js';
import { governedParams } from '../../governance/rule-params.js';
import { AdmissionsService, normCategory, categoryOf } from '../admissions.service.js';
import { type Actor, auditActor } from '../enquiries.service.js';
import { MERIT, runRound, seatMatrixFromShares, type Contender, type Held, type Response, type SeatRow } from './allotment.js';
import { tdsOn, type CommissionRule } from './commission.js';
import { computeIndexMark, formulaProblems, INDEX_PRESETS, overlayWeights, type IndexFormula } from './index-mark.js';
import { buildRankList, type RankCandidate } from './rank-list.js';

/** Applications that still compete for a seat. */
const RANKABLE = ['submitted', 'under_review', 'eligible', 'waitlisted', 'offered', 'accepted'] as const;
const HOLDING: Response[] = ['pending', 'freeze', 'float', 'slide'];

/** Admission depth: index marks, rank lists, seat matrix, CAP-style rounds, agent commission rules and payouts. */
@Injectable()
export class DepthService {
  constructor(private readonly admissions: AdmissionsService) {}

  // ---- index-mark formula and marks -----------------------------------------------------------------

  /** The cycle's formula with any registry weights (`admission/index-mark`) laid over it. */
  async formula(tx: Tx, cycleId: string): Promise<IndexFormula> {
    const [row] = await tx.select().from(admissionIndexFormulas).where(eq(admissionIndexFormulas.cycleId, cycleId));
    if (!row) throw new NotFoundException('Set an index-mark formula for this cycle first');
    return overlayWeights(row.spec as unknown as IndexFormula, await governedParams(tx, 'admission', 'index-mark'));
  }

  async setFormula(tx: Tx, actor: Actor, cycleId: string, input: { preset?: string; spec?: IndexFormula }) {
    await this.admissions.cycle(tx, cycleId);
    const spec = input.spec ?? (input.preset ? INDEX_PRESETS[input.preset]?.formula : undefined);
    if (!spec) throw new BadRequestException('Choose a preset or give a formula');
    const problems = formulaProblems(spec);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    await tx
      .insert(admissionIndexFormulas)
      .values({ tenantId: actor.tenantId, cycleId, spec: spec as unknown as Record<string, unknown>, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: admissionIndexFormulas.cycleId, set: { spec: spec as unknown as Record<string, unknown>, updatedBy: actor.userId } });
    await tx.update(applicationIndexMarks).set({ overallRank: null, categoryRank: null }).where(eq(applicationIndexMarks.cycleId, cycleId));
    await audit(tx, { ...auditActor(actor), action: 'admissions.index_formula_set.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { preset: spec.preset } });
    return { cycleId, formula: await this.formula(tx, cycleId) };
  }

  /** Enter or correct an applicant's marks; the index mark is recomputed and the cycle's ranks are cleared until the list is rebuilt. */
  async setMarks(tx: Tx, actor: Actor, applicationId: string, marks: Record<string, number>) {
    const [a] = await tx.select({ id: applications.id, cycleId: applications.cycleId }).from(applications).where(eq(applications.id, applicationId));
    if (!a) throw new NotFoundException('Application not found');
    const f = await this.formula(tx, a.cycleId);
    const problems = formulaProblems(f, marks);
    if (problems.length) throw new BadRequestException(problems.join('; '));
    const [prev] = await tx.select().from(applicationIndexMarks).where(eq(applicationIndexMarks.applicationId, applicationId));
    const merged = { ...(prev?.marks ?? {}), ...marks };
    const res = computeIndexMark(f, merged);
    const values = { marks: merged, indexMark: res.indexMark, breakdown: res as unknown as Record<string, unknown>, complete: res.missing.length === 0, overallRank: null, categoryRank: null };
    const [row] = await tx
      .insert(applicationIndexMarks)
      .values({ tenantId: actor.tenantId, cycleId: a.cycleId, applicationId, ...values })
      .onConflictDoUpdate({ target: applicationIndexMarks.applicationId, set: { ...values, updatedAt: new Date() } })
      .returning();
    await tx.update(applicationIndexMarks).set({ overallRank: null, categoryRank: null }).where(eq(applicationIndexMarks.cycleId, a.cycleId));
    await audit(tx, { ...auditActor(actor), action: 'admissions.index_marks_set.v1', subjectType: 'application', subjectId: applicationId, data: { indexMark: res.indexMark, missing: res.missing } });
    return row;
  }

  // ---- rank lists -----------------------------------------------------------------------------------

  /** Builds the overall and per-category rank lists from complete index marks and stores the ranks. */
  async buildRankList(tx: Tx, actor: Actor, cycleId: string) {
    const f = await this.formula(tx, cycleId);
    const rows = await tx
      .select({ a: applications, m: applicationIndexMarks })
      .from(applications)
      .innerJoin(applicationIndexMarks, eq(applicationIndexMarks.applicationId, applications.id))
      .where(and(eq(applications.cycleId, cycleId), inArray(applications.status, [...RANKABLE])));
    const incomplete = rows.filter((r) => !r.m.complete).map((r) => ({ applicationId: r.a.id, applicationNo: r.a.applicationNo, missing: (r.m.breakdown as { missing?: string[] }).missing ?? [] }));
    const cands: RankCandidate[] = rows
      .filter((r) => r.m.complete && r.m.indexMark !== null)
      .map((r) => ({ id: r.a.id, applicationNo: r.a.applicationNo, indexMark: r.m.indexMark!, category: categoryOf(r.a), dateOfBirth: r.a.dateOfBirth ?? '9999-12-31', tie: f.tieBreak.map((k) => Number(r.m.marks[k] ?? 0)) }));
    const ranked = buildRankList(cands);
    for (const r of ranked) await tx.update(applicationIndexMarks).set({ overallRank: r.overallRank, categoryRank: r.categoryRank }).where(eq(applicationIndexMarks.applicationId, r.id));
    await audit(tx, { ...auditActor(actor), action: 'admissions.rank_list_built.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { ranked: ranked.length, incomplete: incomplete.length } });
    return { ranked: ranked.length, incomplete };
  }

  /** The stored rank list, overall or for one category. */
  async rankList(tx: Tx, cycleId: string, category?: string) {
    const rows = await tx
      .select({ a: applications, m: applicationIndexMarks })
      .from(applicationIndexMarks)
      .innerJoin(applications, eq(applications.id, applicationIndexMarks.applicationId))
      .where(and(eq(applicationIndexMarks.cycleId, cycleId), sql`${applicationIndexMarks.overallRank} is not null`))
      .orderBy(asc(applicationIndexMarks.overallRank));
    const out = rows.map((r) => ({ applicationId: r.a.id, applicationNo: r.a.applicationNo, name: r.a.applicantName, category: categoryOf(r.a), indexMark: r.m.indexMark, overallRank: r.m.overallRank!, categoryRank: r.m.categoryRank }));
    const want = category ? normCategory(category) : '';
    return { cycleId, category: want || null, rows: want ? out.filter((r) => r.category === want).sort((a, b) => (a.categoryRank ?? 0) - (b.categoryRank ?? 0)) : out };
  }

  // ---- seat matrix and preferences ------------------------------------------------------------------

  async seatMatrix(tx: Tx, cycleId: string) {
    return tx.select().from(admissionSeatMatrix).where(eq(admissionSeatMatrix.cycleId, cycleId)).orderBy(asc(admissionSeatMatrix.optionLabel), asc(admissionSeatMatrix.category));
  }

  /**
   * Replaces the seat matrix. Either explicit rows, or `generate`: options with their seats, split by the reservation shares of the
   * rule `quota/admission-seats` in the registry (else the cycle's own quotas), the rest being merit seats.
   */
  async setSeatMatrix(tx: Tx, actor: Actor, cycleId: string, input: { rows?: SeatRow[]; generate?: { label: string; seats: number }[] }) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    let rows: SeatRow[];
    if (input.generate) {
      const total = input.generate.reduce((n, o) => n + o.seats, 0);
      if (total > cycle.seats) throw new BadRequestException(`The options have ${total} seats but the cycle has only ${cycle.seats}`);
      rows = seatMatrixFromShares(input.generate, await this.admissions.seatQuotas(tx, cycleId), cycle.seats);
    } else rows = input.rows ?? [];
    rows = rows.map((r) => ({ ...r, category: r.category === MERIT ? MERIT : normCategory(r.category) })).filter((r) => r.seats > 0);
    const keys = rows.map((r) => `${r.option}|${r.category}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('An option and category appear twice');
    if (rows.reduce((n, r) => n + r.seats, 0) > cycle.seats) throw new BadRequestException(`The seat matrix has more seats than the cycle's ${cycle.seats}`);
    const [started] = await tx.select({ id: admissionRounds.id }).from(admissionRounds).where(eq(admissionRounds.cycleId, cycleId)).limit(1);
    if (started) throw new ConflictException('Rounds have started; the seat matrix is locked');
    await tx.delete(admissionSeatMatrix).where(eq(admissionSeatMatrix.cycleId, cycleId));
    if (rows.length) await tx.insert(admissionSeatMatrix).values(rows.map((r) => ({ tenantId: actor.tenantId, cycleId, optionLabel: r.option, category: r.category, seats: r.seats })));
    await audit(tx, { ...auditActor(actor), action: 'admissions.seat_matrix_set.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { rows: rows.length } });
    return this.seatStatus(tx, cycleId);
  }

  /** Each matrix row with the seats held (pending, frozen or floating allotments in the latest round of each applicant) and left. */
  async seatStatus(tx: Tx, cycleId: string) {
    const matrix = await this.seatMatrix(tx, cycleId);
    const held = await this.latestAllotments(tx, cycleId);
    return matrix.map((m) => {
      const taken = [...held.values()].filter((h) => h.optionLabel === m.optionLabel && h.seatCategory === m.category && HOLDING.includes(h.response as Response)).length;
      return { option: m.optionLabel, category: m.category, seats: m.seats, held: taken, left: m.seats - taken };
    });
  }

  async setPreferences(tx: Tx, actor: Actor, applicationId: string, options: string[]) {
    const [a] = await tx.select({ id: applications.id, cycleId: applications.cycleId }).from(applications).where(eq(applications.id, applicationId));
    if (!a) throw new NotFoundException('Application not found');
    const labels = new Set((await this.seatMatrix(tx, a.cycleId)).map((m) => m.optionLabel));
    if (new Set(options).size !== options.length) throw new BadRequestException('An option appears twice');
    const bad = options.filter((o) => !labels.has(o));
    if (bad.length) throw new BadRequestException(`Not an option in this cycle: ${bad.join(', ')}`);
    const [open] = await tx.select({ id: admissionRounds.id }).from(admissionRounds).where(and(eq(admissionRounds.cycleId, a.cycleId), eq(admissionRounds.status, 'published'))).limit(1);
    if (open) throw new ConflictException('A round is open; preferences are locked until it closes');
    const [row] = await tx
      .insert(applicationPreferences)
      .values({ tenantId: actor.tenantId, cycleId: a.cycleId, applicationId, options })
      .onConflictDoUpdate({ target: applicationPreferences.applicationId, set: { options, updatedAt: new Date() } })
      .returning();
    return row;
  }

  // ---- CAP rounds -----------------------------------------------------------------------------------

  /** The latest allotment of each applicant across rounds. */
  private async latestAllotments(tx: Tx, cycleId: string) {
    const rows = await tx
      .select({ al: admissionAllotments, roundNo: admissionRounds.roundNo })
      .from(admissionAllotments)
      .innerJoin(admissionRounds, eq(admissionRounds.id, admissionAllotments.roundId))
      .where(eq(admissionAllotments.cycleId, cycleId))
      .orderBy(asc(admissionRounds.roundNo));
    const latest = new Map<string, typeof admissionAllotments.$inferSelect>();
    for (const r of rows) latest.set(r.al.applicationId, r.al);
    return latest;
  }

  async rounds(tx: Tx, cycleId: string) {
    const rounds = await tx.select().from(admissionRounds).where(eq(admissionRounds.cycleId, cycleId)).orderBy(asc(admissionRounds.roundNo));
    const counts = await tx
      .select({ roundId: admissionAllotments.roundId, response: admissionAllotments.response, n: sql<number>`count(*)::int` })
      .from(admissionAllotments)
      .where(eq(admissionAllotments.cycleId, cycleId))
      .groupBy(admissionAllotments.roundId, admissionAllotments.response);
    return rounds.map((r) => ({ ...r, responses: Object.fromEntries(counts.filter((c) => c.roundId === r.id).map((c) => [c.response, c.n])) }));
  }

  /** Drafts the next round. The earlier round must be closed. Applicants who rejected or forfeited a seat do not take part again. */
  async startRound(tx: Tx, actor: Actor, cycleId: string) {
    await this.admissions.cycle(tx, cycleId);
    const [last] = await tx.select().from(admissionRounds).where(eq(admissionRounds.cycleId, cycleId)).orderBy(desc(admissionRounds.roundNo)).limit(1);
    if (last && last.status !== 'closed') throw new ConflictException(`Round ${last.roundNo} is not closed yet`);
    const matrix = await this.seatMatrix(tx, cycleId);
    if (!matrix.length) throw new BadRequestException('Set the seat matrix first');
    const ranked = await tx
      .select({ a: applications, m: applicationIndexMarks, p: applicationPreferences })
      .from(applicationIndexMarks)
      .innerJoin(applications, eq(applications.id, applicationIndexMarks.applicationId))
      .innerJoin(applicationPreferences, eq(applicationPreferences.applicationId, applications.id))
      .where(and(eq(applicationIndexMarks.cycleId, cycleId), sql`${applicationIndexMarks.overallRank} is not null`, inArray(applications.status, [...RANKABLE])));
    if (!ranked.length) throw new BadRequestException('Build the rank list and collect preferences first');
    const prev = await this.latestAllotments(tx, cycleId);
    const out = new Set([...prev.values()].filter((p) => p.response === 'reject' || p.response === 'forfeit').map((p) => p.applicationId));
    const contenders: Contender[] = ranked.filter((r) => !out.has(r.a.id)).map((r) => ({ id: r.a.id, rank: r.m.overallRank!, category: categoryOf(r.a), prefs: r.p.options }));
    const held = new Map<string, Held>();
    for (const p of prev.values()) if (p.response === 'freeze' || p.response === 'float' || p.response === 'slide') held.set(p.applicationId, { option: p.optionLabel, seatCategory: p.seatCategory, response: p.response });
    const { allotments } = runRound(matrix.map((m) => ({ option: m.optionLabel, category: m.category, seats: m.seats })), contenders, held);
    const roundNo = (last?.roundNo ?? 0) + 1;
    const [round] = await tx.insert(admissionRounds).values({ tenantId: actor.tenantId, cycleId, roundNo, createdBy: actor.userId }).returning();
    if (allotments.length) {
      await tx.insert(admissionAllotments).values(
        allotments.map((a) => ({
          tenantId: actor.tenantId,
          cycleId,
          roundId: round.id,
          applicationId: a.id,
          optionLabel: a.option,
          seatCategory: a.seatCategory,
          rank: a.rank,
          kind: a.kind,
          // A float holder who found nothing better keeps what they said last time.
          response: a.kind === 'kept' ? (held.get(a.id)?.response ?? 'pending') : 'pending',
        })),
      );
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.round_started.v1', subjectType: 'admission_cycle', subjectId: cycleId, data: { roundNo, allotments: allotments.length } });
    return { ...round, allotments: allotments.length };
  }

  async roundAllotments(tx: Tx, roundId: string) {
    const [round] = await tx.select().from(admissionRounds).where(eq(admissionRounds.id, roundId));
    if (!round) throw new NotFoundException('Round not found');
    const rows = await tx
      .select({ al: admissionAllotments, no: applications.applicationNo, name: applications.applicantName })
      .from(admissionAllotments)
      .innerJoin(applications, eq(applications.id, admissionAllotments.applicationId))
      .where(eq(admissionAllotments.roundId, roundId))
      .orderBy(asc(admissionAllotments.rank));
    return { round, allotments: rows.map((r) => ({ id: r.al.id, applicationId: r.al.applicationId, applicationNo: r.no, name: r.name, rank: r.al.rank, option: r.al.optionLabel, seatCategory: r.al.seatCategory, kind: r.al.kind, response: r.al.response })) };
  }

  async publishRound(tx: Tx, actor: Actor, roundId: string) {
    const [round] = await tx.update(admissionRounds).set({ status: 'published', publishedAt: new Date() }).where(and(eq(admissionRounds.id, roundId), eq(admissionRounds.status, 'draft'))).returning();
    if (!round) throw new ConflictException('Only a draft round can be published');
    await audit(tx, { ...auditActor(actor), action: 'admissions.round_published.v1', subjectType: 'admission_round', subjectId: roundId, data: { roundNo: round.roundNo } });
    return round;
  }

  /** Closes a published round: allotments nobody answered are forfeited and their seats go back into the pool. */
  async closeRound(tx: Tx, actor: Actor, roundId: string) {
    const [round] = await tx.update(admissionRounds).set({ status: 'closed', closedAt: new Date() }).where(and(eq(admissionRounds.id, roundId), eq(admissionRounds.status, 'published'))).returning();
    if (!round) throw new ConflictException('Only a published round can be closed');
    const forfeited = await tx.update(admissionAllotments).set({ response: 'forfeit' }).where(and(eq(admissionAllotments.roundId, roundId), eq(admissionAllotments.response, 'pending'))).returning({ id: admissionAllotments.id });
    await audit(tx, { ...auditActor(actor), action: 'admissions.round_closed.v1', subjectType: 'admission_round', subjectId: roundId, data: { roundNo: round.roundNo, forfeited: forfeited.length } });
    return { ...round, forfeited: forfeited.length };
  }

  /** An applicant (or staff for them) answers an allotment while its round is open. */
  async respond(tx: Tx, actor: Actor, allotmentId: string, response: 'freeze' | 'float' | 'slide' | 'reject') {
    const [row] = await tx
      .select({ al: admissionAllotments, status: admissionRounds.status })
      .from(admissionAllotments)
      .innerJoin(admissionRounds, eq(admissionRounds.id, admissionAllotments.roundId))
      .where(eq(admissionAllotments.id, allotmentId));
    if (!row) throw new NotFoundException('Allotment not found');
    if (row.status !== 'published') throw new ConflictException('This round is not open for answers');
    const [done] = await tx.update(admissionAllotments).set({ response, respondedAt: new Date() }).where(eq(admissionAllotments.id, allotmentId)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.allotment_response.v1', subjectType: 'application', subjectId: row.al.applicationId, data: { allotmentId, response } });
    return done;
  }

  /** The applicant's own allotments, newest round first. */
  async allotmentsFor(tx: Tx, applicationId: string) {
    const rows = await tx
      .select({ al: admissionAllotments, roundNo: admissionRounds.roundNo, status: admissionRounds.status })
      .from(admissionAllotments)
      .innerJoin(admissionRounds, eq(admissionRounds.id, admissionAllotments.roundId))
      .where(and(eq(admissionAllotments.applicationId, applicationId), inArray(admissionRounds.status, ['published', 'closed'])))
      .orderBy(desc(admissionRounds.roundNo));
    return rows.map((r) => ({ id: r.al.id, roundNo: r.roundNo, roundStatus: r.status, option: r.al.optionLabel, seatCategory: r.al.seatCategory, kind: r.al.kind, response: r.al.response }));
  }

  // ---- agent commission rules and payouts -----------------------------------------------------------

  async rules(tx: Tx) {
    return tx.select().from(agentCommissionRules).orderBy(asc(agentCommissionRules.createdAt));
  }

  async addRule(tx: Tx, actor: Actor, input: Omit<CommissionRule, 'id' | 'active'> & { active?: boolean }) {
    if (input.kind === 'percent' && !(input.basePaise > 0 && input.percentBps > 0)) throw new BadRequestException('A percentage rule needs a fee base and a percentage');
    if (input.kind === 'flat' && !(input.flatPaise > 0)) throw new BadRequestException('A flat rule needs an amount');
    if (input.kind === 'slab' && !input.slabs.length) throw new BadRequestException('A slab rule needs at least one slab');
    const [row] = await tx.insert(agentCommissionRules).values({ tenantId: actor.tenantId, ...input }).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.commission_rule_added.v1', subjectType: 'agent_commission_rule', subjectId: row.id, data: { kind: row.kind, agentId: row.agentId, programId: row.programId } });
    return row;
  }

  async removeRule(tx: Tx, actor: Actor, id: string) {
    const [row] = await tx.delete(agentCommissionRules).where(eq(agentCommissionRules.id, id)).returning({ id: agentCommissionRules.id });
    if (!row) throw new NotFoundException('Rule not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.commission_rule_removed.v1', subjectType: 'agent_commission_rule', subjectId: id, data: {} });
    return { ok: true };
  }

  /** Pays accrued commissions to one agent in one go: gross, tax deducted at source, net, recorded as a payout. */
  async payout(tx: Tx, actor: Actor, agentId: string, input: { commissionIds: string[]; paidOn: string; reference?: string | null; tdsBps?: number }) {
    const [agent] = await tx.select().from(admissionAgents).where(eq(admissionAgents.id, agentId));
    if (!agent) throw new NotFoundException('Agent not found');
    const rows = await tx.select().from(agentCommissions).where(and(inArray(agentCommissions.id, input.commissionIds), eq(agentCommissions.agentId, agentId)));
    if (rows.length !== new Set(input.commissionIds).size) throw new BadRequestException('Some commissions do not belong to this agent');
    if (rows.some((r) => r.status !== 'accrued')) throw new ConflictException('Some commissions are already paid');
    const gross = rows.reduce((n, r) => n + r.amountPaise, 0);
    // Tax deducted at source: the body's rate, else the rate on the agent's own rule, else on an institution-wide rule.
    const all = ((await this.rules(tx)) as CommissionRule[]).filter((r) => r.active);
    const ruleBps = (all.find((r) => r.agentId === agentId && r.tdsBps > 0) ?? all.find((r) => !r.agentId && r.tdsBps > 0))?.tdsBps ?? 0;
    const tds = tdsOn(gross, input.tdsBps ?? ruleBps);
    await tx.update(agentCommissions).set({ status: 'paid', paidOn: input.paidOn, note: input.reference ?? null }).where(inArray(agentCommissions.id, rows.map((r) => r.id)));
    const [p] = await tx
      .insert(agentPayouts)
      .values({ tenantId: actor.tenantId, agentId, grossPaise: gross, tdsPaise: tds, netPaise: gross - tds, commissionIds: rows.map((r) => r.id), paidOn: input.paidOn, reference: input.reference ?? null, createdBy: actor.userId })
      .returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.agent_payout.v1', subjectType: 'admission_agent', subjectId: agentId, data: { payoutId: p.id, grossPaise: gross, tdsPaise: tds } });
    return p;
  }

  async payouts(tx: Tx, agentId?: string) {
    const q = tx.select({ p: agentPayouts, agentName: admissionAgents.name }).from(agentPayouts).innerJoin(admissionAgents, eq(admissionAgents.id, agentPayouts.agentId));
    const rows = await (agentId ? q.where(eq(agentPayouts.agentId, agentId)) : q).orderBy(desc(agentPayouts.paidOn), desc(agentPayouts.createdAt));
    return rows.map((r) => ({ ...r.p, agentName: r.agentName }));
  }
}
