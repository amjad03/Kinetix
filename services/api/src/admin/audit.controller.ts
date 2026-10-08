import { BadRequestException, Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { and, count, desc, eq, gte, like, lt, sql, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { toCsv } from '../common/pdf.js';
import { DbService, type Tx } from '../db/db.service.js';
import { auditLog, users } from '../db/schema.js';

const AUDIT_ROLES: RoleName[] = ['tenant_admin', 'principal'];
const EXPORT_LIMIT = 50_000;

const Filters = z.object({
  actorId: z.uuid().optional(),
  actorType: z.enum(['user', 'device', 'system']).optional(),
  /** Exact action, or a prefix ending in `*` ("fees.*"). */
  action: z.string().trim().min(1).max(120).optional(),
  subjectType: z.string().trim().min(1).max(80).optional(),
  subjectId: z.uuid().optional(),
  from: Day.optional(),
  to: Day.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
type AuditFilters = z.infer<typeof Filters>;

const parse = (q: unknown): AuditFilters => {
  const r = Filters.safeParse(q);
  if (!r.success) throw new BadRequestException(z.flattenError(r.error));
  if (r.data.from && r.data.to && r.data.from > r.data.to) throw new BadRequestException('"From" must not be after "to"');
  return r.data;
};

/** The audit log as the institution's leaders see it: filter, page through and export. Opening it is itself audited. */
@Controller('v1/audit')
export class AuditController {
  constructor(private readonly db: DbService) {}

  private where(f: AuditFilters): SQL | undefined {
    const next = f.to ? new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000) : undefined;
    return and(
      f.actorId ? eq(auditLog.actorId, f.actorId) : undefined,
      f.actorType ? eq(auditLog.actorType, f.actorType) : undefined,
      f.action ? (f.action.endsWith('*') ? like(auditLog.action, `${f.action.slice(0, -1).replace(/[\\%_]/g, '\\$&')}%`) : eq(auditLog.action, f.action)) : undefined,
      f.subjectType ? eq(auditLog.subjectType, f.subjectType) : undefined,
      f.subjectId ? eq(auditLog.subjectId, f.subjectId) : undefined,
      f.from ? gte(auditLog.at, new Date(`${f.from}T00:00:00Z`)) : undefined,
      next ? lt(auditLog.at, next) : undefined,
    );
  }

  private select(tx: Tx, f: AuditFilters, limit: number, offset: number) {
    return tx
      .select({ id: auditLog.id, at: auditLog.at, actorType: auditLog.actorType, actorId: auditLog.actorId, actorName: users.fullName, action: auditLog.action, subjectType: auditLog.subjectType, subjectId: auditLog.subjectId, data: auditLog.data })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(this.where(f))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(limit)
      .offset(offset);
  }

  /** `?actorId&actorType&action&subjectType&subjectId&from&to&limit&offset`; newest first. */
  @Get()
  @Auth('user', AUDIT_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const f = parse(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [{ n }] = await tx.select({ n: count() }).from(auditLog).where(this.where(f));
      const items = await this.select(tx, f, f.limit, f.offset);
      const { limit, offset, ...filters } = f;
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'audit.viewed', subjectType: 'audit_log', data: { filters, limit, offset } });
      return { items, total: n, limit, offset };
    });
  }

  /** The distinct actions in the log, for the filter box. */
  @Get('actions')
  @Auth('user', AUDIT_ROLES)
  actions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.execute(sql`select distinct action from audit_log order by action limit 500`)).rows.map((r) => (r as { action: string }).action));
  }

  /** The same filters as a CSV download (at most 50,000 rows). */
  @Get('export')
  @Auth('user', AUDIT_ROLES)
  async export(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const f = parse(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const items = await this.select(tx, f, EXPORT_LIMIT, 0);
      const { limit: _limit, offset: _offset, ...filters } = f;
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'audit.exported', subjectType: 'audit_log', data: { filters, rows: items.length } });
      const body = toCsv([
        ['Time', 'Actor type', 'Actor id', 'Actor', 'Action', 'Subject type', 'Subject id', 'Details'],
        ...items.map((r) => [r.at.toISOString(), r.actorType, r.actorId, r.actorName, r.action, r.subjectType, r.subjectId, r.data === null ? '' : JSON.stringify(r.data)]),
      ]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(Buffer.from('﻿' + body, 'utf8'));
    });
  }
}
