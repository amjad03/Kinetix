var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, ilike, isNotNull, max, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, chapters, courses, curricula, subjects, topics } from '../db/schema.js';
import { ContentService } from './content.service.js';
const EDITORS = [...TEACHING_ROLES, 'tenant_admin'];
const TopicBody = z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(2000).default(''),
    notes: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
    outcomes: z.array(z.string().trim().min(1).max(500)).max(15).default([]),
});
/**
 * The content library for the board's Books panel, the apps and KINETIX AI grounding.
 * Everyone signed in can read it; teaching staff add their institution's own chapters and
 * topics on top of the global library.
 */
let ContentController = class ContentController {
    constructor(db, content) {
        this.db = db;
        this.content = content;
    }
    curricula(p) {
        return this.db.withTenant(p.tenantId, (tx) => tx.select().from(curricula).orderBy(asc(curricula.name)));
    }
    courses(p, curriculum, term) {
        return this.db.withTenant(p.tenantId, (tx) => {
            const conds = [curriculum ? eq(courses.curriculumCode, curriculum) : undefined, term ? eq(courses.term, Number(term)) : undefined];
            return tx
                .select({ id: courses.id, curriculumCode: courses.curriculumCode, code: courses.code, title: courses.title, term: courses.term, reviewed: courses.reviewed })
                .from(courses)
                .where(and(...conds))
                .orderBy(asc(courses.curriculumCode), asc(courses.term), asc(courses.title));
        });
    }
    course(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const outline = await this.content.outline(tx, id);
            if (!outline)
                throw new NotFoundException('Course not found');
            return outline;
        });
    }
    /**
     * The syllabus for a subject: the board's open class (no query) or `?subjectId=`. Returns
     * `null` when the subject is not linked to a course yet.
     */
    syllabus(p, subjectId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            let subject = subjectId;
            if (!subject && p.kind === 'board') {
                const [s] = await tx.select({ subjectId: boardSessions.subjectId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
                subject = s?.subjectId ?? undefined;
            }
            if (!subject)
                return null;
            if (!z.uuid().safeParse(subject).success)
                throw new BadRequestException('Bad subjectId');
            const courseId = await this.content.courseForSubject(tx, subject);
            return courseId ? this.content.outline(tx, courseId) : null;
        });
    }
    topic(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [t] = await tx
                .select({
                id: topics.id,
                title: topics.title,
                summary: topics.summary,
                notes: topics.notes,
                outcomes: topics.outcomes,
                resources: topics.resources,
                own: isNotNull(topics.tenantId).mapWith(Boolean),
                chapter: { id: chapters.id, title: chapters.title },
                course: { id: courses.id, title: courses.title, reviewed: courses.reviewed },
            })
                .from(topics)
                .innerJoin(chapters, eq(chapters.id, topics.chapterId))
                .innerJoin(courses, eq(courses.id, chapters.courseId))
                .where(eq(topics.id, id));
            if (!t)
                throw new NotFoundException('Topic not found');
            return t;
        });
    }
    search(p, q = '', courseId) {
        const term = q.trim();
        if (term.length < 2)
            return [];
        if (courseId && !z.uuid().safeParse(courseId).success)
            throw new BadRequestException('Bad courseId');
        const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        return this.db.withTenant(p.tenantId, (tx) => tx
            .select({ id: topics.id, title: topics.title, summary: topics.summary, chapterTitle: chapters.title, courseId: courses.id, courseTitle: courses.title })
            .from(topics)
            .innerJoin(chapters, eq(chapters.id, topics.chapterId))
            .innerJoin(courses, eq(courses.id, chapters.courseId))
            .where(and(or(ilike(topics.title, like), ilike(topics.summary, like), ilike(chapters.title, like)), courseId ? eq(courses.id, courseId) : undefined))
            .orderBy(asc(courses.title), asc(chapters.position), asc(topics.position))
            .limit(25));
    }
    /** An institution's own chapter, after the global ones. */
    addChapter(p, courseId, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
            if (!course)
                throw new NotFoundException('Course not found');
            const [{ last }] = await tx.select({ last: max(chapters.position) }).from(chapters).where(eq(chapters.courseId, courseId));
            const [c] = await tx.insert(chapters).values({ tenantId: p.tenantId, courseId, position: (last ?? 0) + 1, title: body.title }).returning();
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'content.chapter.create', subjectType: 'chapter', subjectId: c.id });
            return { id: c.id, title: c.title, own: true, topics: [] };
        });
    }
    /** An institution's own topic, in a global chapter or one of its own. */
    addTopic(p, chapterId, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [chapter] = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, chapterId));
            if (!chapter)
                throw new NotFoundException('Chapter not found');
            const [{ last }] = await tx.select({ last: max(topics.position) }).from(topics).where(eq(topics.chapterId, chapterId));
            const [t] = await tx
                .insert(topics)
                .values({ tenantId: p.tenantId, chapterId, position: (last ?? 0) + 1, ...body, createdBy: p.userId })
                .returning();
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'content.topic.create', subjectType: 'topic', subjectId: t.id });
            return { id: t.id, title: t.title, summary: t.summary, notes: t.notes, outcomes: t.outcomes, own: true };
        });
    }
    editTopic(p, id, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            // Row-level security limits updates to the institution's own rows; global topics stay read-only.
            const [t] = await tx.update(topics).set({ ...body, updatedAt: new Date() }).where(eq(topics.id, id)).returning();
            if (!t)
                throw new NotFoundException('Topic not found, or it belongs to the KINETIX library and cannot be edited');
            return { id: t.id, title: t.title, summary: t.summary, notes: t.notes, outcomes: t.outcomes, own: true };
        });
    }
    async deleteTopic(p, id) {
        await this.db.withTenant(p.tenantId, async (tx) => {
            const gone = await tx.delete(topics).where(eq(topics.id, id)).returning({ id: topics.id });
            if (gone.length === 0)
                throw new NotFoundException('Topic not found, or it belongs to the KINETIX library and cannot be deleted');
        });
    }
};
__decorate([
    Get('curricula'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "curricula", null);
__decorate([
    Get('courses'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Query('curriculum')),
    __param(2, Query('term')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "courses", null);
__decorate([
    Get('courses/:id'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "course", null);
__decorate([
    Get('syllabus'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Query('subjectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "syllabus", null);
__decorate([
    Get('topics/:id'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "topic", null);
__decorate([
    Get('search'),
    Auth(['user', 'board']),
    __param(0, CurrentPrincipal()),
    __param(1, Query('q')),
    __param(2, Query('courseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "search", null);
__decorate([
    Post('courses/:id/chapters'),
    Auth('user', EDITORS),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(TopicBody.pick({ title: true })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "addChapter", null);
__decorate([
    Post('chapters/:id/topics'),
    Auth('user', EDITORS),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(TopicBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "addTopic", null);
__decorate([
    Patch('topics/:id'),
    Auth('user', EDITORS),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(TopicBody.partial()))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "editTopic", null);
__decorate([
    Delete('topics/:id'),
    HttpCode(204),
    Auth('user', EDITORS),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deleteTopic", null);
ContentController = __decorate([
    Controller('v1/content'),
    __metadata("design:paramtypes", [DbService,
        ContentService])
], ContentController);
export { ContentController };
/** Linking the institution's subjects to library courses. */
let SubjectCourseController = class SubjectCourseController {
    constructor(db) {
        this.db = db;
    }
    link(p, id, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            if (body.courseId) {
                const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, body.courseId));
                if (!c)
                    throw new NotFoundException('Course not found');
            }
            const [s] = await tx.update(subjects).set({ courseId: body.courseId }).where(eq(subjects.id, id)).returning();
            if (!s)
                throw new NotFoundException('Subject not found');
            return { id: s.id, name: s.name, courseId: s.courseId };
        });
    }
};
__decorate([
    Put(':id/course'),
    Auth('user', STAFF_ADMIN_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(z.object({ courseId: z.uuid().nullable() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SubjectCourseController.prototype, "link", null);
SubjectCourseController = __decorate([
    Controller('v1/admin/subjects'),
    __metadata("design:paramtypes", [DbService])
], SubjectCourseController);
export { SubjectCourseController };
//# sourceMappingURL=content.controller.js.map