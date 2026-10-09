import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { dpdpRequests, users } from '../db/schema.js';
import { CORRECTABLE_FIELDS, correctionProblem, retentionReasons } from './dpdp.logic.js';
import { DpdpService } from './dpdp.service.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const RequestBody = z
  .object({
    kind: z.enum(['correction', 'erasure']),
    details: z.string().trim().max(1000).default(''),
    correction: z.object({ field: z.enum(CORRECTABLE_FIELDS), value: z.string().trim().min(1).max(200) }).optional(),
  })
  .refine((b) => b.kind !== 'correction' || b.correction || b.details.length >= 5, { message: 'Say what should be corrected' });
const ProcessBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).default('') });

/**
 * Data-principal rights under the DPDP Act. Anyone signed in (student, guardian, staff, alumnus) can get a copy
 * of their data, ask for a correction or ask for erasure; the administrator works the queue.
 */
@Controller('v1/dpdp')
export class DpdpController {
  constructor(
    private readonly db: DbService,
    private readonly svc: DpdpService,
  ) {}

  /** The grievance officer to write to about personal data. */
  @Get('grievance-officer')
  @Auth('user')
  officer(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ officer: await this.svc.grievanceOfficer(tx), response: 'The officer replies within 30 days.' }));
  }

  /** Everything held about me, as JSON. Counts as a completed export request. */
  @Get('me/export')
  @Auth('user')
  exportJson(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bundle = await this.svc.bundle(tx, p.userId);
      await this.logExport(tx, p, 'json');
      return bundle;
    });
  }

  /** The same bundle as a PDF. */
  @Get('me/export.pdf')
  @Auth('user')
  exportPdf(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bundle = await this.svc.bundle(tx, p.userId);
      await this.logExport(tx, p, 'pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="my-data.pdf"');
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(this.svc.pdf(bundle));
    });
  }

  @Get('me/requests')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(dpdpRequests).where(eq(dpdpRequests.userId, p.userId)).orderBy(desc(dpdpRequests.createdAt)).limit(100));
  }

  /** Asks for a correction or erasure. For erasure the answer says up front whether retention rules will block it. */
  @Post('me/requests')
  @Auth('user')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    if (b.correction) {
      const bad = correctionProblem(b.correction.field, b.correction.value);
      if (bad) throw new BadRequestException(bad);
    }
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await this.svc.open(tx, p.tenantId, p.userId, b.kind, b.details, b.correction);
      const willBlock = b.kind === 'erasure' ? retentionReasons(await this.svc.facts(tx, p.userId)) : [];
      return { ...row, retentionNotice: willBlock };
    });
  }

  // ---- the administrator's queue -------------------------------------------------------------

  @Get('requests')
  @Auth('user', ADMIN)
  queue(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    const st = z.enum(['pending', 'completed', 'rejected', 'blocked']).optional().parse(status || undefined);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(dpdpRequests).where(st ? eq(dpdpRequests.status, st) : undefined).orderBy(desc(dpdpRequests.createdAt)).limit(300);
      const people = rows.length ? await tx.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.userId))])) : [];
      return rows.map((r) => ({ ...r, person: people.find((x) => x.id === r.userId) ?? null }));
    });
  }

  /** Works one request: approve (apply the correction, or erase unless retention blocks it) or reject with a reason. */
  @Post('requests/:id/process')
  @HttpCode(200)
  @Auth('user', ADMIN)
  process(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ProcessBody)) b: z.infer<typeof ProcessBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [req] = await tx.select().from(dpdpRequests).where(eq(dpdpRequests.id, id)).for('update');
      if (!req) throw new NotFoundException('Request not found');
      if (req.status !== 'pending') throw new ConflictException(`This request is already ${req.status}`);
      if (req.userId === p.userId) throw new ConflictException('Ask another administrator to process your own request');
      if (b.decision === 'reject' && !b.note) throw new BadRequestException('Say why the request is rejected');
      const approve = b.decision === 'approve';
      if (req.kind === 'correction') return this.svc.processCorrection(tx, req, approve, b.note, p.userId);
      if (req.kind === 'erasure') return this.svc.processErasure(tx, req, approve, b.note, p.userId);
      throw new ConflictException('Export requests are completed automatically');
    });
  }

  private async logExport(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal, format: string) {
    await tx.insert(dpdpRequests).values({ tenantId: p.tenantId, userId: p.userId, kind: 'export', status: 'completed', details: format, processedAt: new Date() });
    await auditUser(tx, p, 'dpdp.export_downloaded', 'user', p.userId, { format });
  }
}
