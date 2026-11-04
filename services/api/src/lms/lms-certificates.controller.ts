import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { lmsCourses, programs, sections, students, subjects } from '../db/schema.js';
import { lmsCertificates, lmsLearningPaths, lmsPathSteps } from '../db/schema-lms.js';
import { studentBlock } from '../documents/doc-data.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { IssuedDocsService } from '../documents/issued-docs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { type Completion, courseCompletions } from './lms-completion.js';
import { lmsSettingsOf, lmsTexts } from './lms-settings.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const IssueBody = z.object({ studentIds: z.array(z.uuid()).max(500).optional() });
const RevokeBody = z.object({ reason: z.string().trim().min(3).max(300) });
const Steps = z.array(z.object({ courseId: z.uuid(), required: z.boolean().default(true) })).min(1).max(30);
const PathBody = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).default(''), programId: z.uuid().nullable().default(null), sectionId: z.uuid().nullable().default(null), certificate: z.boolean().default(false), steps: Steps });
const PathPatch = z.object({ title: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(2000).optional(), status: z.enum(['draft', 'published', 'archived']).optional(), certificate: z.boolean().optional(), steps: Steps.optional() }).strict();
const PATH_ADMINS = ['principal', 'tenant_admin', 'hod'] as const;
const REVOKERS = ['principal', 'tenant_admin', 'hod'] as const;

type Course = typeof lmsCourses.$inferSelect;
type Path = typeof lmsLearningPaths.$inferSelect;

/** Path progress from the completion of its courses: required steps decide it, optional ones only count towards the share. */
export function pathProgress(steps: { courseId: string; required: boolean }[], done: (courseId: string) => boolean): { total: number; done: number; pct: number; complete: boolean; nextCourseId: string | null } {
  const finished = steps.filter((s) => done(s.courseId)).length;
  const required = steps.filter((s) => s.required);
  return { total: steps.length, done: finished, pct: steps.length ? Math.floor((finished * 100) / steps.length) : 0, complete: required.length > 0 && required.every((s) => done(s.courseId)), nextCourseId: steps.find((s) => !done(s.courseId))?.courseId ?? null };
}

/**
 * Completion certificates for courses and learning paths. A certificate is issued only to a student who meets the
 * rules (share of items finished, lowest grade; every required course of a path), is recorded in the document register
 * with a QR code anyone can check, and can be revoked with a reason. Also the learning paths themselves.
 */
