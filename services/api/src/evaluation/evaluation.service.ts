import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { evalAllocations, evalAnnotations, evalConfigs, evalMarks, evalQuestions, evalScripts, examPapers, userRoles, users } from '../db/schema.js';
import { allocateRoundRobin, finalMarks } from './evaluation.logic.js';

export type PaperRow = typeof examPapers.$inferSelect;
export type ConfigRow = typeof evalConfigs.$inferSelect;
export type ScriptRow = typeof evalScripts.$inferSelect;

const EXAMINER_ROLES = ['teacher', 'hod', 'principal', 'examiner'] as const;

/** Loads papers and settings and runs examiner allocation and final-mark calculation. The rules are in evaluation.logic.ts. */
@Injectable()
export class EvaluationService {
  async paper(tx: Tx, paperId: string): Promise<PaperRow> {
    const [p] = await tx.select().from(examPapers).where(eq(examPapers.id, paperId));
    if (!p) throw new NotFoundException('Paper not found');
    return p;
  }

  /** The paper's settings, created with defaults on first use. */
  async config(tx: Tx, tenantId: string, paperId: string): Promise<ConfigRow> {
    const [c] = await tx.select().from(evalConfigs).where(eq(evalConfigs.paperId, paperId));
    if (c) return c;
    const [row] = await tx.insert(evalConfigs).values({ tenantId, paperId }).returning();
    return row;
  }

  async questions(tx: Tx, paperId: string) {
    return tx.select().from(evalQuestions).where(eq(evalQuestions.paperId, paperId)).orderBy(asc(evalQuestions.ord));
  }

  /** Throws unless every id is an active staff member who may evaluate. */
  async assertExaminers(tx: Tx, ids: string[]): Promise<void> {
    const rows = await tx.select({ userId: userRoles.userId }).from(userRoles).where(and(inArray(userRoles.userId, ids), inArray(userRoles.role, [...EXAMINER_ROLES])));
    const ok = new Set(rows.map((r) => r.userId));
    if (ids.some((i) => !ok.has(i))) throw new ConflictException('Every examiner must be a teacher, head of department, principal or examiner');
  }

  /**
   * Creates valuations of `round` for the given scripts, round-robin over the examiners with the paper's
   * per-examiner cap, never giving a script to an examiner who already valued it.
   */
  async allocate(tx: Tx, tenantId: string, paperId: string, round: 1 | 2 | 3, scriptIds: string[], examinerIds: string[], cap: number): Promise<number> {
    if (scriptIds.length === 0) return 0;
    const held = await tx.select({ examinerId: evalAllocations.examinerId, n: sql<number>`count(*)::int` }).from(evalAllocations).where(eq(evalAllocations.paperId, paperId)).groupBy(evalAllocations.examinerId);
    const load = new Map(held.map((h) => [h.examinerId, h.n]));
    const before = await tx.select({ scriptId: evalAllocations.scriptId, examinerId: evalAllocations.examinerId }).from(evalAllocations).where(inArray(evalAllocations.scriptId, scriptIds));
    let plan: Map<string, string>;
    try {
      plan = allocateRoundRobin(
        scriptIds.map((id) => ({ id, exclude: before.filter((b) => b.scriptId === id).map((b) => b.examinerId) })),
        examinerIds.map((id) => ({ id, load: load.get(id) ?? 0 })),
        cap,
      );
    } catch (e) {
      if (e instanceof RangeError) throw new ConflictException(e.message);
      throw e;
    }
    await tx.insert(evalAllocations).values([...plan].map(([scriptId, examinerId]) => ({ tenantId, scriptId, paperId, examinerId, round })));
    await tx.update(evalScripts).set({ status: 'allocated' }).where(and(inArray(evalScripts.id, scriptIds), eq(evalScripts.status, 'uploaded')));
    return plan.size;
  }

  /** The submitted totals per round for the scripts of a paper. */
  async totals(tx: Tx, paperId: string): Promise<Map<string, Partial<Record<1 | 2 | 3, number>>>> {
    const rows = await tx.select({ scriptId: evalAllocations.scriptId, round: evalAllocations.round, total: evalAllocations.total }).from(evalAllocations).where(and(eq(evalAllocations.paperId, paperId), eq(evalAllocations.status, 'submitted')));
    const out = new Map<string, Partial<Record<1 | 2 | 3, number>>>();
    for (const r of rows) out.set(r.scriptId, { ...out.get(r.scriptId), [r.round as 1 | 2 | 3]: r.total ?? 0 });
    return out;
  }

  /** The final marks of one script from its submitted valuations, or null while one is missing. */
  finalFor(s: ScriptRow, t: Partial<Record<1 | 2 | 3, number>> | undefined): number | null {
    return finalMarks({ first: t?.[1] ?? null, second: t?.[2] ?? null, third: t?.[3] ?? null, secondRequired: s.secondRequired, thirdRequired: s.thirdRequired });
  }

  /** Every annotation of a script with the round of the valuation it belongs to, oldest first. */
  async annotationsOf(tx: Tx, scriptId: string) {
    const rows = await tx
      .select({ id: evalAnnotations.id, allocationId: evalAnnotations.allocationId, round: evalAllocations.round, examinerName: users.fullName, pageIndex: evalAnnotations.pageIndex, kind: evalAnnotations.kind, x: evalAnnotations.x, y: evalAnnotations.y, w: evalAnnotations.w, h: evalAnnotations.h, text: evalAnnotations.text, strokes: evalAnnotations.strokes })
      .from(evalAnnotations)
      .innerJoin(evalAllocations, eq(evalAllocations.id, evalAnnotations.allocationId))
      .innerJoin(users, eq(users.id, evalAnnotations.createdBy))
      .where(eq(evalAnnotations.scriptId, scriptId))
      .orderBy(asc(evalAllocations.round), asc(evalAnnotations.pageIndex), asc(evalAnnotations.createdAt));
    return rows.map((r) => ({ ...r, round: r.round as 1 | 2 | 3 }));
  }

  async markEntries(tx: Tx, allocationId: string) {
    return tx.select({ questionId: evalMarks.questionId, marks: evalMarks.marks, comment: evalMarks.comment }).from(evalMarks).where(eq(evalMarks.allocationId, allocationId));
  }
}
