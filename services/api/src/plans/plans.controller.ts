import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import {
  academicYears,
  boardSessions,
  chapters,
  guardians,
  type LessonPlanContent,
  lessonPlans,
  sections,
  students,
  subjects,
  timetableSlots,
  topicCoverage,
  topics,
  users,
  yearPlanItems,
  yearPlans,
} from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { addDays, isoWeekday, isSchoolAdmin, parseDate, TeacherService } from '../teacher/teacher.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { mondayOf, periodDates, planProgress, spreadTopics } from './planner.js';

/** A semester is about 16 teaching weeks; a plan without an end date covers that. */
const DEFAULT_WEEKS = 16;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const GenerateBody = z.object({ sectionId: z.uuid(), subjectId: z.uuid(), startsOn: DATE.optional(), endsOn: DATE.optional() });
const ItemsBody = z.object({
  items: z
    .array(z.object({ topicId: z.uuid(), weekOf: DATE, periods: z.number().int().min(1).max(40) }))
    .min(1)
    .max(500),
});
const Content = z.object({
  objectives: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  steps: z.array(z.object({ minutes: z.number().int().min(1).max(180), activity: z.string().trim().min(1).max(600) })).max(15).default([]),
  materials: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  assessment: z.string().trim().max(800).default(''),
  homework: z.string().trim().max(800).default(''),
});
const LessonBody = z.object({
  slotId: z.uuid(),
  date: DATE,
  topicIds: z.array(z.uuid()).max(10).default([]),
  content: Content,
  aiDrafted: z.boolean().default(false),
});
const DraftBody = z.object({ slotId: z.uuid(), date: DATE, topicIds: z.array(z.uuid()).max(5).optional(), language: z.enum(['en', 'hi', 'kn']).optional() });
const ReviewBody = z.object({ remark: z.string().trim().max(1000).optional() });

/**
 * Year plans (a class's syllabus spread over the term) and lesson plans (one period). Teachers of
 * the class make and change them; the head of the subject's department and the principal read
 * and review them; the class's students and families see the year plan's progress.
 */
