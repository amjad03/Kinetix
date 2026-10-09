import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, sections, students, users } from '../db/schema.js';
import { aptitudeAttempts, aptitudeTests, careerAssistantMessages, careerPaths, mockInterviews, studentResumes } from '../db/schema-pathways.js';
import { SkillsService } from '../skills/skills.service.js';
import { gradeAptitude, interviewQuestions, offlineCoachReply, recommendPaths, resumePdf, scoreInterview } from './careers.logic.js';

const CAREER_STAFF: RoleName[] = ['tenant_admin', 'principal', 'placement_officer'];
const CAREER_VIEW: RoleName[] = [...CAREER_STAFF, 'hod'];
const Str = (n: number) => z.string().trim().max(n);
const ResumeBody = z.object({
  headline: Str(160).default(''),
  summary: Str(1500).default(''),
  education: z.array(z.object({ institution: Str(160).min(1), degree: Str(160).min(1), years: Str(40).default(''), score: Str(40).optional() })).max(8).default([]),
  experience: z.array(z.object({ org: Str(160).min(1), role: Str(160).min(1), years: Str(40).default(''), detail: Str(600).optional() })).max(10).default([]),
  projects: z.array(z.object({ title: Str(160).min(1), detail: Str(600).optional(), url: z.url().max(300).optional() })).max(10).default([]),
  skills: z.array(Str(40).min(1)).max(40).default([]),
  interests: z.array(Str(60).min(1)).max(15).default([]),
  links: z.array(z.object({ label: Str(40).min(1), url: z.url().max(300) })).max(8).default([]),
  visibleToRecruiters: z.boolean().default(true),
});
const TestBody = z.object({
  title: Str(160).min(2),
  category: z.enum(['quant', 'logical', 'verbal', 'technical', 'mixed']).default('mixed'),
  durationMin: z.number().int().min(5).max(180).default(30),
  passPercent: z.number().int().min(1).max(100).default(40),
  driveId: z.uuid().optional(),
  questions: z
    .array(z.object({ prompt: Str(500).min(3), options: z.array(Str(200).min(1)).min(2).max(6), answerIndex: z.number().int().min(0).max(5), topic: Str(60).default('General') }).refine((q) => q.answerIndex < q.options.length, 'The answer must be one of the options'))
    .min(1)
    .max(100),
});
const SubmitBody = z.object({ answers: z.array(z.number().int().min(0).max(5).nullable()).max(100) });
const PathBody = z.object({ title: Str(120).min(2), family: Str(80).default(''), description: Str(1000).default(''), requiredSkills: z.array(Str(60).min(1)).max(20).default([]), roles: z.array(Str(80).min(1)).max(12).default([]), steps: z.array(z.object({ title: Str(120).min(1), detail: Str(400).default('') })).max(10).default([]), active: z.boolean().default(true) });
const MockBody = z.object({ kind: z.enum(['hr', 'technical', 'communication']), role: Str(120).default(''), count: z.number().int().min(1).max(6).default(3) });
const MockSubmit = z.object({ answers: z.array(z.object({ answer: Str(3000), seconds: z.number().int().min(1).max(1800).optional() })).min(1).max(10) });
const AskBody = z.object({ question: Str(600).min(3), language: z.enum(['en', 'hi', 'kn']).default('en') });

/**
 * Career preparation: the resume placement staff can read, aptitude tests, career paths recommended from the skill
 * passport, mock interviews and communication practice, and an AI career assistant.
 */
@Controller('v1/careers')
export class CareersController {
  constructor(
    private readonly db: DbService,
    private readonly skills: SkillsService,
    private readonly ai: AiService,
    private readonly clock: Clock,
  ) {}

