import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessmentQuestionCos, assessmentQuestions, obeCurriculumGaps, QUESTION_DIFFICULTY, type ObeFramework } from '../db/schema-obe-flagship.js';
import { academicYears, assessments, coOutcomeMap, coSets, courseOutcomes, examResults, examSessions, improvementActions, obeEvidence, obeSurveys, programOutcomes, schemeComponents, sections, students, subjects, surveys, tenants, timetableSlots, users } from '../db/schema.js';
import { BrandingService } from '../documents/branding.service.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { peoPoMap } from '../db/schema-obe-depth.js';
import { unitPlan } from './links.controller.js';
import { headsSubject } from '../departments/departments.controller.js';
import { isSchoolAdmin } from '../teacher/teacher.service.js';
import { articulationMatrix, peoAttainment, round } from './attainment.js';
import { bloomNumber, BLOOM_LEVELS } from './bloom.js';
import { reportPdf, reportXlsx, type Block, type Cell, type Column, type ReportDoc } from './obe-report.js';
import { ObeService, studentCoPercent, type Policy } from './obe.service.js';
import { coordinatedPrograms } from './workflow.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'quality_officer'];

export const FRAMEWORK_NAME: Record<ObeFramework, string> = {
  nba_tier1: 'NBA Tier I (engineering)',
  nba_tier2: 'NBA Tier II (engineering)',
  nba_management: 'NBA (management)',
  nba_pharmacy: 'NBA (pharmacy)',
  naac: 'NAAC criterion 2.6',
  custom: 'Institution framework',
};
const KIND_NAME: Record<string, string> = { internal: 'CIE', external: 'SEE', classroom: 'Classroom checks', lms: 'LMS quizzes' };
const METHOD_TEXT: Record<string, string> = {
  threshold: 'a student attains a CO on scoring at least the threshold percentage of the marks of the questions tagged to it; the share of students who attain gives the level',
  class_average: 'the class average percentage on the marks tagged to the CO gives the level',
  percentage: 'the share of students attaining the threshold, scaled to the top level, is the attainment',
};
const PO_TEXT: Record<string, string> = {
  course_weighted: 'for each course, the strength-weighted average of its CO attainments mapped to the PO, then the average over courses weighted by the programme articulation matrix',
  co_weighted: 'the strength-weighted average of every mapped CO attainment of the programme',
  course_average: 'the average attainment of each course weighted by its programme articulation matrix value for the PO',
};

/** The rules of a policy in words, for the "how attainment is calculated" section of every report. */
export function policyText(c: Policy): string[] {
  const kinds = Object.entries(c.evidenceWeights).filter(([, w]) => w > 0).map(([k, w]) => `${KIND_NAME[k] ?? k} ${w}%`).join(', ');
  const bands = [...c.levels].sort((a, b) => b.level - a.level).map((l) => `level ${l.level} at ${l.minStudentsPercent}%`).join(', ');
  return [
    `Direct attainment of a CO: ${METHOD_TEXT[c.coMethod]} (threshold ${c.studentThresholdPercent}%; ${bands}). Evidence is weighted ${kinds}.`,
    `Results received as totals only (such as the university SEE) are ${c.seeApportion === 'off' ? 'not used' : c.seeApportion === 'equal' ? 'shared equally between the COs the paper tests' : "shared out to the COs by the question paper's CO weightage (blueprint)"}.${c.includeLms ? ' LMS quiz questions tagged to a CO count as CIE.' : ''}`,
    `Overall attainment = ${c.directWeight}% direct + ${c.indirectWeight}% indirect (course exit survey for COs; programme exit, alumni and employer surveys for POs), on a 0 to ${c.maxLevel} scale. The default target is level ${c.targetLevel}.`,
    `PO and PSO attainment (direct): ${PO_TEXT[c.poMethod]}.`,
  ];
}

const coCols = (cos: { code: string }[], level?: Column['level']): Column[] => cos.map((c) => ({ title: c.code, w: 0.6, align: 'center' as const, level }));

/**
 * OBE documents, each as a PDF (the institution's report cover in front, from the document engine) and as an Excel
 * workbook: the course file, course, programme and batch attainment reports, the NBA SAR criterion 2 and 3 tables and the
 * NAAC 2.6.1 to 2.6.3 data.
 */
@Controller('v1/obe')
export class ObeReportsController {
  constructor(
    private readonly db: DbService,
    private readonly obe: ObeService,
    private readonly engine: DocumentEngine,
    private readonly branding: BrandingService,
  ) {}

  @Get('subjects/:subjectId/course-file.:format')
  @Auth('user', STAFF)
  courseFile(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Param('format') format: string, @Query('academicYearId', ParseUUIDPipe) yearId: string, @Res() res: Response) {
    return this.send(p, res, format, 'course-file', subjectId, (tx) => this.courseDoc(tx, p, subjectId, yearId, true));
  }

  @Get('subjects/:subjectId/attainment-report.:format')
  @Auth('user', STAFF)
  courseReport(@CurrentPrincipal() p: UserPrincipal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Param('format') format: string, @Query('academicYearId', ParseUUIDPipe) yearId: string, @Res() res: Response) {
    return this.send(p, res, format, 'course-attainment', subjectId, (tx) => this.courseDoc(tx, p, subjectId, yearId, false));
  }

  @Get('programs/:programId/attainment-report.:format')
  @Auth('user', MANAGE)
  programReport(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Param('format') format: string, @Query('academicYearId', ParseUUIDPipe) yearId: string, @Res() res: Response) {
    return this.send(p, res, format, 'programme-attainment', programId, (tx) => this.programDoc(tx, programId, yearId));
  }

  @Get('programs/:programId/batch-report.:format')
  @Auth('user', MANAGE)
  batchReport(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Param('format') format: string, @Res() res: Response) {
    return this.send(p, res, format, 'batch-attainment', programId, (tx) => this.batchDoc(tx, programId));
  }

  @Get('programs/:programId/sar.:format')
  @Auth('user', MANAGE)
  sar(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Param('format') format: string, @Query('academicYearId', ParseUUIDPipe) yearId: string, @Res() res: Response) {
    return this.send(p, res, format, 'nba-sar-c2-c3', programId, (tx) => this.sarDoc(tx, programId, yearId));
  }

  @Get('programs/:programId/naac-2-6.:format')
  @Auth('user', MANAGE)
  naac(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Param('format') format: string, @Query('academicYearId', ParseUUIDPipe) yearId: string, @Res() res: Response) {
    return this.send(p, res, format, 'naac-2.6', programId, (tx) => this.naacDoc(tx, programId, yearId));
  }

