import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { isCorrect } from '../polls/polls.service.js';
import { pollCoMap } from '../db/schema-assist.js';
import { lmsQuizAttempts, lmsQuizQuestions, lmsQuizzes } from '../db/schema-life.js';
import { assessmentQuestionCos, assessmentQuestions, obeBatchSnapshots, obePolicies, obePrograms, questionMarks, type ObeFramework } from '../db/schema-obe-flagship.js';
import { academicYears, assessmentCoMap, assessments, attainmentSnapshots, coOutcomeMap, coSets, courseOutcomes, marks, obeConfigs, pollResponses, polls, obeSurveyRatings, obeSurveys, programOutcomes, programs, qbQuestions, schemeComponents, sections, students, subjects, surveyAnswers, surveyQuestions, surveys as feedbackSurveys } from '../db/schema.js';
import { obeTargets } from '../db/schema-obe-depth.js';
import { blueprintShares, combinedAttainment, directAttainment, gapFor, indirectAttainment, pooledByStudent, programOutcomeAttainment, questionCoMarks, round, withDefaults, type AttainmentConfig, type EvidenceItem, type SurveyEvidence } from './attainment.js';

/** Feedback-survey ratings run 1 to 5; a survey needs this many answers on a CO before it counts. */
export const FEEDBACK_SCALE = 5;
export const FEEDBACK_MIN_RESPONSES = 5;
/** The evidence kind of classroom polls and quizzes; it counts only when the programme's config gives it a weight. */
export const CLASSROOM_KIND = 'classroom';

export type Policy = Required<AttainmentConfig>;
export interface PolicySource {
  scope: 'default' | 'institution' | 'program' | 'subject';
  version: number | null;
  id: string | null;
}

/** The evidence kind of an assessment: its scheme component's kind (or exam → external), folded into CIE when the policy does not weight that kind. */
export function kindOf(a: { kind: string; componentKind: string | null }, config: AttainmentConfig): string {
  const k = a.componentKind ?? (a.kind === 'exam' ? 'external' : 'internal');
  if (config.evidenceWeights[k] !== undefined) return k;
  return k === 'external' ? 'external' : 'internal';
}

/**
 * One student's percentage on a CO: of the CIE marks tagged to it, of the SEE marks, and overall (CIE and SEE weighted as
 * the policy weights them; the pooled percentage when only one kind is weighted).
 */
export function studentCoPercent(items: EvidenceItem[], studentId: string, policy: AttainmentConfig): { cie: number | null; see: number | null; overall: number | null } {
  const pct = (list: EvidenceItem[]) => {
    const p = pooledByStudent(list).get(studentId);
    return p && p.max > 0 ? round((p.scored / p.max) * 100, 1) : null;
  };
  const cie = pct(items.filter((i) => i.kind !== 'external'));
  const see = pct(items.filter((i) => i.kind === 'external'));
  const parts = ([[cie, policy.evidenceWeights.internal ?? 0], [see, policy.evidenceWeights.external ?? 0]] as const).filter((x): x is readonly [number, number] => x[0] !== null && x[1] > 0);
  const overall = parts.length ? round(parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0), 1) : pct(items);
  return { cie, see, overall };
}

/** "2023-26" for an intake that joined in 2023-24 and studies three years. */
export function batchLabel(entryLabel: string, years: number): string {
  const start = Number(entryLabel.slice(0, 4));
  return Number.isFinite(start) ? `${start}-${String((start + years) % 100).padStart(2, '0')}` : entryLabel;
}

