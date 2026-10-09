import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { ParentVisibilityService } from '../parent/parent-visibility.js';
import { DbService, type Tx } from '../db/db.service.js';
import { diaryAcks, diaryEntries, sections, students, subjects, users } from '../db/schema.js';
import { DIARY_WRITERS, SchoolLifeService } from './school-life.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20');
const EntryBody = z
  .object({
    sectionId: z.uuid(),
    subjectId: z.uuid().optional(),
    entryDate: Day.optional(),
    classwork: z.string().trim().max(3000).default(''),
    homeworkNote: z.string().trim().max(3000).default(''),
    notice: z.string().trim().max(3000).default(''),
  })
  .refine((b) => b.classwork || b.homeworkNote || b.notice, { message: 'Write classwork, a homework note or a notice' });
type Entry = z.infer<typeof EntryBody>;

/** Creates diary entries and tells the section's families; shared by the ERP and Teacher App routes. */
@Injectable()
export class DiaryService {
  constructor(private readonly svc: SchoolLifeService) {}

  async create(tx: Tx, p: UserPrincipal, b: Entry) {
    await this.svc.assertCanActFor(tx, p, b.sectionId);
    if (b.subjectId) {
      const [s] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId));
      if (!s) throw new NotFoundException('Subject not found');
    }
    const [row] = await tx
      .insert(diaryEntries)
      .values({ tenantId: p.tenantId, sectionId: b.sectionId, subjectId: b.subjectId ?? null, entryDate: b.entryDate ?? (await this.svc.today(tx)), classwork: b.classwork, homeworkNote: b.homeworkNote, notice: b.notice, authorId: p.userId })
      .returning();
    await auditUser(tx, p, 'diary.entry_created', 'diary_entry', row.id, { sectionId: b.sectionId, date: row.entryDate });
    const families = await this.svc.guardiansOfSection(tx, b.sectionId);
    await this.svc.notify(tx, families, 'homework', 'New diary entry', b.notice || b.homeworkNote || b.classwork, `diary:${row.id}`, { entryId: row.id, sectionId: b.sectionId });
    return row;
  }
}

/** The school diary in the ERP: entries per section and who has read them. */
@Controller('v1/diary')
export class DiaryController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SchoolLifeService,
    private readonly diary: DiaryService,
  ) {}

  @Post()
  @Auth('user', DIARY_WRITERS)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EntryBody)) b: Entry) {
    return this.db.withTenant(p.tenantId, (tx) => this.diary.create(tx, p, b));
  }

  /** A section's entries, newest first, with how many families have acknowledged each. */
  @Get()
  @Auth('user', DIARY_WRITERS)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertCanActFor(tx, p, sectionId);
      const rows = await tx
        .select({ entry: diaryEntries, author: users.fullName, subject: subjects.name, acknowledged: sql<number>`(select count(*)::int from diary_acks a where a.entry_id = diary_entries.id)` })
        .from(diaryEntries)
        .innerJoin(users, eq(users.id, diaryEntries.authorId))
        .leftJoin(subjects, eq(subjects.id, diaryEntries.subjectId))
        .where(and(eq(diaryEntries.sectionId, sectionId), from ? gte(diaryEntries.entryDate, Day.parse(from)) : undefined, to ? lte(diaryEntries.entryDate, Day.parse(to)) : undefined))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
        .limit(200);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(eq(students.sectionId, sectionId));
      return rows.map((r) => ({ ...r.entry, author: r.author, subject: r.subject, acknowledged: r.acknowledged, students: n }));
    });
  }

  /** Every student in the section and whether a guardian has acknowledged the entry. */
  @Get(':id/acknowledgements')
  @Auth('user', DIARY_WRITERS)
  acks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select().from(diaryEntries).where(eq(diaryEntries.id, id));
      if (!e) throw new NotFoundException('Entry not found');
      await this.svc.assertCanActFor(tx, p, e.sectionId);
      return tx
        .select({ studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, acknowledgedAt: diaryAcks.acknowledgedAt })
        .from(students)
        .leftJoin(diaryAcks, and(eq(diaryAcks.studentId, students.id), eq(diaryAcks.entryId, id)))
        .where(eq(students.sectionId, e.sectionId))
        .orderBy(students.rollNo);
    });
  }
}

