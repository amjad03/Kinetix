import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { consentWithdrawn } from '../consent/consent.controller.js';
import { DbService } from '../db/db.service.js';
import { aiUsage, boardSessions, students } from '../db/schema.js';
import { AiService, type AiCaller } from './ai.service.js';
import { examFrequency } from './past-exams.js';
import { TaskInputs, type TaskName } from './tasks.js';

/** Optional class context for app callers; the board takes it from its session. */
const Context = z.object({ sectionId: z.uuid().optional(), subjectId: z.uuid().optional(), topicId: z.uuid().optional(), fresh: z.boolean().default(false) });

const Bodies = {
  explain: TaskInputs.explain.extend(Context.shape),
  quiz: TaskInputs.quiz.extend(Context.shape),
  homework: TaskInputs.homework.extend(Context.shape),
  lessonPlan: TaskInputs.lessonPlan.extend(Context.shape),
  readBoard: TaskInputs.readBoard.extend(Context.shape),
  boardSummary: TaskInputs.boardSummary.extend(Context.shape),
  lecture: TaskInputs.lecture.extend(Context.shape),
  selectAsk: TaskInputs.selectAsk.extend(Context.shape),
};

const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

/**
 * KINETIX AI for the board and the apps. Teachers get every task; students may ask for
 * explanations (self-paced learning). Generated quizzes and homework are drafts: they reach
 * students only when the teacher sends them.
 */
@Controller('v1/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly db: DbService,
  ) {}

  @Post('explain')
  @HttpCode(200)
  @Auth(['board', 'user'], [...STAFF, 'student'])
  explain(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.explain)) body: z.infer<typeof Bodies.explain>) {
    return this.run(p, 'explain', body);
  }

  @Post('quiz')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  async quiz(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.quiz)) body: z.infer<typeof Bodies.quiz>) {
    const res = await this.run(p, 'quiz', body);
    if (!('result' in res) || !res.result) return res;
    // Exam frequency only from the institution's past-exam question bank (spec §43: never invented).
    const subjectId = await this.subjectOf(p, body.subjectId);
    const freq = await this.db.withTenant(p.tenantId, (tx) => examFrequency(tx, res.result.questions.map((q) => q.question), subjectId));
    return { ...res, result: { ...res.result, questions: res.result.questions.map((q, i) => ({ ...q, ...freq[i] })) } };
  }

  /** Summary AI (spec §41): from the board's pages (read text) or a topic. */
  @Post('board-summary')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  boardSummary(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.boardSummary)) body: z.infer<typeof Bodies.boardSummary>) {
    return this.run(p, 'boardSummary', body);
  }

  /** Lecture AI (spec §42). */
  @Post('lecture')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  lecture(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.lecture)) body: z.infer<typeof Bodies.lecture>) {
    return this.run(p, 'lecture', body);
  }

  /** Select & Ask (spec §39): explain, simplify, solve, translate… what the teacher selected. */
  @Post('select-ask')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  selectAsk(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.selectAsk)) body: z.infer<typeof Bodies.selectAsk>) {
    return this.run(p, 'selectAsk', body);
  }

  private async subjectOf(p: BoardPrincipal | UserPrincipal, given?: string): Promise<string | undefined> {
    if (p.kind !== 'board') return given;
    const [s] = await this.db.withTenant(p.tenantId, (tx) => tx.select({ subjectId: boardSessions.subjectId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId)));
    return s?.subjectId ?? undefined;
  }

  @Post('homework')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  homework(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.homework)) body: z.infer<typeof Bodies.homework>) {
    return this.run(p, 'homework', body);
  }

  @Post('lesson-plan')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  lessonPlan(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.lessonPlan)) body: z.infer<typeof Bodies.lessonPlan>) {
    return this.run(p, 'lessonPlan', body);
  }

  /** Reads the handwriting on a board page (sent as a PNG). Needs a vision model on the AI server. */
  @Post('read-board')
  @HttpCode(200)
  @Auth(['board', 'user'], STAFF)
  readBoard(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(Bodies.readBoard)) body: z.infer<typeof Bodies.readBoard>) {
    return this.run(p, 'readBoard', body);
  }

  /** Last 30 days of AI use for the institution, by task and outcome. */
  @Get('usage')
  @Auth('user', STAFF_ADMIN_ROLES)
  usage(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          task: aiUsage.task,
          outcome: aiUsage.outcome,
          requests: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, sql`now() - interval '30 days'`))
        .groupBy(aiUsage.task, aiUsage.outcome);
      return { days: 30, rows };
    });
  }

  private async run<T extends TaskName>(p: BoardPrincipal | UserPrincipal, task: T, body: z.infer<(typeof Bodies)[keyof typeof Bodies]>) {
    const { sectionId, subjectId, topicId, fresh, ...input } = body;
    const caller: AiCaller = { tenantId: p.tenantId, topicId };
    if (p.kind === 'board') {
      caller.deviceId = p.deviceId;
      caller.userId = p.teacherId;
      const [session] = await this.db.withTenant(p.tenantId, (tx) =>
        tx.select({ sectionId: boardSessions.sectionId, subjectId: boardSessions.subjectId }).from(boardSessions).where(and(eq(boardSessions.id, p.sessionId))),
      );
      caller.sectionId = session?.sectionId;
      caller.subjectId = session?.subjectId;
    } else {
      if (task !== 'explain' && !p.roles.some((r) => STAFF.includes(r))) throw new ForbiddenException();
      if (!p.roles.some((r) => STAFF.includes(r))) {
        // A student whose family (or who, as an adult) withdrew consent for AI features.
        const withdrawn = await this.db.withTenant(p.tenantId, async (tx) => {
          const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
          return me ? consentWithdrawn(tx, me.id, 'ai_features') : false;
        });
        if (withdrawn) throw new ForbiddenException({ message: 'KINETIX AI is turned off for this student (consent was withdrawn)', code: 'CONSENT_WITHDRAWN' });
      }
      caller.userId = p.userId;
      caller.sectionId = sectionId;
      caller.subjectId = subjectId;
    }
    return this.ai.run(caller, task, input as never, { fresh });
  }
}
