import { governedParams, overlayPassRules } from '../governance/rule-params.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { assessments, assessmentSchemes, creditTransfers, examPapers, examResultLines, examResults, examSessions, gradeScales, marks, schemeComponents, students, subjects, supplementaryRegistrations } from '../db/schema.js';
import { pickAttempt } from '../exam-cell/exam-cell.logic.js';
import { cellSettings } from '../exam-cell/settings.js';
import { cgpa, sgpa, subjectResult, type ComponentEvidence, type GradeScaleRules, type PassRules, type SchemeComponent, type SubjectResult } from './grading.js';
import { applyGrace, examPassed, passOf, scaleOf } from '../affiliation/maths.js';
import { resolveAffiliation, type ResolvedAffiliation } from '../affiliation/resolve.js';

export type SessionRow = typeof examSessions.$inferSelect;

/** Sessions where candidates sit only the subjects they registered for (failed, to improve, or missed with leave). */
export const REPEAT_KINDS: string[] = ['supplementary', 'improvement', 'special'];

/** Whether a later attempt replaces an earlier one, or the better one counts (the exam office's setting). */
async function attemptPolicy(tx: Tx): Promise<'best' | 'latest'> {
  return (await cellSettings(tx)).attemptPolicy;
}

export interface SchemeBundle {
  subjectId: string;
  credits: number;
  pass: PassRules;
  scale: GradeScaleRules;
  components: SchemeComponent[];
}

export interface ProcessedStudent {
  studentId: string;
  lines: { subjectId: string; credits: number; result: SubjectResult }[];
  sgpa: number;
  cgpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  creditPoints: number;
  outcome: 'pass' | 'fail';
  /** The affiliation profile the result was graded under, or null without one. */
  rulesRef: ResolvedAffiliation['ref'] | null;
}

/** Loads schemes and marks, runs the grading maths and stores results. The maths is in grading.ts. */
@Injectable()
export class ExamsService {
  async session(tx: Tx, id: string): Promise<SessionRow> {
    const [s] = await tx.select().from(examSessions).where(eq(examSessions.id, id));
    if (!s) throw new NotFoundException('Exam session not found');
    return s;
  }

