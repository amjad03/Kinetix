import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { coverageCounts } from '../coverage/coverage.controller.js';
import type { Tx } from '../db/db.service.js';
import { specialClasses } from '../db/schema-academic-ops.js';
import { teachingLogs } from '../db/schema-academics-pass.js';
import { academicTerms, academicYears, attendanceRecords, chapters, departments, lessonPlans, sections, subjects, teacherSubstitutions, tenants, timetableSlots, topicCoverage, topics, users } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { againstPlan, pace, pctOf, weeklyHours, type AgainstPlan } from './teaching-log-rules.js';

export interface LogInput {
  slotId?: string | null;
  specialClassId?: string | null;
  date: string;
  topicIds: string[];
  delivery: string;
  summary: string;
  againstPlan?: AgainstPlan;
  deviationReason?: string;
  source: 'erp' | 'teacher_app' | 'board';
  boardSessionId?: string | null;
}

const ADMIN = ['tenant_admin', 'principal'];
const hhmm = (t: string) => t.slice(0, 5);
const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

/** The teaching diary: entries for periods taught, their syllabus coverage, and the plan-against-actual registers. */
@Injectable()
export class TeachingLogService {
  constructor(
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {}

  async today(tx: Tx) {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  isAdmin(p: { roles: string[] }) {
    return p.roles.some((r) => ADMIN.includes(r));
  }

  /** Subject ids of the departments this person heads. */
  async headed(tx: Tx, userId: string): Promise<Set<string>> {
    const rows = await tx.select({ id: subjects.id }).from(subjects).innerJoin(departments, eq(departments.id, subjects.departmentId)).where(eq(departments.headUserId, userId));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Writes (or rewrites) the diary entry of a period on a date: the teacher of the period or its substitute that day
   * (or the office). The topics taught are marked as covered for the class, and the entry is compared with the lesson
   * plan of the period.
   */
  async write(tx: Tx, actor: { tenantId: string; userId: string; roles: string[]; deviceId?: string }, b: LogInput) {
    const today = await this.today(tx);
    if (b.date > today) throw new BadRequestException('A period cannot be logged before it is taught');
    if (b.date < addDays(today, -60)) throw new BadRequestException('Periods older than 60 days cannot be logged; ask the office');
    let target: { sectionId: string; subjectId: string; teacherId: string; startsAt: string; endsAt: string; batch: string | null; slotId: string | null; specialId: string | null; programId: string };
    let substitute = false;
    if (b.slotId) {
      const [s] = await tx.select({ slot: timetableSlots, programId: sections.programId }).from(timetableSlots).innerJoin(sections, eq(sections.id, timetableSlots.sectionId)).where(eq(timetableSlots.id, b.slotId));
      if (!s) throw new NotFoundException('Period not found');
      const orders = await this.calendar.dayOrders(tx, b.date, b.date);
      if (orders.weekday(b.date, s.programId) !== s.slot.dayOfWeek) throw new BadRequestException('This period does not meet on that date');
      if ((await this.calendar.holidays(tx, b.date, b.date)).on(b.date, s.programId)) throw new BadRequestException('That date is a holiday for this class');
      const [cover] = await tx.select({ teacherId: teacherSubstitutions.substituteTeacherId }).from(teacherSubstitutions).where(and(eq(teacherSubstitutions.slotId, s.slot.id), eq(teacherSubstitutions.date, b.date), eq(teacherSubstitutions.status, 'assigned')));
      substitute = !!cover && cover.teacherId === actor.userId;
      target = { sectionId: s.slot.sectionId, subjectId: s.slot.subjectId, teacherId: cover?.teacherId ?? s.slot.teacherId, startsAt: s.slot.startsAt, endsAt: s.slot.endsAt, batch: s.slot.batch, slotId: s.slot.id, specialId: null, programId: s.programId };
    } else if (b.specialClassId) {
      const [c] = await tx.select({ c: specialClasses, programId: sections.programId }).from(specialClasses).innerJoin(sections, eq(sections.id, specialClasses.sectionId)).where(eq(specialClasses.id, b.specialClassId));
      if (!c) throw new NotFoundException('Special class not found');
      if (c.c.date !== b.date) throw new BadRequestException('The special class is on another date');
      if (c.c.status === 'cancelled') throw new BadRequestException('This special class was cancelled');
      target = { sectionId: c.c.sectionId, subjectId: c.c.subjectId, teacherId: c.c.teacherId, startsAt: c.c.startsAt, endsAt: c.c.endsAt, batch: c.c.batch, slotId: null, specialId: c.c.id, programId: c.programId };
    } else throw new BadRequestException('Name the period (slotId) or the special class');

    if (!this.isAdmin(actor) && actor.userId !== target.teacherId && !(await this.headed(tx, actor.userId)).has(target.subjectId)) throw new ForbiddenException('Only the teacher of this period can write its diary');

    // Every topic must be in the subject's syllabus.
    const topicIds = [...new Set(b.topicIds)];
    if (topicIds.length) {
      const ok = await tx.select({ id: topics.id }).from(topics).innerJoin(chapters, eq(chapters.id, topics.chapterId)).innerJoin(subjects, eq(subjects.courseId, chapters.courseId)).where(and(inArray(topics.id, topicIds), eq(subjects.id, target.subjectId)));
      if (ok.length !== topicIds.length) throw new BadRequestException("Some topics are not in this subject's syllabus");
    }
    const [plan] = target.slotId ? await tx.select({ id: lessonPlans.id, topicIds: lessonPlans.topicIds }).from(lessonPlans).where(and(eq(lessonPlans.timetableSlotId, target.slotId), eq(lessonPlans.date, b.date))) : [];
    const verdict = b.againstPlan ?? againstPlan(plan ? plan.topicIds : null, topicIds);
    if (verdict === 'behind' && !b.deviationReason?.trim() && b.source !== 'board') throw new BadRequestException('Say why the period fell behind its lesson plan');

    const [before] = await tx.select().from(teachingLogs).where(target.slotId ? and(eq(teachingLogs.timetableSlotId, target.slotId), eq(teachingLogs.date, b.date)) : eq(teachingLogs.specialClassId, target.specialId!));
    const values = {
      sectionId: target.sectionId,
      subjectId: target.subjectId,
      teacherId: before?.teacherId && before.teacherId !== actor.userId && !substitute ? before.teacherId : target.teacherId,
      timetableSlotId: target.slotId,
      specialClassId: target.specialId,
      lessonPlanId: plan?.id ?? null,
      boardSessionId: b.boardSessionId ?? before?.boardSessionId ?? null,
      date: b.date,
      startsAt: target.startsAt,
      endsAt: target.endsAt,
      batch: target.batch,
      topicIds,
      delivery: b.delivery,
      summary: b.summary,
      againstPlan: verdict,
      deviationReason: b.deviationReason?.trim() ?? '',
      source: b.source,
      substitute,
      updatedAt: new Date(),
    };
    const [row] = before
      ? await tx.update(teachingLogs).set({ ...values, reviewedAt: null, reviewedBy: null, reviewRemark: null }).where(eq(teachingLogs.id, before.id)).returning()
      : await tx.insert(teachingLogs).values({ tenantId: actor.tenantId, ...values }).returning();
    // The topics taught count as covered for the class (the first time they were taught stays the date).
    for (const topicId of topicIds) {
      await tx
        .insert(topicCoverage)
        .values({ tenantId: actor.tenantId, sectionId: target.sectionId, topicId, coveredOn: b.date, coveredBy: values.teacherId, boardSessionId: b.boardSessionId ?? null })
        .onConflictDoNothing();
    }
    const pick = (r: Record<string, unknown> | undefined) => (r ? { topicIds: r.topicIds, delivery: r.delivery, summary: r.summary, againstPlan: r.againstPlan, deviationReason: r.deviationReason } : null);
    await audit(tx, { tenantId: actor.tenantId, actorType: b.source === 'board' ? 'device' : 'user', actorId: b.source === 'board' ? actor.deviceId : actor.userId, action: before ? 'teaching_log.updated' : 'teaching_log.written', subjectType: 'teaching_log', subjectId: row.id, data: { sectionId: target.sectionId, date: b.date, source: b.source, by: actor.userId }, before: pick(before), after: pick(row) });
    return row;
  }

  /** The head of department (or the principal) reviews an entry; the teacher is told. */
  async review(tx: Tx, p: UserPrincipal, id: string, remark: string) {
    const [r] = await tx.select().from(teachingLogs).where(eq(teachingLogs.id, id));
    if (!r) throw new NotFoundException('Diary entry not found');
    if (!this.isAdmin(p) && !(await this.headed(tx, p.userId)).has(r.subjectId)) throw new ForbiddenException('Only the head of the department or the principal reviews the diary');
    if (r.teacherId === p.userId && !this.isAdmin(p)) throw new ForbiddenException('Your own diary is reviewed by someone else');
    const [row] = await tx.update(teachingLogs).set({ reviewedBy: p.userId, reviewedAt: new Date(), reviewRemark: remark || null }).where(eq(teachingLogs.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'teaching_log.reviewed', subjectType: 'teaching_log', subjectId: id, changes: { reviewed: { before: !!r.reviewedAt, after: true }, reviewRemark: { before: r.reviewRemark, after: remark || null } } });
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.TeachingLogReviewed, aggregateType: 'teaching_log', aggregateId: id, actorId: p.userId, payload: { teacherId: r.teacherId, date: r.date } });
    if (remark)
      await this.notifications.notifyUsers(tx, [r.teacherId], {
        kind: 'task',
        text: {
          en: { title: 'Your teaching diary was reviewed', body: `${r.date}: ${remark}` },
          hi: { title: 'आपकी शिक्षण डायरी की समीक्षा हुई', body: `${r.date}: ${remark}` },
          kn: { title: 'ನಿಮ್ಮ ಬೋಧನಾ ದಿನಚರಿ ಪರಿಶೀಲಿಸಲಾಗಿದೆ', body: `${r.date}: ${remark}` },
        },
        data: { teachingLogId: id },
        dedupeKey: `teaching-log-review:${id}`,
      }, { replace: true });
    return row;
  }

  /** The term a class is in on a date (its programme's term, else the academic year). */
  async termOf(tx: Tx, section: { academicYearId: string; programId: string }, on: string) {
    const terms = await tx.select().from(academicTerms).where(eq(academicTerms.academicYearId, section.academicYearId)).orderBy(asc(academicTerms.startsOn));
    const t = terms.find((x) => (x.programIds === null || x.programIds.includes(section.programId)) && x.startsOn <= on && on <= x.endsOn) ?? terms.find((x) => x.programIds === null || x.programIds.includes(section.programId));
    if (t) return { name: t.name, startsOn: t.startsOn, endsOn: t.endsOn };
    const [y] = await tx.select().from(academicYears).where(eq(academicYears.id, section.academicYearId));
    return { name: y?.label ?? '', startsOn: y?.startsOn ?? on, endsOn: y?.endsOn ?? on };
  }

  /**
   * The periods of a class and subject that meet between two dates: weekly periods on the weekday that meets
   * (compensatory working days follow another), not on holidays, while they were in the timetable; and special classes.
   */
  async meetings(tx: Tx, section: { id: string; programId: string }, subjectId: string, from: string, to: string) {
    const slots = await tx
      .select()
      .from(timetableSlots)
      .where(and(eq(timetableSlots.subjectId, subjectId), or(eq(timetableSlots.sectionId, section.id), sql`${section.id}::uuid = any(${timetableSlots.combinedSectionIds})`)));
    const orders = await this.calendar.dayOrders(tx, from, to);
    const holidays = await this.calendar.holidays(tx, from, to);
    const out: { date: string; slotId: string | null; specialId: string | null; batch: string | null; minutes: number }[] = [];
    const tz = 'Asia/Kolkata';
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (holidays.on(d, section.programId)) continue;
      const wd = orders.weekday(d, section.programId);
      for (const s of slots) {
        if (s.dayOfWeek !== wd) continue;
        // A period archived (changed or removed) met until the day it was archived.
        if (s.archivedAt && localParts(s.archivedAt, tz).date <= d) continue;
        out.push({ date: d, slotId: s.id, specialId: null, batch: s.batch, minutes: mins(s.endsAt) - mins(s.startsAt) });
      }
    }
    const sc = await tx.select().from(specialClasses).where(and(eq(specialClasses.sectionId, section.id), eq(specialClasses.subjectId, subjectId), gte(specialClasses.date, from), lte(specialClasses.date, to), sql`${specialClasses.status} <> 'cancelled'`));
    for (const c of sc) out.push({ date: c.date, slotId: null, specialId: c.id, batch: c.batch, minutes: mins(c.endsAt) - mins(c.startsAt) });
    return out;
  }

