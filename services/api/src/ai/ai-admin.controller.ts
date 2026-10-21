import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { aiActions, aiEvalCases, aiEvalRuns, aiUsage, devices, tenants, topics, users } from '../db/schema.js';
import { AiService } from './ai.service.js';
import { AiGate } from './gate.js';
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

/** How the dashboard groups AI outcomes: served (answered or cached), rejected (unsafe or over the daily allowance), throttled (peak load) or error. */
export const AI_STATUS = { served: ['ok', 'cached'], rejected: ['blocked', 'quota'], throttled: ['throttled'], error: ['invalid', 'unavailable'] } as const;
export type AiStatus = keyof typeof AI_STATUS;
const statusSql = sql<AiStatus>`case when ${aiUsage.outcome} in ('ok', 'cached') then 'served' when ${aiUsage.outcome} in ('blocked', 'quota') then 'rejected' when ${aiUsage.outcome} = 'throttled' then 'throttled' else 'error' end`;
const UUID = z.uuid();

/** A date (whole day) or date-time; `end` moves a bare date to the next midnight so the day is included. */
function instant(v: string | undefined, name: string, end = false): Date | undefined {
  if (!v) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be a date like 2026-10-21`);
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

interface LogFilters {
  from?: string;
  to?: string;
  status?: string;
  kind?: string;
  userId?: string;
  deviceId?: string;
  topicId?: string;
}

/** The answer-log filters as SQL; the range defaults to the last 7 days. */
function logWhere(q: LogFilters): { where: SQL; from: Date; to: Date } {
  const to = instant(q.to, 'to', true) ?? new Date();
  const from = instant(q.from, 'from') ?? new Date(to.getTime() - 7 * 86400_000);
  if (q.status && !(q.status in AI_STATUS)) throw new BadRequestException('status must be served, rejected, throttled or error');
  for (const [k, v] of [['userId', q.userId], ['deviceId', q.deviceId], ['topicId', q.topicId]] as const) if (v && !UUID.safeParse(v).success) throw new BadRequestException(`Bad ${k}`);
  const conds = [
    gte(aiUsage.createdAt, from),
    lt(aiUsage.createdAt, to),
    q.status ? inArray(aiUsage.outcome, [...AI_STATUS[q.status as AiStatus]]) : undefined,
    q.kind ? sql`${aiUsage.task}::text = ${q.kind}` : undefined,
    q.userId ? eq(aiUsage.userId, q.userId) : undefined,
    q.deviceId ? eq(aiUsage.deviceId, q.deviceId) : undefined,
    q.topicId ? eq(aiUsage.topicId, q.topicId) : undefined,
  ].filter((c) => c !== undefined);
  return { where: and(...conds)!, from, to };
}

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
    private readonly gate: AiGate,
  ) {}

  /**
   * The AI answer log: every request with who asked (user, board), the topic, kind, provider and
   * model, latency, tokens in and out, and whether it was served, rejected, throttled or failed
   * (with the reason). Newest first, paginated. Filters: from, to, status, kind, userId, deviceId, topicId.
   */
  @Get('logs')
  @Auth('user', AI_ADMIN)
  logs(@CurrentPrincipal() p: UserPrincipal, @Query() q: LogFilters & { page?: string; pageSize?: string }) {
    const { where } = logWhere(q);
    const page = Math.max(Number(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(aiUsage).where(where);
      const rows = await tx
        .select({
          id: aiUsage.id,
          at: aiUsage.createdAt,
          kind: aiUsage.task,
          status: statusSql,
          outcome: aiUsage.outcome,
          reason: aiUsage.detail,
          user: { id: users.id, fullName: users.fullName },
          device: { id: devices.id, name: devices.name },
          topic: { id: topics.id, title: topics.title },
          provider: aiUsage.provider,
          model: aiUsage.model,
          latencyMs: aiUsage.latencyMs,
          tokensIn: aiUsage.promptTokens,
          tokensOut: aiUsage.completionTokens,
          estCostInr: aiUsage.estCostInr,
        })
        .from(aiUsage)
        .leftJoin(users, eq(users.id, aiUsage.userId))
        .leftJoin(devices, eq(devices.id, aiUsage.deviceId))
        .leftJoin(topics, eq(topics.id, aiUsage.topicId))
        .where(where)
        .orderBy(desc(aiUsage.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return { items: rows.map((r) => ({ ...r, user: r.user?.id ? r.user : null, device: r.device?.id ? r.device : null, topic: r.topic?.id ? r.topic : null })), total, page, pageSize };
    });
  }

  /**
   * AI load and outcomes over a period (default the last 7 days), per day or per hour (`bucket`)
   * in the institution's time zone: requests by status, tokens, p50/p95 latency of model calls,
   * the peak hour, requests by hour of day, the commonest refusal reasons, and the gate's load now.
   */
  @Get('logs/summary')
  @Auth('user', AI_ADMIN)
  logSummary(@CurrentPrincipal() p: UserPrincipal, @Query() q: LogFilters & { bucket?: string }) {
    const bucket = q.bucket ?? 'day';
    if (bucket !== 'day' && bucket !== 'hour') throw new BadRequestException('bucket must be day or hour');
    const { where, from, to } = logWhere(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      // Inlined (not parameters) so the same expression can be selected and grouped by.
      const tz = /^[A-Za-z0-9_/+-]+$/.test(t?.tz ?? '') ? t!.tz : 'Asia/Kolkata';
      const local = sql`(${aiUsage.createdAt} at time zone ${sql.raw(`'${tz}'`)})`;
      const metrics = {
        requests: sql<number>`count(*)::int`,
        served: sql<number>`(count(*) filter (where ${aiUsage.outcome} in ('ok', 'cached')))::int`,
        rejected: sql<number>`(count(*) filter (where ${aiUsage.outcome} in ('blocked', 'quota')))::int`,
        throttled: sql<number>`(count(*) filter (where ${aiUsage.outcome} = 'throttled'))::int`,
        error: sql<number>`(count(*) filter (where ${aiUsage.outcome} in ('invalid', 'unavailable')))::int`,
        tokensIn: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
        p50LatencyMs: sql<number | null>`(percentile_cont(0.5) within group (order by ${aiUsage.latencyMs}) filter (where ${aiUsage.latencyMs} > 0))::int`,
        p95LatencyMs: sql<number | null>`(percentile_cont(0.95) within group (order by ${aiUsage.latencyMs}) filter (where ${aiUsage.latencyMs} > 0))::int`,
      };
      const trunc = sql<string>`to_char(date_trunc(${sql.raw(`'${bucket}'`)}, ${local}), 'YYYY-MM-DD"T"HH24:MI')`;
      const hourTrunc = sql<string>`to_char(date_trunc('hour', ${local}), 'YYYY-MM-DD"T"HH24:MI')`;
      const hourOfDay = sql<number>`extract(hour from ${local})::int`;
      const [totals] = await tx.select(metrics).from(aiUsage).where(where);
      const buckets = await tx.select({ at: trunc, ...metrics }).from(aiUsage).where(where).groupBy(trunc).orderBy(trunc);
      const [peak] = await tx.select({ at: hourTrunc, requests: metrics.requests, throttled: metrics.throttled }).from(aiUsage).where(where).groupBy(hourTrunc).orderBy(desc(metrics.requests), hourTrunc).limit(1);
      const byHour = await tx.select({ hour: hourOfDay, requests: metrics.requests, throttled: metrics.throttled }).from(aiUsage).where(where).groupBy(hourOfDay).orderBy(hourOfDay);
      const byKind = await tx.select({ kind: aiUsage.task, requests: metrics.requests, served: metrics.served, tokensIn: metrics.tokensIn, tokensOut: metrics.tokensOut }).from(aiUsage).where(where).groupBy(aiUsage.task).orderBy(desc(metrics.requests));
      const reasons = await tx
        .select({ status: statusSql, reason: sql<string>`coalesce(${aiUsage.detail}, ${aiUsage.outcome}::text)`, n: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(where, sql`${aiUsage.outcome} not in ('ok', 'cached')`))
        .groupBy(statusSql, sql`coalesce(${aiUsage.detail}, ${aiUsage.outcome}::text)`)
        .orderBy(desc(sql`count(*)`))
        .limit(10);
      return { from, to, timezone: tz, bucket, totals, buckets, peakHour: peak ?? null, byHourOfDay: byHour, byKind, reasons, capacity: this.gate.load };
    });
  }

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
