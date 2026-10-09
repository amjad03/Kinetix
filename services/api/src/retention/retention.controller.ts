import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { retentionRules } from '../db/schema-pathways.js';
import { RETENTION_TARGETS, RetentionService, type RetentionTarget } from './retention.service.js';

const RuleBody = z.object({
  target: z.enum(['vault_documents', 'notifications', 'career_assistant']),
  category: z.string().trim().toLowerCase().max(40).default(''),
  keepDays: z.number().int().min(30).max(3650),
  action: z.enum(['archive', 'delete']),
  active: z.boolean().default(true),
});

/** How long each kind of record is kept. Rules run daily; "run now" can preview what would change first. */
@Controller('v1/retention')
export class RetentionController {
  constructor(
    private readonly db: DbService,
    private readonly svc: RetentionService,
  ) {}

  @Get('rules')
  @Auth('user', ['tenant_admin', 'principal'])
  async rules(@CurrentPrincipal() p: UserPrincipal) {
    const rows = await this.db.withTenant(p.tenantId, (tx) => tx.select().from(retentionRules).orderBy(asc(retentionRules.target), asc(retentionRules.category)));
    return { targets: Object.entries(RETENTION_TARGETS).map(([key, t]) => ({ key, label: t.label, actions: t.actions, usesCategory: t.usesCategory })), rules: rows };
  }

  /** Creates the rule, or changes it when there is already one for that target and category. */
  @Put('rules')
  @Auth('user', ['tenant_admin', 'principal'])
  upsert(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RuleBody)) b: z.infer<typeof RuleBody>) {
    const t = RETENTION_TARGETS[b.target as RetentionTarget];
    if (!(t.actions as readonly string[]).includes(b.action)) throw new BadRequestException(`${t.label} can only be ${t.actions.join(' or ')}d`);
    if (b.category && !t.usesCategory) throw new BadRequestException(`${t.label} do not have categories`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(retentionRules)
        .values({ tenantId: p.tenantId, ...b })
        .onConflictDoUpdate({ target: [retentionRules.tenantId, retentionRules.target, retentionRules.category], set: { keepDays: b.keepDays, action: b.action, active: b.active } })
        .returning();
      await auditUser(tx, p, 'retention.rule_saved', 'retention_rule', row.id, { target: b.target, category: b.category, keepDays: b.keepDays });
      return row;
    });
  }

  @Delete('rules/:id')
  @HttpCode(204)
  @Auth('user', ['tenant_admin', 'principal'])
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(retentionRules).where(eq(retentionRules.id, id)).returning({ id: retentionRules.id });
      if (!gone.length) throw new NotFoundException('Rule not found');
      await auditUser(tx, p, 'retention.rule_removed', 'retention_rule', id);
    });
  }

  @Post('run')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal'])
  run(@CurrentPrincipal() p: UserPrincipal, @Query('dryRun') dryRun?: string) {
    return this.svc.sweep(p.tenantId, dryRun !== 'false');
  }
}
