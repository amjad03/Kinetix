import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ConceptVideo, ConceptVideoSource, Language, ManagedConceptVideo, PeriodConceptVideos, PeriodTopicSource, TopicVideoCount } from '@kinetix/shared';
import { and, asc, eq, gt, inArray, isNull, max, sql, type SQL } from 'drizzle-orm';
import { licenceAllows } from './licensing.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { chapters, conceptVideos, courses, guardians, lessonPlans, sections, students, subjects, timetableSlots, topics, users } from '../db/schema.js';
import { nextUntaughtTopicId, yearPlanTopicIds } from '../plans/suggest.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { YouTube } from '../platform/youtube.js';

export const LANGUAGES: readonly Language[] = ['en', 'hi', 'kn'];

/** The class's language first, then English, then the others; the platform team's order within each. */
export function byLanguage<T extends { language: Language; position: number }>(videos: T[], preferred: Language): T[] {
  const rank = (l: Language) => (l === preferred ? 0 : l === 'en' ? 1 : 2 + LANGUAGES.indexOf(l));
  return [...videos].sort((a, b) => rank(a.language) - rank(b.language) || a.position - b.position);
}

const videoColumns = {
  id: conceptVideos.id,
  source: conceptVideos.scope,
  topicId: conceptVideos.topicId,
  youtubeVideoId: conceptVideos.youtubeVideoId,
  title: conceptVideos.title,
  language: conceptVideos.language,
  durationSeconds: conceptVideos.durationSeconds,
  channelTitle: conceptVideos.channelTitle,
  position: conceptVideos.position,
  createdBy: conceptVideos.createdBy,
  sectionIds: conceptVideos.sectionIds,
  shareStatus: conceptVideos.shareStatus,
};

const SOURCE_ORDER: ConceptVideoSource[] = ['platform', 'institution', 'teacher'];

/** Who is looking: their id and the classes they are in (a student or guardian), or teach. */
export interface VideoViewer {
  userId: string | null;
  sectionIds: string[];
  admin: boolean;
}

export interface VideoActor {
  userId: string;
  admin: boolean;
  teacher: boolean;
}

type VideoRow = ConceptVideo & { createdBy: string | null; sectionIds: string[]; shareStatus: string };

/** A teacher's video is for the viewer when it is approved for everyone, they added it, or it names one of their classes. */
export function visibleTo(v: Pick<VideoRow, 'source' | 'createdBy' | 'sectionIds' | 'shareStatus'>, viewer: VideoViewer | null): boolean {
  if (v.source !== 'teacher' || v.shareStatus === 'approved') return true;
  if (!viewer) return false;
  return (!!viewer.userId && v.createdBy === viewer.userId) || v.sectionIds.some((s) => viewer.sectionIds.includes(s));
}

/**
 * One topic's videos merged platform, then institution, then teacher (each by language, then
 * the order its owner gave), dropping a YouTube video that an earlier source already has.
 */
export function mergeSources<T extends { source: ConceptVideoSource; youtubeVideoId: string; language: Language; position: number }>(rows: T[], preferred: Language): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const source of SOURCE_ORDER) {
    for (const v of byLanguage(rows.filter((r) => r.source === source), preferred)) {
      if (seen.has(v.youtubeVideoId)) continue;
      seen.add(v.youtubeVideoId);
      out.push(v);
    }
  }
  return out;
}

const strip = ({ createdBy: _c, sectionIds: _s, shareStatus: _h, ...v }: VideoRow): ConceptVideo => v;

/**
 * Concept videos for institutions: read-only (the platform team links them, src/platform/).
 * Topics go through row-level security, so a video is only found through a topic the
 * institution can see.
 */
@Injectable()
export class ConceptVideosService {
  constructor(
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly calendar: CalendarService,
    private readonly youtube: YouTube,
  ) {}

  /**
   * Videos of the topics, in topic order. Each topic: platform videos, then the institution's, then
   * teachers' (the viewer's own classes, or approved for everyone), without repeating a YouTube video.
   */
  async forTopics(tx: Tx, topicIds: string[], preferred: Language, viewer: VideoViewer | null = null): Promise<ConceptVideo[]> {
    if (topicIds.length === 0) return [];
    const rows = ((await tx.select(videoColumns).from(conceptVideos).where(and(inArray(conceptVideos.topicId, topicIds), licenceAllows('concept_video', conceptVideos.id)))) as VideoRow[]).filter((r) => visibleTo(r, viewer));
    return topicIds.flatMap((id) => mergeSources(rows.filter((r) => r.topicId === id), preferred).map(strip));
  }