@Controller('v1/lms')
export class LmsCertificatesController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
    private readonly engine: DocumentEngine,
    private readonly issued: IssuedDocsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Records and renders one certificate; the PDF is made again from the register on download. */
  private async issue(tx: Tx, p: UserPrincipal, target: { kind: 'course'; c: Course } | { kind: 'path'; path: Path }, studentId: string, done: { pct: number; grade: number | null }) {
    const [stu] = await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo, section: sections.displayName, userId: students.userId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    const now = this.clock.now();
    const [row] = await tx.insert(lmsCertificates).values({ tenantId: p.tenantId, studentId, courseId: target.kind === 'course' ? target.c.id : null, pathId: target.kind === 'path' ? target.path.id : null, serial: 'PENDING', gradePct: done.grade, completedPct: done.pct, issuedAt: now, issuedBy: p.userId }).onConflictDoNothing().returning();
    if (!row) return null;
    const subjectName = target.kind === 'course' ? (await tx.select({ n: subjects.name }).from(subjects).where(eq(subjects.id, target.c.subjectId)))[0]?.n : null;
    const name = target.kind === 'course' ? target.c.title : target.path.title;
    const what = target.kind === 'course' ? `the course **${name}**${subjectName ? ` (${subjectName})` : ''}` : `the learning path **${name}**`;
    const citation = `has successfully completed ${what} at this institution, finishing ${done.pct}% of the course work${done.grade !== null ? ` with a grade of ${done.grade}%` : ''}.`;
    const title = target.kind === 'course' ? 'Course completion certificate' : 'Learning path completion certificate';
    const out = await this.engine.produce(tx, { tenantId: p.tenantId, userId: p.userId }, {
      docType: 'course_completion_certificate',
      title,
      subject: { type: 'student', id: studentId, name: stu.name },
      source: { type: 'lms_certificate', id: row.id },
      data: { ...(await studentBlock(tx, studentId)), doc: { title }, award: { title, recipient: stu.name, citation, event: name, date: '', position: '' } },
      keyFields: [{ label: 'Document', value: title }, { label: 'Student', value: `${stu.name} (${stu.rollNo})` }, { label: target.kind === 'course' ? 'Course' : 'Learning path', value: name }, { label: 'Completed', value: `${done.pct}%` }, ...(done.grade !== null ? [{ label: 'Grade', value: `${done.grade}%` }] : [])],
    });
    const [cert] = await tx.update(lmsCertificates).set({ serial: out.record.serial, verifyUrl: out.record.verifyUrl, issuedDocumentId: out.record.id }).where(eq(lmsCertificates.id, row.id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.certificate_issued', subjectType: 'lms_certificate', subjectId: row.id, data: { studentId, [target.kind === 'course' ? 'courseId' : 'pathId']: target.kind === 'course' ? target.c.id : target.path.id, serial: cert.serial } });
    await this.notifications.notifyUsers(tx, (await tx.execute<{ u: string }>(this.familySql(studentId))).rows.map((r) => r.u), { kind: 'certificate', text: lmsTexts.certificateIssued({ course: name, name: stu.name }), data: { certificateId: row.id }, dedupeKey: `lms-cert:${row.id}` });
    return cert;
  }

  private familySql(studentId: string) {
    return sql`select g.user_id as u from guardians g where g.student_id = ${studentId}::uuid union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`;
  }

  // ---- courses --------------------------------------------------------------------------------------

  /** The class with each student's completion and certificate. */
  @Get('courses/:id/certificates')
  @Auth('user', [...LMS_STAFF])
  courseList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, c.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      const comp = await courseCompletions(tx, this.lms, c, roster.map((r) => r.id), this.clock.now());
      const certs = await tx.select().from(lmsCertificates).where(eq(lmsCertificates.courseId, id));
      return { courseId: id, certificate: c.certificate, completionPct: c.completionPct, minGradePct: c.minGradePct, rows: roster.map((r) => ({ ...r, completion: comp.get(r.id)!, certificate: certs.find((x) => x.studentId === r.id) ?? null })) };
    });
  }

  /** Issues certificates to the eligible students (all, or those listed) who do not have one; the rest are listed with what they still miss. */
  @Post('courses/:id/certificates')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  issueCourse(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      if (!c.certificate) throw new ConflictException('Turn on certificates for this course first');
      const roster = await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, c.sectionId), eq(students.status, 'active'), b.studentIds ? inArray(students.id, b.studentIds) : undefined));
      if (b.studentIds && roster.length !== new Set(b.studentIds).size) throw new BadRequestException('Every student must be in this class');
      const comp = await courseCompletions(tx, this.lms, c, roster.map((r) => r.id), this.clock.now());
      const have = new Set((await tx.select({ s: lmsCertificates.studentId }).from(lmsCertificates).where(eq(lmsCertificates.courseId, id))).map((r) => r.s));
      const issued: string[] = [];
      const skipped: { studentId: string; reason: string }[] = [];
      for (const r of roster) {
        const d = comp.get(r.id)!;
        if (have.has(r.id)) skipped.push({ studentId: r.id, reason: 'already_issued' });
        else if (!d.eligible) skipped.push({ studentId: r.id, reason: d.missing.join('+') });
        else if (await this.issue(tx, p, { kind: 'course', c }, r.id, d)) issued.push(r.id);
      }
      return { issued: issued.length, skipped };
    });
  }

  /** A student who meets the course's rules takes their own certificate (when the institution allows it). */
  @Post('courses/:id/certificate/claim')
  @Auth('user', ['student'])
  @HttpCode(200)
  claimCourse(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!s || s.sectionId !== c.sectionId || c.status !== 'published') throw new NotFoundException('Course not found');
      if (!c.certificate) throw new ConflictException('This course does not give a certificate');
      if (!(await lmsSettingsOf(tx, p.tenantId)).certificateSelfClaim) throw new ForbiddenException('Your teacher issues the certificates of this course');
      const [old] = await tx.select().from(lmsCertificates).where(and(eq(lmsCertificates.courseId, id), eq(lmsCertificates.studentId, s.id)));
      if (old) return old;
      const d = (await courseCompletions(tx, this.lms, c, [s.id], this.clock.now())).get(s.id)!;
      if (!d.eligible) throw new ConflictException(d.missing.includes('items') ? `Finish ${c.completionPct}% of the course first (${d.pct}% so far)` : `A grade of ${c.minGradePct}% is needed`);
      return this.issue(tx, p, { kind: 'course', c }, s.id, d);
    });
  }

  /** A student's (or their child's) certificates. */
  @Get('my/certificates')
  @Auth('user', ['student', 'guardian'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = (await this.lms.familyStudents(tx, p)).filter((s) => !studentId || s.id === studentId);
      if (!kids.length) throw new NotFoundException('Student not found');
      const rows = await tx
        .select({ c: lmsCertificates, course: lmsCourses.title, path: lmsLearningPaths.title })
        .from(lmsCertificates)
        .leftJoin(lmsCourses, eq(lmsCourses.id, lmsCertificates.courseId))
        .leftJoin(lmsLearningPaths, eq(lmsLearningPaths.id, lmsCertificates.pathId))
        .where(inArray(lmsCertificates.studentId, kids.map((k) => k.id)))
        .orderBy(desc(lmsCertificates.issuedAt));
      return rows.map((r) => ({ id: r.c.id, studentId: r.c.studentId, title: r.course ?? r.path ?? '', kind: r.c.courseId ? 'course' : 'path', serial: r.c.serial, verifyUrl: r.c.verifyUrl, completedPct: r.c.completedPct, gradePct: r.c.gradePct, issuedAt: r.c.issuedAt, revokedAt: r.c.revokedAt }));
    });
  }

  /** The certificate PDF, made again from the register (the student, their family, or staff of the course). */
  @Get('lms-certificates/:id/pdf')
  @Auth('user')
  pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cert = await this.visible(tx, p, id);
      if (!cert.issuedDocumentId) throw new NotFoundException('Certificate not found');
      const out = await this.engine.reprint(tx, cert.issuedDocumentId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.certificate_downloaded', subjectType: 'lms_certificate', subjectId: id });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="certificate-${out.serial.replace(/[^\w.-]/g, '-')}.pdf"`);
      return new StreamableFile(out.pdf);
    });
  }

  private async visible(tx: Tx, p: UserPrincipal, id: string) {
    const [cert] = await tx.select().from(lmsCertificates).where(eq(lmsCertificates.id, id));
    if (!cert) throw new NotFoundException('Certificate not found');
    if ((await this.lms.familyStudents(tx, p)).some((s) => s.id === cert.studentId)) return cert;
    if (p.roles.some((r) => r === 'principal' || r === 'tenant_admin')) return cert;
    if (cert.courseId && (await this.lms.canManage(tx, p, await this.lms.course(tx, cert.courseId)))) return cert;
    if (cert.pathId && p.roles.includes('hod')) return cert;
    throw new NotFoundException('Certificate not found');
  }

  /** Revokes a certificate with a reason; its QR then shows it as revoked. */
  @Post('lms-certificates/:id/revoke')
  @Auth('user', [...REVOKERS])
  @HttpCode(200)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RevokeBody)) b: z.infer<typeof RevokeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cert = await this.visible(tx, p, id);
      if (cert.revokedAt) throw new ConflictException('This certificate is already revoked');
      if (cert.issuedDocumentId) await this.issued.revoke(tx, { tenantId: p.tenantId, userId: p.userId }, cert.issuedDocumentId, b.reason);
      const [row] = await tx.update(lmsCertificates).set({ revokedAt: this.clock.now(), revokeReason: b.reason }).where(eq(lmsCertificates.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.certificate_revoked', subjectType: 'lms_certificate', subjectId: id, data: { reason: b.reason, serial: cert.serial } });
      return row;
    });
  }

  // ---- learning paths -------------------------------------------------------------------------------

  private async checkSteps(tx: Tx, steps: z.infer<typeof Steps>) {
    const ids = steps.map((s) => s.courseId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A course can appear once in a path');
    const found = await tx.select({ id: lmsCourses.id }).from(lmsCourses).where(inArray(lmsCourses.id, ids));
    if (found.length !== ids.length) throw new BadRequestException('A course of the path was not found');
    if (!steps.some((s) => s.required)) throw new BadRequestException('Mark at least one course as required');
  }

  private async saveSteps(tx: Tx, tenantId: string, pathId: string, steps: z.infer<typeof Steps>) {
    await tx.delete(lmsPathSteps).where(eq(lmsPathSteps.pathId, pathId));
    await tx.insert(lmsPathSteps).values(steps.map((s, i) => ({ tenantId, pathId, courseId: s.courseId, position: i + 1, required: s.required })));
  }

  @Post('paths')
  @Auth('user', [...PATH_ADMINS])
  createPath(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PathBody)) b: z.infer<typeof PathBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.checkSteps(tx, b.steps);
      if (b.programId && !(await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, b.programId)))[0]) throw new BadRequestException('Programme not found');
      if (b.sectionId && !(await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.sectionId)))[0]) throw new BadRequestException('Class not found');
      const [row] = await tx.insert(lmsLearningPaths).values({ tenantId: p.tenantId, title: b.title, description: b.description, programId: b.programId, sectionId: b.sectionId, certificate: b.certificate, createdBy: p.userId }).returning();
      await this.saveSteps(tx, p.tenantId, row.id, b.steps);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.path_created', subjectType: 'lms_learning_path', subjectId: row.id, data: { title: b.title, steps: b.steps.length } });
      return row;
    });
  }

  @Patch('paths/:id')
  @Auth('user', [...PATH_ADMINS])
  updatePath(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PathPatch)) b: z.infer<typeof PathPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [old] = await tx.select().from(lmsLearningPaths).where(eq(lmsLearningPaths.id, id));
      if (!old) throw new NotFoundException('Learning path not found');
      const { steps, ...rest } = b;
      if (steps) {
        await this.checkSteps(tx, steps);
        await this.saveSteps(tx, p.tenantId, id, steps);
      }
      const [row] = Object.keys(rest).length ? await tx.update(lmsLearningPaths).set(rest).where(eq(lmsLearningPaths.id, id)).returning() : [old];
      const keys = Object.keys(rest) as (keyof typeof rest)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: rest.status === 'published' ? 'lms.path_published' : 'lms.path_updated', subjectType: 'lms_learning_path', subjectId: id, before: Object.fromEntries(keys.map((k) => [k, old[k]])), after: Object.fromEntries(keys.map((k) => [k, row[k]])), data: { steps: steps?.length ?? null } });
      return row;
    });
  }

  /** Every path with its courses (staff). */
  @Get('paths')
  @Auth('user', [...LMS_STAFF])
  paths(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ p: lmsLearningPaths, program: programs.name, section: sections.displayName }).from(lmsLearningPaths).leftJoin(programs, eq(programs.id, lmsLearningPaths.programId)).leftJoin(sections, eq(sections.id, lmsLearningPaths.sectionId)).orderBy(asc(lmsLearningPaths.title)).limit(500);
      const steps = rows.length ? await tx.select({ s: lmsPathSteps, title: lmsCourses.title }).from(lmsPathSteps).innerJoin(lmsCourses, eq(lmsCourses.id, lmsPathSteps.courseId)).where(inArray(lmsPathSteps.pathId, rows.map((r) => r.p.id))).orderBy(asc(lmsPathSteps.position)) : [];
      const certs = rows.length ? await tx.select({ pathId: lmsCertificates.pathId }).from(lmsCertificates).where(inArray(lmsCertificates.pathId, rows.map((r) => r.p.id))) : [];
      return rows.map((r) => ({ ...r.p, program: r.program, section: r.section, steps: steps.filter((s) => s.s.pathId === r.p.id).map((s) => ({ courseId: s.s.courseId, title: s.title, required: s.s.required })), certificates: certs.filter((c) => c.pathId === r.p.id).length }));
    });
  }

  /** The published paths for a student's programme or class, with progress through each course. */
  @Get('my/paths')
  @Auth('user', ['student', 'guardian'])
  myPaths(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kid = (await this.lms.familyStudents(tx, p)).find((s) => !studentId || s.id === studentId);
      if (!kid) throw new NotFoundException('Student not found');
      return this.pathsFor(tx, kid);
    });
  }

  private async pathsFor(tx: Tx, kid: { id: string; sectionId: string }) {
    const [sec] = await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, kid.sectionId));
    const paths = await tx
      .select()
      .from(lmsLearningPaths)
      .where(and(eq(lmsLearningPaths.status, 'published'), or(eq(lmsLearningPaths.sectionId, kid.sectionId), and(isNull(lmsLearningPaths.sectionId), or(eq(lmsLearningPaths.programId, sec.programId), isNull(lmsLearningPaths.programId))))))
      .orderBy(asc(lmsLearningPaths.title));
    if (!paths.length) return [];
    const steps = await tx.select({ s: lmsPathSteps, c: lmsCourses }).from(lmsPathSteps).innerJoin(lmsCourses, eq(lmsCourses.id, lmsPathSteps.courseId)).where(inArray(lmsPathSteps.pathId, paths.map((x) => x.id))).orderBy(asc(lmsPathSteps.position));
    const now = this.clock.now();
    const cache = new Map<string, Completion>();
    for (const st of steps) if (!cache.has(st.c.id)) cache.set(st.c.id, (await courseCompletions(tx, this.lms, st.c, [kid.id], now)).get(kid.id)!);
    const certs = await tx.select().from(lmsCertificates).where(and(eq(lmsCertificates.studentId, kid.id), inArray(lmsCertificates.pathId, paths.map((x) => x.id))));
    return paths.map((path) => {
      const mine = steps.filter((s) => s.s.pathId === path.id);
      const prog = pathProgress(mine.map((s) => ({ courseId: s.c.id, required: s.s.required })), (cid) => !!cache.get(cid)?.eligible);
      return { id: path.id, title: path.title, description: path.description, certificate: path.certificate, ...prog, certificateIssued: certs.find((c) => c.pathId === path.id) ?? null, steps: mine.map((s) => ({ courseId: s.c.id, title: s.c.title, required: s.s.required, published: s.c.status === 'published', completion: cache.get(s.c.id) })) };
    });
  }

  /** A student who has completed every required course of a path takes the path's certificate. */
  @Post('paths/:id/claim')
  @Auth('user', ['student'])
  @HttpCode(200)
  claimPath(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!s) throw new ForbiddenException('Only a student can claim a certificate');
      const mine = (await this.pathsFor(tx, s)).find((x) => x.id === id);
      if (!mine) throw new NotFoundException('Learning path not found');
      if (!mine.certificate) throw new ConflictException('This path does not give a certificate');
      if (mine.certificateIssued) return mine.certificateIssued;
      if (!mine.complete) throw new ConflictException('Complete every required course of the path first');
      const [path] = await tx.select().from(lmsLearningPaths).where(eq(lmsLearningPaths.id, id));
      return this.issue(tx, p, { kind: 'path', path }, s.id, { pct: mine.pct, grade: null });
    });
  }
}
