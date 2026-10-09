import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { aiActions, aiTutorMessages, aiTutorThreads, guardians, students } from '../db/schema.js';
import { AiService } from './ai.service.js';
import { learningFacts } from './learning-facts.js';
import { Language } from './tasks.js';

const AskBody = z.object({ threadId: z.uuid().optional(), subjectId: z.uuid().optional(), question: z.string().trim().min(2).max(1000), language: Language.default('en') });
const ParentBody = z.object({ language: Language.default('en'), fresh: z.boolean().default(false) });
const DecisionBody = z.object({ decision: z.enum(['accepted', 'edited', 'rejected']) });

/** How many earlier turns the tutor reads each time. */
const HISTORY_TURNS = 6;

/**
 * The student's AI tutor (PRD section 64): a conversation that remembers, and answers pitched by what the student's own
 * record shows. Also the parent assistant, and the decision a person records on any AI answer they were given.
 */
@Controller('v1/ai')
export class TutorController {
  constructor(
    private readonly ai: AiService,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private today() {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private async ownStudent(tx: Tx, p: UserPrincipal) {
    const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
    if (!s) throw new NotFoundException('No student record is linked to this login');
    return s;
  }

  @Post('tutor/ask')
  @HttpCode(200)
  @Auth('user', ['student'])
  async ask(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AskBody)) b: z.infer<typeof AskBody>) {
    const prep = await this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.ownStudent(tx, p);
      let thread = b.threadId ? (await tx.select().from(aiTutorThreads).where(and(eq(aiTutorThreads.id, b.threadId), eq(aiTutorThreads.studentId, me.id))))[0] : undefined;
      if (b.threadId && !thread) throw new NotFoundException('Conversation not found');
      thread ??= (await tx.insert(aiTutorThreads).values({ tenantId: p.tenantId, studentId: me.id, subjectId: b.subjectId ?? null, title: b.question.slice(0, 80) }).returning())[0];
      const earlier = await tx.select().from(aiTutorMessages).where(eq(aiTutorMessages.threadId, thread.id)).orderBy(desc(aiTutorMessages.createdAt)).limit(HISTORY_TURNS);
      const history = earlier.reverse().map((m) => ({ role: m.role as 'student' | 'tutor', text: m.content.slice(0, 1500) }));
      const context = await learningFacts(tx, me.id, this.today());
      return { me, thread, history, context };
    });
    const out = await this.ai.run(
      { tenantId: p.tenantId, userId: p.userId, sectionId: prep.me.sectionId, subjectId: prep.thread.subjectId },
      'tutor',
      { question: b.question, history: prep.history, context: prep.context as unknown as Record<string, unknown>, language: b.language },
      { fresh: true },
    );
    const text = [out.result.answer, ...(out.result.nextSteps.length ? ['', 'Next: ' + out.result.nextSteps.join(' / ')] : [])].join('\n');
    await this.db.withTenant(p.tenantId, async (tx) => {
      await tx.insert(aiTutorMessages).values([
        { tenantId: p.tenantId, threadId: prep.thread.id, role: 'student', content: b.question },
        { tenantId: p.tenantId, threadId: prep.thread.id, role: 'tutor', content: text, sources: out.meta.sources },
      ]);
      await tx.update(aiTutorThreads).set({ updatedAt: this.clock.now() }).where(eq(aiTutorThreads.id, prep.thread.id));
    });
    return { threadId: prep.thread.id, ...out.result, sources: out.meta.sources, preview: out.meta.preview, actionId: out.meta.actionId ?? null, usedRecord: { weakestSubjects: prep.context.weakestSubjects, attendancePercent: prep.context.attendancePercent } };
  }

  @Get('tutor/threads')
  @Auth('user', ['student'])
  threads(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.ownStudent(tx, p);
      return tx.select().from(aiTutorThreads).where(eq(aiTutorThreads.studentId, me.id)).orderBy(desc(aiTutorThreads.updatedAt)).limit(50);
    });
  }

  @Get('tutor/threads/:id')
  @Auth('user', ['student'])
  thread(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.ownStudent(tx, p);
      const [t] = await tx.select().from(aiTutorThreads).where(and(eq(aiTutorThreads.id, id), eq(aiTutorThreads.studentId, me.id)));
      if (!t) throw new NotFoundException('Conversation not found');
      const messages = await tx.select().from(aiTutorMessages).where(eq(aiTutorMessages.threadId, id)).orderBy(asc(aiTutorMessages.createdAt));
      return { ...t, messages };
    });
  }

  @Delete('tutor/threads/:id')
  @HttpCode(204)
  @Auth('user', ['student'])
  removeThread(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.ownStudent(tx, p);
      await tx.delete(aiTutorThreads).where(and(eq(aiTutorThreads.id, id), eq(aiTutorThreads.studentId, me.id)));
    });
  }

  /** A short update for a parent about their own child: marks, attendance, homework, written as "your child". */
  @Post('parent/children/:studentId/insight')
  @HttpCode(200)
  @Auth('user', ['guardian'])
  async parentInsight(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(ParentBody)) b: z.infer<typeof ParentBody>) {
    const facts = await this.db.withTenant(p.tenantId, async (tx) => {
      const [link] = await tx.select({ id: guardians.studentId }).from(guardians).where(and(eq(guardians.userId, p.userId), eq(guardians.studentId, studentId)));
      if (!link) throw new NotFoundException('Child not found');
      const f = await learningFacts(tx, studentId, this.today());
      return { ...f, policies: undefined } as Record<string, unknown>;
    });
    return this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'parentInsight', { facts, language: b.language }, { fresh: b.fresh });
  }

  /** The person says what they did with an AI answer: kept it, edited it or threw it away. */
  @Put('actions/:id/decision')
  @Auth('user')
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(aiActions).set({ decision: b.decision }).where(and(eq(aiActions.id, id), eq(aiActions.userId, p.userId))).returning({ id: aiActions.id, decision: aiActions.decision });
      if (!row) throw new NotFoundException('AI action not found');
      return row;
    });
  }
}