@Injectable()
export class ObeService {
  /**
   * The attainment policy that applies to a course (or the programme when no course is given) in a year: the newest
   * version at the most specific level (course, programme, institution) whose effective year has started by then.
   */
  async policy(tx: Tx, programId: string, subjectId?: string | null, academicYearId?: string | null): Promise<{ config: Policy; source: PolicySource }> {
    const yearStart = academicYearId ? (await tx.select({ s: academicYears.startsOn }).from(academicYears).where(eq(academicYears.id, academicYearId)))[0]?.s : undefined;
    const pick = async (scope: 'subject' | 'program' | 'institution') => {
      const where = scope === 'subject' ? and(eq(obePolicies.scope, 'subject'), eq(obePolicies.subjectId, subjectId!)) : scope === 'program' ? and(eq(obePolicies.scope, 'program'), eq(obePolicies.programId, programId)) : eq(obePolicies.scope, 'institution');
      const rows = await tx
        .select({ id: obePolicies.id, version: obePolicies.version, config: obePolicies.config, from: academicYears.startsOn })
        .from(obePolicies)
        .leftJoin(academicYears, eq(academicYears.id, obePolicies.effectiveFromYearId))
        .where(where)
        .orderBy(desc(obePolicies.version));
      return rows.find((r) => !yearStart || !r.from || r.from <= yearStart);
    };
    if (subjectId) {
      const s = await pick('subject');
      if (s) return { config: withDefaults(s.config as AttainmentConfig), source: { scope: 'subject', version: s.version, id: s.id } };
    }
    const p = await pick('program');
    if (p) return { config: withDefaults(p.config as AttainmentConfig), source: { scope: 'program', version: p.version, id: p.id } };
    const [c] = await tx.select().from(obeConfigs).where(eq(obeConfigs.programId, programId));
    if (c) return { config: withDefaults(c.config as AttainmentConfig), source: { scope: 'program', version: null, id: null } };
    const i = await pick('institution');
    if (i) return { config: withDefaults(i.config as AttainmentConfig), source: { scope: 'institution', version: i.version, id: i.id } };
    return { config: withDefaults(null), source: { scope: 'default', version: null, id: null } };
  }

  async config(tx: Tx, programId: string): Promise<Policy> {
    return (await this.policy(tx, programId)).config;
  }

  /** The framework a programme reports to; NAAC unless set. */
  async framework(tx: Tx, programId: string): Promise<ObeFramework> {
    const [r] = await tx.select({ f: obePrograms.framework }).from(obePrograms).where(eq(obePrograms.programId, programId));
    return r?.f ?? 'naac';
  }

  async program(tx: Tx, programId: string) {
    const [p] = await tx.select().from(programs).where(eq(programs.id, programId));
    if (!p) throw new NotFoundException('Programme not found');
    return p;
  }

  /**
   * Indirect evidence from the surveys module: the rating questions tagged with a course outcome (or, with `outcome`,
   * a PO/PSO), one entry per survey and target (mean rating, answer count). Draft surveys and surveys of other years are
   * left out (a survey's year is its own, else its class's).
   */
  async feedbackEvidence(tx: Tx, targetIds: string[], academicYearId?: string, outcome = false): Promise<Map<string, SurveyEvidence[]>> {
    const out = new Map<string, SurveyEvidence[]>();
    if (!targetIds.length) return out;
    const col = outcome ? surveyQuestions.outcomeId : surveyQuestions.coId;
    const yearOk = academicYearId ? sql`coalesce(${feedbackSurveys.academicYearId}, (select s.academic_year_id from sections s where s.id = ${feedbackSurveys.sectionId}), ${academicYearId}::uuid) = ${academicYearId}::uuid` : sql`true`;
    const rows = await tx
      .select({ target: col, surveyId: surveyQuestions.surveyId, title: feedbackSurveys.title, mean: sql<number>`avg(${surveyAnswers.rating})::float`, n: sql<number>`count(${surveyAnswers.rating})::int` })
      .from(surveyQuestions)
      .innerJoin(feedbackSurveys, eq(feedbackSurveys.id, surveyQuestions.surveyId))
      .innerJoin(surveyAnswers, eq(surveyAnswers.questionId, surveyQuestions.id))
      .where(and(inArray(col, targetIds), eq(surveyQuestions.kind, 'rating'), sql`${feedbackSurveys.status} <> 'draft'`, sql`${surveyAnswers.rating} is not null`, yearOk))
      .groupBy(col, surveyQuestions.surveyId, feedbackSurveys.title);
    for (const r of rows) {
      const list = out.get(r.target!) ?? [];
      list.push({ surveyId: r.surveyId, title: r.title, meanRating: r.mean, scaleMax: FEEDBACK_SCALE, responses: r.n, minResponses: FEEDBACK_MIN_RESPONSES, weight: 1 });
      out.set(r.target!, list);
    }
    return out;
  }

