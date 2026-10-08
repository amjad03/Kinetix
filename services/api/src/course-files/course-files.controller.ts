import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { headsSubject } from '../departments/departments.controller.js';
import { DbService, type Tx } from '../db/db.service.js';
import { courseFiles, departments, sections, subjects, timetableSlots, users } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { bufferStream, ObjectStorage } from '../storage/storage.service.js';
import { courseFilePdf } from './course-file-pdf.js';
import { CourseFilesService } from './course-files.service.js';

const ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];
const MAX_BYTES = 20 * 1024 * 1024;

/** Course files: one PDF per class and subject, assembled from existing records, kept as dated versions. */
@Controller('v1/course-files')
export class CourseFilesController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CourseFilesService,
    private readonly storage: ObjectStorage,
  ) {}

  private isLeader(p: UserPrincipal) {
    return hasRole(p, ['tenant_admin', 'principal']);
  }

  /** Leaders, the head of the subject's department, and a teacher who teaches that class. */
  private async canUse(tx: Tx, p: UserPrincipal, sectionId: string, subjectId: string) {
    if (this.isLeader(p)) return true;
    if (await headsSubject(tx, p, subjectId)) return true;
    const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), eq(timetableSlots.subjectId, subjectId), eq(timetableSlots.teacherId, p.userId))).limit(1);
    return !!slot;
  }

  private async canReview(tx: Tx, p: UserPrincipal, subjectId: string) {
    return this.isLeader(p) || (await headsSubject(tx, p, subjectId));
  }

  /** The class and subject pairs the caller may build a course file for. */
  @Get('options')
  @Auth('user', ROLES)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({ sectionId: sections.id, section: sections.displayName, subjectId: subjects.id, subject: subjects.name, code: subjects.code, departmentHead: departments.headUserId, teacherId: timetableSlots.teacherId })
        .from(timetableSlots)
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .leftJoin(departments, eq(departments.id, subjects.departmentId));
      const seen = new Set<string>();
      const out: { sectionId: string; section: string; subjectId: string; subject: string; code: string }[] = [];
      for (const r of rows) {
        const mine = this.isLeader(p) || (hasRole(p, ['hod']) && r.departmentHead === p.userId) || r.teacherId === p.userId;
        const key = `${r.sectionId}:${r.subjectId}`;
        if (!mine || seen.has(key)) continue;
        seen.add(key);
        out.push({ sectionId: r.sectionId, section: r.section, subjectId: r.subjectId, subject: r.subject, code: r.code });
      }
      return out.sort((a, b) => a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject));
    });
  }

  /** Builds a new version from the records as they stand now. */
  @Post()
  @Auth('user', ROLES)
  generate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ sectionId: z.uuid(), subjectId: z.uuid() }))) b: { sectionId: string; subjectId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.sectionId)))[0], 'Section');
      found((await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId)))[0], 'Subject');
      if (!(await this.canUse(tx, p, b.sectionId, b.subjectId))) throw new ForbiddenException('You do not teach this subject to this class');
      // Serialise concurrent generations of the same class and subject so versions stay unique.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`course-file:${b.sectionId}:${b.subjectId}`}))`);
      const [last] = await tx.select({ v: sql<number>`coalesce(max(${courseFiles.version}), 0)::int` }).from(courseFiles).where(and(eq(courseFiles.sectionId, b.sectionId), eq(courseFiles.subjectId, b.subjectId)));
      const version = last.v + 1;
      const { data, summary } = await this.svc.collect(tx, { ...b, version, generatedBy: p.userId });
      const pdf = courseFilePdf(data);
      const [row] = await tx.insert(courseFiles).values({ tenantId: p.tenantId, ...b, version, storageKey: 'pending', sizeBytes: pdf.length, summary, generatedBy: p.userId, generatedAt: this.svc.now() }).returning();
      const key = `tenants/${p.tenantId}/course-files/${row.id}.pdf`;
      await this.storage.put(key, bufferStream(pdf), MAX_BYTES, 'application/pdf');
      const [saved] = await tx.update(courseFiles).set({ storageKey: key }).where(eq(courseFiles.id, row.id)).returning();
      await auditUser(tx, p, 'course_file.generated', 'course_file', row.id, { ...b, version });
      return this.view(saved, data.section, data.subject, data.generatedBy, null);
    });
  }

  private view(r: typeof courseFiles.$inferSelect, section: string, subject: string, generatedBy: string, reviewedBy: string | null) {
    const { storageKey: _k, ...rest } = r;
    return { ...rest, section, subject, generatedByName: generatedBy, reviewedByName: reviewedBy };
  }

  /** Versions the caller may see, newest first. */
  @Get()
  @Auth('user', ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ f: courseFiles, section: sections.displayName, subject: subjects.name, headId: departments.headUserId })
        .from(courseFiles)
        .innerJoin(sections, eq(sections.id, courseFiles.sectionId))
        .innerJoin(subjects, eq(subjects.id, courseFiles.subjectId))
        .leftJoin(departments, eq(departments.id, subjects.departmentId))
        .orderBy(desc(courseFiles.generatedAt))
        .limit(500);
      const people = new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [...new Set(rows.flatMap((r) => [r.f.generatedBy, r.f.reviewedBy].filter((x): x is string => !!x)))] as string[]))).map((u) => [u.id, u.name]));
      const out = [];
      for (const r of rows) {
        const ok = this.isLeader(p) || (hasRole(p, ['hod']) && r.headId === p.userId) || (await this.canUse(tx, p, r.f.sectionId, r.f.subjectId));
        if (ok) out.push(this.view(r.f, r.section, r.subject, people.get(r.f.generatedBy) ?? '', r.f.reviewedBy ? (people.get(r.f.reviewedBy) ?? null) : null));
      }
      return out;
    });
  }

  private async load(tx: Tx, p: UserPrincipal, id: string) {
    const f = found((await tx.select().from(courseFiles).where(eq(courseFiles.id, id)))[0], 'Course file');
    if (!(await this.canUse(tx, p, f.sectionId, f.subjectId))) throw new NotFoundException('Course file not found');
    return f;
  }

  @Get(':id/download')
  @Auth('user', ROLES)
  async download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.db.withTenant(p.tenantId, async (tx) => {
      const row = await this.load(tx, p, id);
      const [s] = await tx.select({ code: subjects.code }).from(subjects).where(eq(subjects.id, row.subjectId));
      const [sec] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, row.sectionId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'course_file.downloaded', subjectType: 'course_file', subjectId: id });
      return { ...row, name: `course-file-${s.code}-${sec.name}-v${row.version}`.replace(/[^A-Za-z0-9._-]+/g, '-') };
    });
    const { stream } = await this.storage.get(f.storageKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}.pdf"`);
    return new StreamableFile(stream);
  }

  /** The head of department (or a school leader) marks a version as reviewed. */
  @Post(':id/review')
  @Auth('user', ['tenant_admin', 'principal', 'hod'])
  @HttpCode(200)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ remark: z.string().trim().max(1000).default('') }))) b: { remark: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const f = found((await tx.select().from(courseFiles).where(eq(courseFiles.id, id)).for('update'))[0], 'Course file');
      if (!(await this.canReview(tx, p, f.subjectId))) throw new NotFoundException('Course file not found');
      const [row] = await tx.update(courseFiles).set({ reviewedBy: p.userId, reviewedAt: this.svc.now(), reviewRemark: b.remark }).where(eq(courseFiles.id, id)).returning();
      await auditUser(tx, p, 'course_file.reviewed', 'course_file', id);
      return { id: row.id, reviewedAt: row.reviewedAt, reviewRemark: row.reviewRemark };
    });
  }
}
