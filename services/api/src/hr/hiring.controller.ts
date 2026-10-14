import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { normalizePhone } from '../auth/phone.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { rupees, staffBlock } from '../documents/doc-data.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { longDate } from '../documents/render.js';
import { serviceBookEntries } from '../db/schema-hrpay.js';
import { jobInterviews, jobInterviewScores } from '../db/schema-hr2.js';
import { departments, departmentStaff, designations, jobApplicants, jobOpenings, offerLetters, onboardingItems, staffProfiles, tenants, userRoles, users } from '../db/schema.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { addDays } from './dates.js';
import { HR_ROLES, isHr, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { formatSeries, takeNumbers } from './hr-settings.js';
import { ONBOARDING_CHECKLIST } from './onboarding-checklist.js';

/** What each panel member scores, out of 10. */
export const INTERVIEW_CRITERIA = ['subject_knowledge', 'teaching_ability', 'communication', 'research', 'attitude'] as const;
const MAX_RESUME = 5 * 1024 * 1024;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const ScoreBody = z.object({
  scores: z.record(z.enum(INTERVIEW_CRITERIA), z.number().min(0).max(10)).refine((s) => INTERVIEW_CRITERIA.every((k) => typeof s[k] === 'number'), 'Score every criterion'),
  recommendation: z.enum(['select', 'hold', 'reject']),
  remarks: z.string().trim().max(1000).default(''),
});
const HireBody = z.object({
  role: z.enum(['teacher', 'hod', 'librarian', 'accountant', 'hr_manager']).default('teacher'),
  joiningOn: Day,
  departmentId: z.uuid().nullish(),
  designationId: z.uuid().nullish(),
  employmentType: z.enum(['permanent', 'contract', 'probation', 'visiting']).default('probation'),
  startOnboarding: z.boolean().default(true),
});

/** Percentage of the maximum for a panel member's scores. */
export const scoreTotal = (s: Record<string, number>) => Math.round((INTERVIEW_CRITERIA.reduce((n, k) => n + (s[k] ?? 0), 0) / (INTERVIEW_CRITERIA.length * 10)) * 10000) / 100;

/** Interview scoring by the panel, an applicant's whole file, hiring into the staff record and the appointment order. */
@Controller('v1/hr')
export class HiringController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
    private readonly engine: DocumentEngine,
  ) {}

  /** Interviews where the caller sits on the panel (HR sees all), coming up first. */
  @Get('interviews/mine')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: jobInterviews.id, applicant: jobApplicants.fullName, applicantId: jobApplicants.id, opening: jobOpenings.title, round: jobInterviews.round, kind: jobInterviews.kind, scheduledAt: jobInterviews.scheduledAt, venue: jobInterviews.venue, mode: jobInterviews.mode, status: jobInterviews.status, scoredByMe: sql<boolean>`exists (select 1 from job_interview_scores s where s.interview_id = ${jobInterviews.id} and s.panelist_id = ${p.userId}::uuid)` })
        .from(jobInterviews)
        .innerJoin(jobApplicants, eq(jobApplicants.id, jobInterviews.applicantId))
        .innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId))
        .where(sql`${jobInterviews.panelIds} ? ${p.userId}`)
        .orderBy(desc(jobInterviews.scheduledAt))
        .limit(200);
      return rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt.toISOString() }));
    });
  }

  private async interview(tx: Tx, id: string) {
    const [x] = await tx.select().from(jobInterviews).where(eq(jobInterviews.id, id));
    if (!x) throw new NotFoundException('Interview not found');
    return x;
  }

  /** The panel's scores: HR and the panel see them all. */
  @Get('interviews/:id/scores')
  @Auth('user', STAFF_ROLES)
  scores(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const x = await this.interview(tx, id);
      if (!isHr(p) && !x.panelIds.includes(p.userId)) throw new NotFoundException('Interview not found');
      const rows = await tx.select({ s: jobInterviewScores, name: users.fullName }).from(jobInterviewScores).innerJoin(users, eq(users.id, jobInterviewScores.panelistId)).where(eq(jobInterviewScores.interviewId, id)).orderBy(asc(users.fullName));
      const panel = await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(sql`${users.id}::text in (select jsonb_array_elements_text(${JSON.stringify(x.panelIds)}::jsonb))`);
      return {
        criteria: INTERVIEW_CRITERIA,
        panel: panel.map((m) => ({ ...m, scored: rows.some((r) => r.s.panelistId === m.id) })),
        scores: rows.map((r) => ({ panelistId: r.s.panelistId, panelist: r.name, scores: r.s.scores, total: r.s.total, recommendation: r.s.recommendation, remarks: r.s.remarks })),
        average: rows.length ? Math.round((rows.reduce((n, r) => n + r.s.total, 0) / rows.length) * 10) / 10 : null,
      };
    });
  }

  /** A panel member records (or corrects) their scores until the interview is completed. */
  @Put('interviews/:id/scores')
  @Auth('user', STAFF_ROLES)
  score(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScoreBody)) b: z.infer<typeof ScoreBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const x = await this.interview(tx, id);
      if (!x.panelIds.includes(p.userId)) throw new ForbiddenException('Only the interview panel can score');
      if (x.status !== 'scheduled') throw new ConflictException(`This interview is ${x.status}`);
      if (localParts(x.scheduledAt, await this.hr.timezone(tx)).date > (await this.hr.today(tx))) throw new ConflictException('Scores are given on the day of the interview');
      const total = scoreTotal(b.scores);
      await tx
        .insert(jobInterviewScores)
        .values({ tenantId: p.tenantId, interviewId: id, panelistId: p.userId, scores: b.scores, total, recommendation: b.recommendation, remarks: b.remarks })
        .onConflictDoUpdate({ target: [jobInterviewScores.interviewId, jobInterviewScores.panelistId], set: { scores: b.scores, total, recommendation: b.recommendation, remarks: b.remarks } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'job_interview.scored', subjectType: 'job_interview', subjectId: id, data: { total, recommendation: b.recommendation } });
      // When everyone on the panel has scored, the interview is complete.
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(jobInterviewScores).where(eq(jobInterviewScores.interviewId, id));
      if (n.n >= x.panelIds.length) await tx.update(jobInterviews).set({ status: 'completed' }).where(eq(jobInterviews.id, id));
      return { total, completed: n.n >= x.panelIds.length };
    });
  }

  /** An applicant's whole file: details, stage history, interviews with scores, offers. */
  @Get('applicants/:id/file')
  @Auth('user', HR_ROLES)
  file(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ a: jobApplicants, opening: jobOpenings.title, openingId: jobOpenings.id, departmentId: jobOpenings.departmentId, designationId: jobOpenings.designationId }).from(jobApplicants).innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId)).where(eq(jobApplicants.id, id));
      if (!a) throw new NotFoundException('Applicant not found');
      const interviews = await tx.select().from(jobInterviews).where(eq(jobInterviews.applicantId, id)).orderBy(asc(jobInterviews.round), asc(jobInterviews.scheduledAt));
      const scores = interviews.length ? await tx.select({ s: jobInterviewScores, name: users.fullName }).from(jobInterviewScores).innerJoin(users, eq(users.id, jobInterviewScores.panelistId)).where(sql`${jobInterviewScores.interviewId} in (select id from job_interviews where applicant_id = ${id}::uuid)`) : [];
      const offers = await tx.select().from(offerLetters).where(eq(offerLetters.applicantId, id)).orderBy(desc(offerLetters.createdAt));
      const { resumeKey, ...rest } = a.a;
      return {
        ...rest,
        hasResume: !!resumeKey,
        opening: { id: a.openingId, title: a.opening, departmentId: a.departmentId, designationId: a.designationId },
        interviews: interviews.map((i) => ({ ...i, scheduledAt: i.scheduledAt.toISOString(), scores: scores.filter((s) => s.s.interviewId === i.id).map((s) => ({ panelist: s.name, total: s.s.total, recommendation: s.s.recommendation, remarks: s.s.remarks, scores: s.s.scores })) })),
        offers,
        average: scores.length ? Math.round((scores.reduce((n, s) => n + s.s.total, 0) / scores.length) * 10) / 10 : null,
      };
    });
  }

  /**
   * Hires an applicant whose offer was accepted: the staff account (or the existing account with the same email or
   * phone), their role, the HR record with the next employee number, the joining entry in the service book and,
   * optionally, the joining checklist.
   */
  @Post('applicants/:id/hire')
  @Auth('user', HR_ROLES)
  hire(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(HireBody)) b: z.infer<typeof HireBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ a: jobApplicants, o: jobOpenings }).from(jobApplicants).innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId)).where(eq(jobApplicants.id, id)).for('update', { of: jobApplicants });
      if (!a) throw new NotFoundException('Applicant not found');
      if (a.a.hiredUserId) throw new ConflictException('This applicant is already on the staff');
      const [accepted] = await tx.select().from(offerLetters).where(and(eq(offerLetters.applicantId, id), eq(offerLetters.status, 'accepted'))).orderBy(desc(offerLetters.createdAt)).limit(1);
      if (!accepted) throw new ConflictException('Record the accepted offer before hiring');
      if (!a.a.email && !a.a.phone) throw new BadRequestException('Add the applicant\'s email or phone first: it becomes their sign-in');
      const phone = a.a.phone ? normalizePhone(a.a.phone) : null;
      const email = a.a.email?.toLowerCase() ?? null;
      let [user] = await tx.select({ id: users.id }).from(users).where(or(email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined)).limit(1);
      if (user) {
        const [prof] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, user.id));
        if (prof) throw new ConflictException('Someone on the staff already has this email or phone');
      } else {
        [user] = await tx.insert(users).values({ tenantId: p.tenantId, fullName: a.a.fullName, email, phone: phone && /^\+\d{8,15}$/.test(phone) ? phone : null }).returning({ id: users.id });
      }
      await tx.insert(userRoles).values({ tenantId: p.tenantId, userId: user.id, role: b.role as RoleName, campusId: null }).onConflictDoNothing();
      const departmentId = b.departmentId ?? a.o.departmentId;
      const designationId = b.designationId ?? a.o.designationId;
      if (departmentId && !(await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId))).length) throw new BadRequestException('Department not found');
      if (designationId && !(await tx.select({ id: designations.id }).from(designations).where(eq(designations.id, designationId))).length) throw new BadRequestException('Designation not found');
      const { series, first } = await takeNumbers(tx, p.tenantId, 'employeeSeries', 1);
      const employeeCode = formatSeries(series, new Date(), first);
      await tx.insert(staffProfiles).values({ tenantId: p.tenantId, userId: user.id, employeeCode, departmentId: departmentId ?? null, designationId: designationId ?? null, employmentType: b.employmentType, dateOfJoining: b.joiningOn, phdStatus: a.a.phd ? 'awarded' : 'none' });
      if (departmentId) await tx.insert(departmentStaff).values({ tenantId: p.tenantId, departmentId, userId: user.id }).onConflictDoNothing();
      await tx.insert(serviceBookEntries).values({ tenantId: p.tenantId, userId: user.id, kind: 'appointment', onDate: b.joiningOn, title: `Appointed as ${accepted.position}`, details: `Offer ${accepted.offerNo}`, orderNo: `APT/${b.joiningOn.slice(0, 4)}/${employeeCode}`, createdBy: p.userId });
      if (b.startOnboarding) await tx.insert(onboardingItems).values(ONBOARDING_CHECKLIST.map(([title, owner, days]) => ({ tenantId: p.tenantId, userId: user.id, title, owner, dueOn: addDays(b.joiningOn, days) })));
      const history = a.a.stage === 'hired' ? a.a.stageHistory : [...a.a.stageHistory, { stage: 'hired', at: new Date().toISOString(), by: p.userId, note: `Joined as ${employeeCode}` }];
      await tx.update(jobApplicants).set({ hiredUserId: user.id, stage: 'hired', stageHistory: history }).where(eq(jobApplicants.id, id));
      // The opening closes once every position is filled.
      const [filled] = await tx.select({ n: sql<number>`count(*)::int` }).from(jobApplicants).where(and(eq(jobApplicants.openingId, a.o.id), eq(jobApplicants.stage, 'hired')));
      if (filled.n >= a.o.positions && a.o.status === 'open') await tx.update(jobOpenings).set({ status: 'closed' }).where(eq(jobOpenings.id, a.o.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.hired', subjectType: 'job_applicant', subjectId: id, data: { userId: user.id, employeeCode } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.staff_created', subjectType: 'user', subjectId: user.id, data: { employeeCode, fromApplicant: id } });
      return { userId: user.id, employeeCode };
    });
  }

  /** The appointment order of a hired applicant, through the document engine (recorded in the register with its QR). */
  @Get('applicants/:id/appointment-letter')
  @Auth('user', HR_ROLES)
  appointment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(jobApplicants).where(eq(jobApplicants.id, id));
      if (!a?.hiredUserId) throw new ConflictException('The appointment order is issued once the applicant is hired');
      const [o] = await tx.select().from(offerLetters).where(and(eq(offerLetters.applicantId, id), eq(offerLetters.status, 'accepted'))).orderBy(desc(offerLetters.createdAt)).limit(1);
      const [sp] = await tx.select({ code: staffProfiles.employeeCode, doj: staffProfiles.dateOfJoining, type: staffProfiles.employmentType, dept: departments.name, desig: designations.name }).from(staffProfiles).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(designations, eq(designations.id, staffProfiles.designationId)).where(eq(staffProfiles.userId, a.hiredUserId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'recruitment.appointment_letter', subjectType: 'job_applicant', subjectId: id });
      const today = await this.hr.today(tx);
      const position = sp?.desig ?? o?.position ?? 'Staff member';
      const department = sp?.dept ?? '';
      const no = `APT/${(sp?.doj ?? today).slice(0, 4)}/${sp?.code ?? a.hiredUserId.slice(0, 6).toUpperCase()}`;
      const appointment = {
        no,
        date: longDate(today),
        name: a.fullName,
        position,
        department: department || 'the institution',
        payScale: o?.annualCtcPaise ? `${rupees(o.annualCtcPaise).replace(/\.00$/, '')} a year (cost to company), paid monthly with statutory deductions` : 'as per the institution’s pay structure',
        joiningDate: sp?.doj ? longDate(sp.doj) : '',
        probation: (sp?.type ?? 'probation') === 'probation' ? 'one year' : 'none',
        reportingTo: department ? `Head of the Department, ${department}` : 'Principal',
        terms: (o?.terms ?? '').trim() || 'Your appointment is subject to verification of your original certificates. You will be governed by the service rules of the institution as amended from time to time.',
      };
      const out = await this.engine.produce(tx, p, {
        docType: 'appointment_letter',
        title: 'Letter of Appointment',
        subject: { type: 'staff', id: a.hiredUserId, name: a.fullName },
        source: { type: 'appointment', id: a.hiredUserId },
        data: { ...(await staffBlock(tx, a.hiredUserId)), appointment },
        keyFields: [{ label: 'Appointee', value: a.fullName }, { label: 'Position', value: position }, { label: 'Department', value: department }, { label: 'Employee code', value: sp?.code ?? '' }],
        photo: null,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="appointment-${sp?.code?.replace(/[^\w-]+/g, '-') ?? 'order'}.pdf"`);
      return new StreamableFile(out.pdf);
    });
  }

  // ---- resumes -------------------------------------------------------------------------------------------

  @Post('applicants/:id/resume')
  @Auth('user', HR_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME, files: 1 } }))
  async uploadResume(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The resume must be a PDF, JPEG or PNG');
    const old = await this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ key: jobApplicants.resumeKey }).from(jobApplicants).where(eq(jobApplicants.id, id));
      if (!a) throw new NotFoundException('Applicant not found');
      return a.key;
    });
    await this.scans.assertClean(file.buffer, 'The resume');
    const key = `tenants/${p.tenantId}/hr/resumes/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_RESUME, type);
    try {
      await this.db.withTenant(p.tenantId, async (tx) => {
        await tx.update(jobApplicants).set({ resumeKey: key, resumeType: type, resumeName: file.originalname.slice(0, 200) }).where(eq(jobApplicants.id, id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'job_applicant.resume_attached', subjectType: 'job_applicant', subjectId: id, data: { type } });
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
    if (old) await this.storage.delete(old).catch(() => undefined);
    return { id, resumeName: file.originalname.slice(0, 200) };
  }

  @Get('applicants/:id/resume')
  @Auth('user', [...HR_ROLES, 'hod', 'teacher'])
  async resume(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(jobApplicants).where(eq(jobApplicants.id, id));
      if (!row?.resumeKey) throw new NotFoundException('No resume attached');
      // Panel members see the resume of the applicants they interview.
      if (!isHr(p)) {
        const [onPanel] = await tx.select({ id: jobInterviews.id }).from(jobInterviews).where(and(eq(jobInterviews.applicantId, id), sql`${jobInterviews.panelIds} ? ${p.userId}`)).limit(1);
        if (!onPanel) throw new NotFoundException('No resume attached');
      }
      return row;
    });
    const { stream, size } = await this.storage.get(a.resumeKey!);
    res.set({ 'content-type': a.resumeType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }
}
