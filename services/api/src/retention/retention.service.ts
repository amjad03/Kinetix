import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { notifications, vaultDocuments } from '../db/schema.js';
import { careerAssistantMessages, retentionRules } from '../db/schema-pathways.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';

export const RETENTION_SWEEP = 'retention.sweep';

/** What a rule can govern, and what it may do to it. Documents are only ever archived, never destroyed. */
export const RETENTION_TARGETS = {
  vault_documents: { actions: ['archive'], label: 'Vault documents', usesCategory: true },
  notifications: { actions: ['delete'], label: 'Read notifications', usesCategory: false },
  career_assistant: { actions: ['delete'], label: 'Career assistant chats', usesCategory: false },
} as const;
export type RetentionTarget = keyof typeof RETENTION_TARGETS;

export interface RetentionOutcome {
  ruleId: string;
  target: string;
  category: string;
  action: string;
  affected: number;
}

/** Applies the institution's retention rules, daily or on demand. A dry run only counts. */
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly log = new Logger(RetentionService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(RETENTION_SWEEP, (job: Job) => this.sweep(job.tenantId, false).then(() => undefined));
  }

  async sweep(tenantId: string, dryRun: boolean): Promise<RetentionOutcome[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const rules = await tx.select().from(retentionRules).where(eq(retentionRules.active, true));
      const out: RetentionOutcome[] = [];
      for (const r of rules) {
        const cutoff = new Date(this.clock.now().getTime() - r.keepDays * 86_400_000);
        const affected = await this.apply(tx, r, cutoff, dryRun);
        out.push({ ruleId: r.id, target: r.target, category: r.category, action: r.action, affected });
        if (!dryRun) {
          await tx.update(retentionRules).set({ lastRunAt: this.clock.now(), lastAffected: affected }).where(eq(retentionRules.id, r.id));
          if (affected) await audit(tx, { tenantId, actorType: 'system', action: `retention.${r.action}`, subjectType: 'retention_rule', subjectId: r.id, data: { target: r.target, category: r.category, affected } });
        }
      }
      if (!dryRun && out.some((o) => o.affected)) this.log.log(`Retention for ${tenantId}: ${out.map((o) => `${o.target}=${o.affected}`).join(', ')}`);
      return out;
    });
  }

  private async apply(tx: Tx, r: typeof retentionRules.$inferSelect, cutoff: Date, dryRun: boolean): Promise<number> {
    switch (r.target as RetentionTarget) {
      case 'vault_documents': {
        const where = and(isNull(vaultDocuments.archivedAt), lt(vaultDocuments.createdAt, cutoff), r.category ? eq(vaultDocuments.category, r.category) : undefined);
        if (dryRun) return (await tx.select({ n: sql<number>`count(*)::int` }).from(vaultDocuments).where(where))[0].n;
        return (await tx.update(vaultDocuments).set({ archivedAt: this.clock.now() }).where(where).returning({ id: vaultDocuments.id })).length;
      }
      case 'notifications': {
        const where = and(isNotNull(notifications.readAt), lt(notifications.createdAt, cutoff));
        if (dryRun) return (await tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(where))[0].n;
        return (await tx.delete(notifications).where(where).returning({ id: notifications.id })).length;
      }
      case 'career_assistant': {
        const where = lt(careerAssistantMessages.createdAt, cutoff);
        if (dryRun) return (await tx.select({ n: sql<number>`count(*)::int` }).from(careerAssistantMessages).where(where))[0].n;
        return (await tx.delete(careerAssistantMessages).where(where).returning({ id: careerAssistantMessages.id })).length;
      }
      default:
        return 0;
    }
  }
}