  private async me(tx: Tx, p: UserPrincipal) {
    const [s] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.userId, p.userId));
    if (!s) throw new NotFoundException('Only students can do this');
    return s;
  }

  /** The student whose data is asked for: the caller's own, or any student for career staff. */
  private async subject(tx: Tx, p: UserPrincipal, studentId?: string): Promise<string> {
    if (studentId && p.roles.some((r) => CAREER_VIEW.includes(r))) return studentId;
    return (await this.me(tx, p)).id;
  }

  // ---- resume ---------------------------------------------------------------------------------

  @Get('resume')
  @Auth('user', ['student'])
  myResume(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [r] = await tx.select().from(studentResumes).where(eq(studentResumes.studentId, s.id));
      return r ?? { studentId: s.id, headline: '', summary: '', education: [], experience: [], projects: [], skills: [], interests: [], links: [], visibleToRecruiters: true };
    });
  }

  @Put('resume')
  @Auth('user', ['student'])
  saveResume(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ResumeBody)) b: z.infer<typeof ResumeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [row] = await tx
        .insert(studentResumes)
        .values({ tenantId: p.tenantId, studentId: s.id, ...b })
        .onConflictDoUpdate({ target: studentResumes.studentId, set: { ...b, updatedAt: sql`now()` } })
        .returning();
      return row;
    });
  }

  /** Placement staff browse the resumes students chose to share. */
  @Get('resumes')
  @Auth('user', CAREER_VIEW)
  resumes(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, headline: studentResumes.headline, skills: studentResumes.skills, updatedAt: studentResumes.updatedAt })
        .from(studentResumes)
        .innerJoin(students, eq(students.id, studentResumes.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(studentResumes.visibleToRecruiters, true))
        .orderBy(asc(students.fullName));
      const needle = q?.trim().toLowerCase();
      return needle ? rows.filter((r) => `${r.fullName} ${r.headline} ${r.skills.join(' ')}`.toLowerCase().includes(needle)) : rows;
    });
  }

  private async resumeOf(tx: Tx, p: UserPrincipal, studentId: string) {
    const [s] = await tx.select({ id: students.id, userId: students.userId, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const staff = p.roles.some((r) => CAREER_VIEW.includes(r));
    const [r] = await tx.select().from(studentResumes).where(eq(studentResumes.studentId, studentId));
    if (!staff) {
      const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
      if (s.userId !== p.userId && !g) throw new NotFoundException('Student not found');
    } else if (!r?.visibleToRecruiters) throw new NotFoundException('This student has not shared a resume');
    if (!r) throw new NotFoundException('No resume yet');
    return { s, r };
  }

  @Get('resumes/:studentId')
  @Auth('user', [...CAREER_VIEW, 'student', 'guardian'])
  resume(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, r } = await this.resumeOf(tx, p, studentId);
      return { student: { id: s.id, fullName: s.fullName, rollNo: s.rollNo, className: s.className }, ...r };
    });
  }

  @Get('resumes/:studentId/pdf')
  @Auth('user', [...CAREER_VIEW, 'student', 'guardian'])
  resumeFile(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, r } = await this.resumeOf(tx, p, studentId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="resume-${s.rollNo}.pdf"`);
      return new StreamableFile(resumePdf({ fullName: s.fullName, rollNo: s.rollNo, className: s.className, ...r }));
    });
  }

  // ---- aptitude tests ---------------------------------------------------------------------------

  @Get('tests')
  @Auth('user', [...CAREER_VIEW, 'student'])
  tests(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = p.roles.some((r) => CAREER_VIEW.includes(r));
      const rows = await tx.select().from(aptitudeTests).where(staff ? undefined : eq(aptitudeTests.active, true)).orderBy(desc(aptitudeTests.createdAt));
      const mine = staff ? [] : await tx.select().from(aptitudeAttempts).where(eq(aptitudeAttempts.studentId, (await this.me(tx, p)).id));
      return rows.map((t) => ({
        id: t.id, title: t.title, category: t.category, durationMin: t.durationMin, passPercent: t.passPercent, questionCount: t.questions.length, driveId: t.driveId, active: t.active,
        ...(staff ? {} : { attempts: mine.filter((a) => a.testId === t.id && a.submittedAt).length, best: Math.max(0, ...mine.filter((a) => a.testId === t.id && a.submittedAt).map((a) => a.percent)), passed: mine.some((a) => a.testId === t.id && a.passed) }),
      }));
    });
  }

  @Post('tests')
  @Auth('user', CAREER_STAFF)
  createTest(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TestBody)) b: z.infer<typeof TestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(aptitudeTests).values({ tenantId: p.tenantId, ...b, driveId: b.driveId ?? null, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'aptitude.created', 'aptitude_test', row.id, { questions: b.questions.length });
      return { ...row, questions: undefined, questionCount: b.questions.length };
    });
  }

  @Put('tests/:id/active')
  @Auth('user', CAREER_STAFF)
  setActive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ active: z.boolean() }))) b: { active: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(aptitudeTests).set({ active: b.active }).where(eq(aptitudeTests.id, id)).returning({ id: aptitudeTests.id, active: aptitudeTests.active });
      if (!row) throw new NotFoundException('Test not found');
      return row;
    });
  }

  /** Starts (or resumes) an attempt. The questions come without their answers. */
  @Post('tests/:id/start')
  @HttpCode(200)
  @Auth('user', ['student'])
  start(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [t] = await tx.select().from(aptitudeTests).where(and(eq(aptitudeTests.id, id), eq(aptitudeTests.active, true)));
      if (!t) throw new NotFoundException('Test not found');
      const mine = await tx.select().from(aptitudeAttempts).where(and(eq(aptitudeAttempts.testId, id), eq(aptitudeAttempts.studentId, s.id))).orderBy(desc(aptitudeAttempts.startedAt));
      const expired = (a: (typeof mine)[number]) => this.clock.now().getTime() >= a.startedAt.getTime() + (t.durationMin + 2) * 60_000;
      const open = mine.find((a) => !a.submittedAt && !expired(a));
      if (!open) {
        if (mine.some((a) => a.passed)) throw new ConflictException('You have already passed this test');
        // An attempt that ran out of time counts as used.
        if (mine.filter((a) => a.submittedAt || expired(a)).length >= 3) throw new ConflictException('You have used all 3 attempts');
      }
      const attempt = open ?? (await tx.insert(aptitudeAttempts).values({ tenantId: p.tenantId, testId: id, studentId: s.id, total: t.questions.length, startedAt: this.clock.now() }).returning())[0];
      return { attemptId: attempt.id, durationMin: t.durationMin, startedAt: attempt.startedAt, questions: t.questions.map((q) => ({ prompt: q.prompt, options: q.options, topic: q.topic })) };
    });
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  @Auth('user', ['student'])
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SubmitBody)) b: z.infer<typeof SubmitBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [a] = await tx.select().from(aptitudeAttempts).where(and(eq(aptitudeAttempts.id, id), eq(aptitudeAttempts.studentId, s.id))).for('update');
      if (!a) throw new NotFoundException('Attempt not found');
      if (a.submittedAt) throw new ConflictException('This attempt was already submitted');
      const [t] = await tx.select().from(aptitudeTests).where(eq(aptitudeTests.id, a.testId));
      if (this.clock.now().getTime() > a.startedAt.getTime() + (t.durationMin + 2) * 60_000) throw new ConflictException('The time for this attempt is over');
      const g = gradeAptitude(t.questions, b.answers);
      const [row] = await tx.update(aptitudeAttempts).set({ answers: b.answers, score: g.score, total: g.total, percent: g.percent, passed: g.percent >= t.passPercent, topicScores: g.topicScores, submittedAt: this.clock.now() }).where(eq(aptitudeAttempts.id, id)).returning();
      return { score: row.score, total: row.total, percent: row.percent, passed: row.passed, passPercent: t.passPercent, topicScores: row.topicScores };
    });
  }

  @Get('tests/:id/results')
  @Auth('user', CAREER_VIEW)
  results(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(aptitudeTests).where(eq(aptitudeTests.id, id));
      if (!t) throw new NotFoundException('Test not found');
      const rows = await tx
        .select({ studentId: aptitudeAttempts.studentId, fullName: students.fullName, rollNo: students.rollNo, percent: aptitudeAttempts.percent, passed: aptitudeAttempts.passed, submittedAt: aptitudeAttempts.submittedAt })
        .from(aptitudeAttempts)
        .innerJoin(students, eq(students.id, aptitudeAttempts.studentId))
        .where(and(eq(aptitudeAttempts.testId, id), sql`${aptitudeAttempts.submittedAt} is not null`))
        .orderBy(desc(aptitudeAttempts.percent));
      const avg = rows.length ? Math.round((rows.reduce((s, r) => s + r.percent, 0) / rows.length) * 10) / 10 : 0;
      return { test: { id: t.id, title: t.title, passPercent: t.passPercent }, attempts: rows.length, passed: rows.filter((r) => r.passed).length, averagePercent: avg, rows };
    });
  }

  // ---- career paths ------------------------------------------------------------------------------

  @Get('paths')
  @Auth('user', [...CAREER_VIEW, 'student', 'teacher'])
  paths(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(careerPaths).where(p.roles.some((r) => CAREER_STAFF.includes(r)) ? undefined : eq(careerPaths.active, true)).orderBy(asc(careerPaths.title)));
  }

  @Post('paths')
  @Auth('user', CAREER_STAFF)
  createPath(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PathBody)) b: z.infer<typeof PathBody>) {
    return this.db.withTenant(p.tenantId, (tx) => orConflict('A career path with that title exists', () => tx.insert(careerPaths).values({ tenantId: p.tenantId, ...b }).returning().then((r) => r[0])));
  }

  @Put('paths/:id')
  @Auth('user', CAREER_STAFF)
  updatePath(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PathBody)) b: z.infer<typeof PathBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(careerPaths).set(b).where(eq(careerPaths.id, id)).returning();
      if (!row) throw new NotFoundException('Career path not found');
      return row;
    });
  }

  /** Career paths ranked for a student from their skill passport and the interests on their resume. */
  private async recommend(tx: Tx, studentId: string) {
    const passport = await this.skills.skillsFor(tx, studentId);
    const [r] = await tx.select().from(studentResumes).where(eq(studentResumes.studentId, studentId));
    const have = [...passport.filter((s) => s.level !== null).map((s) => ({ name: s.name, level: s.level })), ...(r?.skills ?? []).map((n) => ({ name: n, level: 3 as number | null }))];
    const paths = await tx.select().from(careerPaths).where(eq(careerPaths.active, true));
    return { fits: recommendPaths(paths, have, r?.interests ?? []), skills: have, interests: r?.interests ?? [], resume: r };
  }

  @Get('recommendations')
  @Auth('user', [...CAREER_VIEW, 'student'])
  recommendations(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.subject(tx, p, studentId);
      const { fits, skills, interests } = await this.recommend(tx, sid);
      return { skills: skills.map((s) => s.name), interests, paths: fits };
    });
  }

  // ---- mock interviews ----------------------------------------------------------------------------

  @Post('mock-interviews')
  @Auth('user', ['student'])
  startMock(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MockBody)) b: z.infer<typeof MockBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [row] = await tx.insert(mockInterviews).values({ tenantId: p.tenantId, studentId: s.id, kind: b.kind, role: b.role, questions: interviewQuestions(b.kind, b.count) }).returning();
      return { id: row.id, kind: row.kind, questions: row.questions.map((q) => q.prompt) };
    });
  }

  @Post('mock-interviews/:id/submit')
  @HttpCode(200)
  @Auth('user', ['student'])
  submitMock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MockSubmit)) b: z.infer<typeof MockSubmit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const [m] = await tx.select().from(mockInterviews).where(and(eq(mockInterviews.id, id), eq(mockInterviews.studentId, s.id))).for('update');
      if (!m) throw new NotFoundException('Interview not found');
      if (m.status === 'completed') throw new ConflictException('This interview is already scored');
      if (b.answers.length !== m.questions.length) throw new ConflictException(`Answer all ${m.questions.length} questions`);
      const r = scoreInterview(m.questions, b.answers);
      const feedback = { perQuestion: r.perQuestion, overall: r.overall };
      await tx.update(mockInterviews).set({ answers: b.answers, feedback, score: r.score, status: 'completed', completedAt: this.clock.now() }).where(eq(mockInterviews.id, id));
      return { id, score: r.score, ...feedback, questions: m.questions.map((q) => q.prompt) };
    });
  }

  @Get('mock-interviews/mine')
  @Auth('user', ['student'])
  myMocks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const rows = await tx.select().from(mockInterviews).where(eq(mockInterviews.studentId, s.id)).orderBy(desc(mockInterviews.createdAt));
      return rows.map((m) => ({ id: m.id, kind: m.kind, role: m.role, status: m.status, score: m.score, createdAt: m.createdAt }));
    });
  }

  // ---- AI career assistant ------------------------------------------------------------------------

  @Post('assistant/ask')
  @HttpCode(200)
  @Auth('user', ['student'])
  async ask(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AskBody)) b: z.infer<typeof AskBody>) {
    const ctx = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const r = await this.recommend(tx, s.id);
      return { studentId: s.id, ...r };
    });
    const facts = { skills: ctx.skills.map((s) => ({ name: s.name, level: s.level })), interests: ctx.interests, paths: ctx.fits.slice(0, 5).map((f) => ({ title: f.title, fit: f.fit, gaps: f.gaps })) };
    const out = await this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'careerCoach', { question: b.question, facts, language: b.language });
    const resumeComplete = !!ctx.resume && !!ctx.resume.summary && ctx.resume.education.length > 0 && ctx.resume.skills.length > 0;
    const reply = out.meta.preview ? offlineCoachReply(b.question, { topPaths: ctx.fits, skills: ctx.skills.map((s) => s.name), resumeComplete }) : out.result;
    await this.db.withTenant(p.tenantId, async (tx) => {
      const at = Date.now();
      await tx.insert(careerAssistantMessages).values([
        { tenantId: p.tenantId, studentId: ctx.studentId, role: 'user', body: b.question, createdAt: new Date(at) },
        { tenantId: p.tenantId, studentId: ctx.studentId, role: 'assistant', body: reply.answer, aiUsed: !out.meta.preview, createdAt: new Date(at + 1) },
      ]);
    });
    return { ...reply, aiUsed: !out.meta.preview };
  }

  @Get('assistant/history')
  @Auth('user', ['student'])
  history(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const rows = await tx.select({ role: careerAssistantMessages.role, body: careerAssistantMessages.body, aiUsed: careerAssistantMessages.aiUsed, createdAt: careerAssistantMessages.createdAt }).from(careerAssistantMessages).where(eq(careerAssistantMessages.studentId, s.id)).orderBy(desc(careerAssistantMessages.createdAt)).limit(40);
      return rows.reverse();
    });
  }
}
