import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, conceptVideos, homework, lmsAnnouncements, lmsCourses, lmsGradeCategories, lmsGradeOverrides, lmsItems, lmsModules, sections, students, subjects, topics } from '../db/schema.js';
import { csv } from '../hr/exports.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const CourseBody = z.object({ sectionId: z.uuid(), subjectId: z.uuid(), title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(1000).default('') });
const CoursePatch = z.object({ title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(1000).optional(), status: z.enum(['draft', 'published']).optional() });
const ModuleBody = z.object({ title: z.string().trim().min(1).max(120) });
const ItemBody = z.object({
  kind: z.enum(['topic', 'video', 'homework', 'assessment', 'file', 'link']),
  title: z.string().trim().min(1).max(160),
  refId: z.uuid().optional(),
  url: z.url().max(500).optional(),
});
const AnnounceBody = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(2000).default('') });
const CategoriesBody = z.object({
  categories: z.array(z.object({ name: z.string().trim().min(1).max(60), source: z.enum(['homework', 'test', 'assignment', 'internal', 'exam', 'practical']), weight: z.number().gt(0).max(100) })).min(1).max(10),
});
const OverrideBody = z.object({ studentId: z.uuid(), categoryId: z.uuid(), percent: z.number().min(0).max(100).nullable(), reason: z.string().trim().min(3).max(300) });

/**
 * LMS course shells (one per section and subject), their modules and content, announcements and
 * the gradebook. Teachers of the class, the head of department and school leaders manage;
 * students and families read published courses and their own running grade.
 */
