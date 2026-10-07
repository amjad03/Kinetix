import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { assessmentCoMap, assessments, attainmentSnapshots, coOutcomeMap, coSets, courseOutcomes, marks, obeConfigs, obeSurveyRatings, obeSurveys, programOutcomes, programs, schemeComponents, sections, subjects } from '../db/schema.js';
import { combinedAttainment, DEFAULT_ATTAINMENT_CONFIG, directAttainment, gapFor, indirectAttainment, programOutcomeAttainment, type AttainmentConfig, type EvidenceItem, type SurveyEvidence } from './attainment.js';

@Injectable()
export class ObeService {
  async config(tx: Tx, programId: string): Promise<AttainmentConfig> {
    const [c] = await tx.select().from(obeConfigs).where(eq(obeConfigs.programId, programId));
    return c ? (c.config as AttainmentConfig) : DEFAULT_ATTAINMENT_CONFIG;
  }

  async program(tx: Tx, programId: string) {
    const [p] = await tx.select().from(programs).where(eq(programs.id, programId));
    if (!p) throw new NotFoundException('Programme not found');
    return p;
  }

  /** Recomputes CO, PO and PSO attainment of a programme for a year and stores a new batch of snapshots. */
  async compute(tx: Tx, tenantId: string, userId: string, programId: string, academicYearId: string) {
    const config = await this.config(tx, programId);
    const subs = await tx.select({ id: subjects.id, code: subjects.code }).from(subjects).where(eq(subjects.programId, programId));
    const sets = subs.length ? await tx.select().from(coSets).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))) : [];
    const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))).orderBy(asc(courseOutcomes.ord)) : [];
    const subjectOfSet = new Map(sets.map((s) => [s.id, s.subjectId]));
    const subjectCode = new Map(subs.map((s) => [s.id, s.code]));
    const maps = cos.length ? await tx.select().from(assessmentCoMap).where(inArray(assessmentCoMap.coId, cos.map((c) => c.id))) : [];
    const asmts = maps.length
      ? await tx
          .select({ id: assessments.id, title: assessments.title, kind: assessments.kind, max: assessments.maxMarks, componentKind: schemeComponents.kind })
          .from(assessments)
          .innerJoin(sections, eq(sections.id, assessments.sectionId))
          .leftJoin(schemeComponents, eq(schemeComponents.id, assessments.componentId))
          .where(and(inArray(assessments.id, [...new Set(maps.map((m) => m.assessmentId))]), eq(sections.academicYearId, academicYearId)))
      : [];
    const rows = asmts.length ? await tx.select({ assessmentId: marks.assessmentId, studentId: marks.studentId, v: sql<number | null>`coalesce(${marks.moderatedMarks}, ${marks.marks})::float`, absent: marks.absent }).from(marks).where(inArray(marks.assessmentId, asmts.map((a) => a.id))) : [];
    const surveys = await tx.select().from(obeSurveys).where(and(eq(obeSurveys.programId, programId), eq(obeSurveys.academicYearId, academicYearId)));
    const ratings = surveys.length ? await tx.select().from(obeSurveyRatings).where(inArray(obeSurveyRatings.surveyId, surveys.map((s) => s.id))) : [];
    const previous = await this.latestBatch(tx, programId);
    const computedAt = new Date();
    const out: (typeof attainmentSnapshots.$inferInsert)[] = [];

    const surveyEvidence = (pick: (r: (typeof ratings)[number]) => boolean): SurveyEvidence[] =>
      surveys.flatMap((sv) => {
        const rs = ratings.filter((r) => r.surveyId === sv.id && pick(r));
        return rs.length === 0 ? [] : [{ surveyId: sv.id, title: sv.title, meanRating: rs.reduce((s, r) => s + r.rating, 0) / rs.length, scaleMax: sv.scaleMax, responses: rs.length, minResponses: sv.minResponses, weight: sv.weight }];
      });

    const coLevel = new Map<string, number | null>();
    for (const co of cos) {
      const subjectId = subjectOfSet.get(co.coSetId)!;
      const items: EvidenceItem[] = maps
        .filter((m) => m.coId === co.id)
        .flatMap((m) => {
          const a = asmts.find((x) => x.id === m.assessmentId);
          if (!a) return [];
          const scores = rows.filter((r) => r.assessmentId === a.id).map((r) => ({ studentId: r.studentId, scored: r.absent || r.v === null ? 0 : r.v * m.share, max: a.max * m.share }));
          return [{ sourceId: a.id, label: a.title, kind: a.componentKind ?? (a.kind === 'exam' ? 'external' : 'internal'), scores }];
        });
      const direct = directAttainment(items, config);
      const indirect = indirectAttainment(surveyEvidence((r) => r.coId === co.id), config);
      const combined = combinedAttainment(direct.level, indirect.level, config);
      coLevel.set(co.id, combined);
      const g = gapFor(combined, config.targetLevel, config.decimals);
      out.push({ tenantId, programId, academicYearId, scope: 'co', targetId: co.id, code: `${subjectCode.get(subjectId)}/${co.code}`, subjectId, direct: direct.level, indirect: indirect.level, combined, target: g.target, gap: g.gap, met: g.met, detail: { byKind: direct.byKind, weakItems: direct.weakItems, surveys: indirect }, computedBy: userId, computedAt });
    }

    const pos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.ord));
    const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
    for (const po of pos) {
      const mine = cells.filter((c) => c.outcomeId === po.id);
      const agg = programOutcomeAttainment(mine.map((c) => ({ coId: c.coId, strength: c.strength, coAttainment: coLevel.get(c.coId) ?? null })), config);
      const indirect = indirectAttainment(surveyEvidence((r) => r.outcomeId === po.id), config);
      const combined = combinedAttainment(agg.level, indirect.level, config);
      const g = gapFor(combined, config.targetLevel, config.decimals);
      out.push({ tenantId, programId, academicYearId, scope: 'po', targetId: po.id, code: po.code, direct: agg.level, indirect: indirect.level, combined, target: g.target, gap: g.gap, met: g.met, detail: { coverage: agg.coverage, contributors: agg.contributors, kind: po.kind, contributions: mine.map((c) => ({ coId: c.coId, strength: c.strength, co: coLevel.get(c.coId) ?? null })), surveys: indirect }, computedBy: userId, computedAt });
    }
    if (out.length) await tx.insert(attainmentSnapshots).values(out);
    return { computedAt, cos: cos.length, outcomes: pos.length, previousAt: previous?.computedAt ?? null };
  }

  async latestBatch(tx: Tx, programId: string, academicYearId?: string) {
    const [row] = await tx
      .select({ computedAt: attainmentSnapshots.computedAt })
      .from(attainmentSnapshots)
      .where(and(eq(attainmentSnapshots.programId, programId), academicYearId ? eq(attainmentSnapshots.academicYearId, academicYearId) : sql`true`))
      .orderBy(sql`${attainmentSnapshots.computedAt} desc`)
      .limit(1);
    return row;
  }

  /** The newest snapshot batch of the year with each target's trend against the batch before it. */
  async latest(tx: Tx, programId: string, academicYearId: string) {
    const all = await tx.select().from(attainmentSnapshots).where(and(eq(attainmentSnapshots.programId, programId), eq(attainmentSnapshots.academicYearId, academicYearId))).orderBy(sql`${attainmentSnapshots.computedAt} desc`);
    if (all.length === 0) return { computedAt: null as Date | null, rows: [] as ((typeof all)[number] & { previous: number | null })[] };
    const at = all[0].computedAt.getTime();
    const prev = new Map<string, number | null>();
    for (const r of all) if (r.computedAt.getTime() < at && !prev.has(r.targetId)) prev.set(r.targetId, r.combined);
    return { computedAt: all[0].computedAt, rows: all.filter((r) => r.computedAt.getTime() === at).map((r) => ({ ...r, previous: prev.get(r.targetId) ?? null })) };
  }
}
