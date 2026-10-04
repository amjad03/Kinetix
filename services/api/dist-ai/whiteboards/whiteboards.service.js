var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { sections, subjects, users, whiteboards } from '../db/schema.js';
/** Queries over saved boards shared by the teacher, parent and admin views. */
let WhiteboardsService = class WhiteboardsService {
    /** Board metadata (no content), joined with class, subject and teacher names. */
    summaries(tx) {
        return tx
            .select({
            id: whiteboards.id,
            title: whiteboards.title,
            pageCount: whiteboards.pageCount,
            sectionId: whiteboards.sectionId,
            sectionName: sections.displayName,
            subjectName: subjects.name,
            teacherName: users.fullName,
            sharedAt: whiteboards.sharedAt,
            createdAt: whiteboards.createdAt,
            updatedAt: whiteboards.updatedAt,
        })
            .from(whiteboards)
            .innerJoin(users, eq(users.id, whiteboards.ownerId))
            .leftJoin(sections, eq(sections.id, whiteboards.sectionId))
            .leftJoin(subjects, eq(subjects.id, whiteboards.subjectId))
            .$dynamic();
    }
    async summary(tx, id) {
        const [s] = await this.summaries(tx).where(eq(whiteboards.id, id));
        return s;
    }
    /** Boards shared with any of these classes. */
    sharedWith(sectionIds) {
        return and(inArray(whiteboards.sectionId, sectionIds), isNotNull(whiteboards.sharedAt));
    }
};
WhiteboardsService = __decorate([
    Injectable()
], WhiteboardsService);
export { WhiteboardsService };
//# sourceMappingURL=whiteboards.service.js.map