@Controller('v1/lms')
export class LmsController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
  ) {}

  @Post('courses')
  @Auth('user', [...LMS_STAFF])
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CourseBody)) b: z.infer<typeof CourseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, b);
      const [row] = await tx.select({ name: subjects.name, section: sections.displayName, subjectProgram: subjects.programId, sectionProgram: sections.programId }).from(subjects).innerJoin(sections, eq(sections.id, b.sectionId)).where(eq(subjects.id, b.subjectId));
      if (!row || row.subjectProgram !== row.sectionProgram) throw new BadRequestException('That subject is not taught in this class');
      const course = await orConflict('This class and subject already has a course', async () => {
        const [c] = await tx.insert(lmsCourses).values({ tenantId: p.tenantId, sectionId: b.sectionId, subjectId: b.subjectId, title: b.title ?? `${row.name} · ${row.section}`, description: b.description, createdBy: p.userId }).returning();
        return c;
      });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.course_created', subjectType: 'lms_course', subjectId: course.id });
      return course;
    });
  }

  /** Staff: the courses they manage (all for leaders), optionally for one class. */
  @Get('courses')
  @Auth('user', [...LMS_STAFF])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ c: lmsCourses, subject: subjects.name, section: sections.displayName })
        .from(lmsCourses)
        .innerJoin(subjects, eq(subjects.id, lmsCourses.subjectId))
        .innerJoin(sections, eq(sections.id, lmsCourses.sectionId))
        .where(sectionId ? eq(lmsCourses.sectionId, z.uuid().parse(sectionId)) : undefined)
        .orderBy(asc(sections.displayName), asc(subjects.name));
      const out = [];
      for (const r of rows) if (await this.lms.canManage(tx, p, r.c)) out.push({ ...r.c, subject: r.subject, section: r.section });
      return out;
    });
  }

  /** A student's (or their child's) published courses with the running grade. */
  @Get('my')
  @Auth('user', ['student', 'guardian'])
  my(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = (await this.lms.familyStudents(tx, p)).filter((s) => !studentId || s.id === studentId);
      if (studentId && kids.length === 0) throw new NotFoundException('Student not found');
      const out = [];
      for (const s of kids) {
        const courses = await tx
          .select({ c: lmsCourses, subject: subjects.name })
          .from(lmsCourses)
          .innerJoin(subjects, eq(subjects.id, lmsCourses.subjectId))
          .where(and(eq(lmsCourses.sectionId, s.sectionId), eq(lmsCourses.status, 'published')))
          .orderBy(asc(subjects.name));
        for (const { c, subject } of courses) {
          const [mods] = await tx.select({ n: count() }).from(lmsModules).where(eq(lmsModules.courseId, c.id));
          const g = (await this.lms.gradebook(tx, c, { publishedOnly: true, studentIds: [s.id] })).rows[0];
          out.push({ studentId: s.id, studentName: s.fullName, courseId: c.id, title: c.title, subject, moduleCount: mods.n, overall: g?.overall ?? null, letter: g?.letter ?? null });
        }
      }
      return out;
    });
  }

  @Get('courses/:id')
  @Auth('user')
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      const manage = await this.lms.canManage(tx, p, c);
      let grade = null;
      if (!manage) {
        const kid = (await this.lms.familyStudents(tx, p)).find((s) => s.sectionId === c.sectionId && (!studentId || s.id === studentId));
        if (!kid || c.status !== 'published') throw new NotFoundException('Course not found');
        const gb = await this.lms.gradebook(tx, c, { publishedOnly: true, studentIds: [kid.id] });
        grade = { categories: gb.categories, ...gb.rows[0] };
      }
      const mods = await tx.select().from(lmsModules).where(eq(lmsModules.courseId, id)).orderBy(asc(lmsModules.position));
      const items = mods.length ? await tx.select().from(lmsItems).where(inArray(lmsItems.moduleId, mods.map((m) => m.id))).orderBy(asc(lmsItems.position)) : [];
      const announcements = await tx.select().from(lmsAnnouncements).where(eq(lmsAnnouncements.courseId, id)).orderBy(desc(lmsAnnouncements.createdAt)).limit(20);
      const [meta] = await tx.select({ subject: subjects.name, section: sections.displayName }).from(subjects).innerJoin(sections, eq(sections.id, c.sectionId)).where(eq(subjects.id, c.subjectId));
      return { ...c, ...meta, canManage: manage, grade, modules: mods.map((m) => ({ ...m, items: items.filter((i) => i.moduleId === m.id) })), announcements };
    });
  }

  @Patch('courses/:id')
  @Auth('user', [...LMS_STAFF])
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CoursePatch)) b: z.infer<typeof CoursePatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      if (Object.keys(b).length === 0) throw new BadRequestException('Nothing to change');
      const [row] = await tx.update(lmsCourses).set(b).where(eq(lmsCourses.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.course_updated', subjectType: 'lms_course', subjectId: id, data: b });
      return row;
    });
  }

  @Post('courses/:id/modules')
  @Auth('user', [...LMS_STAFF])
  addModule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ModuleBody)) b: z.infer<typeof ModuleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      const [m] = await tx.select({ n: max(lmsModules.position) }).from(lmsModules).where(eq(lmsModules.courseId, id));
      const [row] = await tx.insert(lmsModules).values({ tenantId: p.tenantId, courseId: id, title: b.title, position: (m?.n ?? 0) + 1 }).returning();
      return row;
    });
  }

  @Delete('modules/:id')
  @HttpCode(204)
  @Auth('user', [...LMS_STAFF])
  removeModule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select().from(lmsModules).where(eq(lmsModules.id, id));
      if (!m) throw new NotFoundException('Module not found');
      await this.lms.assertManage(tx, p, await this.lms.course(tx, m.courseId));
      await tx.delete(lmsModules).where(eq(lmsModules.id, id));
    });
  }

  /** Appends an item to a module: a link to existing content (topic, video, homework, assessment of this class) or a file or web link. */
  @Post('modules/:id/items')
  @Auth('user', [...LMS_STAFF])
  addItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemBody)) b: z.infer<typeof ItemBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select().from(lmsModules).where(eq(lmsModules.id, id));
      if (!m) throw new NotFoundException('Module not found');
      const c = await this.lms.course(tx, m.courseId);
      await this.lms.assertManage(tx, p, c);
      await this.checkRef(tx, c, b);
      const [mx] = await tx.select({ n: max(lmsItems.position) }).from(lmsItems).where(eq(lmsItems.moduleId, id));
      const [row] = await tx.insert(lmsItems).values({ tenantId: p.tenantId, moduleId: id, position: (mx?.n ?? 0) + 1, kind: b.kind, title: b.title, refId: b.refId ?? null, url: b.url ?? null }).returning();
      return row;
    });
  }

  @Delete('items/:id')
  @HttpCode(204)
  @Auth('user', [...LMS_STAFF])
  removeItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [i] = await tx.select({ courseId: lmsModules.courseId }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsItems.id, id));
      if (!i) throw new NotFoundException('Item not found');
      await this.lms.assertManage(tx, p, await this.lms.course(tx, i.courseId));
      await tx.delete(lmsItems).where(eq(lmsItems.id, id));
    });
  }

  @Post('courses/:id/announcements')
  @Auth('user', [...LMS_STAFF])
  announce(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AnnounceBody)) b: z.infer<typeof AnnounceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      const [row] = await tx.insert(lmsAnnouncements).values({ tenantId: p.tenantId, courseId: id, ...b, createdBy: p.userId }).returning();
      return row;
    });
  }

  /** Replaces the grade categories; weights must add up to 100. Existing overrides of removed categories go with them. */
  @Put('courses/:id/categories')
  @Auth('user', [...LMS_STAFF])
  setCategories(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CategoriesBody)) b: z.infer<typeof CategoriesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      if (Math.abs(b.categories.reduce((s, x) => s + x.weight, 0) - 100) > 0.01) throw new BadRequestException('Category weights must add up to 100');
      await tx.delete(lmsGradeCategories).where(eq(lmsGradeCategories.courseId, id));
      const rows = await tx.insert(lmsGradeCategories).values(b.categories.map((x, i) => ({ tenantId: p.tenantId, courseId: id, ...x, position: i + 1 }))).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.categories_set', subjectType: 'lms_course', subjectId: id, data: b.categories });
      return rows;
    });
  }

  @Get('courses/:id/gradebook')
  @Auth('user', [...LMS_STAFF])
  gradebook(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      return { course: { id: c.id, title: c.title }, ...(await this.lms.gradebook(tx, c, { publishedOnly: false })) };
    });
  }

  /** The teacher's override of one category percentage for one student (percent null removes it). The reason is required and audited. */
  @Put('courses/:id/overrides')
  @Auth('user', [...LMS_STAFF])
  override(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OverrideBody)) b: z.infer<typeof OverrideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      const [cat] = await tx.select().from(lmsGradeCategories).where(and(eq(lmsGradeCategories.id, b.categoryId), eq(lmsGradeCategories.courseId, id)));
      const [stu] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, b.studentId), eq(students.sectionId, c.sectionId)));
      if (!cat || !stu) throw new NotFoundException('Category or student not found in this course');
      const [old] = await tx.select().from(lmsGradeOverrides).where(and(eq(lmsGradeOverrides.categoryId, b.categoryId), eq(lmsGradeOverrides.studentId, b.studentId)));
      if (b.percent === null) await tx.delete(lmsGradeOverrides).where(and(eq(lmsGradeOverrides.categoryId, b.categoryId), eq(lmsGradeOverrides.studentId, b.studentId)));
      else await tx.insert(lmsGradeOverrides).values({ tenantId: p.tenantId, categoryId: b.categoryId, studentId: b.studentId, percent: b.percent, reason: b.reason, setBy: p.userId }).onConflictDoUpdate({ target: [lmsGradeOverrides.categoryId, lmsGradeOverrides.studentId], set: { percent: b.percent, reason: b.reason, setBy: p.userId, setAt: sql`now()` } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.grade_override', subjectType: 'lms_course', subjectId: id, data: { studentId: b.studentId, categoryId: b.categoryId, from: old?.percent ?? null, to: b.percent, reason: b.reason } });
      return { ok: true };
    });
  }

  @Get('courses/:id/gradebook.csv')
  @Auth('user', [...LMS_STAFF])
  exportCsv(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      const g = await this.lms.gradebook(tx, c, { publishedOnly: false });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="gradebook.csv"');
      return csv([['Roll no', 'Name', ...g.categories.map((x) => `${x.name} (${x.weight}%)`), 'Overall %', 'Grade'], ...g.rows.map((r) => [r.rollNo, r.fullName, ...r.cells.map((x) => x.percent), r.overall, r.letter])]);
    });
  }

  /** Content items must point at something that exists (and, for homework and assessments, in this class); files and links need a URL. */
  private async checkRef(tx: Tx, c: { sectionId: string; subjectId: string }, b: z.infer<typeof ItemBody>) {
    if (b.kind === 'file' || b.kind === 'link') {
      if (!b.url) throw new BadRequestException('Add the address of the file or link');
      return;
    }
    if (!b.refId) throw new BadRequestException('Choose the content to link');
    const t = { topic: topics, video: conceptVideos, homework, assessment: assessments }[b.kind];
    const [row] = await tx.select({ id: t.id }).from(t).where(b.kind === 'homework' || b.kind === 'assessment' ? and(eq(t.id, b.refId), eq((t as typeof homework).sectionId, c.sectionId), eq((t as typeof homework).subjectId, c.subjectId)) : eq(t.id, b.refId));
    if (!row) throw new BadRequestException('That content was not found for this class');
  }
}