  /**
   * A class's register for one course: topics covered, periods (and hours) allotted for the term, scheduled so far,
   * held (attendance taken) and logged in the diary, lesson plans, how entries went against the plan, the pace, and
   * the periods still to be logged.
   */
  async register(tx: Tx, sectionId: string, subjectId: string) {
    const [sec] = await tx.select().from(sections).where(eq(sections.id, sectionId));
    const [sub] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    if (!sec || !sub) throw new NotFoundException('Class or subject not found');
    if (sub.programId !== sec.programId || sub.term !== sec.term) throw new BadRequestException('That subject is not taught in this class');
    const today = await this.today(tx);
    const term = await this.termOf(tx, sec, today);
    const until = today < term.endsOn ? today : term.endsOn;
    const all = await this.meetings(tx, sec, subjectId, term.startsOn, term.endsOn);
    const sofar = all.filter((m) => m.date <= until);
    const logs = await tx.select().from(teachingLogs).where(and(eq(teachingLogs.sectionId, sectionId), eq(teachingLogs.subjectId, subjectId), gte(teachingLogs.date, term.startsOn), lte(teachingLogs.date, term.endsOn))).orderBy(asc(teachingLogs.date), asc(teachingLogs.startsAt));
    const loggedKeys = new Set(logs.map((l) => `${l.timetableSlotId ?? l.specialClassId}|${l.date}`));
    const held = sofar.length
      ? new Set(
          (
            await tx
              .selectDistinct({ slotId: attendanceRecords.timetableSlotId, date: attendanceRecords.date })
              .from(attendanceRecords)
              .where(and(eq(attendanceRecords.sectionId, sectionId), gte(attendanceRecords.date, term.startsOn), lte(attendanceRecords.date, until), inArray(attendanceRecords.timetableSlotId, [...new Set(sofar.filter((m) => m.slotId).map((m) => m.slotId!))].concat(['00000000-0000-0000-0000-000000000000']))))
          ).map((r) => `${r.slotId}|${r.date}`),
        )
      : new Set<string>();
    const heldCount = sofar.filter((m) => held.has(`${m.slotId}|${m.date}`) || loggedKeys.has(`${m.slotId ?? m.specialId}|${m.date}`)).length;
    const weeklySlots = new Set(all.filter((m) => m.slotId).map((m) => m.slotId)).size;
    const weeks = Math.max(1, Math.round(((Date.parse(term.endsOn) - Date.parse(term.startsOn)) / 86400_000 + 1) / 7));
    const perWeek = weeklyHours(sub, weeklySlots);
    const counts = (await coverageCounts(tx, [{ sectionId, subjectId }])).get(`${sectionId}|${subjectId}`)!;
    const plans = await tx.select({ n: sql<number>`count(*)::int`, approved: sql<number>`count(*) filter (where ${lessonPlans.status} = 'approved')::int` }).from(lessonPlans).where(and(eq(lessonPlans.sectionId, sectionId), eq(lessonPlans.subjectId, subjectId)));
    const byPlan = { as_planned: 0, ahead: 0, behind: 0, unplanned: 0 } as Record<AgainstPlan, number>;
    for (const l of logs) byPlan[l.againstPlan as AgainstPlan] = (byPlan[l.againstPlan as AgainstPlan] ?? 0) + 1;
    const coveredPct = pctOf(counts.covered, counts.total);
    const elapsedPct = pctOf(sofar.length, all.length);
    const minutesHeld = sofar.filter((m) => held.has(`${m.slotId}|${m.date}`) || loggedKeys.has(`${m.slotId ?? m.specialId}|${m.date}`)).reduce((n, m) => n + m.minutes, 0);
    const pending = sofar.filter((m) => !loggedKeys.has(`${m.slotId ?? m.specialId}|${m.date}`) && m.date >= addDays(until, -13)).map((m) => ({ date: m.date, slotId: m.slotId, specialClassId: m.specialId, batch: m.batch }));
    return {
      section: { id: sec.id, name: sec.displayName },
      subject: { id: sub.id, code: sub.code, name: sub.name, credits: sub.credits, ltp: `${sub.lectureHours}-${sub.tutorialHours}-${sub.practicalHours}` },
      term,
      topics: { ...counts, percent: coveredPct },
      hours: { perWeek, allotted: perWeek * weeks, scheduled: all.length, scheduledToDate: sofar.length, held: heldCount, heldHours: Math.round((minutesHeld / 60) * 10) / 10, logged: logs.length },
      lessonPlans: plans[0],
      againstPlan: byPlan,
      elapsedPct,
      pace: pace(coveredPct, elapsedPct),
      pending,
      entries: logs.slice(-30).reverse(),
    };
  }