  /**
   * A subject's scheme for the year. Under an affiliating university's (or board's) profile the profile's grade
   * scale and pass rules replace the scheme's own (the university decides them, not the college); with an
   * autonomous profile, or none, the scheme's stand. An approved `grading/pass-mark` rule overlays either.
   */
  async scheme(tx: Tx, subjectId: string, academicYearId: string, affiliation?: ResolvedAffiliation | null): Promise<SchemeBundle | null> {
    const [sc] = await tx.select().from(assessmentSchemes).where(and(eq(assessmentSchemes.subjectId, subjectId), eq(assessmentSchemes.academicYearId, academicYearId)));
    if (!sc) return null;
    const [scale] = await tx.select().from(gradeScales).where(eq(gradeScales.id, sc.gradeScaleId));
    const comps = await tx.select().from(schemeComponents).where(eq(schemeComponents.schemeId, sc.id)).orderBy(asc(schemeComponents.ord));
    const university = affiliation?.scheme.ruleAuthority === 'university' ? affiliation.rules : null;
    const pass = university ? passOf(university) : (sc.passRules as PassRules);
    return {
      subjectId,
      credits: sc.credits,
      pass: overlayPassRules(pass, await governedParams(tx, 'grading', 'pass-mark')),
      scale: university ? scaleOf(university) : (scale.rules as GradeScaleRules),
      components: comps.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, weight: c.weight, bestOf: c.bestOf })),
    };
  }

  /** Problems that stop a session from being processed (missing schemes, unlinked or unverified marks). */
  async blockers(tx: Tx, s: SessionRow): Promise<string[]> {
    const papers = await tx.select({ subjectId: examPapers.subjectId, sectionId: examPapers.sectionId, name: subjects.name }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).where(eq(examPapers.sessionId, s.id));
    const problems: string[] = [];
    if (papers.length === 0) problems.push('The session has no papers');
    for (const p of papers) {
      const sc = await this.scheme(tx, p.subjectId, s.academicYearId);
      if (!sc) {
        problems.push(`${p.name}: no assessment scheme`);
        continue;
      }
      for (const c of sc.components) {
        const linked = await tx.select({ title: assessments.title, status: assessments.markStatus }).from(assessments).where(and(eq(assessments.componentId, c.id), eq(assessments.sectionId, p.sectionId)));
        if (linked.length === 0) problems.push(`${p.name}: no assessment linked to ${c.code}`);
        for (const a of linked) if (a.status === 'draft' || a.status === 'submitted') problems.push(`${p.name}: marks of "${a.title}" are not verified yet`);
      }
    }
    return problems;
  }

  /**
   * Grades the given students (default: every candidate of the session). A supplementary, improvement or special
   * session with registrations grades only the registered candidates in their registered subjects, wherever their
   * class is now; their internal marks are carried over from the original assessments and only this session's paper
   * counts for the external component. A mark coded MP (malpractice) fails the subject as MP, NE as not eligible.
   */
  async compute(tx: Tx, s: SessionRow, onlyStudent?: string): Promise<ProcessedStudent[]> {
    const papers = await tx.select().from(examPapers).where(eq(examPapers.sessionId, s.id));
    const sectionIds = [...new Set(papers.map((p) => p.sectionId))];
    const regs = REPEAT_KINDS.includes(s.kind)
      ? await tx.select({ studentId: supplementaryRegistrations.studentId, subjectId: supplementaryRegistrations.subjectId }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, s.id), onlyStudent ? eq(supplementaryRegistrations.studentId, onlyStudent) : sql`true`))
      : [];
    const registered = new Map<string, Set<string>>();
    for (const r of regs) registered.set(r.studentId, (registered.get(r.studentId) ?? new Set<string>()).add(r.subjectId));
    const roster = registered.size
      ? await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(inArray(students.id, [...registered.keys()]))
      : sectionIds.length
        ? await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(and(inArray(students.sectionId, sectionIds), eq(students.status, 'active'), onlyStudent ? eq(students.id, onlyStudent) : sql`true`))
        : [];
    const affiliation = await resolveAffiliation(tx, s.programId);
    const rules = affiliation?.rules ?? null;
    const bundles = new Map<string, SchemeBundle>();
    for (const p of papers) if (!bundles.has(p.subjectId)) {
      const b = await this.scheme(tx, p.subjectId, s.academicYearId, affiliation);
      if (!b) throw new ConflictException('A subject has no assessment scheme');
      bundles.set(p.subjectId, b);
    }
    const studentIds = roster.map((r) => r.id);
    const idList = sql.join(studentIds.map((x) => sql`${x}::uuid`), sql`, `);
    // Component-linked assessments of these subjects: of the session's classes, or anywhere the candidates have marks.
    const linked =
      bundles.size && studentIds.length
        ? await tx
            .select({ id: assessments.id, sectionId: assessments.sectionId, subjectId: assessments.subjectId, componentId: assessments.componentId, max: assessments.maxMarks })
            .from(assessments)
            .where(and(inArray(assessments.subjectId, [...bundles.keys()]), sql`${assessments.componentId} is not null`, sql`(${sectionIds.length ? inArray(assessments.sectionId, sectionIds) : sql`false`} or exists (select 1 from marks m where m.assessment_id = ${assessments.id} and m.student_id in (${idList})))`))
        : [];
    const rows = linked.length
      ? await tx.select({ assessmentId: marks.assessmentId, studentId: marks.studentId, marks: marks.marks, moderated: marks.moderatedMarks, absent: marks.absent, code: marks.code }).from(marks).where(and(inArray(marks.assessmentId, linked.map((a) => a.id)), inArray(marks.studentId, studentIds)))
      : [];
    const markOf = new Map(rows.map((r) => [`${r.assessmentId}:${r.studentId}`, r]));
    const sessionAssessments = new Set(papers.map((p) => p.assessmentId).filter((x): x is string => !!x));
    const subjectIds = [...bundles.keys()];
    const policy = await attemptPolicy(tx);
    const out: ProcessedStudent[] = [];
    for (const st of roster) {
      const mine = registered.get(st.id);
      const graded = subjectIds
        .filter((sub) => (mine ? mine.has(sub) : papers.some((p) => p.subjectId === sub && p.sectionId === st.sectionId)))
        .map((sub) => {
          const b = bundles.get(sub)!;
          const counts = (a: (typeof linked)[number]) => a.subjectId === sub && (a.sectionId === st.sectionId || markOf.has(`${a.id}:${st.id}`));
          const codes: string[] = [];
          const evidence: ComponentEvidence[] = b.components.map((c) => {
            let list = linked.filter((a) => a.componentId === c.id && counts(a));
            // The external component is this session's paper only (an earlier attempt's paper does not add to it).
            if (c.kind === 'external' && list.some((a) => sessionAssessments.has(a.id))) list = list.filter((a) => sessionAssessments.has(a.id));
            for (const a of list) {
              const code = markOf.get(`${a.id}:${st.id}`)?.code;
              if (code) codes.push(code);
            }
            return {
              componentId: c.id,
              entries: list.map((a) => {
                const m = markOf.get(`${a.id}:${st.id}`);
                return { scored: m ? (m.moderated ?? m.marks) : null, max: a.max, absent: (m?.absent ?? false) || !!m?.code };
              }),
            };
          });
          const result = markCodes(profileChecks(subjectResult(b.components, evidence, b.pass, b.scale), b.scale, rules), codes);
          return { subjectId: sub, credits: b.credits, pass: b.pass, scale: b.scale, components: b.components, result };
        });
      const lines = rules ? applyGrace(graded, rules.grace) : graded;
      const decimals = rules?.gpa.decimals ?? bundles.get(subjectIds[0])?.scale.decimals ?? 2;
      const gpaOpts = { rounding: rules?.gpa.rounding ?? ('half_up' as const), includeFailedCredits: rules?.gpa.includeFailedCredits ?? true };
      const term = sgpa(lines.map((l) => ({ credits: l.credits, gradePoint: l.result.gradePoint, passed: l.result.passed })), decimals, gpaOpts);
      const prior = await this.priorLines(tx, s, st.id, policy);
      const current = lines.map((l) => ({ subjectId: l.subjectId, term: s.term, credits: l.credits, points: l.result.passed ? l.credits * l.result.gradePoint : 0, passed: l.result.passed, gradePoint: l.result.gradePoint, percent: l.result.percent }));
      const all = [...prior.filter((p) => !current.some((l) => l.subjectId === p.subjectId)), ...current.map((c) => pickAttempt(prior.find((p) => p.subjectId === c.subjectId), c, policy))];
      const byTerm = new Map<number, { creditsAttempted: number; creditPoints: number }>();
      for (const l of all) {
        const t = byTerm.get(l.term) ?? { creditsAttempted: 0, creditPoints: 0 };
        // Regulations that leave failed subjects out of the average leave them out of CGPA too.
        if (gpaOpts.includeFailedCredits || l.points > 0) t.creditsAttempted += l.credits;
        t.creditPoints += l.points;
        byTerm.set(l.term, t);
      }
      const passed = rules ? examPassed(rules, lines.map((l) => l.result)).passed : lines.every((l) => l.result.passed);
      out.push({
        studentId: st.id,
        lines: lines.map((l) => ({ subjectId: l.subjectId, credits: l.credits, result: l.result })),
        sgpa: term.sgpa,
        cgpa: cgpa([...byTerm.values()], decimals, gpaOpts.rounding),
        creditsAttempted: term.creditsAttempted,
        creditsEarned: term.creditsEarned,
        creditPoints: term.creditPoints,
        outcome: passed ? 'pass' : 'fail',
        rulesRef: affiliation?.ref ?? null,
      });
    }
    return out;
  }

  /** The student's lines from other published sessions; of two attempts of a subject the policy keeps the later or the better one. */
  private async priorLines(tx: Tx, s: SessionRow, studentId: string, policy: 'best' | 'latest') {
    const rows = await tx
      .select({ subjectId: examResultLines.subjectId, term: examSessions.term, credits: examResultLines.credits, gp: examResultLines.gradePoint, passed: examResultLines.passed, percent: examResultLines.percent, startsOn: examSessions.startsOn })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .where(and(eq(examResults.studentId, studentId), ne(examSessions.id, s.id), inArray(examSessions.status, ['published', 'locked']), eq(examSessions.programId, s.programId)))
      .orderBy(asc(examSessions.startsOn), asc(examSessions.createdAt));
    const kept = new Map<string, { subjectId: string; term: number; credits: number; points: number; passed: boolean; gradePoint: number; percent: number }>();
    for (const r of rows) {
      const line = { subjectId: r.subjectId, term: r.term, credits: r.credits, points: r.passed ? r.credits * r.gp : 0, passed: r.passed, gradePoint: r.gp, percent: r.percent };
      kept.set(r.subjectId, pickAttempt(kept.get(r.subjectId), line, policy));
    }
    // Credits accepted from another institution (transfer, lateral entry) count towards the CGPA like a pass.
    for (const c of await tx.select().from(creditTransfers).where(eq(creditTransfers.studentId, studentId))) {
      const key = c.subjectId ?? `transfer:${c.id}`;
      if (!kept.has(key)) kept.set(key, { subjectId: key, term: c.term, credits: c.credits, points: c.credits * c.gradePoint, passed: true, gradePoint: c.gradePoint, percent: 0 });
    }
    return [...kept.values()];
  }

  async store(tx: Tx, tenantId: string, s: SessionRow, results: ProcessedStudent[]): Promise<void> {
    const old = await tx.select({ id: examResults.id }).from(examResults).where(and(eq(examResults.sessionId, s.id), inArray(examResults.studentId, results.map((r) => r.studentId))));
    if (old.length) await tx.delete(examResults).where(inArray(examResults.id, old.map((o) => o.id)));
    for (const r of results) {
      const [row] = await tx
        .insert(examResults)
        .values({ tenantId, sessionId: s.id, studentId: r.studentId, sgpa: r.sgpa, cgpa: r.cgpa, creditsAttempted: r.creditsAttempted, creditsEarned: r.creditsEarned, creditPoints: r.creditPoints, outcome: r.outcome, rulesRef: r.rulesRef })
        .returning({ id: examResults.id });
      if (r.lines.length)
        await tx.insert(examResultLines).values(
          r.lines.map((l) => ({ tenantId, resultId: row.id, subjectId: l.subjectId, credits: l.credits, percent: l.result.percent, grade: l.result.grade, gradePoint: l.result.gradePoint, passed: l.result.passed, reasons: l.result.reasons, components: l.result.components, grace: l.result.grace })),
        );
    }
  }

  /** Per student, the latest attempt of each subject across published sessions of the programme and (optionally) the given session. */
  async latestAttempts(tx: Tx, studentIds: string[], programId: string, includeSessionId?: string) {
    if (studentIds.length === 0) return new Map<string, { subjectId: string; code: string; subject: string; credits: number; passed: boolean; sessionId: string }[]>();
    const rows = await tx
      .select({ studentId: examResults.studentId, subjectId: examResultLines.subjectId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, passed: examResultLines.passed, gradePoint: examResultLines.gradePoint, percent: examResultLines.percent, sessionId: examSessions.id })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
      .where(and(inArray(examResults.studentId, studentIds), eq(examSessions.programId, programId), includeSessionId ? sql`(${examSessions.status} in ('published','locked') or ${examSessions.id} = ${includeSessionId})` : inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn), asc(examSessions.createdAt));
    const policy = await attemptPolicy(tx);
    const latest = new Map<string, Map<string, (typeof rows)[number]>>();
    for (const r of rows) {
      const m = latest.get(r.studentId) ?? new Map<string, (typeof rows)[number]>();
      m.set(r.subjectId, pickAttempt(m.get(r.subjectId), r, policy));
      latest.set(r.studentId, m);
    }
    return new Map([...latest].map(([sid, m]) => [sid, [...m.values()].map(({ studentId: _s, gradePoint: _g, percent: _p, ...l }) => l)]));
  }
}

