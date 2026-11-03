import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { AGAINST_PLAN, TEACHING_DELIVERIES } from '../db/schema-academics-pass.js';
import { boardSessions, topicCoverage } from '../db/schema.js';
import { TeacherService } from '../teacher/teacher.service.js';
import { TeachingLogService } from './teaching-log.service.js';

export const DIARY_WRITE: RoleName[] = ['teacher', 'hod', 'principal', 'tenant_admin'];
export const DIARY_HEADS: RoleName[] = ['hod', 'principal', 'tenant_admin'];

const LogBody = z
  .object({
    slotId: z.uuid().nullable().optional(),
    specialClassId: z.uuid().nullable().optional(),
    date: z.iso.date(),
    topicIds: z.array(z.uuid()).max(30).default([]),
    delivery: z.enum(TEACHING_DELIVERIES).default('lecture'),
    summary: z.string().trim().max(2000).default(''),
    againstPlan: z.enum(AGAINST_PLAN).optional(),
    deviationReason: z.string().trim().max(500).optional(),
    source: z.enum(['erp', 'teacher_app']).default('erp'),
  })
  .refine((b) => !!b.slotId !== !!b.specialClassId, { message: 'Name either the period or the special class', path: ['slotId'] })
  .refine((b) => b.topicIds.length > 0 || b.summary.length > 0, { message: 'Say what was taught: topics or a summary', path: ['summary'] });

const BoardLogBody = z.object({
  topicIds: z.array(z.uuid()).max(30).optional(),
  delivery: z.enum(TEACHING_DELIVERIES).default('lecture'),
  summary: z.string().trim().max(2000).default(''),
});

const ReviewBody = z.object({ remark: z.string().trim().max(500).default('') });
const Uuid = z.uuid();

/**
 * The teaching diary (work-done log): teachers record what each period taught against its lesson plan, from the ERP,
 * the Teacher App or the smart board; topics taught mark syllabus coverage; heads of department review entries and see
 * syllabus completion by class and course with hours taken against hours allotted.
 */
@Controller('v1')
export class TeachingLogController {
  constructor(
    private readonly db: DbService,
    private readonly svc: TeachingLogService,
    private readonly teacher: TeacherService,
  ) {}

  @Post('teaching-log')
  @HttpCode(200)
  @Auth('user', DIARY_WRITE)
  write(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LogBody)) b: z.infer<typeof LogBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.write(tx, p, b));
  }

  /**
   * From the board: the diary entry of the period open on it, today. Topics default to the ones marked taught from
   * this board today.
   */
  @Post('classroom/teaching-log')
  @HttpCode(200)
  @Auth('board')
  fromBoard(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(BoardLogBody)) b: z.infer<typeof BoardLogBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ slotId: boardSessions.timetableSlotId, sectionId: boardSessions.sectionId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
      if (!s?.slotId) throw new BadRequestException('Open the current period on the board first');
      const today = await this.svc.today(tx);
      const topicIds = b.topicIds ?? (await tx.select({ id: topicCoverage.topicId }).from(topicCoverage).where(and(eq(topicCoverage.boardSessionId, p.sessionId), eq(topicCoverage.coveredOn, today)))).map((r) => r.id);
      if (!topicIds.length && !b.summary) throw new BadRequestException('Mark the topics taught, or write what was done');
      return this.svc.write(tx, { tenantId: p.tenantId, userId: p.teacherId, roles: ['teacher'], deviceId: p.deviceId }, { slotId: s.slotId, date: today, topicIds, delivery: b.delivery, summary: b.summary, source: 'board', boardSessionId: p.sessionId });
    });
  }

  /** A class's register for one course: plan against actual, hours, coverage and the periods still to log. */
  @Get('teaching-log/register')
  @Auth('user', [...DIARY_WRITE, 'exam_controller'])
  register(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('subjectId') subjectId?: string) {
    if (!Uuid.safeParse(sectionId).success || !Uuid.safeParse(subjectId).success) throw new BadRequestException('Choose a class and a course');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mayRead = this.svc.isAdmin(p) || p.roles.includes('exam_controller') || (await this.teacher.teachesSection(tx, p.userId, sectionId!)) || (await this.svc.headed(tx, p.userId)).has(subjectId!);
      if (!mayRead) throw new ForbiddenException('You do not teach this class');
      return this.svc.register(tx, sectionId!, subjectId!);
    });
  }

  /** Syllabus completion by class and course (a head sees their departments, a teacher their own classes). */
  @Get('teaching-log/completion')
  @Auth('user', [...DIARY_WRITE, 'exam_controller'])
  completion(@CurrentPrincipal() p: UserPrincipal, @Query('departmentId') departmentId?: string, @Query('sectionId') sectionId?: string) {
    for (const v of [departmentId, sectionId]) if (v && !Uuid.safeParse(v).success) throw new BadRequestException('Unknown filter');
    return this.db.withTenant(p.tenantId, (tx) => this.svc.completion(tx, p.roles.includes('exam_controller') ? { ...p, roles: [...p.roles, 'principal'] } : p, { departmentId, sectionId }));
  }

  /** The signed-in teacher's periods of the last two weeks without a diary entry. */
  @Get('teaching-log/pending')
  @Auth('user', DIARY_WRITE)
  pending(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.pending(tx, p.userId));
  }

  @Post('teaching-log/:id/review')
  @HttpCode(200)
  @Auth('user', DIARY_HEADS)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.review(tx, p, id, b.remark));
  }

  /** Bulk review of entries (the HOD's weekly sign-off). */
  @Post('teaching-log/review')
  @HttpCode(200)
  @Auth('user', DIARY_HEADS)
  reviewMany(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ ids: z.array(z.uuid()).min(1).max(200), remark: z.string().trim().max(500).default('') }))) b: { ids: string[]; remark: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const done: string[] = [];
      const refused: { id: string; reason: string }[] = [];
      for (const id of b.ids) {
        try {
          await tx.transaction(async (sp) => {
            await this.svc.review(sp, p, id, b.remark);
          });
          done.push(id);
        } catch (e) {
          refused.push({ id, reason: (e as Error).message });
        }
      }
      return { reviewed: done.length, refused };
    });
  }
}
