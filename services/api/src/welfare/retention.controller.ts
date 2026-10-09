import { BadRequestException, Body, Controller, Get, HttpCode, OnModuleInit, Param, Post, Put } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { counsellingSessions, healthVisits } from '../db/schema.js';
import { retentionRules } from '../db/schema-depth.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const RETENTION_JOB = 'retention.sensitive';
/** Student health and counselling records the rules can act on. */
export const DATA_CLASSES = ['health_visits', 'counselling'] as const;
type DataClass = (typeof DATA_CLASSES)[number];
const MIN_MONTHS = 6;

const RuleBody = z.object({ retainMonths: z.number().int().min(MIN_MONTHS).max(240), action: z.enum(['delete', 'redact']), active: z.boolean() });

const cutoff = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

/** How long health visits and counselling records are kept, and what happens afterwards (PRD section 40, DPDP storage limitation). */
@Controller('v1/retention')
export class RetentionController implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(RETENTION_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.apply(tx, job.tenantId, null)).then(() => undefined));
  }

  /** Records older than the cut-off; counselling counts only closed sessions. */
  private async due(tx: Tx, dataClass: DataClass, months: number): Promise<string[]> {
    const before = cutoff(this.clock.now(), months);
    if (dataClass === 'health_visits') return (await tx.select({ id: healthVisits.id }).from(healthVisits).where(sql`${healthVisits.visitedAt} < ${before.toISOString()} and ${healthVisits.complaint} <> '[removed]'`)).map((r) => r.id);
    return (await tx.select({ id: counsellingSessions.id }).from(counsellingSessions).where(sql`${counsellingSessions.createdAt} < ${before.toISOString()} and ${counsellingSessions.status} in ('completed', 'cancelled', 'no_show') and (${counsellingSessions.confidentialNotes} is not null or ${counsellingSessions.reason} <> '')`)).map((r) => r.id);
  }

  private async apply(tx: Tx, tenantId: string, actor: UserPrincipal | null): Promise<Record<string, number>> {
    const rules = await tx.select().from(retentionRules).where(eq(retentionRules.active, true));
    const out: Record<string, number> = {};
    for (const rule of rules) {
      const dc = rule.dataClass as DataClass;
      if (!DATA_CLASSES.includes(dc)) continue;
      const ids = await this.due(tx, dc, rule.retainMonths);
      if (ids.length) {
        if (dc === 'health_visits') {
          if (rule.action === 'delete') await tx.delete(healthVisits).where(inArray(healthVisits.id, ids));
          else await tx.update(healthVisits).set({ complaint: '[removed]', action: '' }).where(inArray(healthVisits.id, ids));
        } else if (rule.action === 'delete') await tx.delete(counsellingSessions).where(inArray(counsellingSessions.id, ids));
        else await tx.update(counsellingSessions).set({ reason: '', confidentialNotes: null }).where(inArray(counsellingSessions.id, ids));
      }
      out[dc] = ids.length;
      await tx.update(retentionRules).set({ lastRunAt: this.clock.now(), lastRunCount: ids.length }).where(eq(retentionRules.id, rule.id));
    }
    if (actor) await auditUser(tx, actor, 'retention.sensitive_applied', 'retention_rules', tenantId, out);
    return out;
  }

  /** Each data class with its rule (if any) and how many records are past the cut-off today. */
  @Get('rules')
  @Auth('user', ADMIN)
  rules(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(retentionRules);
      const out = [];
      for (const dc of DATA_CLASSES) {
        const r = rows.find((x) => x.dataClass === dc);
        out.push({ dataClass: dc, retainMonths: r?.retainMonths ?? null, action: r?.action ?? null, active: r?.active ?? false, lastRunAt: r?.lastRunAt ?? null, lastRunCount: r?.lastRunCount ?? null, dueNow: r ? (await this.due(tx, dc, r.retainMonths)).length : null });
      }
      return out;
    });
  }

  @Put('rules/:dataClass')
  @Auth('user', ADMIN)
  saveRule(@CurrentPrincipal() p: UserPrincipal, @Param('dataClass') dataClass: string, @Body(new ZodBody(RuleBody)) b: z.infer<typeof RuleBody>) {
    if (!DATA_CLASSES.includes(dataClass as DataClass)) throw new BadRequestException('Choose health visits or counselling');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(retentionRules)
        .values({ tenantId: p.tenantId, dataClass, retainMonths: b.retainMonths, action: b.action, active: b.active, updatedBy: p.userId })
        .onConflictDoUpdate({ target: [retentionRules.tenantId, retentionRules.dataClass], set: { retainMonths: b.retainMonths, action: b.action, active: b.active, updatedBy: p.userId } })
        .returning();
      await auditUser(tx, p, 'retention.rule_saved', 'retention_rules', row.id, { dataClass, ...b });
      return row;
    });
  }

  /** Applies the active rules now (the daily job does the same). */
  @Post('run')
  @HttpCode(200)
  @Auth('user', ADMIN)
  run(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ processed: await this.apply(tx, p.tenantId, p) }));
  }
}

