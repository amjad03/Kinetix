import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { admissionInterviews, applications, interviewScores } from '../db/schema.js';
import { type Actor, auditActor } from './enquiries.service.js';

/** The merit-rule field that stands for the applicant's interview score (out of 100). */
export const INTERVIEW_SCORE_FIELD = 'interview_score';

const TERMINAL = ['rejected', 'withdrawn', 'declined', 'enrolled'];

export interface Panelist {
  userId: string | null;
  name: string;
}
export interface SheetInput {
  criteria: { criterion: string; score: number; max: number }[];
  remarks?: string | null;
}

/** A panelist's sheet as a percentage of its own maximum. */
export const sheetPercent = (criteria: { score: number; max: number }[]) => {
  const max = criteria.reduce((n, c) => n + c.max, 0);
  return max > 0 ? (criteria.reduce((n, c) => n + c.score, 0) / max) * 100 : 0;
};

/**
 * The latest completed interview per application of a cycle: its score out of 100 for the merit
 * list, and whether the panel rejected the candidate (they are then left out of the ranking).
 */
export async function interviewResults(tx: Tx, cycleId: string) {
  const rows = await tx
    .select({ applicationId: admissionInterviews.applicationId, score: admissionInterviews.score, maxScore: admissionInterviews.maxScore, outcome: admissionInterviews.outcome })
    .from(admissionInterviews)
    .innerJoin(applications, eq(applications.id, admissionInterviews.applicationId))
    .where(and(eq(applications.cycleId, cycleId), eq(admissionInterviews.status, 'done')))
    .orderBy(asc(admissionInterviews.slotAt));
  const out = new Map<string, { score: number; rejected: boolean }>();
  for (const r of rows) out.set(r.applicationId, { score: r.score != null && r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 10000) / 100 : 0, rejected: r.outcome === 'rejected' });
  return out;
}

/** Interview scheduling: a panel, a slot, per-panelist score sheets and an outcome that feeds the merit list. */
@Injectable()
export class InterviewsService {
  async schedule(tx: Tx, actor: Actor, input: { applicationId: string; slotAt: string; venue?: string | null; panel: Panelist[] }) {
    const [a] = await tx.select().from(applications).where(eq(applications.id, input.applicationId));
    if (!a) throw new NotFoundException('Application not found');
    if (TERMINAL.includes(a.status)) throw new BadRequestException(`This application is ${a.status}`);
    const slot = new Date(input.slotAt);
    // A panelist cannot sit on two interviews at the same minute.
    const clashing = await tx.select({ panel: admissionInterviews.panel }).from(admissionInterviews).where(and(eq(admissionInterviews.slotAt, slot), eq(admissionInterviews.status, 'scheduled')));
    const names = new Set(input.panel.map((p) => p.name.trim().toLowerCase()));
    if (clashing.some((c) => c.panel.some((p) => names.has(p.name.trim().toLowerCase())))) throw new ConflictException('A panelist is already booked for another interview at that time');
    const [row] = await tx
      .insert(admissionInterviews)
      .values({ tenantId: actor.tenantId, applicationId: a.id, slotAt: slot, venue: input.venue ?? null, panel: input.panel, createdBy: actor.userId })
      .returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.interview_scheduled.v1', subjectType: 'application', subjectId: a.id, data: { interviewId: row.id, slotAt: input.slotAt } });
    return row;
  }

  async get(tx: Tx, id: string, lock = false) {
    const q = tx.select().from(admissionInterviews).where(eq(admissionInterviews.id, id));
    const [row] = await (lock ? q.for('update') : q);
    if (!row) throw new NotFoundException('Interview not found');
    return row;
  }

  async list(tx: Tx, f: { cycleId?: string; applicationId?: string; from?: string; to?: string }) {
    const conds: (SQL | undefined)[] = [
      f.cycleId ? eq(applications.cycleId, f.cycleId) : undefined,
      f.applicationId ? eq(admissionInterviews.applicationId, f.applicationId) : undefined,
      f.from ? gte(admissionInterviews.slotAt, new Date(`${f.from}T00:00:00Z`)) : undefined,
      f.to ? lte(admissionInterviews.slotAt, new Date(`${f.to}T23:59:59Z`)) : undefined,
    ];
    const rows = await tx
      .select({ i: admissionInterviews, applicantName: applications.applicantName, applicationNo: applications.applicationNo })
      .from(admissionInterviews)
      .innerJoin(applications, eq(applications.id, admissionInterviews.applicationId))
      .where(and(...conds))
      .orderBy(desc(admissionInterviews.slotAt))
      .limit(500);
    return rows.map((r) => ({ ...r.i, applicantName: r.applicantName, applicationNo: r.applicationNo }));
  }