  /** The classes a user is in as a student or guardian, or teaches. */
  async sectionsOf(tx: Tx, userId: string): Promise<string[]> {
    const own = await tx.select({ id: students.sectionId }).from(students).where(eq(students.userId, userId));
    const children = await tx
      .select({ id: students.sectionId })
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .where(eq(guardians.userId, userId));
    const teaching = await tx.select({ id: timetableSlots.sectionId }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, userId), isNull(timetableSlots.archivedAt)));
    return [...new Set([...own, ...children, ...teaching].map((r) => r.id))];
  }

  async viewer(tx: Tx, userId: string | null, admin = false, extraSectionIds: string[] = []): Promise<VideoViewer> {
    const sectionIds = userId ? await this.sectionsOf(tx, userId) : [];
    return { userId, sectionIds: [...new Set([...sectionIds, ...extraSectionIds])], admin };
  }

  /** The topic's course language (the class's medium), or null when the institution can't see the topic. */
  async topicLanguage(tx: Tx, topicId: string): Promise<Language | null> {
    const [row] = await tx
      .select({ language: courses.language })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(eq(topics.id, topicId));
    return row?.language ?? null;
  }

  /**
   * What a board is about to teach: its open class's period, else the current or next period
   * today (the teacher's, for a paired board without a class; the room's, for a board nobody is
   * signed in to). The topic comes from the period's lesson plan, else the year plan's week,
   * else the next syllabus topic the class has not been taught.
   */
  async forBoard(tx: Tx, b: { slotId: string | null; teacherId: string | null; roomId: string | null }, lang?: Language): Promise<PeriodConceptVideos> {
    const tz = await this.timetable.tenantTimezone(tx);
    const now = localParts(this.clock.now(), tz);
    const empty: PeriodConceptVideos = { period: null, source: null, topics: [], language: lang ?? 'en', videos: [] };

    const slotQuery = () =>
      tx
        .select({
          id: timetableSlots.id,
          startsAt: timetableSlots.startsAt,
          endsAt: timetableSlots.endsAt,
          roomId: timetableSlots.roomId,
          sectionId: timetableSlots.sectionId,
          section: sections.displayName,
          programId: sections.programId,
          subjectId: subjects.id,
          subject: subjects.name,
          language: courses.language,
        })
        .from(timetableSlots)
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .leftJoin(courses, eq(courses.id, subjects.courseId))
        .$dynamic();
    let slot: Awaited<ReturnType<typeof slotQuery>>[number] | undefined;
    if (b.slotId) {
      [slot] = await slotQuery().where(eq(timetableSlots.id, b.slotId));
    } else if (b.teacherId || b.roomId) {
      const rows = await slotQuery()
        .where(
          and(
            b.teacherId ? eq(timetableSlots.teacherId, b.teacherId) : eq(timetableSlots.roomId, b.roomId!),
            eq(timetableSlots.dayOfWeek, now.isoWeekday),
            isNull(timetableSlots.archivedAt),
            gt(timetableSlots.endsAt, now.time),
          ),
        )
        .orderBy(asc(timetableSlots.startsAt));
      const holidays = await this.calendar.holidays(tx, now.date, now.date);
      const open = rows.filter((r) => !holidays.on(now.date, r.programId));
      // Two classes at once (messy timetables): the one in this board's room.
      slot = open.find((r) => r.startsAt <= now.time && (!b.roomId || r.roomId === b.roomId)) ?? open.find((r) => r.startsAt <= now.time) ?? open[0];
    }
    if (!slot) return empty;

    const language = lang ?? slot.language ?? 'en';
    let source: PeriodTopicSource | null = null;
    let topicIds: string[] = [];
    const [plan] = await tx.select({ topicIds: lessonPlans.topicIds }).from(lessonPlans).where(and(eq(lessonPlans.timetableSlotId, slot.id), eq(lessonPlans.date, now.date)));
    if (plan?.topicIds.length) [source, topicIds] = ['lesson_plan', plan.topicIds];
    if (!topicIds.length) {
      topicIds = await yearPlanTopicIds(tx, slot.sectionId, slot.subjectId, now.date);
      if (topicIds.length) source = 'year_plan';
    }
    if (!topicIds.length) {
      const next = await nextUntaughtTopicId(tx, slot.sectionId, slot.subjectId);
      if (next) [source, topicIds] = ['syllabus', [next]];
    }
    const titles = topicIds.length ? await tx.select({ id: topics.id, title: topics.title }).from(topics).where(inArray(topics.id, topicIds)) : [];
    const ordered = topicIds.map((id) => titles.find((t) => t.id === id)).filter((t): t is { id: string; title: string } => !!t);
    const videos = await this.forTopics(
      tx,
      ordered.map((t) => t.id),
      language,
      await this.viewer(tx, b.teacherId, false, [slot.sectionId]),
    );
    return {
      period: {
        slotId: slot.id,
        date: now.date,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        isNow: slot.startsAt <= now.time,
        section: { id: slot.sectionId, displayName: slot.section },
        subject: { id: slot.subjectId, name: slot.subject },
      },
      source,
      topics: ordered,
      language,
      videos: videos.map((v) => ({ ...v, topicTitle: ordered.find((t) => t.id === v.topicId)!.title })),
    };
  }

  // ---------------------------------------------------------------------------------------
  // Institution and teacher videos (migration 0066). Platform videos are the platform team's.
  // ---------------------------------------------------------------------------------------

  private readonly managedSelect = {
    id: conceptVideos.id,
    source: conceptVideos.scope,
    topicId: conceptVideos.topicId,
    topicTitle: topics.title,
    youtubeVideoId: conceptVideos.youtubeVideoId,
    title: conceptVideos.title,
    language: conceptVideos.language,
    durationSeconds: conceptVideos.durationSeconds,
    channelTitle: conceptVideos.channelTitle,
    position: conceptVideos.position,
    shareStatus: conceptVideos.shareStatus,
    reviewReason: conceptVideos.reviewReason,
    sectionIds: conceptVideos.sectionIds,
    createdBy: conceptVideos.createdBy,
    createdByName: users.fullName,
    createdAt: conceptVideos.createdAt,
  };

  private async managed(tx: Tx, where: SQL | undefined): Promise<ManagedConceptVideo[]> {
    const rows = await tx
      .select(this.managedSelect)
      .from(conceptVideos)
      .innerJoin(topics, eq(topics.id, conceptVideos.topicId))
      .leftJoin(users, eq(users.id, conceptVideos.createdBy))
      .where(where)
      .orderBy(asc(conceptVideos.position), asc(conceptVideos.createdAt));
    const ids = [...new Set(rows.flatMap((r) => r.sectionIds))];
    const secs = ids.length ? await tx.select({ id: sections.id, displayName: sections.displayName }).from(sections).where(inArray(sections.id, ids)) : [];
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), sections: secs.filter((x) => r.sectionIds.includes(x.id)) })) as ManagedConceptVideo[];
  }

  /** The videos this person manages on a topic: an admin sees the institution's and every teacher's; a teacher their own. */
  mine(tx: Tx, a: VideoActor, topicId: string): Promise<ManagedConceptVideo[]> {
    const mineOnly = a.admin ? inArray(conceptVideos.scope, ['institution', 'teacher']) : and(eq(conceptVideos.scope, 'teacher'), eq(conceptVideos.createdBy, a.userId));
    return this.managed(tx, and(eq(conceptVideos.topicId, topicId), mineOnly));
  }

  /** The admin's approval queue (or the approved / rejected history), newest request first. */
  async approvals(tx: Tx, status: 'pending' | 'approved' | 'rejected'): Promise<ManagedConceptVideo[]> {
    const rows = await this.managed(tx, and(eq(conceptVideos.scope, 'teacher'), eq(conceptVideos.shareStatus, status)));
    return rows.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  }

  /** The institution's own videos per topic of a course (topics with none are left out). */
  async counts(tx: Tx, courseId: string): Promise<TopicVideoCount[]> {
    return tx
      .select({
        topicId: conceptVideos.topicId,
        institution: sql<number>`count(*) filter (where ${conceptVideos.scope} = 'institution')::int`,
        teacher: sql<number>`count(*) filter (where ${conceptVideos.scope} = 'teacher')::int`,
        pending: sql<number>`count(*) filter (where ${conceptVideos.shareStatus} = 'pending')::int`,
      })
      .from(conceptVideos)
      .innerJoin(topics, eq(topics.id, conceptVideos.topicId))
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .where(and(eq(chapters.courseId, courseId), inArray(conceptVideos.scope, ['institution', 'teacher'])))
      .groupBy(conceptVideos.topicId);
  }

  async teachesSections(tx: Tx, userId: string): Promise<string[]> {
    const rows = await tx.select({ id: timetableSlots.sectionId }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, userId), isNull(timetableSlots.archivedAt)));
    return [...new Set(rows.map((r) => r.id))];
  }

  /** Adds a YouTube video to a topic for the institution (admin) or for the teacher's own classes. */
  async add(
    tx: Tx,
    tenantId: string,
    a: VideoActor,
    topicId: string,
    videoId: string,
    b: { scope: 'institution' | 'teacher'; title?: string; language?: Language; sectionIds?: string[] },
  ): Promise<ManagedConceptVideo> {
    if (b.scope === 'institution' && !a.admin) throw new ForbiddenException('Only the principal or an admin can add videos for the whole institution');
    if (b.scope === 'teacher' && !a.teacher) throw new ForbiddenException('Only teachers can add videos for their classes');
    const courseLanguage = await this.topicLanguage(tx, topicId);
    if (!courseLanguage) throw new NotFoundException('Topic not found');
    let sectionIds: string[] = [];
    if (b.scope === 'teacher') {
      const mine = await this.teachesSections(tx, a.userId);
      sectionIds = b.sectionIds?.length ? [...new Set(b.sectionIds)] : mine;
      if (sectionIds.length === 0) throw new BadRequestException('You have no classes to add this for');
      if (sectionIds.some((x) => !mine.includes(x))) throw new ForbiddenException('You do not teach one of those classes');
    }
    const info = b.title ? null : await this.youtube.videoInfo(videoId);
    const title = b.title ?? info?.title;
    if (!title) throw new BadRequestException("Couldn't get the video's title from YouTube. Type a title and add it again.");
    const own = b.scope === 'teacher' ? eq(conceptVideos.createdBy, a.userId) : undefined;
    const [dup] = await tx
      .select({ id: conceptVideos.id })
      .from(conceptVideos)
      .where(and(eq(conceptVideos.topicId, topicId), eq(conceptVideos.youtubeVideoId, videoId), eq(conceptVideos.scope, b.scope), own));
    if (dup) throw new ConflictException('This video is already on this topic');
    const [{ last }] = await tx.select({ last: max(conceptVideos.position) }).from(conceptVideos).where(and(eq(conceptVideos.topicId, topicId), eq(conceptVideos.scope, b.scope), own));
    const [row] = await tx
      .insert(conceptVideos)
      .values({
        topicId,
        youtubeVideoId: videoId,
        title: title.slice(0, 200),
        language: b.language ?? courseLanguage,
        durationSeconds: info?.durationSeconds ?? null,
        channelTitle: info?.channelTitle ?? null,
        position: (last ?? 0) + 1,
        createdBy: a.userId,
        scope: b.scope,
        tenantId,
        sectionIds,
      })
      .returning({ id: conceptVideos.id });
    await audit(tx, { tenantId, actorType: 'user', actorId: a.userId, action: `concept_video.${b.scope}.added`, subjectType: 'topic', subjectId: topicId, data: { youtubeVideoId: videoId } });
    return (await this.managed(tx, eq(conceptVideos.id, row.id)))[0];
  }

  /** The tenant's video the actor may change; platform videos are never found here. */
  private async own(tx: Tx, a: VideoActor, id: string, how: 'edit' | 'delete') {
    const [v] = await tx.select().from(conceptVideos).where(and(eq(conceptVideos.id, id), inArray(conceptVideos.scope, ['institution', 'teacher'])));
    if (!v) throw new NotFoundException('Video not found');
    const allowed = v.scope === 'institution' ? a.admin : v.createdBy === a.userId || (how === 'delete' && a.admin);
    if (!allowed) throw new ForbiddenException(v.scope === 'institution' ? 'Only the principal or an admin can change institution videos' : "This is another teacher's video");
    return v;
  }

  async edit(tx: Tx, tenantId: string, a: VideoActor, id: string, b: { title?: string; language?: Language; sectionIds?: string[] }): Promise<ManagedConceptVideo> {
    const v = await this.own(tx, a, id, 'edit');
    const set: Partial<typeof conceptVideos.$inferInsert> = {};
    if (b.title !== undefined) set.title = b.title;
    if (b.language !== undefined) set.language = b.language;
    if (b.sectionIds !== undefined) {
      if (v.scope !== 'teacher') throw new BadRequestException("Only a teacher's video has classes");
      const mine = await this.teachesSections(tx, a.userId);
      if (b.sectionIds.length === 0 || b.sectionIds.some((x) => !mine.includes(x))) throw new ForbiddenException('Pick classes you teach');
      set.sectionIds = [...new Set(b.sectionIds)];
    }
    await tx.update(conceptVideos).set(set).where(eq(conceptVideos.id, id));
    await audit(tx, { tenantId, actorType: 'user', actorId: a.userId, action: `concept_video.${v.scope}.edited`, subjectType: 'topic', subjectId: v.topicId, data: { videoId: id } });
    return (await this.managed(tx, eq(conceptVideos.id, id)))[0];
  }

  async remove(tx: Tx, tenantId: string, a: VideoActor, id: string): Promise<void> {
    const v = await this.own(tx, a, id, 'delete');
    await tx.delete(conceptVideos).where(eq(conceptVideos.id, id));
    await audit(tx, { tenantId, actorType: 'user', actorId: a.userId, action: `concept_video.${v.scope}.removed`, subjectType: 'topic', subjectId: v.topicId, data: { youtubeVideoId: v.youtubeVideoId } });
  }

  /** The actor's videos of one scope on a topic in a new order: every one of them, once. */
  async reorder(tx: Tx, a: VideoActor, topicId: string, scope: 'institution' | 'teacher', ids: string[]): Promise<ManagedConceptVideo[]> {
    if (scope === 'institution' && !a.admin) throw new ForbiddenException('Only the principal or an admin can order institution videos');
    const where = and(eq(conceptVideos.topicId, topicId), eq(conceptVideos.scope, scope), scope === 'teacher' ? eq(conceptVideos.createdBy, a.userId) : undefined);
    const current = await tx.select({ id: conceptVideos.id }).from(conceptVideos).where(where);
    const set = new Set(ids);
    if (set.size !== ids.length || set.size !== current.length || current.some((c) => !set.has(c.id))) throw new BadRequestException("List each of the topic's videos once");
    for (const [i, id] of ids.entries()) await tx.update(conceptVideos).set({ position: i + 1 }).where(eq(conceptVideos.id, id));
    return this.managed(tx, where);
  }

  /** The teacher asks for their video to be shown to the whole institution. */
  async requestShare(tx: Tx, tenantId: string, a: VideoActor, id: string): Promise<ManagedConceptVideo> {
    const [v] = await tx.select().from(conceptVideos).where(and(eq(conceptVideos.id, id), eq(conceptVideos.scope, 'teacher')));
    if (!v) throw new NotFoundException('Video not found');
    if (v.createdBy !== a.userId) throw new ForbiddenException("This is another teacher's video");
    if (v.shareStatus === 'pending' || v.shareStatus === 'approved') throw new ConflictException(v.shareStatus === 'pending' ? 'Already waiting for approval' : 'Already shared with the institution');
    await tx.update(conceptVideos).set({ shareStatus: 'pending', reviewReason: null, reviewedBy: null, reviewedAt: null }).where(eq(conceptVideos.id, id));
    await audit(tx, { tenantId, actorType: 'user', actorId: a.userId, action: 'concept_video.share_requested', subjectType: 'topic', subjectId: v.topicId, data: { videoId: id } });
    return (await this.managed(tx, eq(conceptVideos.id, id)))[0];
  }

  /** An admin approves (shown to the whole institution) or rejects (with a reason) a pending request. */
  async review(tx: Tx, tenantId: string, a: VideoActor, id: string, decision: 'approved' | 'rejected', reason?: string): Promise<ManagedConceptVideo> {
    if (!a.admin) throw new ForbiddenException('Only the principal or an admin can review videos');
    const [v] = await tx.select().from(conceptVideos).where(and(eq(conceptVideos.id, id), eq(conceptVideos.scope, 'teacher')));
    if (!v) throw new NotFoundException('Video not found');
    if (v.shareStatus !== 'pending') throw new ConflictException('This video is not waiting for approval');
    await tx.update(conceptVideos).set({ shareStatus: decision, reviewReason: reason ?? null, reviewedBy: a.userId, reviewedAt: new Date() }).where(eq(conceptVideos.id, id));
    await audit(tx, { tenantId, actorType: 'user', actorId: a.userId, action: `concept_video.share_${decision}`, subjectType: 'topic', subjectId: v.topicId, data: { videoId: id, reason } });
    return (await this.managed(tx, eq(conceptVideos.id, id)))[0];
  }
}
