import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { sections, subjects, users, whiteboards } from '../db/schema.js';

/** Queries over saved boards shared by the teacher, parent and admin views. */
@Injectable()
export class WhiteboardsService {
  /** Board metadata (no content), joined with class, subject and teacher names. */
  summaries(tx: Tx) {
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

  async summary(tx: Tx, id: string) {
    const [s] = await this.summaries(tx).where(eq(whiteboards.id, id));
    return s;
  }

  /** Boards shared with any of these classes. */
  sharedWith(sectionIds: string[]) {
    return and(inArray(whiteboards.sectionId, sectionIds), isNotNull(whiteboards.sharedAt));
  }
}