  /**
   * Direct evidence from board polls, quizzes and class checks tagged with a course outcome: one item per closed poll with a right
   * answer, scored 1 for a correct answer and 0 for a wrong one, for the students who answered. It counts only when the
   * framework gives the "classroom" evidence kind a weight (see AttainmentConfig.evidenceWeights), so it is optional.
   */
  async classroomEvidence(tx: Tx, coIds: string[], academicYearId: string): Promise<Map<string, EvidenceItem[]>> {
    const out = new Map<string, EvidenceItem[]>();
    if (!coIds.length) return out;
    const tagged = await tx
      .select({ coId: pollCoMap.coId, pollId: polls.id, question: polls.question, kind: polls.kind, correct: polls.correct })
      .from(pollCoMap)
      .innerJoin(polls, eq(polls.id, pollCoMap.pollId))
      .innerJoin(sections, eq(sections.id, polls.sectionId))
      .where(and(inArray(pollCoMap.coId, coIds), sql`${polls.closedAt} is not null`, sql`${polls.correct} is not null`, eq(sections.academicYearId, academicYearId)));
    if (!tagged.length) return out;
    const answers = await tx.select({ pollId: pollResponses.pollId, studentId: pollResponses.studentId, answer: pollResponses.answer }).from(pollResponses).where(inArray(pollResponses.pollId, [...new Set(tagged.map((t) => t.pollId))]));
    for (const t of tagged) {
      const scores = answers.filter((a) => a.pollId === t.pollId).map((a) => ({ studentId: a.studentId, scored: isCorrect({ kind: t.kind, correct: t.correct }, a.answer) ? 1 : 0, max: 1 }));
      if (!scores.length) continue;
      const list = out.get(t.coId) ?? [];
      list.push({ sourceId: t.pollId, label: t.question.slice(0, 80) || 'Class check', kind: CLASSROOM_KIND, scores, basis: 'poll' });
      out.set(t.coId, list);
    }
    return out;
  }

  /** The policy of each course of a programme (course policies override the programme's). */
  async policiesFor(tx: Tx, programId: string, subjectIds: string[], academicYearId?: string): Promise<{ base: Policy; source: PolicySource; bySubject: Map<string, { config: Policy; source: PolicySource }> }> {
    const base = await this.policy(tx, programId, null, academicYearId);
    const bySubject = new Map<string, { config: Policy; source: PolicySource }>();
    const own = subjectIds.length ? await tx.select({ subjectId: obePolicies.subjectId }).from(obePolicies).where(and(eq(obePolicies.scope, 'subject'), inArray(obePolicies.subjectId, subjectIds))) : [];
    for (const s of new Set(own.map((o) => o.subjectId!))) bySubject.set(s, await this.policy(tx, programId, s, academicYearId));
    return { base: base.config, source: base.source, bySubject };
  }