  /**
   * Syllabus completion by class and course (the HOD's and principal's review): coverage %, periods held against
   * those scheduled so far and allotted for the term, diary entries and the pace. A head sees their departments.
   */
  async completion(tx: Tx, p: UserPrincipal, o: { departmentId?: string; sectionId?: string }) {
    const today = await this.today(tx);
    const [year] = await tx.select().from(academicYears).where(eq(academicYears.isCurrent, true));
    if (!year) return { rows: [] };
    const headed = this.isAdmin(p) ? null : await this.headed(tx, p.userId);
    const pairs = await tx
      .selectDistinct({ sectionId: timetableSlots.sectionId, section: sections.displayName, subjectId: subjects.id, code: subjects.code, subject: subjects.name, department: departments.name, departmentId: departments.id, teacher: users.fullName, teacherId: users.id })
      .from(timetableSlots)
      .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
      .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .leftJoin(departments, eq(departments.id, subjects.departmentId))
      .where(and(isNull(timetableSlots.archivedAt), eq(sections.academicYearId, year.id), o.departmentId ? eq(subjects.departmentId, o.departmentId) : undefined, o.sectionId ? eq(timetableSlots.sectionId, o.sectionId) : undefined));
    const seen = new Map<string, (typeof pairs)[number] & { teachers: string[] }>();
    for (const r of pairs) {
      if (headed && !headed.has(r.subjectId) && r.teacherId !== p.userId) continue;
      const k = `${r.sectionId}|${r.subjectId}`;
      const e = seen.get(k) ?? { ...r, teachers: [] };
      if (!e.teachers.includes(r.teacher)) e.teachers.push(r.teacher);
      seen.set(k, e);
    }
    const counts = await coverageCounts(tx, [...seen.values()].map((r) => ({ sectionId: r.sectionId, subjectId: r.subjectId })));
    const secRows = new Map((await tx.select().from(sections).where(inArray(sections.id, [...new Set([...seen.values()].map((r) => r.sectionId))].concat(['00000000-0000-0000-0000-000000000000'])))).map((s) => [s.id, s]));
    const logCounts = new Map(
      (
        await tx
          .select({ sectionId: teachingLogs.sectionId, subjectId: teachingLogs.subjectId, n: sql<number>`count(*)::int`, behind: sql<number>`count(*) filter (where ${teachingLogs.againstPlan} = 'behind')::int`, unreviewed: sql<number>`count(*) filter (where ${teachingLogs.reviewedAt} is null)::int` })
          .from(teachingLogs)
          .groupBy(teachingLogs.sectionId, teachingLogs.subjectId)
      ).map((r) => [`${r.sectionId}|${r.subjectId}`, r]),
    );
    const rows = [];
    for (const r of seen.values()) {
      const sec = secRows.get(r.sectionId)!;
      const term = await this.termOf(tx, sec, today);
      const until = today < term.endsOn ? today : term.endsOn;
      const all = await this.meetings(tx, sec, r.subjectId, term.startsOn, term.endsOn);
      const sofar = all.filter((m) => m.date <= until).length;
      const c = counts.get(`${r.sectionId}|${r.subjectId}`) ?? { covered: 0, total: 0 };
      const l = logCounts.get(`${r.sectionId}|${r.subjectId}`);
      const coveredPct = pctOf(c.covered, c.total);
      const elapsedPct = pctOf(sofar, all.length);
      rows.push({ sectionId: r.sectionId, section: r.section, subjectId: r.subjectId, code: r.code, subject: r.subject, department: r.department, teachers: r.teachers.join(', '), topics: c.total, covered: c.covered, coveredPct, scheduled: all.length, scheduledToDate: sofar, logged: l?.n ?? 0, behindPlan: l?.behind ?? 0, unreviewed: l?.unreviewed ?? 0, elapsedPct, pace: pace(coveredPct, elapsedPct) });
    }
    rows.sort((a, b) => (a.department ?? '').localeCompare(b.department ?? '') || a.section.localeCompare(b.section) || a.code.localeCompare(b.code));
    return { rows };
  }

