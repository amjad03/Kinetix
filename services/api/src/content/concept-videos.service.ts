import { Injectable } from '@nestjs/common';
import type { ConceptVideo, Language, PeriodConceptVideos, PeriodTopicSource } from '@kinetix/shared';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { chapters, conceptVideos, courses, lessonPlans, sections, subjects, timetableSlots, topics } from '../db/schema.js';
import { nextUntaughtTopicId, yearPlanTopicIds } from '../plans/suggest.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

export const LANGUAGES: readonly Language[] = ['en', 'hi', 'kn'];

/** The class's language first, then English, then the others; the platform team's order within each. */
export function byLanguage<T extends { language: Language; position: number }>(videos: T[], preferred: Language): T[] {
  const rank = (l: Language) => (l === preferred ? 0 : l === 'en' ? 1 : 2 + LANGUAGES.indexOf(l));
  return [...videos].sort((a, b) => rank(a.language) - rank(b.language) || a.position - b.position);
}

const videoColumns = {
  id: conceptVideos.id,
  topicId: conceptVideos.topicId,
  youtubeVideoId: conceptVideos.youtubeVideoId,
  title: conceptVideos.title,
  language: conceptVideos.language,
  durationSeconds: conceptVideos.durationSeconds,
  channelTitle: conceptVideos.channelTitle,
  position: conceptVideos.position,
};

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
  ) {}

  /** Videos of the topics, in topic order, each topic's videos in language order. */
  async forTopics(tx: Tx, topicIds: string[], preferred: Language): Promise<ConceptVideo[]> {
    if (topicIds.length === 0) return [];
    const rows = (await tx.select(videoColumns).from(conceptVideos).where(inArray(conceptVideos.topicId, topicIds))) as ConceptVideo[];
    return topicIds.flatMap((id) => byLanguage(rows.filter((r) => r.topicId === id), preferred));
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
}