  /**
   * Direct evidence of the courses for a year, per CO: question-wise marks split over the COs of each question; a total
   * with no question marks shared out by the paper's CO weightage (the policy's apportioning); an assessment without a
   * paper by its CO shares; and LMS quiz questions tagged to a CO (CIE). With `studentId`, only that student's marks.
   */
  async courseEvidence(tx: Tx, subjectIds: string[], academicYearId: string, cfg: (subjectId: string) => Policy, studentId?: string): Promise<Map<string, EvidenceItem[]>> {
    const out = new Map<string, EvidenceItem[]>();
    if (!subjectIds.length) return out;
    const add = (coId: string, item: EvidenceItem) => out.set(coId, [...(out.get(coId) ?? []), item]);
    const asmts = await tx
      .select({ id: assessments.id, title: assessments.title, kind: assessments.kind, max: assessments.maxMarks, subjectId: assessments.subjectId, componentKind: schemeComponents.kind })
      .from(assessments)
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .leftJoin(schemeComponents, eq(schemeComponents.id, assessments.componentId))
      .where(and(inArray(assessments.subjectId, subjectIds), eq(sections.academicYearId, academicYearId)))
      .orderBy(asc(assessments.heldOn));
    if (asmts.length) {
      const ids = asmts.map((a) => a.id);
      const qs = await tx.select().from(assessmentQuestions).where(inArray(assessmentQuestions.assessmentId, ids)).orderBy(asc(assessmentQuestions.ord));
      const qcos = qs.length ? await tx.select().from(assessmentQuestionCos).where(inArray(assessmentQuestionCos.questionId, qs.map((q) => q.id))) : [];
      const qm = qs.length ? await tx.select({ assessmentId: questionMarks.assessmentId, questionId: questionMarks.questionId, studentId: questionMarks.studentId, marks: questionMarks.marks }).from(questionMarks).where(and(inArray(questionMarks.assessmentId, ids), studentId ? eq(questionMarks.studentId, studentId) : sql`true`)) : [];
      const maps = await tx.select().from(assessmentCoMap).where(inArray(assessmentCoMap.assessmentId, ids));
      const totals = await tx.select({ assessmentId: marks.assessmentId, studentId: marks.studentId, v: sql<number | null>`coalesce(${marks.moderatedMarks}, ${marks.marks})::float`, absent: marks.absent }).from(marks).where(and(inArray(marks.assessmentId, ids), studentId ? eq(marks.studentId, studentId) : sql`true`));
      for (const a of asmts) {
        const config = cfg(a.subjectId);
        const kind = kindOf(a, config);
        const rows = totals.filter((t) => t.assessmentId === a.id);
        const paper = qs.filter((q) => q.assessmentId === a.id).map((q) => ({ id: q.id, maxMarks: q.maxMarks, cos: qcos.filter((c) => c.questionId === q.id).map((c) => ({ coId: c.coId, weight: c.weight })) }));
        const perCo = new Map<string, EvidenceItem['scores']>();
        const push = (coId: string, s: EvidenceItem['scores'][number]) => perCo.set(coId, [...(perCo.get(coId) ?? []), s]);
        let basis: EvidenceItem['basis'] = 'share';
        if (paper.some((q) => q.cos.length)) {
          const mine = qm.filter((m) => m.assessmentId === a.id);
          const byStudent = new Map<string, Map<string, number | null>>();
          for (const m of mine) byStudent.set(m.studentId, (byStudent.get(m.studentId) ?? new Map()).set(m.questionId, m.marks));
          const shares = blueprintShares(paper, config.seeApportion);
          const blank = questionCoMarks(paper, new Map());
          basis = mine.some((m) => m.marks !== null) ? 'questions' : 'apportioned';
          for (const sid of new Set([...rows.map((r) => r.studentId), ...byStudent.keys()])) {
            const total = rows.find((r) => r.studentId === sid);
            const own = byStudent.get(sid);
            if (total?.absent) {
              for (const [coId, m] of blank) push(coId, { studentId: sid, scored: 0, max: m.max });
            } else if (own && [...own.values()].some((v) => v !== null)) {
              for (const [coId, m] of questionCoMarks(paper, own)) push(coId, { studentId: sid, scored: m.scored, max: m.max });
            } else if (total && total.v !== null) {
              for (const [coId, share] of shares) push(coId, { studentId: sid, scored: total.v * share, max: a.max * share });
            }
          }
        } else {
          for (const m of maps.filter((x) => x.assessmentId === a.id)) for (const r of rows) push(m.coId, { studentId: r.studentId, scored: r.absent || r.v === null ? 0 : r.v * m.share, max: a.max * m.share });
        }
        for (const [coId, scores] of perCo) add(coId, { sourceId: a.id, label: a.title, kind, scores, basis });
      }
    }
    // LMS quizzes: questions tagged to a CO (directly or through the question bank), each student's best attempt.
    const lmsSubjects = subjectIds.filter((s) => cfg(s).includeLms);
    if (lmsSubjects.length) {
      const quizzes = await tx
        .select({ id: lmsQuizzes.id, title: lmsQuizzes.title, subjectId: lmsQuizzes.subjectId })
        .from(lmsQuizzes)
        .innerJoin(sections, eq(sections.id, lmsQuizzes.sectionId))
        .where(and(inArray(lmsQuizzes.subjectId, lmsSubjects), eq(sections.academicYearId, academicYearId), sql`${lmsQuizzes.status} <> 'draft'`));
      if (quizzes.length) {
        const qq = await tx
          .select({ id: lmsQuizQuestions.id, quizId: lmsQuizQuestions.quizId, marks: lmsQuizQuestions.marks, coId: sql<string | null>`coalesce(${lmsQuizQuestions.coId}, ${qbQuestions.coId})` })
          .from(lmsQuizQuestions)
          .leftJoin(qbQuestions, eq(qbQuestions.id, lmsQuizQuestions.qbQuestionId))
          .where(and(inArray(lmsQuizQuestions.quizId, quizzes.map((q) => q.id)), or(isNotNull(lmsQuizQuestions.coId), isNotNull(qbQuestions.coId))));
        const attempts = qq.length ? await tx.select().from(lmsQuizAttempts).where(and(inArray(lmsQuizAttempts.quizId, [...new Set(qq.map((q) => q.quizId))]), isNotNull(lmsQuizAttempts.submittedAt), studentId ? eq(lmsQuizAttempts.studentId, studentId) : sql`true`)) : [];
        for (const quiz of quizzes) {
          const config = cfg(quiz.subjectId);
          const kind = config.evidenceWeights.lms !== undefined ? 'lms' : 'internal';
          const best = new Map<string, (typeof attempts)[number]>();
          for (const at of attempts.filter((x) => x.quizId === quiz.id)) if (!best.has(at.studentId) || (at.score ?? 0) > (best.get(at.studentId)!.score ?? 0)) best.set(at.studentId, at);
          const perCo = new Map<string, EvidenceItem['scores']>();
          for (const at of best.values()) {
            const asked = new Set(at.questionIds);
            const byCo = new Map<string, { scored: number; max: number }>();
            for (const q of qq.filter((x) => x.quizId === quiz.id && asked.has(x.id) && x.coId)) {
              const cur = byCo.get(q.coId!) ?? { scored: 0, max: 0 };
              cur.scored += at.results[q.id]?.marks ?? 0;
              cur.max += q.marks;
              byCo.set(q.coId!, cur);
            }
            for (const [coId, v] of byCo) perCo.set(coId, [...(perCo.get(coId) ?? []), { studentId: at.studentId, ...v }]);
          }
          for (const [coId, scores] of perCo) add(coId, { sourceId: quiz.id, label: `LMS quiz: ${quiz.title}`, kind, scores, basis: 'lms' });
        }
      }
    }
    return out;
  }

