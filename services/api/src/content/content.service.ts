import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { cosine, embed } from '../ai/embed.js';
import { licenceAllows } from './licensing.js';
import type { Tx } from '../db/db.service.js';
import { chapters, courses, subjects, topics, type TopicLesson } from '../db/schema.js';

const STOPWORDS = new Set(
  'the and for with from that this what how why are was were into about using use of to in on by an a is it its be as at or explain chapter topic class lesson give write questions question quiz homework'.split(' '),
);

/** How close (cosine of the hashed-trigram vectors) a topic must be to count as a match with no shared keyword. */
export const SEMANTIC_MIN = 0.4;

/** Lower-case words worth matching on: three letters or more, no stop words. */
export function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

export interface GroundingTopic {
  id: string;
  title: string;
  notes: string[];
  lesson: TopicLesson | null;
}

/**
 * The content library: global courses with an institution's own chapters and topics on top.
 * Row-level security shows global rows to everyone and a tenant's rows only to that tenant.
 */
@Injectable()
export class ContentService {
  async courseForSubject(tx: Tx, subjectId: string): Promise<string | null> {
    const [s] = await tx.select({ courseId: subjects.courseId }).from(subjects).where(eq(subjects.id, subjectId));
    return s?.courseId ?? null;
  }

  /** A course with its chapters and topic titles, global first then the institution's own. */
  async outline(tx: Tx, courseId: string) {
    const [course] = await tx.select().from(courses).where(and(eq(courses.id, courseId), licenceAllows('course', courses.id)));
    if (!course) return null;
    const chs = await tx.select().from(chapters).where(eq(chapters.courseId, courseId)).orderBy(sql`${chapters.tenantId} is not null`, asc(chapters.position));
    const tps = chs.length
      ? await tx
          .select({ id: topics.id, chapterId: topics.chapterId, title: topics.title, summary: topics.summary, resources: topics.resources, tenantId: topics.tenantId, position: topics.position })
          .from(topics)
          .where(and(inArray(topics.chapterId, chs.map((c) => c.id)), licenceAllows('topic', topics.id)))
          .orderBy(sql`${topics.tenantId} is not null`, asc(topics.position))
      : [];
    return {
      id: course.id,
      curriculumCode: course.curriculumCode,
      code: course.code,
      title: course.title,
      term: course.term,
      reviewed: course.reviewed,
      chapters: chs.map((c) => ({
        id: c.id,
        title: c.title,
        own: c.tenantId !== null,
        topics: tps.filter((t) => t.chapterId === c.id).map((t) => ({ id: t.id, title: t.title, summary: t.summary, resources: t.resources, own: t.tenantId !== null })),
      })),
    };
  }

  /**
   * The topics of a course that best match a free-text request, for grounding AI answers.
   * Simple keyword overlap on titles, summaries and the lesson's key terms; embeddings replace
   * this once the library is large.
   */
  async matchTopics(tx: Tx, courseId: string, text: string, limit = 2): Promise<GroundingTopic[]> {
    const want = keywords(text);
    if (want.size === 0) return [];
    const rows = await tx
      .select({ id: topics.id, title: topics.title, summary: topics.summary, notes: topics.notes, lesson: topics.lesson, chapter: chapters.title })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .where(eq(chapters.courseId, courseId));
    // Exact keywords first. A topic with none still counts when its title and terms are close in meaning to the request
    // (local hashed-trigram embeddings: "photosynthesise" finds "photosynthesis"); it scores below any keyword hit.
    const query = embed([...want].join(' '));
    return rows
      .map((r) => {
        const text = `${r.title} ${r.chapter} ${r.summary} ${r.lesson?.terms.join(' ') ?? ''}`;
        const have = keywords(text);
        let score = 0;
        for (const w of want) if (have.has(w)) score++;
        if (score === 0 && cosine(query, embed(text)) >= SEMANTIC_MIN) score = 0.5;
        return { r, score };
      })
      .filter((x) => x.score > 0 && x.r.notes.length > 0)
      .sort((a, b) => b.score - a.score)
      // Keep only strong matches: a weak second topic adds noise to the prompt.
      .filter((x, _, all) => x.score * 2 > all[0].score)
      .slice(0, limit)
      .map(({ r }) => ({ id: r.id, title: r.title, notes: r.notes, lesson: r.lesson }));
  }

  async topicsById(tx: Tx, ids: string[]): Promise<GroundingTopic[]> {
    if (ids.length === 0) return [];
    return tx.select({ id: topics.id, title: topics.title, notes: topics.notes, lesson: topics.lesson }).from(topics).where(inArray(topics.id, ids));
  }
}
