import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { aiActions, aiEvalCases, aiEvalRuns, users } from '../db/schema.js';
import { AiService } from './ai.service.js';
import { allText } from './safety.js';
import { PROMPT_VERSION, TaskInputs } from './tasks.js';

const AI_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const EVAL_TASKS = ['explain', 'tutor'] as const;
const CaseBody = z.object({
  name: z.string().trim().min(3).max(120),
  task: z.enum(EVAL_TASKS),
  input: z.record(z.string(), z.unknown()),
  mustInclude: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  mustNotInclude: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  maxChars: z.number().int().min(50).max(20_000).optional(),
});

/** Whether an answer meets a case's checks. Pure so the rules can be tested without a model. */
export function judge(answer: string, c: { mustInclude: string[]; mustNotInclude: string[]; maxChars: number | null }): string[] {
  const text = answer.toLowerCase();
  const failures: string[] = [];
  for (const w of c.mustInclude) if (!text.includes(w.toLowerCase())) failures.push(`Missing "${w}"`);
  for (const w of c.mustNotInclude) if (text.includes(w.toLowerCase())) failures.push(`Contains "${w}"`);
  if (c.maxChars && answer.length > c.maxChars) failures.push(`Longer than ${c.maxChars} characters (${answer.length})`);
  return failures;
}

/** The AI action audit (who asked what, grounded in what, kept or not) and the evaluation harness (PRD sections 64, 70). */
@Controller('v1/ai/admin')
export class AiAdminController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiService,
  ) {}

  @Get('actions')
  @Auth('user', AI_ADMIN)
  actions(@CurrentPrincipal() p: UserPrincipal, @Query('task') task?: string, @Query('surface') surface?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const where = [task ? eq(aiActions.task, task) : undefined, surface ? eq(aiActions.surface, surface) : undefined].filter((x) => x !== undefined);
      const rows = await tx
        .select({ a: aiActions, user: users.fullName })
        .from(aiActions)
        .leftJoin(users, eq(users.id, aiActions.userId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(aiActions.createdAt))
        .limit(200);
      return rows.map((r) => ({ ...r.a, user: r.user }));
    });
  }

  /** Counts by surface and by what people did with the answer. */
  @Get('actions/summary')
  @Auth('user', AI_ADMIN)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bySurface = await tx.select({ surface: aiActions.surface, n: sql<number>`count(*)::int` }).from(aiActions).groupBy(aiActions.surface);
      const byDecision = await tx.select({ decision: sql<string>`coalesce(${aiActions.decision}, 'undecided')`, n: sql<number>`count(*)::int` }).from(aiActions).groupBy(sql`coalesce(${aiActions.decision}, 'undecided')`);
      return { bySurface, byDecision };
    });
  }

  @Get('evals/cases')
  @Auth('user', AI_ADMIN)
  cases(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(aiEvalCases).orderBy(aiEvalCases.name));
  }

  @Post('evals/cases')
  @Auth('user', AI_ADMIN)
  addCase(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CaseBody)) b: z.infer<typeof CaseBody>) {
    const parsed = TaskInputs[b.task].safeParse(b.input);
    if (!parsed.success) throw new BadRequestException(`The input does not fit the ${b.task} task`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(aiEvalCases).values({ ...b, tenantId: p.tenantId, maxChars: b.maxChars ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'ai.eval_case_added', subjectType: 'ai_eval_case', subjectId: row.id, data: { name: b.name, task: b.task } });
      return row;
    });
  }

  @Delete('evals/cases/:id')
  @HttpCode(204)
  @Auth('user', AI_ADMIN)
  removeCase(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.delete(aiEvalCases).where(eq(aiEvalCases.id, id));
    });
  }

  /** Runs every active case through the live model (or the preview when none is connected) and scores the answers. */
  @Post('evals/run')
  @HttpCode(200)
  @Auth('user', AI_ADMIN)
  async run(@CurrentPrincipal() p: UserPrincipal) {
    const cases = await this.db.withTenant(p.tenantId, (tx) => tx.select().from(aiEvalCases).where(eq(aiEvalCases.active, true)).orderBy(aiEvalCases.name));
    if (!cases.length) throw new NotFoundException('Add at least one evaluation case first');
    const results: { caseId: string; name: string; passed: boolean; failures: string[]; chars: number }[] = [];
    let provider = '';
    let model = '';
    for (const c of cases) {
      try {
        const input = TaskInputs[c.task as (typeof EVAL_TASKS)[number]].parse(c.input);
        const out = await this.ai.run({ tenantId: p.tenantId, userId: p.userId }, c.task as 'explain', input as never, { fresh: true });
        provider = out.meta.provider;
        model = out.meta.model;
        const text = allText(out.result);
        const failures = judge(text, c);
        results.push({ caseId: c.id, name: c.name, passed: failures.length === 0, failures, chars: text.length });
      } catch (e) {
        results.push({ caseId: c.id, name: c.name, passed: false, failures: [`The model call failed: ${(e as Error).message.slice(0, 160)}`], chars: 0 });
      }
    }
    const passed = results.filter((r) => r.passed).length;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [run] = await tx.insert(aiEvalRuns).values({ tenantId: p.tenantId, startedBy: p.userId, provider, model, promptVersion: PROMPT_VERSION, passed, failed: results.length - passed, results }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'ai.eval_run', subjectType: 'ai_eval_run', subjectId: run.id, data: { passed, failed: results.length - passed, provider, model } });
      return run;
    });
  }

  @Get('evals/runs')
  @Auth('user', AI_ADMIN)
  runs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(aiEvalRuns).orderBy(desc(aiEvalRuns.createdAt)).limit(30));
  }
}