  private async send(p: UserPrincipal, res: Response, format: string, kind: string, id: string, build: (tx: Tx) => Promise<ReportDoc>) {
    if (format !== 'pdf' && format !== 'xlsx') throw new NotFoundException('Choose PDF or Excel');
    const file = await this.db.withTenant(p.tenantId, async (tx) => {
      const doc = await build(tx);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'obe.report.exported', subjectType: kind.startsWith('course') ? 'subject' : 'program', subjectId: id, data: { kind, format } });
      if (format === 'xlsx') return reportXlsx(doc);
      const palette = (await this.branding.get(tx)).palette;
      const body = reportPdf(doc, palette.primary);
      return this.engine.withCover(tx, p, body, { title: doc.title, subtitle: doc.subtitle, period: doc.period, preparedFor: doc.preparedFor, preparedBy: 'Outcome-based education (IQAC)', source: { type: 'report', id: `obe:${kind}:${id}`.slice(0, 300) } });
    });
    const name = `${kind}.${format}`;
    res.setHeader('content-type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `${format === 'pdf' ? 'inline' : 'attachment'}; filename="${name}"`);
    res.end(file);
  }

  // ---- shared data -------------------------------------------------------------------------------------------------------

  private async basics(tx: Tx, programId: string, yearId?: string) {
    const prog = await this.obe.program(tx, programId);
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const [yr] = yearId ? await tx.select({ label: academicYears.label }).from(academicYears).where(eq(academicYears.id, yearId)) : [];
    const framework = await this.obe.framework(tx, programId);
    const statements = await tx.select().from(programOutcomes).where(eq(programOutcomes.programId, programId)).orderBy(asc(programOutcomes.ord), asc(programOutcomes.code));
    const outcomes = statements.filter((s) => s.kind === 'po' || s.kind === 'pso').sort((a, b) => (a.kind === b.kind ? a.ord - b.ord || a.code.localeCompare(b.code, 'en', { numeric: true }) : a.kind === 'po' ? -1 : 1));
    return { prog, institution: t?.name ?? '', year: yr?.label ?? '', framework, statements, outcomes };
  }

  private async courseSets(tx: Tx, programId: string) {
    const subs = await tx.select().from(subjects).where(eq(subjects.programId, programId)).orderBy(asc(subjects.term), asc(subjects.sortOrder), asc(subjects.code));
    const sets = subs.length ? await tx.select().from(coSets).where(and(inArray(coSets.subjectId, subs.map((s) => s.id)), eq(coSets.status, 'active'))) : [];
    const cos = sets.length ? await tx.select().from(courseOutcomes).where(inArray(courseOutcomes.coSetId, sets.map((s) => s.id))).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
    const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
    const withCos = subs.filter((s) => sets.some((x) => x.subjectId === s.id));
    const cosOf = (subjectId: string) => cos.filter((c) => c.coSetId === sets.find((x) => x.subjectId === subjectId)?.id);
    return { subs: withCos, cos, cells, cosOf };
  }

  private statementBlocks(statements: { kind: string; code: string; statement: string }[]): Block[] {
    const out: Block[] = [];
    for (const [kind, title] of [['vision', 'Vision'], ['mission', 'Mission'], ['peo', 'Programme educational objectives (PEOs)'], ['po', 'Programme outcomes (POs)'], ['pso', 'Programme specific outcomes (PSOs)']] as const) {
      const list = statements.filter((s) => s.kind === kind);
      if (!list.length) continue;
      out.push({ kind: 'table', caption: title, sheet: title.split(' (')[0], columns: [{ title: 'Code', w: 0.8 }, { title: 'Statement', w: 8 }], rows: list.map((s) => [s.code, s.statement]) });
    }
    return out;
  }

  private camTable(caption: string, cos: { id: string; code: string; statement: string }[], outcomes: { id: string; code: string }[], cells: { coId: string; outcomeId: string; strength: number }[], sheet?: string): Block {
    const s = (co: string, o: string) => cells.find((c) => c.coId === co && c.outcomeId === o)?.strength ?? null;
    const avg = outcomes.map((o) => {
      const v = cos.map((c) => s(c.id, o.id)).filter((x): x is number => x !== null && x > 0);
      return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 2) : null;
    });
    return { kind: 'table', caption, sheet, columns: [{ title: 'CO', w: 0.7 }, ...outcomes.map((o) => ({ title: o.code, w: 0.55, align: 'center' as const, strength: true }))], rows: [...cos.map((c) => [c.code, ...outcomes.map((o) => s(c.id, o.id))] as Cell[]), ['Average', ...avg]] };
  }

  // ---- course file and course attainment ---------------------------------------------------------------------------------

  private async courseDoc(tx: Tx, p: UserPrincipal, subjectId: string, yearId: string, full: boolean): Promise<ReportDoc> {
    const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    if (!sub) throw new NotFoundException('Subject not found');
    if (!isSchoolAdmin(p) && !p.roles.includes('quality_officer') && !(await headsSubject(tx, p, subjectId)) && !(await coordinatedPrograms(tx, p.userId)).includes(sub.programId)) {
      const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.subjectId, subjectId), eq(timetableSlots.teacherId, p.userId))).limit(1);
      if (!slot) throw new ForbiddenException('You do not teach this course');
    }
    const b = await this.basics(tx, sub.programId, yearId);
    const { config, source } = await this.obe.policy(tx, sub.programId, subjectId, yearId);
    const [set] = await tx.select().from(coSets).where(and(eq(coSets.subjectId, subjectId), eq(coSets.status, 'active')));
    const cos = set ? await tx.select().from(courseOutcomes).where(eq(courseOutcomes.coSetId, set.id)).orderBy(asc(courseOutcomes.ord), asc(courseOutcomes.code)) : [];
    const cells = cos.length ? await tx.select().from(coOutcomeMap).where(inArray(coOutcomeMap.coId, cos.map((c) => c.id))) : [];
    const faculty = (await tx.selectDistinct({ name: users.fullName, section: sections.displayName }).from(timetableSlots).innerJoin(users, eq(users.id, timetableSlots.teacherId)).innerJoin(sections, eq(sections.id, timetableSlots.sectionId)).where(and(eq(timetableSlots.subjectId, subjectId), eq(sections.academicYearId, yearId)))).map((f) => `${f.name} (${f.section})`);
    const blocks: Block[] = [];
    blocks.push({ kind: 'facts', items: [['Programme', b.prog.name], ['Course', `${sub.code} ${sub.name}`], ['Semester', String(sub.term)], ['Academic year', b.year], ['Credits', sub.credits === null ? '-' : String(sub.credits)], ['L-T-P-S (hours a week)', `${sub.lectureHours}-${sub.tutorialHours}-${sub.practicalHours}-${sub.selfStudyHours}`], ['Faculty', faculty.join(', ') || '-'], ['Framework', FRAMEWORK_NAME[b.framework]], ['CO version', set ? `Version ${set.version}, approved ${set.activatedAt?.toISOString().slice(0, 10) ?? ''}` : 'No approved COs'], ['Rules', `${source.scope === 'subject' ? 'Course' : source.scope === 'program' ? 'Programme' : source.scope === 'institution' ? 'Institution' : 'Default'} policy${source.version ? ` v${source.version}` : ''}`]] });

    if (full) {
      blocks.push({ kind: 'heading', text: '1. Syllabus' });
      const plan = await unitPlan(tx, sub);
      blocks.push({ kind: 'table', caption: 'Course plan: units, their topics and the COs each unit serves', sheet: 'Syllabus', columns: [{ title: 'Unit', w: 3 }, { title: 'Topics', w: 6 }, { title: 'COs', w: 1.4 }], rows: plan.units.map((u) => [u.title, u.topics.join('; '), u.coCodes.join(', ') || '-']), empty: 'No syllabus is linked to this course in the content library.' });
      if (plan.units.length && plan.uncovered.length) blocks.push({ kind: 'para', text: `No unit is mapped to ${plan.uncovered.join(', ')}.`, muted: true });
    }

    blocks.push({ kind: 'heading', text: `${full ? '2' : '1'}. Course outcomes` });
    blocks.push({ kind: 'table', caption: 'Course outcomes with their Bloom level', sheet: 'COs', columns: [{ title: 'CO', w: 0.7 }, { title: 'Statement', w: 7 }, { title: 'Bloom level', w: 1.4 }], rows: cos.map((c) => [c.code, c.statement, c.bloomLevel ?? '-']) });
    blocks.push({ kind: 'heading', text: `${full ? '3' : '2'}. Course articulation matrix (CO-PO/PSO)` });
    blocks.push(this.camTable('Strength of each CO towards each PO and PSO (3 high, 2 medium, 1 low)', cos, b.outcomes, cells, 'CAM'));
    const justified = cells.filter((c) => c.justification?.trim());
    if (full && justified.length) blocks.push({ kind: 'table', caption: 'Justification of the mappings', sheet: 'CAM justification', columns: [{ title: 'CO', w: 0.7 }, { title: 'PO/PSO', w: 0.8 }, { title: 'Strength', w: 0.8, align: 'center' }, { title: 'Why', w: 7 }], rows: justified.map((c) => [cos.find((x) => x.id === c.coId)?.code ?? '', b.outcomes.find((o) => o.id === c.outcomeId)?.code ?? '', c.strength, c.justification ?? '']) });

    // Assessments and their papers.
    const asm = await tx
      .select({ id: assessments.id, title: assessments.title, kind: assessments.kind, max: assessments.maxMarks, heldOn: assessments.heldOn, section: sections.displayName, componentKind: schemeComponents.kind, avg: sql<number | null>`(select avg(coalesce(m.moderated_marks, m.marks))::float from marks m where m.assessment_id = ${assessments.id} and coalesce(m.moderated_marks, m.marks) is not null)`, n: sql<number>`(select count(*)::int from marks m where m.assessment_id = ${assessments.id})`, absent: sql<number>`(select count(*)::int from marks m where m.assessment_id = ${assessments.id} and m.absent)` })
      .from(assessments)
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .leftJoin(schemeComponents, eq(schemeComponents.id, assessments.componentId))
      .where(and(eq(assessments.subjectId, subjectId), eq(sections.academicYearId, yearId)))
      .orderBy(asc(sections.displayName), asc(assessments.heldOn));
    const qs = asm.length ? await tx.select().from(assessmentQuestions).where(inArray(assessmentQuestions.assessmentId, asm.map((a) => a.id))).orderBy(asc(assessmentQuestions.ord)) : [];
    const tags = qs.length ? await tx.select().from(assessmentQuestionCos).where(inArray(assessmentQuestionCos.questionId, qs.map((q) => q.id))) : [];
    const qAvg = new Map(qs.length ? (await tx.execute<{ question_id: string; avg: number }>(sql`select question_id, avg(marks)::float as avg from question_marks where question_id in (${sql.join(qs.map((q) => sql`${q.id}::uuid`), sql`, `)}) and marks is not null group by question_id`)).rows.map((r) => [r.question_id, r.avg]) : []);
    const coCode = new Map(cos.map((c) => [c.id, c.code]));
    const n = full ? 4 : 3;
    blocks.push({ kind: 'heading', text: `${n}. Assessments, question papers and CO weightage` });
    blocks.push({ kind: 'table', caption: 'Assessments of the year', sheet: 'Assessments', columns: [{ title: 'Assessment', w: 4 }, { title: 'Class', w: 2 }, { title: 'Evidence', w: 1 }, { title: 'Held on', w: 1.4 }, { title: 'Out of', w: 0.9, align: 'right' }, { title: 'Marks entered', w: 1.1, align: 'right' }, { title: 'Average %', w: 1.1, align: 'right' }, { title: 'Questions', w: 1, align: 'right' }], rows: asm.map((a) => [a.title, a.section, a.kind === 'exam' || a.componentKind === 'external' ? 'SEE' : 'CIE', a.heldOn, a.max, a.n, a.avg === null ? null : round((a.avg / a.max) * 100, 1), qs.filter((q) => q.assessmentId === a.id).length]) });
    const seen = new Set<string>();
    for (const a of asm) {
      const paper = qs.filter((q) => q.assessmentId === a.id);
      const sig = `${a.title.replace(/\s+/g, ' ')}|${paper.map((q) => `${q.no}:${q.maxMarks}`).join(',')}`;
      if (!paper.length || seen.has(sig)) continue;
      seen.add(sig);
      blocks.push({ kind: 'table', caption: `${a.title}: question paper with CO and Bloom tags`, sheet: `Paper ${seen.size}`, columns: [{ title: 'Q', w: 0.6 }, { title: 'Part', w: 1 }, { title: 'Marks', w: 0.8, align: 'right' }, { title: 'COs', w: 1.6 }, { title: 'Bloom level', w: 1.4 }, { title: 'Difficulty', w: 1 }, { title: 'Class average %', w: 1.3, align: 'right' }], rows: paper.map((q) => [q.no, q.part || '-', q.maxMarks, tags.filter((t) => t.questionId === q.id).map((t) => coCode.get(t.coId) ?? '').join(', ') || '-', bloomNumber(q.bloomLevel) ? BLOOM_LEVELS[bloomNumber(q.bloomLevel)! - 1] : '-', q.difficulty ?? '-', qAvg.has(q.id) ? round((qAvg.get(q.id)! / q.maxMarks) * 100, 1) : null]) });
    }
    if (qs.length) {
      const total = qs.reduce((s, q) => s + q.maxMarks, 0);
      const weight = (coId: string) => qs.reduce((s, q) => { const mine = tags.filter((t) => t.questionId === q.id); const w = mine.reduce((x, t) => x + t.weight, 0); const t = mine.find((x) => x.coId === coId); return s + (t && w ? (q.maxMarks * t.weight) / w : 0); }, 0);
      blocks.push({ kind: 'table', caption: 'CO weightage across all question papers (marks and share)', sheet: 'CO weightage', columns: [{ title: 'CO', w: 1 }, { title: 'Marks', w: 1, align: 'right' }, { title: 'Share %', w: 1, align: 'right' }], rows: cos.map((c) => [c.code, round(weight(c.id), 1), total ? round((weight(c.id) / total) * 100, 1) : null]) });
      blocks.push({ kind: 'table', caption: 'Bloom level spread across all question papers', sheet: 'Bloom spread', columns: [{ title: 'Bloom level', w: 2 }, { title: 'Marks', w: 1, align: 'right' }, { title: 'Share %', w: 1, align: 'right' }], rows: BLOOM_LEVELS.map((name, i) => { const m = qs.filter((q) => bloomNumber(q.bloomLevel) === i + 1).reduce((s, q) => s + q.maxMarks, 0); return [name, m, total ? round((m / total) * 100, 1) : null]; }) });
      blocks.push({ kind: 'table', caption: 'Difficulty spread across all question papers', sheet: 'Difficulty spread', columns: [{ title: 'Difficulty', w: 2 }, { title: 'Marks', w: 1, align: 'right' }, { title: 'Share %', w: 1, align: 'right' }], rows: [...QUESTION_DIFFICULTY.map((d) => { const m = qs.filter((q) => q.difficulty === d).reduce((s, q) => s + q.maxMarks, 0); return [d, m, total ? round((m / total) * 100, 1) : null]; }), (() => { const m = qs.filter((q) => !q.difficulty).reduce((s, q) => s + q.maxMarks, 0); return ['not set', m, total ? round((m / total) * 100, 1) : null]; })()] });
    }

    // Student-wise CO attainment and the class result per CO.
    const evidence = await this.obe.courseEvidence(tx, [subjectId], yearId, () => config);
    const roster = await tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName, section: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(eq(sections.programId, sub.programId), eq(sections.term, sub.term), eq(sections.academicYearId, yearId), eq(students.status, 'active'))).orderBy(asc(sections.displayName), asc(students.rollNo));
    if (full) {
      blocks.push({ kind: 'heading', text: '5. Marks: student-wise CO attainment (percentage of the marks on each CO)' });
      blocks.push({ kind: 'para', text: `Each cell is the student's percentage of the marks tagged to the CO, CIE and SEE weighted ${config.evidenceWeights.internal ?? 0} : ${config.evidenceWeights.external ?? 0}. A student attains a CO at ${config.studentThresholdPercent}% or more.`, muted: true });
      blocks.push({ kind: 'table', caption: 'Students and their CO percentages', sheet: 'Student-wise', columns: [{ title: 'Roll no', w: 1.2 }, { title: 'Name', w: 2.6 }, ...cos.map((c) => ({ title: c.code, w: 0.7, align: 'right' as const, level: { max: 100, target: config.studentThresholdPercent } }))], rows: roster.map((s) => [s.rollNo, s.name, ...cos.map((c) => studentCoPercent(evidence.get(c.id) ?? [], s.id, config).overall)]) });
    }
    const { rows: snaps, computedAt } = await this.obe.latest(tx, sub.programId, yearId);
    const snap = new Map(snaps.filter((r) => r.scope === 'co').map((r) => [r.targetId, r]));
    blocks.push({ kind: 'heading', text: `${full ? '6' : '4'}. Attainment calculation` });
    for (const line of policyText(config)) blocks.push({ kind: 'para', text: line });
    blocks.push({ kind: 'para', text: computedAt ? `Calculated on ${computedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.` : 'Attainment has not been calculated for this year yet.', muted: true });
    const kindRow = (r: (typeof snaps)[number] | undefined, k: string) => {
      const x = ((r?.detail as { byKind?: { kind: string; students: number; attained: number; percentAttained: number; averagePercent: number; level: number }[] })?.byKind ?? []).find((y) => y.kind === k);
      return x ? [x.students, x.attained, x.percentAttained, x.level] : [null, null, null, null];
    };
    blocks.push({
      kind: 'table',
      caption: 'CO attainment: CIE and SEE pools, direct, indirect and overall',
      sheet: 'CO attainment',
      columns: [{ title: 'CO', w: 0.7 }, { title: 'CIE students', w: 0.9, align: 'right' }, { title: 'CIE attained', w: 0.9, align: 'right' }, { title: 'CIE %', w: 0.8, align: 'right' }, { title: 'CIE level', w: 0.8, align: 'right' }, { title: 'SEE students', w: 0.9, align: 'right' }, { title: 'SEE attained', w: 0.9, align: 'right' }, { title: 'SEE %', w: 0.8, align: 'right' }, { title: 'SEE level', w: 0.8, align: 'right' }, { title: 'Direct', w: 0.8, align: 'right' }, { title: 'Indirect', w: 0.8, align: 'right' }, { title: 'Overall', w: 0.8, align: 'right', level: { max: config.maxLevel, target: config.targetLevel } }, { title: 'Target', w: 0.8, align: 'right' }, { title: 'Met', w: 0.6, align: 'center' }],
      rows: cos.map((c) => {
        const r = snap.get(c.id);
        return [c.code, ...kindRow(r, 'internal'), ...kindRow(r, 'external'), r?.direct ?? null, r?.indirect ?? null, r?.combined ?? null, r?.target ?? config.targetLevel, r ? (r.met ? 'Yes' : 'No') : '-'];
      }),
    });

    // Gaps and actions.
    const gaps = cos.filter((c) => snap.get(c.id) && !snap.get(c.id)!.met);
    blocks.push({ kind: 'heading', text: `${full ? '7' : '5'}. Gaps and actions` });
    blocks.push({ kind: 'table', caption: 'COs below their target', sheet: 'Gaps', columns: [{ title: 'CO', w: 0.8 }, { title: 'Overall', w: 1, align: 'right' }, { title: 'Target', w: 1, align: 'right' }, { title: 'Gap', w: 1, align: 'right' }, { title: 'Weakest evidence', w: 6 }], rows: gaps.map((c) => { const r = snap.get(c.id)!; return [c.code, r.combined, r.target, r.gap, ((r.detail as { weakItems?: { label: string; percentAttained: number }[] }).weakItems ?? []).slice(0, 3).map((w) => `${w.label} (${w.percentAttained}%)`).join('; ')]; }), empty: 'Every measured CO met its target.' });
    const acts = await tx.select().from(improvementActions).where(and(eq(improvementActions.programId, sub.programId), or(eq(improvementActions.subjectId, subjectId), like(improvementActions.code, `${sub.code}/%`), cos.length ? inArray(improvementActions.targetId, cos.map((c) => c.id)) : sql`false`))).orderBy(asc(improvementActions.createdAt));
    blocks.push({ kind: 'table', caption: 'Improvement actions and action taken', sheet: 'Actions', columns: [{ title: 'Outcome', w: 1.2 }, { title: 'Action', w: 4 }, { title: 'Action taken', w: 4 }, { title: 'Status', w: 1 }, { title: 'Before', w: 0.8, align: 'right' }, { title: 'After', w: 0.8, align: 'right' }], rows: acts.map((a) => [a.code ?? '', a.title, a.actionTaken ?? '-', a.status, a.baselineValue, a.remeasuredValue]), empty: 'No improvement actions for this course.' });
    if (full) {
      const exit = await tx.select({ title: surveys.title, status: surveys.status, responses: sql<number>`(select count(*)::int from survey_responses r where r.survey_id = "surveys"."id")`, mean: sql<number | null>`(select round(avg(a.rating)::numeric, 2)::float from survey_answers a join survey_questions q on q.id = a.question_id where q.survey_id = "surveys"."id" and q.kind = 'rating')` }).from(surveys).where(and(eq(surveys.subjectId, subjectId), eq(surveys.obeKind, 'course_exit'), eq(surveys.academicYearId, yearId)));
      blocks.push({ kind: 'heading', text: '8. Course exit survey (indirect assessment)' });
      blocks.push({ kind: 'table', caption: 'Course exit surveys of the year', sheet: 'Exit survey', columns: [{ title: 'Survey', w: 5 }, { title: 'Status', w: 1 }, { title: 'Responses', w: 1, align: 'right' }, { title: 'Mean rating (of 5)', w: 1.4, align: 'right' }], rows: exit.map((e) => [e.title, e.status, e.responses, e.mean]), empty: 'No course exit survey was run in the app; paper surveys entered as ratings count too.' });
    }
    return { title: `${full ? 'Course file' : 'Course attainment report'}: ${sub.code} ${sub.name}`, subtitle: `${b.prog.name}, semester ${sub.term}, ${b.year}. ${FRAMEWORK_NAME[b.framework]}.`, institution: b.institution, period: b.year, preparedFor: full ? 'Course file (department)' : 'Department and IQAC', landscape: full ? undefined : true, blocks };
  }

  // ---- programme ----------------------------------------------------------------------------------------------------------

  private async programDoc(tx: Tx, programId: string, yearId: string): Promise<ReportDoc> {
    const b = await this.basics(tx, programId, yearId);
    const config = (await this.obe.policy(tx, programId, null, yearId)).config;
    const { subs, cells, cosOf } = await this.courseSets(tx, programId);
    const { rows, computedAt } = await this.obe.latest(tx, programId, yearId);
    const blocks: Block[] = [{ kind: 'facts', items: [['Programme', b.prog.name], ['Academic year', b.year], ['Framework', FRAMEWORK_NAME[b.framework]], ['Calculated', computedAt ? computedAt.toISOString().slice(0, 10) : 'Not yet']] }];
    blocks.push({ kind: 'heading', text: '1. Statements' }, ...this.statementBlocks(b.statements));
    blocks.push({ kind: 'heading', text: '2. How attainment is calculated' });
    for (const line of policyText(config)) blocks.push({ kind: 'para', text: line });
    blocks.push({ kind: 'heading', text: '3. Programme articulation matrix (course × PO/PSO)' }, this.pamBlock(subs, cells, cosOf, b.outcomes));
    blocks.push({ kind: 'heading', text: '4. Course outcome attainment by course' });
    const live = subs.filter((s) => cosOf(s.id).some((c) => rows.some((r) => r.targetId === c.id)));
    const maxCos = Math.max(0, ...live.map((s) => cosOf(s.id).length));
    blocks.push({ kind: 'table', caption: 'Overall CO attainment (level) of each course', sheet: 'CO attainment', columns: [{ title: 'Course', w: 3.2 }, { title: 'Sem', w: 0.5, align: 'center' }, ...Array.from({ length: maxCos }, (_, i) => ({ title: `CO${i + 1}`, w: 0.7, align: 'center' as const, level: { max: config.maxLevel, target: config.targetLevel } })), { title: 'Course average', w: 1, align: 'right' }], rows: live.map((s) => { const v = cosOf(s.id).map((c) => rows.find((r) => r.targetId === c.id)?.combined ?? null); const m = v.filter((x): x is number => x !== null); return [`${s.code} ${s.name}`, s.term, ...Array.from({ length: maxCos }, (_, i) => v[i] ?? null), m.length ? round(m.reduce((a, c) => a + c, 0) / m.length, 2) : null]; }) });
    blocks.push({ kind: 'heading', text: '5. PO and PSO attainment' }, this.poBlock(rows, b.outcomes, config));
    blocks.push({ kind: 'heading', text: '6. PEO attainment (through the PEO-PO/PSO matrix)' }, ...(await this.peoBlocks(tx, programId, rows, config)));
    blocks.push(...(await this.actionBlocks(tx, programId, yearId, '7')));
    return { title: `Programme attainment report: ${b.prog.name}`, subtitle: `${b.year}. ${FRAMEWORK_NAME[b.framework]}.`, institution: b.institution, period: b.year, preparedFor: 'IQAC and the programme committee', landscape: true, blocks };
  }

  /** Each PEO's attainment: its POs' overall attainment weighted by the PEO-PO/PSO matrix. */
  private async peoBlocks(tx: Tx, programId: string, rows: { scope: string; targetId: string; combined: number | null }[], config: Policy): Promise<Block[]> {
    const peos = await tx.select().from(programOutcomes).where(and(eq(programOutcomes.programId, programId), eq(programOutcomes.kind, 'peo'))).orderBy(asc(programOutcomes.ord), asc(programOutcomes.code));
    const cells = await tx.select({ peoId: peoPoMap.peoId, outcomeId: peoPoMap.outcomeId, strength: peoPoMap.strength, code: programOutcomes.code }).from(peoPoMap).innerJoin(programOutcomes, eq(programOutcomes.id, peoPoMap.outcomeId)).where(eq(peoPoMap.programId, programId));
    const levels = new Map(rows.filter((r) => r.scope === 'po').map((r) => [r.targetId, r.combined]));
    return [
      { kind: 'para', text: 'A PEO is attained through the POs and PSOs that serve it: the average of their overall attainment, weighted by the strength in the PEO-PO/PSO matrix (3 high, 2 medium, 1 low).', muted: true },
      { kind: 'table', caption: 'PEO attainment', sheet: 'PEO attainment', columns: [{ title: 'PEO', w: 0.8 }, { title: 'Statement', w: 5 }, { title: 'Served by (strength)', w: 2.6 }, { title: 'Attainment', w: 1, align: 'right', level: { max: config.maxLevel, target: config.targetLevel } }, { title: 'Target', w: 0.8, align: 'right' }, { title: 'Met', w: 0.6, align: 'center' }], rows: peos.map((pe) => { const mine = cells.filter((c) => c.peoId === pe.id); const a = peoAttainment(mine, levels, config.decimals); return [pe.code, pe.statement, mine.map((c) => `${c.code} (${c.strength})`).join(', ') || '-', a.value, config.targetLevel, a.value === null ? '-' : a.value >= config.targetLevel ? 'Yes' : 'No']; }), empty: 'No PEOs are recorded for this programme.' },
    ];
  }

  private pamBlock(subs: { id: string; code: string; name: string; term: number }[], cells: { coId: string; outcomeId: string; strength: number }[], cosOf: (s: string) => { id: string }[], outcomes: { id: string; code: string }[]): Block {
    const m = articulationMatrix(subs.flatMap((s) => { const ids = new Set(cosOf(s.id).map((c) => c.id)); return cells.filter((c) => ids.has(c.coId)).map((c) => ({ courseId: s.id, outcomeId: c.outcomeId, strength: c.strength })); }));
    return { kind: 'table', caption: 'Average strength of each course’s COs towards each PO and PSO, built from the course articulation matrices', sheet: 'PAM', columns: [{ title: 'Course', w: 3 }, { title: 'Sem', w: 0.5, align: 'center' }, ...outcomes.map((o) => ({ title: o.code, w: 0.6, align: 'center' as const, strength: true }))], rows: subs.filter((s) => m.has(s.id)).map((s) => [`${s.code} ${s.name}`, s.term, ...outcomes.map((o) => m.get(s.id)?.get(o.id) ?? null)]) };
  }

  private poBlock(rows: { scope: string; targetId: string; code: string; direct: number | null; indirect: number | null; combined: number | null; target: number; met: boolean; detail: unknown }[], outcomes: { id: string; code: string; statement: string }[], config: Policy): Block {
    return {
      kind: 'table',
      caption: `Direct (from the courses), indirect (surveys) and overall (${config.directWeight} : ${config.indirectWeight})`,
      sheet: 'PO attainment',
      columns: [{ title: 'PO/PSO', w: 0.8 }, { title: 'Statement', w: 6 }, { title: 'Direct', w: 0.8, align: 'right' }, { title: 'Indirect', w: 0.8, align: 'right' }, { title: 'Overall', w: 0.8, align: 'right', level: { max: config.maxLevel, target: config.targetLevel } }, { title: 'Target', w: 0.8, align: 'right' }, { title: 'Met', w: 0.6, align: 'center' }, { title: 'Courses', w: 0.8, align: 'right' }],
      rows: outcomes.map((o) => {
        const r = rows.find((x) => x.scope === 'po' && x.targetId === o.id);
        return [o.code, o.statement, r?.direct ?? null, r?.indirect ?? null, r?.combined ?? null, r?.target ?? config.targetLevel, r ? (r.met ? 'Yes' : 'No') : '-', ((r?.detail as { byCourse?: unknown[] })?.byCourse ?? []).length];
      }),
    };
  }

  private async actionBlocks(tx: Tx, programId: string, yearId: string, n: string): Promise<Block[]> {
    const acts = await tx.select({ a: improvementActions, owner: users.fullName, verifier: sql<string | null>`(select v.full_name from users v where v.id = ${improvementActions.verifiedBy})` }).from(improvementActions).leftJoin(users, eq(users.id, improvementActions.ownerId)).where(and(eq(improvementActions.programId, programId), or(eq(improvementActions.academicYearId, yearId), sql`${improvementActions.academicYearId} is null`))).orderBy(asc(improvementActions.code));
    const ev = acts.length ? await tx.select({ targetId: obeEvidence.targetId, title: obeEvidence.title }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'action'), inArray(obeEvidence.targetId, acts.map((x) => x.a.id)))) : [];
    return [
      { kind: 'heading', text: `${n}. Gap analysis and action-taken report` },
      { kind: 'table', caption: 'Outcomes below target, the action, what was done and the re-measurement', sheet: 'ATR', columns: [{ title: 'Outcome', w: 1.2 }, { title: 'Before', w: 0.7, align: 'right' }, { title: 'Target', w: 0.7, align: 'right' }, { title: 'Root cause', w: 3 }, { title: 'Action', w: 3 }, { title: 'Action taken', w: 3.4 }, { title: 'Owner', w: 1.6 }, { title: 'Status', w: 1 }, { title: 'After', w: 0.7, align: 'right' }, { title: 'Evidence', w: 2.4 }, { title: 'Verified', w: 1.8 }], rows: acts.map(({ a, owner, verifier }) => [a.code ?? '', a.baselineValue, a.targetValue, a.rootCause ?? '-', a.title, a.actionTaken ?? '-', owner ?? '-', a.status, a.remeasuredValue, ev.filter((e) => e.targetId === a.id).map((e) => e.title).join('; ') || '-', a.verifiedAt ? `${verifier ?? ''} ${a.verifiedAt.toISOString().slice(0, 10)}`.trim() : '-']), empty: 'No improvement actions were needed.' },
    ];
  }

  // ---- batch ---------------------------------------------------------------------------------------------------------------

  private async batchDoc(tx: Tx, programId: string): Promise<ReportDoc> {
    const b = await this.basics(tx, programId);
    const config = await this.obe.config(tx, programId);
    const { batches, rows } = await this.obe.batches(tx, programId);
    const blocks: Block[] = [{ kind: 'para', text: 'Each batch is an intake followed through the years it studied: the CO attainment of the courses of its semesters each year, rolled up to the POs and PSOs, with the graduating year’s surveys as indirect attainment.' }];
    blocks.push({ kind: 'table', caption: 'Overall PO/PSO attainment of each batch', sheet: 'Batches', columns: [{ title: 'PO/PSO', w: 1 }, ...batches.map((x) => ({ title: x.batch, w: 1, align: 'right' as const, level: { max: config.maxLevel, target: config.targetLevel } })), { title: 'Target', w: 0.8, align: 'right' }], rows: b.outcomes.map((o) => [o.code, ...batches.map((x) => rows.find((r) => r.entryYearId === x.entryYearId && r.targetId === o.id)?.combined ?? null), config.targetLevel]) });
    for (const x of batches) blocks.push({ kind: 'table', caption: `Batch ${x.batch} (${x.years.join(', ')}): direct, indirect and overall`, sheet: `Batch ${x.batch}`, columns: [{ title: 'PO/PSO', w: 1 }, { title: 'Direct', w: 1, align: 'right' }, { title: 'Indirect', w: 1, align: 'right' }, { title: 'Overall', w: 1, align: 'right', level: { max: config.maxLevel, target: config.targetLevel } }, { title: 'Met', w: 0.7, align: 'center' }, { title: 'COs measured', w: 1, align: 'right' }], rows: rows.filter((r) => r.entryYearId === x.entryYearId).map((r) => [r.code, r.direct, r.indirect, r.combined, r.met ? 'Yes' : 'No', (r.detail as { contributors?: number }).contributors ?? null]) });
    return { title: `Batch-wise attainment: ${b.prog.name}`, subtitle: `${batches.length} batches. ${FRAMEWORK_NAME[b.framework]}.`, institution: b.institution, period: batches.length ? `${batches.length} batches` : 'No batches yet', preparedFor: 'IQAC and the programme committee', landscape: true, blocks };
  }

  // ---- NBA SAR criteria 2 and 3 ----------------------------------------------------------------------------------------------

  /** The assessment year and the two before it (NBA's CAY, CAYm1, CAYm2), newest first, as far as they exist. */
  private async assessmentYears(tx: Tx, yearId: string): Promise<{ id: string; label: string; tag: string }[]> {
    const years = await tx.select({ id: academicYears.id, label: academicYears.label, startsOn: academicYears.startsOn }).from(academicYears).orderBy(desc(academicYears.startsOn));
    const at = years.findIndex((y) => y.id === yearId);
    if (at < 0) return [];
    return years.slice(at, at + 3).map((y, i) => ({ id: y.id, label: y.label, tag: i === 0 ? 'CAY' : `CAYm${i}` }));
  }

  /**
   * NBA SAR tables for the programme's framework. Engineering Tier II and pharmacy: criterion 2 (curricular gaps 2.1.1,
   * content beyond the syllabus 2.1.2, question paper quality 2.2.2) and criterion 3 (3.1 to 3.3). Engineering Tier I adds
   * the curriculum structure and components (2.1.2, 2.1.3). Management (MBA/PGDM) reports outcomes as criterion 3 and the
   * curriculum as criterion 4. CO and PO attainment are shown for the assessment year and the two years before it.
   */
  private async sarDoc(tx: Tx, programId: string, yearId: string): Promise<ReportDoc> {
    const b = await this.basics(tx, programId, yearId);
    const config = (await this.obe.policy(tx, programId, null, yearId)).config;
    const { subs, cells, cosOf } = await this.courseSets(tx, programId);
    const { rows } = await this.obe.latest(tx, programId, yearId);
    const years = await this.assessmentYears(tx, yearId);
    const history = new Map<string, Awaited<ReturnType<ObeService['latest']>>['rows']>();
    for (const y of years) history.set(y.id, y.id === yearId ? rows : (await this.obe.latest(tx, programId, y.id)).rows);
    const gaps = await tx.select().from(obeCurriculumGaps).where(eq(obeCurriculumGaps.programId, programId)).orderBy(desc(obeCurriculumGaps.heldOn));
    const subName = new Map(subs.map((s) => [s.id, `${s.code} ${s.name}`]));
    const management = b.framework === 'nba_management';
    const tier1 = b.framework === 'nba_tier1';
    const blocks: Block[] = [{ kind: 'facts', items: [['Programme', b.prog.name], ['Framework', FRAMEWORK_NAME[b.framework]], ['Assessment years', years.map((y) => `${y.tag} ${y.label}`).join(', ') || b.year], ['Courses with COs', String(subs.length)]] }];

    // Curriculum (criterion 2; criterion 4 for management programmes).
    const curriculum: Block[] = [];
    const cur = management ? '4' : '2';
    curriculum.push({ kind: 'heading', text: management ? 'Criterion 4: Curriculum and learning process' : 'Criterion 2: Program curriculum and teaching-learning processes' });
    if (tier1 || management) {
      const all = await tx.select().from(subjects).where(eq(subjects.programId, programId)).orderBy(asc(subjects.term), asc(subjects.sortOrder), asc(subjects.code));
      curriculum.push({ kind: 'sub', text: `${cur}.1.2 Structure of the curriculum` });
      curriculum.push({ kind: 'table', caption: `Table ${cur}.1.2: Courses with their contact hours and credits`, sheet: `${cur}.1.2 Structure`, columns: [{ title: 'Sem', w: 0.5, align: 'center' }, { title: 'Course code', w: 1.2 }, { title: 'Course title', w: 4 }, { title: 'Type', w: 1.2 }, { title: 'L', w: 0.5, align: 'right' }, { title: 'T', w: 0.5, align: 'right' }, { title: 'P', w: 0.5, align: 'right' }, { title: 'Credits', w: 0.8, align: 'right' }], rows: all.map((s) => [s.term, s.code, s.name, s.courseType.replace(/_/g, ' '), s.lectureHours, s.tutorialHours, s.practicalHours, s.credits]), empty: 'No courses are recorded for this programme.' });
      const byType = new Map<string, { courses: number; credits: number; hours: number }>();
      for (const s of all) {
        const v = byType.get(s.courseType) ?? { courses: 0, credits: 0, hours: 0 };
        v.courses++;
        v.credits += s.credits ?? 0;
        v.hours += s.lectureHours + s.tutorialHours + s.practicalHours;
        byType.set(s.courseType, v);
      }
      const totalCredits = [...byType.values()].reduce((a, v) => a + v.credits, 0);
      curriculum.push({ kind: 'sub', text: `${cur}.1.3 Components of the curriculum` });
      curriculum.push({ kind: 'table', caption: `Table ${cur}.1.3: Curriculum components`, sheet: `${cur}.1.3 Components`, columns: [{ title: 'Component', w: 2.4 }, { title: 'Courses', w: 0.9, align: 'right' }, { title: 'Contact hours a week', w: 1.4, align: 'right' }, { title: 'Credits', w: 0.9, align: 'right' }, { title: 'Share of credits %', w: 1.3, align: 'right' }], rows: [...byType].map(([k, v]) => [k.replace(/_/g, ' '), v.courses, v.hours, round(v.credits, 1), totalCredits ? round((v.credits / totalCredits) * 100, 1) : null]) });
    }
    const gapNo = tier1 ? `${cur}.1.4` : `${cur}.1.1`;
    curriculum.push({ kind: 'sub', text: `${gapNo} Curricular gaps identified for the attainment of the POs and PSOs, and actions taken` });
    curriculum.push({ kind: 'table', caption: `Table ${gapNo}: Curricular gaps`, sheet: `${gapNo} Gaps`, columns: [{ title: 'S.No', w: 0.5 }, { title: 'Gap', w: 3.4 }, { title: 'Action taken', w: 3.4 }, { title: 'Date', w: 1.1 }, { title: 'Resource person', w: 2 }, { title: 'Students', w: 0.8, align: 'right' }, { title: 'Relevance to POs/PSOs', w: 1.4 }], rows: gaps.filter((g) => g.kind === 'gap').map((g, i) => [i + 1, g.title, g.description ?? '-', g.heldOn, g.resourcePerson ?? '-', g.beneficiaries, g.outcomeCodes.map((c) => c.toUpperCase()).join(', ')]) });
    const beyondNo = tier1 ? `${cur}.1.4 (b)` : `${cur}.1.2`;
    curriculum.push({ kind: 'sub', text: `${beyondNo} Delivery of content beyond the syllabus for the attainment of the POs and PSOs` });
    curriculum.push({ kind: 'table', caption: `Table ${beyondNo}: Content beyond the syllabus`, sheet: `${beyondNo.replace(' (b)', 'b')} Beyond syllabus`, columns: [{ title: 'S.No', w: 0.5 }, { title: 'Topic', w: 3.4 }, { title: 'Course', w: 2.4 }, { title: 'Mode', w: 1.4 }, { title: 'Date', w: 1.1 }, { title: 'Resource person', w: 2 }, { title: 'Students', w: 0.8, align: 'right' }, { title: 'POs/PSOs', w: 1.2 }], rows: gaps.filter((g) => g.kind === 'beyond_syllabus').map((g, i) => [i + 1, g.title, g.subjectId ? subName.get(g.subjectId) ?? '-' : '-', (g.method ?? '-').replace(/_/g, ' '), g.heldOn, g.resourcePerson ?? '-', g.beneficiaries, g.outcomeCodes.map((c) => c.toUpperCase()).join(', ')]) });
    curriculum.push({ kind: 'sub', text: `${cur}.2.2 Quality of internal semester question papers, assignments and evaluation` });
    const papers = subs.length
      ? await tx.execute<{ subject_id: string; title: string; questions: number; cos: number; bloom: number; higher: number; marks: number; levels: number }>(sql`
          select a.subject_id, a.title, count(distinct q.id)::int as questions,
            count(distinct c.co_id)::int as cos, count(distinct q.bloom_level)::int as bloom, count(distinct q.difficulty)::int as levels,
            (select coalesce(sum(x.max_marks), 0)::float from assessment_questions x where x.assessment_id = min(a.id::text)::uuid) as marks,
            (select coalesce(sum(x.max_marks), 0)::float from assessment_questions x where x.assessment_id = min(a.id::text)::uuid and x.bloom_level ~* '(analy|evalu|creat|[456])') as higher
          from assessments a join sections s on s.id = a.section_id
          join assessment_questions q on q.assessment_id = a.id left join assessment_question_cos c on c.question_id = q.id
          where s.academic_year_id = ${yearId}::uuid and a.subject_id in (${sql.join(subs.map((x) => sql`${x.id}::uuid`), sql`, `)}) and a.kind <> 'exam'
          group by a.subject_id, a.title order by 1, 2`)
      : { rows: [] };
    curriculum.push({ kind: 'table', caption: `Table ${cur}.2.2: Internal question papers: CO coverage, Bloom levels and difficulty`, sheet: `${cur}.2.2 Question papers`, columns: [{ title: 'Course', w: 3 }, { title: 'Assessment', w: 3 }, { title: 'Questions', w: 0.9, align: 'right' }, { title: 'COs covered', w: 1, align: 'right' }, { title: 'COs of course', w: 1, align: 'right' }, { title: 'Bloom levels used', w: 1.1, align: 'right' }, { title: 'Higher-order marks %', w: 1.3, align: 'right' }, { title: 'Difficulty levels', w: 1.1, align: 'right' }], rows: papers.rows.map((r) => [subName.get(r.subject_id) ?? '', r.title, r.questions, r.cos, cosOf(r.subject_id).length, r.bloom, r.marks ? round((r.higher / r.marks) * 100, 1) : null, r.levels]), empty: 'No internal question papers are recorded for this year.' });

    // Outcomes (criterion 3).
    const outcomes: Block[] = [];
    outcomes.push({ kind: 'heading', text: management ? 'Criterion 3: Program outcomes and course outcomes' : 'Criterion 3: Course outcomes and program outcomes' });
    outcomes.push({ kind: 'sub', text: '3.1.1 Course outcomes (COs)' });
    outcomes.push({ kind: 'table', caption: 'Table 3.1.1: COs of the courses', sheet: '3.1.1 COs', columns: [{ title: 'Course', w: 2.6 }, { title: 'Sem', w: 0.5, align: 'center' }, { title: 'CO', w: 0.6 }, { title: 'Statement', w: 6 }, { title: 'Bloom level', w: 1.2 }], rows: subs.flatMap((s) => cosOf(s.id).map((c) => [`${s.code} ${s.name}`, s.term, c.code, c.statement, c.bloomLevel ?? '-'])) });
    outcomes.push({ kind: 'sub', text: '3.1.2 CO-PO/PSO matrices of the courses' });
    for (const s of subs.slice(0, 40)) outcomes.push(this.camTable(`Table 3.1.2: ${s.code} ${s.name}`, cosOf(s.id), b.outcomes, cells, `3.1.2 ${s.code}`));
    outcomes.push({ kind: 'sub', text: '3.1.3 Program level course-PO/PSO matrix' }, this.pamBlock(subs, cells, cosOf, b.outcomes));
    outcomes.push({ kind: 'sub', text: '3.2.1 Assessment processes and tools used to measure CO attainment' });
    for (const line of policyText(config)) outcomes.push({ kind: 'para', text: line });
    outcomes.push({ kind: 'para', text: 'Direct tools: internal tests, assignments, quizzes (including LMS quizzes), laboratory work and the semester end examination, each with its questions tagged to COs, Bloom levels and difficulty, and marked question by question. Indirect tool: the course exit survey taken in the Student App.' });
    outcomes.push({ kind: 'sub', text: '3.2.2 Attainment of course outcomes' });
    const maxCos = Math.max(0, ...subs.map((s) => cosOf(s.id).length));
    const snapOf = (r: typeof rows, id: string) => r.find((x) => x.targetId === id);
    outcomes.push({ kind: 'table', caption: `Table 3.2.2: CO attainment levels against each CO's target (${years[0]?.tag ?? 'CAY'} ${b.year})`, sheet: '3.2.2 CO attainment', columns: [{ title: 'Course', w: 3 }, ...Array.from({ length: maxCos }, (_, i) => ({ title: `CO${i + 1}`, w: 0.7, align: 'center' as const, level: { max: config.maxLevel, target: config.targetLevel } })), { title: 'Target', w: 0.7, align: 'right' }, { title: 'COs met', w: 0.8, align: 'right' }], rows: subs.map((s) => { const v = cosOf(s.id).map((c) => snapOf(rows, c.id)); const t = v.filter((x) => x).map((x) => x!.target); return [`${s.code} ${s.name}`, ...Array.from({ length: maxCos }, (_, i) => v[i]?.combined ?? null), t.length ? round(t.reduce((a, c) => a + c, 0) / t.length, 2) : config.targetLevel, `${v.filter((x) => x?.met).length}/${v.filter((x) => x && x.combined !== null).length}`]; }) });
    if (years.length > 1) {
      // Matched by course code and CO code: an earlier year's COs may be an earlier version.
      outcomes.push({ kind: 'table', caption: 'Table 3.2.2 (b): Average CO attainment of each course over the assessment years', sheet: '3.2.2 By year', columns: [{ title: 'Course', w: 3 }, ...years.flatMap((y) => [{ title: `${y.tag} ${y.label}`, w: 1.1, align: 'right' as const, level: { max: config.maxLevel, target: config.targetLevel } }, { title: `${y.tag} met`, w: 0.8, align: 'right' as const }])], rows: subs.map((s) => [`${s.code} ${s.name}`, ...years.flatMap((y) => { const mine = (history.get(y.id) ?? []).filter((r) => r.scope === 'co' && (r.subjectId === s.id || r.code.startsWith(`${s.code}/`))); const v = mine.filter((r) => r.combined !== null); return [v.length ? round(v.reduce((a, r) => a + (r.combined as number), 0) / v.length, 2) : null, v.length ? `${v.filter((r) => r.met).length}/${v.length}` : '-']; })]) });
    }
    outcomes.push({ kind: 'sub', text: '3.3.1 Assessment tools and processes for PO/PSO attainment' });
    outcomes.push({ kind: 'para', text: `Direct: from the CO attainment of every course through the course articulation matrices. Indirect: programme exit survey of the final-year students in the Student App, alumni and employer surveys. Overall = ${config.directWeight}% direct + ${config.indirectWeight}% indirect.` });
    outcomes.push({ kind: 'sub', text: '3.3.2 Results of the evaluation of each PO and PSO' }, this.poBlock(rows, b.outcomes, config));
    if (years.length > 1) outcomes.push({ kind: 'table', caption: 'Table 3.3.2 (b): Overall PO and PSO attainment over the assessment years', sheet: '3.3.2 By year', columns: [{ title: 'PO/PSO', w: 0.9 }, ...years.flatMap((y) => [{ title: `${y.tag} ${y.label}`, w: 1.1, align: 'right' as const, level: { max: config.maxLevel, target: config.targetLevel } }, { title: `${y.tag} target`, w: 0.9, align: 'right' as const }])], rows: b.outcomes.map((o) => [o.code, ...years.flatMap((y) => { const r = (history.get(y.id) ?? []).find((x) => x.scope === 'po' && x.targetId === o.id); return [r?.combined ?? null, r?.target ?? null]; })]) });
    outcomes.push(...(await this.actionBlocks(tx, programId, yearId, '3.3.3')));
    blocks.push(...(management ? [...outcomes, ...curriculum] : [...curriculum, ...outcomes]));
    return { title: `NBA SAR ${management ? 'criteria 3 and 4' : 'criteria 2 and 3'}: ${b.prog.name}`, subtitle: `${b.year}. Programme reports under ${FRAMEWORK_NAME[b.framework]}.`, institution: b.institution, period: b.year, preparedFor: 'National Board of Accreditation (NBA)', landscape: true, blocks };
  }
  // ---- NAAC 2.6 --------------------------------------------------------------------------------------------------------------

  private async naacDoc(tx: Tx, programId: string, yearId: string): Promise<ReportDoc> {
    const b = await this.basics(tx, programId, yearId);
    const config = (await this.obe.policy(tx, programId, null, yearId)).config;
    const { subs, cosOf } = await this.courseSets(tx, programId);
    const { rows } = await this.obe.latest(tx, programId, yearId);
    const blocks: Block[] = [];
    blocks.push({ kind: 'heading', text: '2.6.1 Programme outcomes, programme specific outcomes and course outcomes are stated and displayed' });
    blocks.push({ kind: 'para', text: 'The POs, PSOs and COs below are approved through the course outcome workflow (faculty, head of department, OBE coordinator, IQAC), published on the institution website and in the course files, and shown to students in the Student App with their own attainment of each CO.' });
    blocks.push(...this.statementBlocks(b.statements.filter((s) => s.kind === 'po' || s.kind === 'pso')));
    blocks.push({ kind: 'table', caption: 'Course outcomes of the programme', sheet: 'COs', columns: [{ title: 'Course', w: 2.6 }, { title: 'Sem', w: 0.5, align: 'center' }, { title: 'CO', w: 0.6 }, { title: 'Statement', w: 6 }, { title: 'Bloom level', w: 1.2 }], rows: subs.flatMap((s) => cosOf(s.id).map((c) => [`${s.code} ${s.name}`, s.term, c.code, c.statement, c.bloomLevel ?? '-'])) });
    blocks.push({ kind: 'heading', text: '2.6.2 Attainment of programme outcomes and course outcomes is evaluated' });
    for (const line of policyText(config)) blocks.push({ kind: 'para', text: line });
    const maxCos = Math.max(0, ...subs.map((s) => cosOf(s.id).length));
    blocks.push({ kind: 'table', caption: 'CO attainment of each course', sheet: 'CO attainment', columns: [{ title: 'Course', w: 3 }, ...Array.from({ length: maxCos }, (_, i) => ({ title: `CO${i + 1}`, w: 0.7, align: 'center' as const, level: { max: config.maxLevel, target: config.targetLevel } }))], rows: subs.map((s) => { const v = cosOf(s.id).map((c) => rows.find((r) => r.targetId === c.id)?.combined ?? null); return [`${s.code} ${s.name}`, ...Array.from({ length: maxCos }, (_, i) => v[i] ?? null)]; }) });
    blocks.push(this.poBlock(rows, b.outcomes, config));
    blocks.push({ kind: 'heading', text: '2.6.3 Pass percentage of students' });
    const results = await tx
      .select({ year: academicYears.label, term: examSessions.term, appeared: sql<number>`count(*)::int`, passed: sql<number>`count(*) filter (where ${examResults.outcome} = 'pass')::int` })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(academicYears, eq(academicYears.id, examSessions.academicYearId))
      .where(and(eq(examSessions.programId, programId), eq(examSessions.kind, 'regular'), inArray(examSessions.status, ['published', 'locked'])))
      .groupBy(academicYears.label, academicYears.startsOn, examSessions.term)
      .orderBy(desc(academicYears.startsOn), desc(examSessions.term));
    const finalTerm = b.prog.termCount;
    const finalRows = results.filter((r) => r.term === finalTerm);
    const shown = finalRows.length ? finalRows : results;
    blocks.push({ kind: 'para', text: finalRows.length ? `Final-year (semester ${finalTerm}) students who passed the regular examination, by year.` : `No final-year results are recorded yet; the regular examinations recorded so far are shown with their semester.`, muted: !finalRows.length });
    blocks.push({ kind: 'table', caption: 'Pass percentage', sheet: '2.6.3 Pass percentage', columns: [{ title: 'Year', w: 1.2 }, { title: 'Semester', w: 1, align: 'center' }, { title: 'Appeared', w: 1, align: 'right' }, { title: 'Passed', w: 1, align: 'right' }, { title: 'Pass %', w: 1, align: 'right' }], rows: shown.map((r) => [r.year, r.term, r.appeared, r.passed, r.appeared ? round((r.passed / r.appeared) * 100, 2) : null]), empty: 'No published examination results.' });
    const inst = await tx.select({ kind: obeSurveys.kind, n: sql<number>`count(*)::int` }).from(obeSurveys).where(and(eq(obeSurveys.programId, programId), eq(obeSurveys.academicYearId, yearId))).groupBy(obeSurveys.kind);
    if (inst.length) blocks.push({ kind: 'para', text: `Indirect instruments this year: ${inst.map((i) => `${i.n} ${i.kind.replace(/_/g, ' ')}`).join(', ')} survey(s), with the course and programme exit surveys taken in the Student App.`, muted: true });
    return { title: `NAAC 2.6: Student performance and learning outcomes, ${b.prog.name}`, subtitle: `${b.year}. Metrics 2.6.1, 2.6.2 and 2.6.3.`, institution: b.institution, period: b.year, preparedFor: 'National Assessment and Accreditation Council (NAAC)', landscape: true, blocks };
  }
}