  async detail(tx: Tx, id: string) {
    const i = await this.get(tx, id);
    const sheets = await tx.select().from(interviewScores).where(eq(interviewScores.interviewId, id)).orderBy(asc(interviewScores.panelistName));
    return { ...i, sheets };
  }

  async reschedule(tx: Tx, actor: Actor, id: string, patch: { slotAt?: string; venue?: string | null; panel?: Panelist[]; cancel?: boolean }) {
    const i = await this.get(tx, id, true);
    if (i.status !== 'scheduled') throw new BadRequestException(`This interview is ${i.status}`);
    const set: Partial<typeof admissionInterviews.$inferInsert> = {};
    if (patch.slotAt) set.slotAt = new Date(patch.slotAt);
    if (patch.venue !== undefined) set.venue = patch.venue;
    if (patch.panel) set.panel = patch.panel;
    if (patch.cancel) set.status = 'cancelled';
    const [row] = await tx.update(admissionInterviews).set(set).where(eq(admissionInterviews.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: patch.cancel ? 'admissions.interview_cancelled.v1' : 'admissions.interview_rescheduled.v1', subjectType: 'admission_interview', subjectId: id, data: { fields: Object.keys(patch) } });
    return row;
  }

  /** A panelist's score sheet (replaces their earlier one). The interview's score is the average of all sheets. */
  async submitSheet(tx: Tx, actor: Actor & { userId: string }, id: string, panelistName: string, input: SheetInput) {
    const i = await this.get(tx, id, true);
    if (i.status !== 'scheduled') throw new BadRequestException(`This interview is ${i.status}`);
    for (const c of input.criteria) if (c.score > c.max) throw new BadRequestException(`${c.criterion}: the score is above the maximum of ${c.max}`);
    const total = input.criteria.reduce((n, c) => n + c.score, 0);
    await tx
      .insert(interviewScores)
      .values({ tenantId: actor.tenantId, interviewId: id, panelistId: actor.userId, panelistName, criteria: input.criteria, score: total, remarks: input.remarks ?? null })
      .onConflictDoUpdate({ target: [interviewScores.interviewId, interviewScores.panelistName], set: { criteria: input.criteria, score: total, remarks: input.remarks ?? null, panelistId: actor.userId } });
    await audit(tx, { ...auditActor(actor), action: 'admissions.interview_sheet_submitted.v1', subjectType: 'admission_interview', subjectId: id, data: { panelistName, total } });
    return this.detail(tx, id);
  }

  /** Closes the interview with the panel's outcome; the score becomes the average of the sheets, scaled to the interview's maximum. */
  async complete(tx: Tx, actor: Actor, id: string, outcome: 'selected' | 'waitlisted' | 'rejected', remarks?: string | null) {
    const i = await this.get(tx, id, true);
    if (i.status !== 'scheduled') throw new BadRequestException(`This interview is ${i.status}`);
    const sheets = await tx.select().from(interviewScores).where(eq(interviewScores.interviewId, id));
    if (sheets.length === 0) throw new BadRequestException('Enter at least one score sheet first');
    const pct = sheets.reduce((n, s) => n + sheetPercent(s.criteria), 0) / sheets.length;
    const score = Math.round(((pct / 100) * i.maxScore) * 100) / 100;
    const [row] = await tx.update(admissionInterviews).set({ status: 'done', outcome, score, remarks: remarks ?? i.remarks }).where(eq(admissionInterviews.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.interview_completed.v1', subjectType: 'application', subjectId: i.applicationId, data: { interviewId: id, outcome, score } });
    return row;
  }

  async markNoShow(tx: Tx, actor: Actor, id: string) {
    const i = await this.get(tx, id, true);
    if (i.status !== 'scheduled') throw new BadRequestException(`This interview is ${i.status}`);
    const [row] = await tx.update(admissionInterviews).set({ status: 'no_show' }).where(eq(admissionInterviews.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.interview_no_show.v1', subjectType: 'admission_interview', subjectId: id, data: {} });
    return row;
  }
}
