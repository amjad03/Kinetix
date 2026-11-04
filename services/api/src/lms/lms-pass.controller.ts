import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { lmsAnnouncements, lmsCourses, lmsItems, lmsModules, students, subjects } from '../db/schema.js';
import { lmsItemProgress } from '../db/schema-life.js';
import { lmsSettings } from '../db/schema-lms.js';
import { itemAccess } from './lms-access.js';
import { completionOf, openPrerequisites } from './lms-completion.js';
import { ItemFields } from './lms.controller.js';
import { effectiveLmsSettings, LmsSettingsPatch, lmsSettingsOf } from './lms-settings.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const WebUrl = z.url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Use a web address (https://)');
const ItemPatch = z.object({ title: z.string().trim().min(1).max(160).optional(), url: WebUrl.nullable().optional(), ...ItemFields }).strict();
const ModulePatch = z.object({ title: z.string().trim().min(1).max(120) });
const OrderBody = z.object({ modules: z.array(z.object({ id: z.uuid(), itemIds: z.array(z.uuid()).max(500) })).min(1).max(100) });
const CompletionBody = z
  .object({ completionPct: z.number().int().min(1).max(100).optional(), minGradePct: z.number().min(0).max(100).nullable().optional(), certificate: z.boolean().optional(), prerequisiteCourseIds: z.array(z.uuid()).max(10).optional() })
  .strict();
const SyncBody = z.object({ events: z.array(z.object({ itemId: z.uuid(), at: z.coerce.date(), completed: z.boolean().default(false) })).min(1).max(200) });
const LEADERS = ['principal', 'tenant_admin'] as const;

/**
 * LMS authoring and the low-bandwidth student path: editing and reordering content, each item's completion rule, a
 * course's completion rules and prerequisite courses, the institution's LMS settings, the offline bundle the Student
 * App keeps on the phone and the progress it syncs back.
 */