/** Teacher App: write a diary entry and see the ones you wrote. */
@Controller('v1/teacher/diary')
export class TeacherDiaryController {
  constructor(
    private readonly db: DbService,
    private readonly diary: DiaryService,
  ) {}

  @Post()
  @Auth('user', TEACHING_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(EntryBody)) b: Entry) {
    return this.db.withTenant(p.tenantId, (tx) => this.diary.create(tx, p, b));
  }

  @Get()
  @Auth('user', TEACHING_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ entry: diaryEntries, section: sections.displayName })
        .from(diaryEntries)
        .innerJoin(sections, eq(sections.id, diaryEntries.sectionId))
        .where(eq(diaryEntries.authorId, p.userId))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
        .limit(50)
        .then((rows) => rows.map((r) => ({ ...r.entry, section: r.section }))),
    );
  }
}

/** Parent App: a child's diary and the acknowledgement. */
@Controller('v1/parent/children/:studentId/diary')
export class ParentDiaryController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SchoolLifeService,
    private readonly vis: ParentVisibilityService,
  ) {}

  /** The child's class diary, newest first; each entry says whether a guardian has acknowledged it. */
  @Get()
  @Auth('user', ['guardian'])
  list(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('date') date?: string, @Query('days') days?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const child = await this.svc.guardianChild(tx, p, studentId);
      await this.vis.assert(tx, p, 'diary');
      const since = date ? Day.parse(date) : undefined;
      const limit = Math.min(Math.max(Number(days) || 14, 1), 90);
      const rows = await tx
        .select({ entry: diaryEntries, author: users.fullName, subject: subjects.name, acknowledgedAt: diaryAcks.acknowledgedAt })
        .from(diaryEntries)
        .innerJoin(users, eq(users.id, diaryEntries.authorId))
        .leftJoin(subjects, eq(subjects.id, diaryEntries.subjectId))
        .leftJoin(diaryAcks, and(eq(diaryAcks.entryId, diaryEntries.id), eq(diaryAcks.studentId, studentId)))
        .where(and(eq(diaryEntries.sectionId, child.sectionId), since ? eq(diaryEntries.entryDate, since) : undefined))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
        .limit(since ? 100 : limit * 10);
      return rows.map((r) => ({ ...r.entry, author: r.author, subject: r.subject, acknowledgedAt: r.acknowledgedAt }));
    });
  }

  @Post(':entryId/acknowledge')
  @Auth('user', ['guardian'])
  acknowledge(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Param('entryId', ParseUUIDPipe) entryId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const child = await this.svc.guardianChild(tx, p, studentId);
      await this.vis.assert(tx, p, 'diary');
      const [e] = await tx.select({ id: diaryEntries.id, sectionId: diaryEntries.sectionId }).from(diaryEntries).where(eq(diaryEntries.id, entryId));
      if (!e || e.sectionId !== child.sectionId) throw new NotFoundException('Entry not found');
      const [row] = await tx.insert(diaryAcks).values({ tenantId: p.tenantId, entryId, studentId, guardianUserId: p.userId }).onConflictDoNothing().returning();
      if (row) await auditUser(tx, p, 'diary.acknowledged', 'diary_entry', entryId, { studentId });
      const [ack] = await tx.select().from(diaryAcks).where(and(eq(diaryAcks.entryId, entryId), eq(diaryAcks.studentId, studentId)));
      if (!ack) throw new BadRequestException('Could not record the acknowledgement');
      return { entryId, studentId, acknowledgedAt: ack.acknowledgedAt };
    });
  }
}
