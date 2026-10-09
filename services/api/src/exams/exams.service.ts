import { governedParams, overlayPassRules } from '../governance/rule-params.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { assessments, assessmentSchemes, examPapers, examResultLines, examResults, examSessions, gradeScales, marks, schemeComponents, students, subjects } from '../db/schema.js';
import { cgpa, sgpa, subjectResult, type ComponentEvidence, type GradeScaleRules, type PassRules, type SchemeComponent, type SubjectResult } from './grading.js';

export type SessionRow = typeof examSessions.$inferSelect;

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
}

/** Loads schemes and marks, runs the grading maths and stores results. The maths is in grading.ts. */
@Injectable()
export class ExamsService {
  async session(tx: Tx, id: string): Promise<SessionRow> {
    const [s] = await tx.select().from(examSessions).where(eq(examSessions.id, id));
    if (!s) throw new NotFoundException('Exam session not found');
    return s;
  }

  async scheme(tx: Tx, subjectId: string, academicYearId: string): Promise<SchemeBundle | null> {
    const [sc] = await tx.select().from(assessmentSchemes).where(and(eq(assessmentSchemes.subjectId, subjectId), eq(assessmentSchemes.academicYearId, academicYearId)));
    if (!sc) return null;
    const [scale] = await tx.select().from(gradeScales).where(eq(gradeScales.id, sc.gradeScaleId));
    const comps = await tx.select().from(schemeComponents).where(eq(schemeComponents.schemeId, sc.id)).orderBy(asc(schemeComponents.ord));
    return { subjectId, credits: sc.credits, pass: overlayPassRules(sc.passRules as PassRules, await governedParams(tx, 'grading', 'pass-mark')), scale: scale.rules as GradeScaleRules, components: comps.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, weight: c.weight })) };
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

  /** Grades the given students (default: every active student of the session's classes). */
  async compute(tx: Tx, s: SessionRow, onlyStudent?: string): Promise<ProcessedStudent[]> {
    const papers = await tx.select().from(examPapers).where(eq(examPapers.sessionId, s.id));
    const sectionIds = [...new Set(papers.map((p) => p.sectionId))];
    const roster = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(and(inArray(students.sectionId, sectionIds), eq(students.status, 'active'), onlyStudent ? eq(students.id, onlyStudent) : sql`true`));
    const bundles = new Map<string, SchemeBundle>();
    for (const p of papers) if (!bundles.has(p.subjectId)) {
      const b = await this.scheme(tx, p.subjectId, s.academicYearId);
      if (!b) throw new ConflictException('A subject has no assessment scheme');
      bundles.set(p.subjectId, b);
    }
    // All component-linked assessments of these classes and subjects with their marks.
    const linked = await tx
      .select({ id: assessments.id, sectionId: assessments.sectionId, subjectId: assessments.subjectId, componentId: assessments.componentId, max: assessments.maxMarks })
      .from(assessments)
      .where(and(inArray(assessments.sectionId, sectionIds), inArray(assessments.subjectId, [...bundles.keys()]), sql`${assessments.componentId} is not null`));
    const rows = linked.length
      ? await tx.select({ assessmentId: marks.assessmentId, studentId: marks.studentId, marks: marks.marks, moderated: marks.moderatedMarks, absent: marks.absent }).from(marks).where(inArray(marks.assessmentId, linked.map((a) => a.id)))
      : [];
    const markOf = new Map(rows.map((r) => [`${r.assessmentId}:${r.studentId}`, r]));
    const subjectIds = [...bundles.keys()].filter((id) => papers.some((p) => p.subjectId === id));
    const out: ProcessedStudent[] = [];
    for (const st of roster) {
      const lines = subjectIds
        .filter((sub) => papers.some((p) => p.subjectId === sub && p.sectionId === st.sectionId))
        .map((sub) => {
          const b = bundles.get(sub)!;
          const evidence: ComponentEvidence[] = b.components.map((c) => ({
            componentId: c.id,
            entries: linked.filter((a) => a.componentId === c.id && a.sectionId === st.sectionId).map((a) => {
              const m = markOf.get(`${a.id}:${st.id}`);
              return { scored: m ? (m.moderated ?? m.marks) : null, max: a.max, absent: m?.absent ?? false };
            }),
          }));
          return { subjectId: sub, credits: b.credits, result: subjectResult(b.components, evidence, b.pass, b.scale) };
        });
      const decimals = bundles.get(subjectIds[0])?.scale.decimals ?? 2;
      const term = sgpa(lines.map((l) => ({ credits: l.credits, gradePoint: l.result.gradePoint, passed: l.result.passed })), decimals);
      const prior = await this.priorLines(tx, s, st.id);
      const all = [...prior.filter((p) => !lines.some((l) => l.subjectId === p.subjectId)), ...lines.map((l) => ({ subjectId: l.subjectId, term: s.term, credits: l.credits, points: l.result.passed ? l.credits * l.result.gradePoint : 0 }))];
      const byTerm = new Map<number, { creditsAttempted: number; creditPoints: number }>();
      for (const l of all) {
        const t = byTerm.get(l.term) ?? { creditsAttempted: 0, creditPoints: 0 };
        t.creditsAttempted += l.credits;
        t.creditPoints += l.points;
        byTerm.set(l.term, t);
      }
      out.push({
        studentId: st.id,
        lines,
        sgpa: term.sgpa,
        cgpa: cgpa([...byTerm.values()], decimals),
        creditsAttempted: term.creditsAttempted,
        creditsEarned: term.creditsEarned,
        creditPoints: term.creditPoints,
        outcome: lines.every((l) => l.result.passed) ? 'pass' : 'fail',
      });
    }
    return out;
  }

  /** The student's lines from other published sessions; a later attempt of a subject replaces an earlier one. */
  private async priorLines(tx: Tx, s: SessionRow, studentId: string) {
    const rows = await tx
      .select({ subjectId: examResultLines.subjectId, term: examSessions.term, credits: examResultLines.credits, gp: examResultLines.gradePoint, passed: examResultLines.passed, startsOn: examSessions.startsOn })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .where(and(eq(examResults.studentId, studentId), ne(examSessions.id, s.id), inArray(examSessions.status, ['published', 'locked']), eq(examSessions.programId, s.programId)))
      .orderBy(asc(examSessions.startsOn));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) latest.set(r.subjectId, r);
    return [...latest.values()].map((r) => ({ subjectId: r.subjectId, term: r.term, credits: r.credits, points: r.passed ? r.credits * r.gp : 0 }));
  }

  async store(tx: Tx, tenantId: string, s: SessionRow, results: ProcessedStudent[]): Promise<void> {
    const old = await tx.select({ id: examResults.id }).from(examResults).where(and(eq(examResults.sessionId, s.id), inArray(examResults.studentId, results.map((r) => r.studentId))));
    if (old.length) await tx.delete(examResults).where(inArray(examResults.id, old.map((o) => o.id)));
    for (const r of results) {
      const [row] = await tx
        .insert(examResults)
        .values({ tenantId, sessionId: s.id, studentId: r.studentId, sgpa: r.sgpa, cgpa: r.cgpa, creditsAttempted: r.creditsAttempted, creditsEarned: r.creditsEarned, creditPoints: r.creditPoints, outcome: r.outcome })
        .returning({ id: examResults.id });
      if (r.lines.length)
        await tx.insert(examResultLines).values(
          r.lines.map((l) => ({ tenantId, resultId: row.id, subjectId: l.subjectId, credits: l.credits, percent: l.result.percent, grade: l.result.grade, gradePoint: l.result.gradePoint, passed: l.result.passed, reasons: l.result.reasons, components: l.result.components })),
        );
    }
  }

  /** Per student, the latest attempt of each subject across published sessions of the programme and (optionally) the given session. */
  async latestAttempts(tx: Tx, studentIds: string[], programId: string, includeSessionId?: string) {
    if (studentIds.length === 0) return new Map<string, { subjectId: string; code: string; subject: string; credits: number; passed: boolean; sessionId: string }[]>();
    const rows = await tx
      .select({ studentId: examResults.studentId, subjectId: examResultLines.subjectId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, passed: examResultLines.passed, sessionId: examSessions.id })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
      .where(and(inArray(examResults.studentId, studentIds), eq(examSessions.programId, programId), includeSessionId ? sql`(${examSessions.status} in ('published','locked') or ${examSessions.id} = ${includeSessionId})` : inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn), asc(examSessions.createdAt));
    const latest = new Map<string, Map<string, (typeof rows)[number]>>();
    for (const r of rows) {
      const m = latest.get(r.studentId) ?? new Map();
      m.set(r.subjectId, r);
      latest.set(r.studentId, m);
    }
    return new Map([...latest].map(([sid, m]) => [sid, [...m.values()].map(({ studentId: _s, ...l }) => l)]));
  }
}