  /** This teacher's periods of the last two weeks that have no diary entry (substituted periods included). */
  async pending(tx: Tx, teacherId: string) {
    const today = await this.today(tx);
    const from = addDays(today, -13);
    const own = await tx.select({ slot: timetableSlots, programId: sections.programId, section: sections.displayName, subject: subjects.name, code: subjects.code }).from(timetableSlots).innerJoin(sections, eq(sections.id, timetableSlots.sectionId)).innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId)).where(eq(timetableSlots.teacherId, teacherId));
    const subs = await tx.select({ slotId: teacherSubstitutions.slotId, date: teacherSubstitutions.date, substitute: teacherSubstitutions.substituteTeacherId }).from(teacherSubstitutions).where(and(gte(teacherSubstitutions.date, from), lte(teacherSubstitutions.date, today), eq(teacherSubstitutions.status, 'assigned'), or(eq(teacherSubstitutions.substituteTeacherId, teacherId), eq(teacherSubstitutions.originalTeacherId, teacherId))));
    const orders = await this.calendar.dayOrders(tx, from, today);
    const holidays = await this.calendar.holidays(tx, from, today);
    const logs = new Set((await tx.select({ slotId: teachingLogs.timetableSlotId, date: teachingLogs.date }).from(teachingLogs).where(and(gte(teachingLogs.date, from), lte(teachingLogs.date, today)))).map((l) => `${l.slotId}|${l.date}`));
    const out: { date: string; slotId: string; startsAt: string; endsAt: string; section: string; subject: string; code: string; substitute: boolean }[] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      for (const r of own) {
        if (r.slot.archivedAt && localParts(r.slot.archivedAt, 'Asia/Kolkata').date <= d) continue;
        if (orders.weekday(d, r.programId) !== r.slot.dayOfWeek || holidays.on(d, r.programId)) continue;
        if (subs.some((s) => s.slotId === r.slot.id && s.date === d && s.substitute !== teacherId)) continue;
        if (!logs.has(`${r.slot.id}|${d}`)) out.push({ date: d, slotId: r.slot.id, startsAt: hhmm(r.slot.startsAt), endsAt: hhmm(r.slot.endsAt), section: r.section, subject: r.subject, code: r.code, substitute: false });
      }
    }
    const covering = subs.filter((s) => s.substitute === teacherId && !logs.has(`${s.slotId}|${s.date}`));
    if (covering.length) {
      const rows = await tx.select({ slot: timetableSlots, section: sections.displayName, subject: subjects.name, code: subjects.code }).from(timetableSlots).innerJoin(sections, eq(sections.id, timetableSlots.sectionId)).innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId)).where(inArray(timetableSlots.id, covering.map((c) => c.slotId)));
      for (const c of covering) {
        const r = rows.find((x) => x.slot.id === c.slotId);
        if (r) out.push({ date: c.date, slotId: r.slot.id, startsAt: hhmm(r.slot.startsAt), endsAt: hhmm(r.slot.endsAt), section: r.section, subject: r.subject, code: r.code, substitute: true });
      }
    }
    // Only periods that have ended.
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const now = localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata');
    return out.filter((x) => x.date < today || x.endsAt <= now.time.slice(0, 5)).sort((a, b) => b.date.localeCompare(a.date) || a.startsAt.localeCompare(b.startsAt));
  }
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