@Controller('v1')
export class PlansController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly teacher: TeacherService,
    private readonly timetable: TimetableService,
    private readonly calendar: CalendarService,
    private readonly ai: AiService,
  ) {}

  // ----------------------------------------------------------------------------------------
  // Year plans
  // ----------------------------------------------------------------------------------------

  /** Makes (or remakes) the plan from the timetable and calendar. Remaking replaces the weeks. */
  @Post('year-plans/generate')
  @HttpCode(200)
  @Auth('user')
  generate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GenerateBody)) b: z.infer<typeof GenerateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.classSubject(tx, b.sectionId, b.subjectId);
      await this.assertCanPlan(tx, p, b.sectionId, b.subjectId);
      const today = await this.today(tx);
      const [year] = await tx.select().from(academicYears).where(eq(academicYears.isCurrent, true));
      const startsOn = b.startsOn ? parseDate(b.startsOn, 'startsOn') : today < (year?.startsOn ?? today) ? year!.startsOn : today;
      let endsOn = b.endsOn ? parseDate(b.endsOn, 'endsOn') : addDays(startsOn, DEFAULT_WEEKS * 7 - 1);
      if (!b.endsOn && year && endsOn > year.endsOn) endsOn = year.endsOn;
      if (endsOn < startsOn) throw new BadRequestException('The plan must end after it starts');

      const topicIds = await this.syllabusTopics(tx, b.subjectId);
      if (topicIds.length === 0) throw new BadRequestException('This subject has no syllabus yet. Link it to a course first.');
      const slots = await tx
        .select({ dayOfWeek: timetableSlots.dayOfWeek })
        .from(timetableSlots)
        .where(and(eq(timetableSlots.sectionId, b.sectionId), eq(timetableSlots.subjectId, b.subjectId), isNull(timetableSlots.archivedAt)));
      if (slots.length === 0) throw new BadRequestException('This subject has no periods in the timetable');
      const [section] = await tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, b.sectionId));
      const off = await this.calendar.holidays(tx, startsOn, endsOn, ['holiday', 'exam']);
      const dates = periodDates(
        slots.map((s) => s.dayOfWeek),
        startsOn,
        endsOn,
        (d) => !!off.on(d, section.programId),
      );
      if (dates.length === 0) throw new BadRequestException('There are no teaching days in these dates');
      const items = spreadTopics(topicIds, dates);

      const [existing] = await tx.select({ id: yearPlans.id }).from(yearPlans).where(and(eq(yearPlans.sectionId, b.sectionId), eq(yearPlans.subjectId, b.subjectId)));
      let planId = existing?.id;
      if (planId) {
        await tx.update(yearPlans).set({ startsOn, endsOn, updatedAt: new Date() }).where(eq(yearPlans.id, planId));
        await tx.delete(yearPlanItems).where(eq(yearPlanItems.planId, planId));
      } else {
        [{ id: planId }] = await tx
          .insert(yearPlans)
          .values({ tenantId: p.tenantId, sectionId: b.sectionId, subjectId: b.subjectId, startsOn, endsOn, createdBy: p.userId })
          .returning({ id: yearPlans.id });
      }
      await tx.insert(yearPlanItems).values(items.map((i) => ({ tenantId: p.tenantId, planId: planId!, ...i })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'year_plan.generated', subjectType: 'year_plan', subjectId: planId!, data: { periods: dates.length, topics: items.length } });
      return this.planView(tx, planId!, today);
    });
  }

  /** The plan for a class and subject (null when there is none), with progress. */
  @Get('year-plans')
  @Auth('user')
  get(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.classSubject(tx, sectionId, subjectId);
      await this.assertCanRead(tx, p, sectionId, subjectId);
      const [plan] = await tx.select({ id: yearPlans.id }).from(yearPlans).where(and(eq(yearPlans.sectionId, sectionId), eq(yearPlans.subjectId, subjectId)));
      return plan ? this.planView(tx, plan.id, await this.today(tx)) : null;
    });
  }

  /** Moves topics to other weeks or changes their periods (topics not listed are kept). */
  @Put('year-plans/:id/items')
  @Auth('user')
  editItems(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemsBody)) b: z.infer<typeof ItemsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [plan] = await tx.select().from(yearPlans).where(eq(yearPlans.id, id));
      if (!plan) throw new NotFoundException('Plan not found');
      await this.assertCanPlan(tx, p, plan.sectionId, plan.subjectId);
      const inPlan = new Set((await tx.select({ topicId: yearPlanItems.topicId }).from(yearPlanItems).where(eq(yearPlanItems.planId, id))).map((r) => r.topicId));
      for (const i of b.items) {
        if (!inPlan.has(i.topicId)) throw new BadRequestException('Some topics are not in this plan');
        await tx
          .update(yearPlanItems)
          .set({ weekOf: mondayOf(parseDate(i.weekOf, 'weekOf')), periods: i.periods })
          .where(and(eq(yearPlanItems.planId, id), eq(yearPlanItems.topicId, i.topicId)));
      }
      await tx.update(yearPlans).set({ updatedAt: new Date() }).where(eq(yearPlans.id, id));
      return this.planView(tx, id, await this.today(tx));
    });
  }

  // ----------------------------------------------------------------------------------------
  // Lesson plans
  // ----------------------------------------------------------------------------------------

  /** A class's lesson plans in a date range (default: this week and next). */
  @Get('lesson-plans')
  @Auth('user')
  list(
    @CurrentPrincipal() p: UserPrincipal,
    @Query('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('subjectId', ParseUUIDPipe) subjectId: string,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.classSubject(tx, sectionId, subjectId);
      await this.assertStaffRead(tx, p, sectionId, subjectId);
      const today = await this.today(tx);
      const from = fromQ ? parseDate(fromQ, 'from') : mondayOf(today);
      const to = toQ ? parseDate(toQ, 'to') : addDays(mondayOf(today), 13);
      const rows = await this.lessonQuery(tx).where(and(eq(lessonPlans.sectionId, sectionId), eq(lessonPlans.subjectId, subjectId), gte(lessonPlans.date, from), lte(lessonPlans.date, to)));
      return { from, to, plans: await this.withTopics(tx, rows) };
    });
  }

  /**
   * The plan for one period, or a suggestion when none is saved: the year plan's untaught
   * topics for that week, so the teacher starts from the syllabus.
   */
  @Get('lesson-plans/period')
  @Auth('user')
  period(@CurrentPrincipal() p: UserPrincipal, @Query('slotId', ParseUUIDPipe) slotId: string, @Query('date') dateQ: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const date = parseDate(dateQ, 'date');
      const slot = await this.slot(tx, slotId);
      await this.assertStaffRead(tx, p, slot.sectionId, slot.subjectId);
      return this.periodView(tx, slot, date);
    });
  }

  /** The board: the plan for the period open on it today. */
  @Get('lesson-plans/current')
  @Auth('board')
  current(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ slotId: boardSessions.timetableSlotId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
      if (!s?.slotId) return null;
      return this.periodView(tx, await this.slot(tx, s.slotId), await this.today(tx));
    });
  }

  /** Saves the plan for a period (creates or replaces it). */
  @Put('lesson-plans')
  @Auth('user')
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LessonBody)) b: z.infer<typeof LessonBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const date = parseDate(b.date, 'date');
      const slot = await this.slot(tx, b.slotId);
      await this.assertCanPlan(tx, p, slot.sectionId, slot.subjectId);
      if (slot.dayOfWeek !== isoWeekday(date)) throw new BadRequestException('This period is not on that day');
      await this.assertTopicsIn(tx, b.topicIds, slot.subjectId);
      const content: LessonPlanContent = b.content;
      const v = { topicIds: b.topicIds, content, aiDrafted: b.aiDrafted, teacherId: p.userId, updatedAt: new Date(), reviewedAt: null, reviewedBy: null, reviewRemark: null };
      const [row] = await tx
        .insert(lessonPlans)
        .values({ tenantId: p.tenantId, sectionId: slot.sectionId, subjectId: slot.subjectId, timetableSlotId: slot.id, date, ...v })
        .onConflictDoUpdate({ target: [lessonPlans.timetableSlotId, lessonPlans.date], set: v })
        .returning({ id: lessonPlans.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lesson_plan.saved', subjectType: 'lesson_plan', subjectId: row.id, data: { date, aiDrafted: b.aiDrafted } });
      return this.periodView(tx, slot, date);
    });
  }

  /** A first draft from KINETIX AI for the period's topics (not saved). */
  @Post('lesson-plans/draft')
  @HttpCode(200)
  @Auth('user')
  draft(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DraftBody)) b: z.infer<typeof DraftBody>) {
    return this.db
      .withTenant(p.tenantId, async (tx) => {
        const date = parseDate(b.date, 'date');
        const slot = await this.slot(tx, b.slotId);
        await this.assertCanPlan(tx, p, slot.sectionId, slot.subjectId);
        const view = await this.periodView(tx, slot, date);
        const ids = b.topicIds ?? view.suggestedTopicIds;
        await this.assertTopicsIn(tx, ids, slot.subjectId);
        const titles = ids.length ? (await tx.select({ id: topics.id, title: topics.title }).from(topics).where(inArray(topics.id, ids))).map((t) => t.title) : [];
        const [me] = await tx.select({ lang: users.preferredLanguage }).from(users).where(eq(users.id, p.userId));
        const [h1, m1] = slot.startsAt.split(':').map(Number);
        const [h2, m2] = slot.endsAt.split(':').map(Number);
        const minutes = Math.min(180, Math.max(10, h2 * 60 + m2 - (h1 * 60 + m1)));
        return { slot, topicIds: ids, topic: titles.join('; ') || view.subject.name, minutes, language: b.language ?? me?.lang ?? 'en' };
      })
      .then(async (d) => {
        const res = await this.ai.run(
          { tenantId: p.tenantId, userId: p.userId, sectionId: d.slot.sectionId, subjectId: d.slot.subjectId, topicId: d.topicIds[0] ?? null },
          'lessonPlan',
          { topic: d.topic, minutes: d.minutes, language: d.language },
        );
        return { topicIds: d.topicIds, content: { ...res.result, homework: '' } as LessonPlanContent, meta: res.meta };
      });
  }

  /** The head of department or the principal marks a plan as reviewed, with an optional remark. */
  @Post('lesson-plans/:id/review')
  @HttpCode(200)
  @Auth('user')
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [lp] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id));
      if (!lp) throw new NotFoundException('Lesson plan not found');
      if (!isSchoolAdmin(p) && !(await headsSubject(tx, p, lp.subjectId))) throw new ForbiddenException('Only the head of department or the principal reviews lesson plans');
      await tx.update(lessonPlans).set({ reviewedBy: p.userId, reviewedAt: this.clock.now(), reviewRemark: b.remark || null }).where(eq(lessonPlans.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lesson_plan.reviewed', subjectType: 'lesson_plan', subjectId: id });
      const [row] = await this.withTopics(tx, await this.lessonQuery(tx).where(eq(lessonPlans.id, id)));
      return row;
    });
  }

  // ----------------------------------------------------------------------------------------

  private async planView(tx: Tx, planId: string, today: string) {
    const [plan] = await tx.select().from(yearPlans).where(eq(yearPlans.id, planId));
    const rows = await tx
      .select({ topicId: yearPlanItems.topicId, weekOf: yearPlanItems.weekOf, periods: yearPlanItems.periods, title: topics.title, chapter: chapters.title, chapterPos: chapters.position, topicPos: topics.position })
      .from(yearPlanItems)
      .innerJoin(topics, eq(topics.id, yearPlanItems.topicId))
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .where(eq(yearPlanItems.planId, planId))
      .orderBy(asc(yearPlanItems.weekOf), asc(chapters.position), asc(topics.position));
    const coveredRows = rows.length
      ? await tx
          .select({ topicId: topicCoverage.topicId, coveredOn: topicCoverage.coveredOn })
          .from(topicCoverage)
          .where(and(eq(topicCoverage.sectionId, plan.sectionId), inArray(topicCoverage.topicId, rows.map((r) => r.topicId))))
      : [];
    const coveredOn = new Map(coveredRows.map((c) => [c.topicId, c.coveredOn]));
    const progress = planProgress(rows, new Set(coveredOn.keys()), today);
    const thisWeek = mondayOf(today);
    return {
      id: plan.id,
      sectionId: plan.sectionId,
      subjectId: plan.subjectId,
      startsOn: plan.startsOn,
      endsOn: plan.endsOn,
      updatedAt: plan.updatedAt,
      progress,
      items: rows.map(({ chapterPos: _c, topicPos: _t, ...r }) => ({
        ...r,
        coveredOn: coveredOn.get(r.topicId) ?? null,
        late: !coveredOn.has(r.topicId) && r.weekOf < thisWeek,
      })),
    };
  }

  private async periodView(tx: Tx, slot: Awaited<ReturnType<PlansController['slot']>>, date: string) {
    const [subject] = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.id, slot.subjectId));
    const [saved] = await this.withTopics(tx, await this.lessonQuery(tx).where(and(eq(lessonPlans.timetableSlotId, slot.id), eq(lessonPlans.date, date))));
    // Suggested: that week's untaught topics in the year plan, else the next untaught ones.
    const [plan] = await tx.select({ id: yearPlans.id }).from(yearPlans).where(and(eq(yearPlans.sectionId, slot.sectionId), eq(yearPlans.subjectId, slot.subjectId)));
    let suggestedTopicIds: string[] = [];
    if (plan) {
      const items = await tx.select({ topicId: yearPlanItems.topicId, weekOf: yearPlanItems.weekOf }).from(yearPlanItems).where(eq(yearPlanItems.planId, plan.id)).orderBy(asc(yearPlanItems.weekOf));
      const covered = new Set(
        (await tx.select({ topicId: topicCoverage.topicId }).from(topicCoverage).where(eq(topicCoverage.sectionId, slot.sectionId))).map((r) => r.topicId),
      );
      const open = items.filter((i) => !covered.has(i.topicId));
      const week = open.filter((i) => i.weekOf === mondayOf(date));
      suggestedTopicIds = (week.length ? week : open.slice(0, 1)).map((i) => i.topicId);
    }
    return {
      slot: { id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, sectionId: slot.sectionId, section: slot.section, subjectId: slot.subjectId },
      subject,
      date,
      plan: saved ?? null,
      suggestedTopicIds,
    };
  }

  private lessonQuery(tx: Tx) {
    return tx
      .select({
        id: lessonPlans.id,
        slotId: lessonPlans.timetableSlotId,
        date: lessonPlans.date,
        sectionId: lessonPlans.sectionId,
        subjectId: lessonPlans.subjectId,
        teacher: users.fullName,
        topicIds: lessonPlans.topicIds,
        content: lessonPlans.content,
        aiDrafted: lessonPlans.aiDrafted,
        reviewedAt: lessonPlans.reviewedAt,
        reviewRemark: lessonPlans.reviewRemark,
        updatedAt: lessonPlans.updatedAt,
      })
      .from(lessonPlans)
      .innerJoin(users, eq(users.id, lessonPlans.teacherId))
      .orderBy(asc(lessonPlans.date))
      .$dynamic();
  }

  /** Adds topic titles (and the reviewer's name). */
  private async withTopics<T extends { topicIds: string[]; reviewedAt: Date | null }>(tx: Tx, rows: T[]) {
    const ids = [...new Set(rows.flatMap((r) => r.topicIds))];
    const titles = ids.length ? new Map((await tx.select({ id: topics.id, title: topics.title }).from(topics).where(inArray(topics.id, ids))).map((t) => [t.id, t.title])) : new Map<string, string>();
    return rows.map((r) => ({ ...r, topics: r.topicIds.map((id) => ({ id, title: titles.get(id) ?? '' })) }));
  }

  private async slot(tx: Tx, slotId: string) {
    const [s] = await tx
      .select({
        id: timetableSlots.id,
        sectionId: timetableSlots.sectionId,
        subjectId: timetableSlots.subjectId,
        dayOfWeek: timetableSlots.dayOfWeek,
        startsAt: timetableSlots.startsAt,
        endsAt: timetableSlots.endsAt,
        section: sections.displayName,
      })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .where(eq(timetableSlots.id, slotId));
    if (!s) throw new NotFoundException('Period not found');
    return s;
  }

  private async syllabusTopics(tx: Tx, subjectId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: topics.id })
      .from(subjects)
      .innerJoin(chapters, eq(chapters.courseId, subjects.courseId))
      .innerJoin(topics, eq(topics.chapterId, chapters.id))
      .where(eq(subjects.id, subjectId))
      .orderBy(asc(chapters.position), asc(topics.position));
    return rows.map((r) => r.id);
  }

  private async assertTopicsIn(tx: Tx, ids: string[], subjectId: string) {
    if (ids.length === 0) return;
    const inSyllabus = new Set(await this.syllabusTopics(tx, subjectId));
    if (ids.some((id) => !inSyllabus.has(id))) throw new BadRequestException("That topic is not in this subject's syllabus");
  }

  private async classSubject(tx: Tx, sectionId: string, subjectId: string) {
    const section = await this.teacher.section(tx, sectionId);
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    if (!subject || subject.programId !== section.programId || subject.term !== section.term) throw new BadRequestException('That subject is not taught in this class');
  }

  /** Teachers of the class, the head of the subject's department, the principal and administrator. */
  private async assertCanPlan(tx: Tx, p: UserPrincipal, sectionId: string, subjectId: string) {
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId)) || (await headsSubject(tx, p, subjectId))) return;
    throw new ForbiddenException('You do not teach this class');
  }

  private async assertStaffRead(tx: Tx, p: UserPrincipal, sectionId: string, subjectId: string) {
    await this.assertCanPlan(tx, p, sectionId, subjectId);
  }

  /** Staff as above, and the class's students and families (year plan progress only). */
  private async assertCanRead(tx: Tx, p: UserPrincipal, sectionId: string, subjectId: string) {
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId)) || (await headsSubject(tx, p, subjectId))) return;
    const [mine] = await tx
      .select({ id: students.id })
      .from(students)
      .leftJoin(guardians, eq(guardians.studentId, students.id))
      .where(and(eq(students.sectionId, sectionId), eq(students.status, 'active'), sql`(${students.userId} = ${p.userId} or ${guardians.userId} = ${p.userId})`))
      .limit(1);
    if (!mine) throw new NotFoundException('Class not found');
  }

  private async today(tx: Tx) {
    return localParts(this.clock.now(), await this.timetable.tenantTimezone(tx)).date;
  }
}
