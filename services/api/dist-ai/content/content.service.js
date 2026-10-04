var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { chapters, courses, subjects, topics } from '../db/schema.js';
const STOPWORDS = new Set('the and for with from that this what how why are was were into about using use of to in on by an a is it its be as at or explain chapter topic class lesson give write questions question quiz homework'.split(' '));
/** Lower-case words worth matching on: three letters or more, no stop words. */
export function keywords(text) {
    return new Set(text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
        .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)));
}
/**
 * The content library: global courses with an institution's own chapters and topics on top.
 * Row-level security shows global rows to everyone and a tenant's rows only to that tenant.
 */
let ContentService = class ContentService {
    async courseForSubject(tx, subjectId) {
        const [s] = await tx.select({ courseId: subjects.courseId }).from(subjects).where(eq(subjects.id, subjectId));
        return s?.courseId ?? null;
    }
    /** A course with its chapters and topic titles, global first then the institution's own. */
    async outline(tx, courseId) {
        const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
        if (!course)
            return null;
        const chs = await tx.select().from(chapters).where(eq(chapters.courseId, courseId)).orderBy(sql `${chapters.tenantId} is not null`, asc(chapters.position));
        const tps = chs.length
            ? await tx
                .select({ id: topics.id, chapterId: topics.chapterId, title: topics.title, summary: topics.summary, tenantId: topics.tenantId, position: topics.position })
                .from(topics)
                .where(inArray(topics.chapterId, chs.map((c) => c.id)))
                .orderBy(sql `${topics.tenantId} is not null`, asc(topics.position))
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
                topics: tps.filter((t) => t.chapterId === c.id).map((t) => ({ id: t.id, title: t.title, summary: t.summary, own: t.tenantId !== null })),
            })),
        };
    }
    /**
     * The topics of a course that best match a free-text request, for grounding AI answers.
     * Simple keyword overlap on titles and summaries; embeddings replace this once the library
     * is large.
     */
    async matchTopics(tx, courseId, text, limit = 2) {
        const want = keywords(text);
        if (want.size === 0)
            return [];
        const rows = await tx
            .select({ id: topics.id, title: topics.title, summary: topics.summary, notes: topics.notes, chapter: chapters.title })
            .from(topics)
            .innerJoin(chapters, eq(chapters.id, topics.chapterId))
            .where(eq(chapters.courseId, courseId));
        return rows
            .map((r) => {
            const have = keywords(`${r.title} ${r.chapter} ${r.summary}`);
            let score = 0;
            for (const w of want)
                if (have.has(w))
                    score++;
            return { r, score };
        })
            .filter((x) => x.score > 0 && x.r.notes.length > 0)
            .sort((a, b) => b.score - a.score)
            // Keep only strong matches: a weak second topic adds noise to the prompt.
            .filter((x, _, all) => x.score * 2 > all[0].score)
            .slice(0, limit)
            .map(({ r }) => ({ id: r.id, title: r.title, notes: r.notes }));
    }
    async topicsById(tx, ids) {
        if (ids.length === 0)
            return [];
        return tx.select({ id: topics.id, title: topics.title, notes: topics.notes }).from(topics).where(inArray(topics.id, ids));
    }
};
ContentService = __decorate([
    Injectable()
], ContentService);
export { ContentService };
//# sourceMappingURL=content.service.js.map