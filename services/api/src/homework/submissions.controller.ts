import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { and, asc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, zonedToInstant } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, homework, homeworkSubmissions, students, type SubmissionFile, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { addDays, isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** The parts of a multer file this controller uses. */
interface Upload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ReviewBody = z.object({ status: z.enum(['checked', 'returned']), remark: z.string().trim().max(500).optional() });

/**
 * Homework submissions: a student (or, for a child without a login, a guardian) hands in text
 * and up to five photos or PDFs; the teacher checks the work or returns it to be redone, and
 * the student and family are told.
 */
@Controller('v1/homework/:id/submissions')
export class SubmissionsController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
    private readonly timetable: TimetableService,
    private readonly storage: ObjectStorage,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** Hands in (or replaces) the work. Multipart: `text` and up to five `files`. */
  @Post(':studentId')
  @HttpCode(200)
  @Auth('user', ['student', 'guardian'])
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } }))
  async submit(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: { text?: unknown },
    @UploadedFiles() uploads: Upload[] = [],
  ) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text.length > 5000) throw new BadRequestException('The answer is too long (5,000 characters at most)');
    if (!text && uploads.length === 0) throw new BadRequestException('Write an answer or add a photo');
    for (const f of uploads) if (!FILE_TYPES.includes(f.mimetype)) throw new BadRequestException(`"${f.originalname}" is not a photo or PDF`);

    const hw = await this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.homeworkFor(tx, p, id, studentId);
      const [prev] = await tx.select().from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, studentId)));
      if (prev?.status === 'checked') throw new BadRequestException('This homework has already been checked');
      return { ...hw, previous: prev?.files ?? [] };
    });

    // Files first (outside the transaction), then the row; old files beyond the new count are removed.
    const files: SubmissionFile[] = [];
    for (const [i, f] of uploads.entries()) {
      const key = `tenants/${p.tenantId}/homework/${id}/students/${studentId}/${i}`;
      await this.storage.put(key, Readable.from(f.buffer), MAX_FILE_BYTES, f.mimetype);
      files.push({ key, name: f.originalname.slice(0, 200), mime: f.mimetype, bytes: f.size });
    }
    for (const old of hw.previous.slice(files.length)) await this.storage.delete(old.key).catch(() => undefined);

    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = this.clock.now();
      const v = { text, files, status: 'submitted' as const, submittedBy: p.userId, submittedAt: now, remark: null, checkedBy: null, checkedAt: null };
      await tx
        .insert(homeworkSubmissions)
        .values({ tenantId: p.tenantId, homeworkId: id, studentId, ...v })
        .onConflictDoUpdate({ target: [homeworkSubmissions.homeworkId, homeworkSubmissions.studentId], set: v });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.submitted', subjectType: 'homework', subjectId: id, data: { studentId, files: files.length } });
      return this.one(tx, id, studentId, hw.dueEnd);
    });
  }

  /** One student's submission (the student, their family, or staff who teach the class). */
  @Get(':studentId')
  @Auth('user')
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.homeworkFor(tx, p, id, studentId, true);
      return this.one(tx, id, studentId, hw.dueEnd);
    });
  }

  /** The class list with who has handed in (staff who teach the class). */
  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staffHomework(tx, p, id);
      const rows = await tx
        .select({
          studentId: students.id,
          fullName: students.fullName,
          rollNo: students.rollNo,
          status: homeworkSubmissions.status,
          submittedAt: homeworkSubmissions.submittedAt,
          text: homeworkSubmissions.text,
          files: homeworkSubmissions.files,
          remark: homeworkSubmissions.remark,
          checkedAt: homeworkSubmissions.checkedAt,
          checkedBy: users.fullName,
        })
        .from(students)
        .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.studentId, students.id), eq(homeworkSubmissions.homeworkId, id)))
        .leftJoin(users, eq(users.id, homeworkSubmissions.checkedBy))
        .where(and(eq(students.sectionId, hw.sectionId), eq(students.status, 'active')))
        .orderBy(asc(students.rollNo));
      const out = rows.map((r) => ({ ...r, files: (r.files ?? []).map(publicFile), late: r.submittedAt ? r.submittedAt > hw.dueEnd : false }));
      const count = (s: string | null) => out.filter((r) => r.status === s).length;
      return { homeworkId: id, dueOn: hw.dueOn, counts: { students: out.length, submitted: count('submitted'), checked: count('checked'), returned: count('returned'), missing: count(null) }, students: out };
    });
  }

  /** A file from a submission. */
  @Get(':studentId/files/:index')
  @Auth('user')
  async file(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const f = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.homeworkFor(tx, p, id, studentId, true);
      const [s] = await tx.select({ files: homeworkSubmissions.files }).from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, studentId)));
      const f = s?.files[index];
      if (!f) throw new NotFoundException('File not found');
      return f;
    });
    const { stream, size } = await this.storage.get(f.key);
    res.setHeader('content-type', f.mime);
    res.setHeader('content-length', size);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    stream.pipe(res);
  }

  /** The teacher checks the work, or returns it to be redone (with a remark). */
  @Post(':studentId/review')
  @HttpCode(200)
  @Auth('user')
  review(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staffHomework(tx, p, id);
      const [s] = await tx
        .update(homeworkSubmissions)
        .set({ status: b.status, remark: b.remark || null, checkedBy: p.userId, checkedAt: this.clock.now() })
        .where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, studentId)))
        .returning();
      if (!s) throw new NotFoundException('Nothing has been handed in yet');
      const [st] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, studentId));
      await this.notifications.homeworkReviewed(tx, { homeworkId: id, studentId, studentName: st.fullName, title: hw.title, status: b.status, remark: b.remark || null });
      return this.one(tx, id, studentId, hw.dueEnd);
    });
  }

  private async one(tx: Tx, id: string, studentId: string, dueEnd: Date) {
    const [s] = await tx
      .select({ submission: homeworkSubmissions, checkedBy: users.fullName })
      .from(homeworkSubmissions)
      .leftJoin(users, eq(users.id, homeworkSubmissions.checkedBy))
      .where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, studentId)));
    if (!s) return { homeworkId: id, studentId, status: null };
    const x = s.submission;
    return {
      homeworkId: id,
      studentId,
      status: x.status,
      text: x.text,
      files: x.files.map(publicFile),
      submittedAt: x.submittedAt,
      late: x.submittedAt > dueEnd,
      remark: x.remark,
      checkedBy: s.checkedBy,
      checkedAt: x.checkedAt,
    };
  }

  /** The homework, if [p] is the student, their guardian, or (when [staffToo]) staff who teach the class. */
  private async homeworkFor(tx: Tx, p: UserPrincipal, id: string, studentId: string, staffToo = false) {
    const hw = await this.load(tx, id);
    const [st] = await tx.select({ sectionId: students.sectionId, userId: students.userId }).from(students).where(eq(students.id, studentId));
    const notFound = new NotFoundException('Homework not found');
    if (!st || st.sectionId !== hw.sectionId) throw notFound;
    if (st.userId === p.userId) return hw;
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
    if (g) return hw;
    if (staffToo && (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, hw.sectionId)))) return hw;
    throw notFound;
  }

  private async staffHomework(tx: Tx, p: UserPrincipal, id: string) {
    const hw = await this.load(tx, id);
    if (isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, hw.sectionId))) return hw;
    throw new ForbiddenException('You do not teach this class');
  }

  private async load(tx: Tx, id: string) {
    const [hw] = await tx.select({ id: homework.id, sectionId: homework.sectionId, title: homework.title, dueOn: homework.dueOn }).from(homework).where(eq(homework.id, id));
    if (!hw) throw new NotFoundException('Homework not found');
    // Late = handed in after the due date has ended in the institution's timezone.
    const dueEnd = zonedToInstant(addDays(hw.dueOn, 1), '00:00:00', await this.timetable.tenantTimezone(tx));
    return { ...hw, dueEnd };
  }
}

/** Storage keys stay on the server. */
function publicFile(f: SubmissionFile, index: number) {
  return { index, name: f.name, mime: f.mime, bytes: f.bytes };
}