@Controller('v1/lms')
export class LmsPassController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
  ) {}

  // ---- settings -------------------------------------------------------------------------------------

  @Get('settings')
  @Auth('user', [...LMS_STAFF])
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ settings: await lmsSettingsOf(tx, p.tenantId), canEdit: p.roles.some((r) => (LEADERS as readonly string[]).includes(r)) }));
  }

  @Put('settings')
  @Auth('user', [...LEADERS])
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LmsSettingsPatch)) b: z.infer<typeof LmsSettingsPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await lmsSettingsOf(tx, p.tenantId);
      const next = effectiveLmsSettings({ ...before, ...b });
      await tx.insert(lmsSettings).values({ tenantId: p.tenantId, settings: next, updatedBy: p.userId }).onConflictDoUpdate({ target: lmsSettings.tenantId, set: { settings: next, updatedBy: p.userId, updatedAt: this.clock.now() } });
      const keys = Object.keys(b) as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.settings_changed', subjectType: 'lms_settings', subjectId: p.tenantId, before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: Object.fromEntries(keys.map((k) => [k, next[k]])) });
      return { settings: next, canEdit: true };
    });
  }

  // ---- authoring ------------------------------------------------------------------------------------

  private async itemCourse(tx: Tx, p: UserPrincipal, itemId: string) {
    const [row] = await tx.select({ item: lmsItems, courseId: lmsModules.courseId }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsItems.id, itemId));
    if (!row) throw new NotFoundException('Item not found');
    const c = await this.lms.course(tx, row.courseId);
    await this.lms.assertManage(tx, p, c);
    return { item: row.item, course: c };
  }

  /** Edits an item: its title, address, lesson text, completion rule and pass mark, and the low-bandwidth hints. */
  @Patch('items/:id')
  @Auth('user', [...LMS_STAFF])
  editItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemPatch)) b: z.infer<typeof ItemPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { item, course } = await this.itemCourse(tx, p, id);
      if (!Object.keys(b).length) throw new BadRequestException('Nothing to change');
      if (b.body !== undefined && item.kind === 'page' && !b.body.trim()) throw new BadRequestException('Write the lesson text');
      if (b.url === null && ['file', 'link', 'simulation', 'virtual_lab', 'ppt', 'pdf'].includes(item.kind)) throw new BadRequestException('Add the address of the file or link');
      if (b.completionRule === 'pass' && !['quiz', 'scorm'].includes(item.kind)) throw new BadRequestException('Only quizzes and SCORM or cmi5 packages are completed by a pass mark');
      const [row] = await tx.update(lmsItems).set({ ...b, updatedAt: this.clock.now() }).where(eq(lmsItems.id, id)).returning();
      const keys = Object.keys(b).filter((k) => k !== 'body') as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.item_updated', subjectType: 'lms_course', subjectId: course.id, before: Object.fromEntries(keys.map((k) => [k, item[k as keyof typeof item]])), after: Object.fromEntries(keys.map((k) => [k, row[k as keyof typeof row]])), data: { itemId: id, bodyChanged: b.body !== undefined } });
      return row;
    });
  }

  @Patch('modules/:id')
  @Auth('user', [...LMS_STAFF])
  renameModule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ModulePatch)) b: z.infer<typeof ModulePatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select().from(lmsModules).where(eq(lmsModules.id, id));
      if (!m) throw new NotFoundException('Module not found');
      await this.lms.assertManage(tx, p, await this.lms.course(tx, m.courseId));
      const [row] = await tx.update(lmsModules).set({ title: b.title }).where(eq(lmsModules.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.module_renamed', subjectType: 'lms_course', subjectId: m.courseId, before: { title: m.title }, after: { title: b.title } });
      return row;
    });
  }

  /** Puts the modules, and the items in each, in the order given; items may move between modules of the course. Every module and item must be listed once. */
  @Put('courses/:id/order')
  @Auth('user', [...LMS_STAFF])
  order(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OrderBody)) b: z.infer<typeof OrderBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, await this.lms.course(tx, id));
      const mods = await tx.select({ id: lmsModules.id }).from(lmsModules).where(eq(lmsModules.courseId, id));
      const items = mods.length ? await tx.select({ id: lmsItems.id }).from(lmsItems).where(inArray(lmsItems.moduleId, mods.map((m) => m.id))) : [];
      const givenMods = b.modules.map((m) => m.id);
      const givenItems = b.modules.flatMap((m) => m.itemIds);
      const same = (a: string[], c: string[]) => a.length === c.length && new Set(a).size === a.length && a.every((x) => c.includes(x));
      if (!same(givenMods, mods.map((m) => m.id))) throw new BadRequestException('List every module of the course once');
      if (!same(givenItems, items.map((i) => i.id))) throw new BadRequestException('List every item of the course once');
      for (const [mi, m] of b.modules.entries()) {
        await tx.update(lmsModules).set({ position: mi + 1 }).where(eq(lmsModules.id, m.id));
        for (const [ii, itemId] of m.itemIds.entries()) await tx.update(lmsItems).set({ moduleId: m.id, position: ii + 1 }).where(eq(lmsItems.id, itemId));
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.course_reordered', subjectType: 'lms_course', subjectId: id, data: { modules: givenMods.length, items: givenItems.length } });
      return { modules: givenMods.length, items: givenItems.length };
    });
  }

  /** When a student has completed the course (share of items, lowest grade), whether it gives a certificate, and courses to finish first. */
  @Patch('courses/:id/completion')
  @Auth('user', [...LMS_STAFF])
  completion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CompletionBody)) b: z.infer<typeof CompletionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      if (!Object.keys(b).length) throw new BadRequestException('Nothing to change');
      if (b.prerequisiteCourseIds) {
        const ids = [...new Set(b.prerequisiteCourseIds)];
        if (ids.includes(id)) throw new BadRequestException('A course cannot be its own prerequisite');
        const pre = ids.length ? await tx.select({ id: lmsCourses.id, pre: lmsCourses.prerequisiteCourseIds }).from(lmsCourses).where(inArray(lmsCourses.id, ids)) : [];
        if (pre.length !== ids.length) throw new BadRequestException('A prerequisite course was not found');
        if (pre.some((x) => x.pre?.includes(id))) throw new BadRequestException('These courses would wait for each other');
        b.prerequisiteCourseIds = ids;
      }
      const [row] = await tx.update(lmsCourses).set(b).where(eq(lmsCourses.id, id)).returning();
      const keys = Object.keys(b) as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.completion_rules_changed', subjectType: 'lms_course', subjectId: id, before: Object.fromEntries(keys.map((k) => [k, c[k]])), after: Object.fromEntries(keys.map((k) => [k, row[k]])) });
      return row;
    });
  }

  // ---- offline and low bandwidth --------------------------------------------------------------------

  /**
   * Everything the Student App keeps for offline reading, in one answer: the student's published courses with their
   * modules, released items (lesson text included, locked items without their content), announcements and
   * completion. An ETag lets the app skip the download when nothing changed (304).
   */
  @Get('my/offline')
  @Auth('user', ['student', 'guardian'])
  offline(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId: string | undefined, @Headers('if-none-match') etag: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kid = (await this.lms.familyStudents(tx, p)).find((s) => !studentId || s.id === studentId);
      if (!kid) throw new NotFoundException('Student not found');
      const now = this.clock.now();
      const courses = await tx.select({ c: lmsCourses, subject: subjects.name }).from(lmsCourses).innerJoin(subjects, eq(subjects.id, lmsCourses.subjectId)).where(and(eq(lmsCourses.sectionId, kid.sectionId), eq(lmsCourses.status, 'published'))).orderBy(asc(subjects.name));
      const ids = courses.map((c) => c.c.id);
      const mods = ids.length ? await tx.select().from(lmsModules).where(inArray(lmsModules.courseId, ids)).orderBy(asc(lmsModules.position)) : [];
      const items = mods.length ? await tx.select().from(lmsItems).where(inArray(lmsItems.moduleId, mods.map((m) => m.id))).orderBy(asc(lmsItems.position)) : [];
      const done = new Set(items.length ? (await tx.select({ i: lmsItemProgress.itemId }).from(lmsItemProgress).where(and(eq(lmsItemProgress.studentId, kid.id), inArray(lmsItemProgress.itemId, items.map((i) => i.id)), isNotNull(lmsItemProgress.completedAt)))).map((r) => r.i) : []);
      const ann = ids.length ? await tx.select().from(lmsAnnouncements).where(inArray(lmsAnnouncements.courseId, ids)).orderBy(desc(lmsAnnouncements.createdAt)).limit(200) : [];
      const out = [];
      for (const { c, subject } of courses) {
        const blocked = (await openPrerequisites(tx, this.lms, c, kid.id, now)).length > 0;
        const cm = mods.filter((m) => m.courseId === c.id);
        const ci = items.filter((i) => cm.some((m) => m.id === i.moduleId));
        out.push({
          id: c.id,
          title: c.title,
          subject,
          completion: completionOf(ci, kid.id, now, done, null, { completionPct: c.completionPct, minGradePct: null }),
          modules: cm.map((m) => ({
            id: m.id,
            title: m.title,
            items: ci
              .filter((i) => i.moduleId === m.id)
              .flatMap((i) => {
                const a = itemAccess(i, kid.id, now, done);
                if (!a.visible) return [];
                const locked = a.locked || blocked;
                return [{ id: i.id, kind: i.kind, title: i.title, completionRule: i.completionRule, durationMin: i.durationMin, sizeKb: i.sizeKb, offline: i.offline, locked, completed: done.has(i.id), url: locked ? null : i.url, refId: locked ? null : i.refId, body: locked || !i.offline ? '' : i.body, updatedAt: i.updatedAt }];
              }),
          })),
          announcements: ann.filter((a) => a.courseId === c.id).slice(0, 20).map((a) => ({ id: a.id, title: a.title, body: a.body, createdAt: a.createdAt })),
        });
      }
      const body = { studentId: kid.id, courses: out };
      const tag = `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
      res.setHeader('ETag', tag);
      res.setHeader('Cache-Control', 'private, no-cache');
      if (etag && etag === tag) {
        res.status(304);
        return undefined;
      }
      return { ...body, generatedAt: now };
    });
  }

  /**
   * Progress the app recorded while offline. Each event is applied as if it had happened then (opened, or marked done
   * for "mark as done" items); repeating a batch changes nothing. Events for items the student cannot open are skipped.
   */
  @Post('my/progress/sync')
  @Auth('user', ['student'])
  @HttpCode(200)
  sync(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SyncBody)) b: z.infer<typeof SyncBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
      if (!s) throw new ForbiddenException('Only a student can sync progress');
      const now = this.clock.now();
      const ids = [...new Set(b.events.map((e) => e.itemId))];
      const items = await tx
        .select({ item: lmsItems, sectionId: lmsCourses.sectionId, status: lmsCourses.status, courseId: lmsCourses.id })
        .from(lmsItems)
        .innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId))
        .innerJoin(lmsCourses, eq(lmsCourses.id, lmsModules.courseId))
        .where(inArray(lmsItems.id, ids));
      const done = new Set((await tx.select({ i: lmsItemProgress.itemId }).from(lmsItemProgress).where(and(eq(lmsItemProgress.studentId, s.id), isNotNull(lmsItemProgress.completedAt)))).map((r) => r.i));
      let applied = 0;
      const skipped: string[] = [];
      // Items of a course still waiting for its prerequisite courses are skipped.
      const blocked = new Set<string>();
      for (const cid of new Set(items.map((x) => x.courseId))) if ((await openPrerequisites(tx, this.lms, await this.lms.course(tx, cid), s.id, now)).length) blocked.add(cid);
      // Oldest first, so an item finished offline unlocks the one after it in the same batch.
      for (const e of [...b.events].sort((x, y) => x.at.getTime() - y.at.getTime())) {
        const it = items.find((x) => x.item.id === e.itemId);
        const at = e.at > now ? now : e.at;
        if (!it || blocked.has(it.courseId) || it.sectionId !== s.sectionId || it.status !== 'published' || !itemAccess(it.item, s.id, at, done).visible || (itemAccess(it.item, s.id, at, done) as { locked?: boolean }).locked) {
          skipped.push(e.itemId);
          continue;
        }
        const complete = it.item.completionRule === 'view' || (e.completed && it.item.completionRule === 'mark_done');
        await tx
          .insert(lmsItemProgress)
          .values({ tenantId: p.tenantId, itemId: e.itemId, studentId: s.id, firstViewedAt: at, lastViewedAt: at, completedAt: complete ? at : null })
          .onConflictDoUpdate({
            target: [lmsItemProgress.itemId, lmsItemProgress.studentId],
            set: { firstViewedAt: sql`least(${lmsItemProgress.firstViewedAt}, ${at.toISOString()}::timestamptz)`, lastViewedAt: sql`greatest(${lmsItemProgress.lastViewedAt}, ${at.toISOString()}::timestamptz)`, ...(complete ? { completedAt: sql`least(coalesce(${lmsItemProgress.completedAt}, ${at.toISOString()}::timestamptz), ${at.toISOString()}::timestamptz)` } : {}) },
          });
        if (complete) done.add(e.itemId);
        applied++;
      }
      return { applied, skipped };
    });
  }
}