  /** Recomputes CO, PO and PSO attainment of a programme for a year and stores a new batch of snapshots. */
  async compute(tx: Tx, tenantId: string, userId: string, programId: string, academicYearId: string) {
    const subs = await tx.select({ id: subjects.id, code: subjects.code }).from(subjects).where(eq(subjects.programId, programId));
    const { base: config, source, bySubject } = await this.policiesFor(tx, programId, subs.map((s) => s.id), academicYearId);
    const cfg = (subjectId: string) => bySubject.get(subjectId)?.config ?? config;
    const sets = subs.length ? await tx.select().from(coSets).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))) : [];
    const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))).orderBy(asc(courseOutcomes.ord)) : [];
    const subjectOfSet = new Map(sets.map((s) => [s.id, s.subjectId]));
    const subjectCode = new Map(subs.map((s) => [s.id, s.code]));
    const evidence = await this.courseEvidence(tx, [...new Set(sets.map((s) => s.subjectId))], academicYearId, cfg);
    const surveys = await tx.select().from(obeSurveys).where(and(eq(obeSurveys.programId, programId), eq(obeSurveys.academicYearId, academicYearId)));
    const ratings = surveys.length ? await tx.select().from(obeSurveyRatings).where(inArray(obeSurveyRatings.surveyId, surveys.map((s) => s.id))) : [];
    const feedback = await this.feedbackEvidence(tx, cos.map((c) => c.id), academicYearId);
    const classroom = await this.classroomEvidence(tx, cos.map((c) => c.id), academicYearId);
    const previous = await this.latestBatch(tx, programId);
    // Targets set for this year override the programme's target level (and, for a CO, the student threshold).
    const targets = new Map((await tx.select().from(obeTargets).where(and(eq(obeTargets.programId, programId), eq(obeTargets.academicYearId, academicYearId)))).map((t) => [t.targetId, t]));
    const computedAt = new Date();
    const out: (typeof attainmentSnapshots.$inferInsert)[] = [];

    const surveyEvidence = (pick: (r: (typeof ratings)[number]) => boolean): SurveyEvidence[] =>
      surveys.flatMap((sv) => {
        const rs = ratings.filter((r) => r.surveyId === sv.id && pick(r));
        return rs.length === 0 ? [] : [{ surveyId: sv.id, title: sv.title, meanRating: rs.reduce((s, r) => s + r.rating, 0) / rs.length, scaleMax: sv.scaleMax, responses: rs.length, minResponses: sv.minResponses, weight: sv.weight }];
      });

    const coLevel = new Map<string, number | null>();
    const coSubject = new Map<string, string>();
    for (const co of cos) {
      const subjectId = subjectOfSet.get(co.coSetId)!;
      coSubject.set(co.id, subjectId);
      const own = targets.get(co.id);
      const policy = cfg(subjectId);
      const coConfig = own?.thresholdPercent ? { ...policy, studentThresholdPercent: own.thresholdPercent } : policy;
      const items = [...(evidence.get(co.id) ?? []), ...(classroom.get(co.id) ?? [])];
      const direct = directAttainment(items, coConfig);
      const indirect = indirectAttainment([...surveyEvidence((r) => r.coId === co.id), ...(feedback.get(co.id) ?? [])], policy);
      const combined = combinedAttainment(direct.level, indirect.level, policy);
      coLevel.set(co.id, combined);
      const g = gapFor(combined, own?.targetLevel ?? policy.targetLevel, policy.decimals);
      const ps = bySubject.get(subjectId)?.source ?? source;
      out.push({
        tenantId, programId, academicYearId, scope: 'co', targetId: co.id, code: `${subjectCode.get(subjectId)}/${co.code}`, subjectId, direct: direct.level, indirect: indirect.level, combined, target: g.target, gap: g.gap, met: g.met,
        detail: { byKind: direct.byKind, weakItems: direct.weakItems, surveys: indirect, method: coConfig.coMethod, threshold: coConfig.studentThresholdPercent, items: items.map((i) => ({ sourceId: i.sourceId, label: i.label, kind: i.kind, basis: i.basis ?? 'share' })), policy: { scope: ps.scope, version: ps.version } },
        computedBy: userId, computedAt,
      });
    }

    const pos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.ord));
    const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
    const courseAverage = new Map<string, number | null>();
    for (const s of new Set(coSubject.values())) {
      const vals = cos.filter((c) => coSubject.get(c.id) === s).map((c) => coLevel.get(c.id)).filter((v): v is number => v !== null && v !== undefined);
      courseAverage.set(s, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    }
    const poFeedback = await this.feedbackEvidence(tx, pos.map((p) => p.id), academicYearId, true);
    for (const po of pos) {
      const mine = cells.filter((c) => c.outcomeId === po.id);
      const agg = programOutcomeAttainment(mine.map((c) => ({ coId: c.coId, strength: c.strength, coAttainment: coLevel.get(c.coId) ?? null, courseId: coSubject.get(c.coId) })), config, courseAverage);
      const indirect = indirectAttainment([...surveyEvidence((r) => r.outcomeId === po.id), ...(poFeedback.get(po.id) ?? [])], config);
      const combined = combinedAttainment(agg.level, indirect.level, config);
      const g = gapFor(combined, targets.get(po.id)?.targetLevel ?? config.targetLevel, config.decimals);
      out.push({
        tenantId, programId, academicYearId, scope: 'po', targetId: po.id, code: po.code, direct: agg.level, indirect: indirect.level, combined, target: g.target, gap: g.gap, met: g.met,
        detail: { coverage: agg.coverage, contributors: agg.contributors, kind: po.kind, method: config.poMethod, byCourse: agg.byCourse, contributions: mine.map((c) => ({ coId: c.coId, subjectId: coSubject.get(c.coId), strength: c.strength, co: coLevel.get(c.coId) ?? null })), surveys: indirect, policy: { scope: source.scope, version: source.version } },
        computedBy: userId, computedAt,
      });
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

  /**
   * Attainment of one batch (the intake that joined in `entryYearId`): for each year of the programme it studied, the
   * latest computed CO attainment of the courses of its semesters that year, rolled up to every PO/PSO with the
   * programme's method; the indirect part is the graduating year's (exit, alumni and employer surveys).
   */
  async computeBatch(tx: Tx, tenantId: string, userId: string, programId: string, entryYearId: string) {
    const prog = await this.program(tx, programId);
    const years = await tx.select().from(academicYears).orderBy(asc(academicYears.startsOn));
    const start = years.findIndex((y) => y.id === entryYearId);
    if (start < 0) throw new NotFoundException('Academic year not found');
    const span = Math.max(1, Math.ceil(prog.termCount / 2));
    const label = batchLabel(years[start].label, span);
    const studied = years.slice(start, start + span);
    const config = (await this.policy(tx, programId, null, studied.at(-1)!.id)).config;
    const coRows: { coId: string; subjectId: string; combined: number | null; yearId: string }[] = [];
    let lastPo = new Map<string, { indirect: number | null; target: number }>();
    for (const [k, y] of studied.entries()) {
      const terms = [2 * k + 1, 2 * k + 2];
      const { rows } = await this.latest(tx, programId, y.id);
      const termOf = new Map((rows.length ? await tx.select({ id: subjects.id, term: subjects.term }).from(subjects).where(inArray(subjects.id, [...new Set(rows.filter((r) => r.subjectId).map((r) => r.subjectId!))])) : []).map((s) => [s.id, s.term]));
      for (const r of rows.filter((x) => x.scope === 'co' && x.subjectId && terms.includes(termOf.get(x.subjectId) ?? -1))) coRows.push({ coId: r.targetId, subjectId: r.subjectId!, combined: r.combined, yearId: y.id });
      if (rows.some((r) => r.scope === 'po')) lastPo = new Map(rows.filter((r) => r.scope === 'po').map((r) => [r.targetId, { indirect: r.indirect, target: r.target }]));
    }
    const pos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), inArray(programOutcomes.kind, ['po', 'pso']))).orderBy(asc(programOutcomes.kind), asc(programOutcomes.ord));
    const cells = coRows.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, coRows.map((c) => c.coId))) : [];
    const level = new Map(coRows.map((c) => [c.coId, c.combined]));
    const subjectOf = new Map(coRows.map((c) => [c.coId, c.subjectId]));
    const courseAverage = new Map<string, number | null>();
    for (const s of new Set(coRows.map((c) => c.subjectId))) {
      const v = coRows.filter((c) => c.subjectId === s && c.combined !== null).map((c) => c.combined as number);
      courseAverage.set(s, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    }
    const computedAt = new Date();
    const out: (typeof obeBatchSnapshots.$inferInsert)[] = [];
    for (const po of pos) {
      const mine = cells.filter((c) => c.outcomeId === po.id);
      const agg = programOutcomeAttainment(mine.map((c) => ({ coId: c.coId, strength: c.strength, coAttainment: level.get(c.coId) ?? null, courseId: subjectOf.get(c.coId) })), config, courseAverage);
      const ind = lastPo.get(po.id)?.indirect ?? null;
      const combined = combinedAttainment(agg.level, ind, config);
      const g = gapFor(combined, lastPo.get(po.id)?.target ?? config.targetLevel, config.decimals);
      out.push({ tenantId, programId, batch: label, entryYearId, scope: 'po', targetId: po.id, code: po.code, direct: agg.level, indirect: ind, combined, target: g.target, gap: g.gap, met: g.met, detail: { coverage: agg.coverage, contributors: agg.contributors, byCourse: agg.byCourse, kind: po.kind, years: studied.map((y) => y.label), method: config.poMethod }, computedBy: userId, computedAt });
    }
    const coMet = coRows.filter((c) => c.combined !== null);
    if (out.length) await tx.insert(obeBatchSnapshots).values(out);
    return { batch: label, years: studied.map((y) => y.label), cos: coRows.length, measured: coMet.length, outcomes: out.length, computedAt };
  }

  /** The newest batch-wise attainment of each batch of a programme. */
  async batches(tx: Tx, programId: string) {
    const rows = await tx
      .select()
      .from(obeBatchSnapshots)
      .where(and(eq(obeBatchSnapshots.programId, programId), sql`"obe_batch_snapshots"."computed_at" = (select max(b.computed_at) from obe_batch_snapshots b where b.program_id = ${programId} and b.entry_year_id = "obe_batch_snapshots"."entry_year_id")`))
      .orderBy(asc(obeBatchSnapshots.batch), asc(obeBatchSnapshots.code));
    const batches = [...new Map(rows.map((r) => [r.entryYearId, { entryYearId: r.entryYearId, batch: r.batch, computedAt: r.computedAt, years: (r.detail as { years?: string[] }).years ?? [] }])).values()];
    return { batches, rows };
  }

  /**
   * One student's CO-wise attainment in the courses of their class for a year: per CO, the share of the marks tagged to
   * it they scored in CIE, SEE and overall (CIE and SEE weighted as the policy weights them), whether that reaches the
   * threshold, and the class's level for the CO from the latest calculation.
   */
  async studentOutcomes(tx: Tx, studentId: string, academicYearId?: string) {
    const [st] = await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, programId: sections.programId, term: sections.term, yearId: sections.academicYearId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    const yearId = academicYearId ?? st.yearId;
    const subs = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects).where(and(eq(subjects.programId, st.programId), eq(subjects.term, st.term))).orderBy(asc(subjects.sortOrder), asc(subjects.code));
    const sets = subs.length ? await tx.select().from(coSets).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))) : [];
    const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
    const { base, bySubject } = await this.policiesFor(tx, st.programId, subs.map((s) => s.id), yearId);
    const cfg = (s: string) => bySubject.get(s)?.config ?? base;
    const evidence = await this.courseEvidence(tx, subs.map((s) => s.id), yearId, cfg, studentId);
    const { rows: snaps } = await this.latest(tx, st.programId, yearId);
    const snap = new Map(snaps.filter((r) => r.scope === 'co').map((r) => [r.targetId, r]));
    return {
      student: { id: st.id, name: st.name, rollNo: st.rollNo },
      academicYearId: yearId,
      courses: subs
        .map((s) => {
          const set = sets.find((x) => x.subjectId === s.id);
          const policy = cfg(s.id);
          const mine = set ? cos.filter((c) => c.coSetId === set.id) : [];
          return {
            subjectId: s.id,
            code: s.code,
            name: s.name,
            threshold: policy.studentThresholdPercent,
            cos: mine.map((c) => {
              const { cie, see, overall } = studentCoPercent(evidence.get(c.id) ?? [], studentId, policy);
              const cls = snap.get(c.id);
              return { coId: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, cie, see, overall, attained: overall === null ? null : overall + 1e-9 >= policy.studentThresholdPercent, classLevel: cls?.combined ?? null, target: cls?.target ?? policy.targetLevel };
            }),
          };
        })
        .filter((c) => c.cos.length > 0),
    };
  }
}