/**
 * What a profile adds to a subject's result: absent in the external examination fails (shown with the profile's
 * absent grade), and internal marks below the eligibility minimum make the candidate not eligible (NE).
 */
export function profileChecks(r: SubjectResult, scale: GradeScaleRules, rules: ResolvedAffiliation['rules'] | null): SubjectResult {
  if (!rules) return r;
  const reasons = [...r.reasons];
  if (r.externalAbsent && !reasons.includes('absent')) reasons.push('absent');
  const ia = r.components.filter((c) => c.kind === 'internal');
  const iaWeight = ia.reduce((x, c) => x + c.weight, 0);
  const min = rules.pass.internalEligibilityPercent;
  if (min !== null && iaWeight > 0 && ia.every((c) => c.fraction !== null) && (ia.reduce((x, c) => x + c.weighted, 0) / iaWeight) * 100 + 1e-9 < min && !reasons.includes('not_eligible')) reasons.push('not_eligible');
  if (reasons.length === r.reasons.length) return r;
  const failBand = [...scale.bands].sort((a, b) => a.minPercent - b.minPercent).find((b) => !b.pass);
  const grade = reasons.includes('absent') ? rules.grading.absentGrade : reasons.includes('not_eligible') ? 'NE' : (failBand?.grade ?? r.grade);
  return { ...r, reasons, passed: false, gradePoint: 0, grade };
}

/** A mark coded MP (malpractice: the paper is cancelled) or NE (not eligible to sit) fails the subject with that grade, and no grace applies. */
export function markCodes(r: SubjectResult, codes: string[]): SubjectResult {
  if (codes.length === 0) return r;
  const code = codes.includes('MP') ? 'MP' : 'NE';
  const reason = code === 'MP' ? 'malpractice' : 'not_eligible';
  return { ...r, passed: false, gradePoint: 0, grade: code, grace: 0, externalAbsent: true, reasons: r.reasons.includes(reason) ? r.reasons : [...r.reasons, reason] };
}
