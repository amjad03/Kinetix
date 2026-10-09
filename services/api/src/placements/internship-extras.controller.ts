import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { certificates, courseOutcomes, internships, skills, students, subjects } from '../db/schema.js';
import { internshipAttendance, internshipCertificates, internshipLinks } from '../db/schema-pathways.js';
import { InternshipExtrasService } from './internship-extras.service.js';
import { MENTOR_ROLES, PLACEMENT_ROLES, found, hasRole } from './placements.access.js';

const AttendanceBody = z.object({ onDate: Day, present: z.boolean().default(true), hours: z.number().min(0).max(16).default(8), note: z.string().trim().max(300).default('') });
const LinkBody = z.object({ kind: z.enum(['skill', 'course', 'course_outcome']), refId: z.uuid(), note: z.string().trim().max(300).default('') });
const CertBody = z.object({ waiveAttendance: z.boolean().default(false) });
const STUDENT_AND_STAFF = [...MENTOR_ROLES, 'student' as const];

/** Internship attendance, what the internship counts towards (skills, courses, outcomes) and the completion certificate. */
@Controller('v1/placements/internships')
export class InternshipExtrasController {
  constructor(
    private readonly db: DbService,
    private readonly extras: InternshipExtrasService,
  ) {}

  /** The internship if the caller is its student, its mentor or placement staff; `write` also lets the student in only for attendance. */
  private async access(tx: Tx, p: UserPrincipal, id: string, mode: 'read' | 'staff' | 'attendance') {
    const i = found((await tx.select().from(internships).where(eq(internships.id, id)))[0], 'Internship');
    const staff = hasRole(p, PLACEMENT_ROLES) || i.mentorUserId === p.userId;
    if (staff) return i;
    const [own] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, i.studentId), eq(students.userId, p.userId)));
    if (!own) throw new NotFoundException('Internship not found');
    if (mode === 'staff') throw new ForbiddenException('Only the mentor or the placement cell can do this');
    return i;
  }

  @Get(':id/attendance')
  @Auth('user', STUDENT_AND_STAFF)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = await this.access(tx, p, id, 'read');
      const rows = await tx.select().from(internshipAttendance).where(eq(internshipAttendance.internshipId, id)).orderBy(asc(internshipAttendance.onDate));
      return { summary: await this.extras.summary(tx, i), rows };
    });
  }

  /** The intern marks a day, or the mentor does. Marking a day again replaces it. */
  @Post(':id/attendance')
  @HttpCode(200)
  @Auth('user', STUDENT_AND_STAFF)
  mark(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AttendanceBody)) b: z.infer<typeof AttendanceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = await this.access(tx, p, id, 'attendance');
      if (!['approved', 'ongoing', 'completed'].includes(i.status)) throw new ConflictException('Attendance can be marked once the internship is approved');
      if (b.onDate < i.startsOn || b.onDate > i.endsOn) throw new ConflictException('That day is outside the internship');
      const [row] = await tx
        .insert(internshipAttendance)
        .values({ tenantId: p.tenantId, internshipId: id, ...b, hours: b.present ? b.hours : 0, markedBy: p.userId })
        .onConflictDoUpdate({ target: [internshipAttendance.internshipId, internshipAttendance.onDate], set: { present: b.present, hours: b.present ? b.hours : 0, note: b.note, markedBy: p.userId } })
        .returning();
      return { row, summary: await this.extras.summary(tx, i) };
    });
  }

  @Get(':id/links')
  @Auth('user', STUDENT_AND_STAFF)
  links(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.access(tx, p, id, 'read');
      const rows = await tx.select().from(internshipLinks).where(eq(internshipLinks.internshipId, id));
      const out = [];
      for (const r of rows) {
        let label = '';
        if (r.skillId) label = (await tx.select({ n: skills.name }).from(skills).where(eq(skills.id, r.skillId)))[0]?.n ?? '';
        else if (r.subjectId) label = (await tx.select({ n: subjects.name }).from(subjects).where(eq(subjects.id, r.subjectId)))[0]?.n ?? '';
        else if (r.courseOutcomeId) label = (await tx.select({ n: courseOutcomes.code }).from(courseOutcomes).where(eq(courseOutcomes.id, r.courseOutcomeId)))[0]?.n ?? '';
        out.push({ id: r.id, kind: r.kind, label, note: r.note });
      }
      return out;
    });
  }

  @Post(':id/links')
  @Auth('user', MENTOR_ROLES)
  link(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(LinkBody)) b: z.infer<typeof LinkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.access(tx, p, id, 'staff');
      const exists =
        b.kind === 'skill' ? await tx.select({ id: skills.id }).from(skills).where(eq(skills.id, b.refId)) : b.kind === 'course' ? await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.refId)) : await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(eq(courseOutcomes.id, b.refId));
      if (!exists.length) throw new NotFoundException(`${b.kind.replace('_', ' ')} not found`);
      const [dup] = await tx
        .select({ id: internshipLinks.id })
        .from(internshipLinks)
        .where(and(eq(internshipLinks.internshipId, id), eq(internshipLinks.kind, b.kind), b.kind === 'skill' ? eq(internshipLinks.skillId, b.refId) : b.kind === 'course' ? eq(internshipLinks.subjectId, b.refId) : eq(internshipLinks.courseOutcomeId, b.refId)));
      if (dup) throw new ConflictException('Already linked');
      const [row] = await tx
        .insert(internshipLinks)
        .values({ tenantId: p.tenantId, internshipId: id, kind: b.kind, note: b.note, skillId: b.kind === 'skill' ? b.refId : null, subjectId: b.kind === 'course' ? b.refId : null, courseOutcomeId: b.kind === 'course_outcome' ? b.refId : null })
        .returning();
      await auditUser(tx, p, 'internship.linked', 'internship', id, { kind: b.kind, refId: b.refId });
      return row;
    });
  }

  @Delete(':id/links/:linkId')
  @HttpCode(204)
  @Auth('user', MENTOR_ROLES)
  unlink(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.access(tx, p, id, 'staff');
      await tx.delete(internshipLinks).where(and(eq(internshipLinks.id, linkId), eq(internshipLinks.internshipId, id)));
    });
  }

  @Get(':id/certificate')
  @Auth('user', STUDENT_AND_STAFF)
  certificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.access(tx, p, id, 'read');
      const [c] = await tx.select({ certificateId: internshipCertificates.certificateId, serialNo: certificates.serialNo, status: certificates.status }).from(internshipCertificates).innerJoin(certificates, eq(certificates.id, internshipCertificates.certificateId)).where(eq(internshipCertificates.internshipId, id));
      return c ?? { certificateId: null, serialNo: null, status: null };
    });
  }

  /** Issues the completion certificate now (the office can waive the attendance minimum). */
  @Post(':id/certificate')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CertBody)) b: z.infer<typeof CertBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = await this.access(tx, p, id, 'staff');
      if (i.status !== 'completed') throw new ConflictException('The internship must be completed first');
      return this.extras.issueCertificate(tx, p, i, b.waiveAttendance);
    });
  }
}
