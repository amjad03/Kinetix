import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { staffProfiles, users } from '../db/schema.js';
import { reimbursementClaims } from '../db/schema-hr3.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { HR_ROLES, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { CLAIM_CATEGORIES, claimStatusSql, ReimbursementsService } from './reimbursements.service.js';

const MAX_BILL_BYTES = 5 * 1024 * 1024;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const ClaimBody = z.object({
  category: z.enum(CLAIM_CATEGORIES),
  spentOn: Day,
  amountPaise: z.number().int().min(100, 'At least ₹1').max(10_00_000_00),
  description: z.string().trim().min(3, 'Say what the bill is for').max(500),
});
const DecideBody = z.object({ approve: z.boolean(), approvedPaise: z.number().int().min(1).max(10_00_000_00).optional(), payMonth: Month.optional(), note: z.string().trim().max(500).default('') });
const ListQuery = z.object({
  status: z.enum(['submitted', 'approved', 'paid', 'rejected', 'cancelled']).optional(),
  category: z.enum(CLAIM_CATEGORIES).optional(),
  month: Month.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Reimbursement claims: staff claim against a bill (app or ERP), HR approves onto a pay month, payroll pays it. */
@Controller('v1/hr/reimbursements')
export class ReimbursementsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ReimbursementsService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  @Get('me')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(reimbursementClaims).where(eq(reimbursementClaims.userId, p.userId)).orderBy(desc(reimbursementClaims.createdAt)).limit(200);
      return Promise.all(rows.map((r) => this.svc.view(tx, r)));
    });
  }

  @Post()
  @Auth('user', STAFF_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ClaimBody)) b: z.infer<typeof ClaimBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.view(tx, await this.svc.create(tx, p, b)));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.view(tx, await this.svc.cancel(tx, p, id)));
  }

  /** Attaches the bill (PDF, JPEG or PNG, up to 5 MB) while the claim waits. Multipart field `file`. */
  @Post(':id/bill')
  @Auth('user', STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BILL_BYTES, files: 1 } }))
  async bill(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The bill must be a PDF, JPEG or PNG');
    const before = await this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.svc.load(tx, id);
      if (c.userId !== p.userId) throw new NotFoundException('Claim not found');
      if (c.status !== 'submitted') throw new ConflictException(`This claim is ${c.status}`);
      return c;
    });
    await this.scans.assertClean(file.buffer, 'The bill');
    const key = `tenants/${p.tenantId}/hr/reimbursements/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_BILL_BYTES, type);
    try {
      const out = await this.db.withTenant(p.tenantId, async (tx) => {
        await tx.update(reimbursementClaims).set({ billKey: key, billType: type, billName: file.originalname.slice(0, 200) }).where(and(eq(reimbursementClaims.id, id), eq(reimbursementClaims.status, 'submitted')));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'reimbursement.bill_attached', subjectType: 'reimbursement_claim', subjectId: id, data: { type } });
        return this.svc.view(tx, await this.svc.load(tx, id));
      });
      if (before.billKey) await this.storage.delete(before.billKey).catch(() => undefined);
      return out;
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  @Get(':id/bill')
  @Auth('user', STAFF_ROLES)
  async billFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const c = await this.db.withTenant(p.tenantId, (tx) => this.svc.visible(tx, p, id));
    if (!c.billKey) throw new NotFoundException('No bill attached');
    const { stream, size } = await this.storage.get(c.billKey);
    res.set({ 'content-type': c.billType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }

  /** Every claim, for HR and accounts, a page at a time, waiting ones first. */
  @Get()
  @Auth('user', PAYROLL_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = ListQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException(q.error.issues[0]?.message ?? 'Bad query');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = reimbursementClaims;
      const where = and(...([q.data.status ? sql`${claimStatusSql} = ${q.data.status}` : undefined, q.data.category ? eq(c.category, q.data.category) : undefined, q.data.month ? eq(c.payMonth, q.data.month) : undefined, q.data.q ? or(ilike(users.fullName, `%${q.data.q}%`), ilike(c.claimNo, `%${q.data.q}%`), ilike(staffProfiles.employeeCode, `%${q.data.q}%`)) : undefined] as (SQL | undefined)[]));
      const rows = await tx
        .select({ id: c.id, claimNo: c.claimNo, userId: c.userId, fullName: users.fullName, employeeCode: staffProfiles.employeeCode, category: c.category, spentOn: c.spentOn, amountPaise: c.amountPaise, approvedPaise: c.approvedPaise, description: c.description, hasBill: sql<boolean>`${c.billKey} is not null`, status: claimStatusSql, payMonth: c.payMonth, createdAt: c.createdAt })
        .from(c)
        .innerJoin(users, eq(users.id, c.userId))
        .leftJoin(staffProfiles, eq(staffProfiles.userId, c.userId))
        .where(where)
        .orderBy(sql`case ${c.status} when 'submitted' then 0 else 1 end`, desc(c.createdAt), asc(c.claimNo))
        .limit(q.data.pageSize)
        .offset((q.data.page - 1) * q.data.pageSize);
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(c).innerJoin(users, eq(users.id, c.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, c.userId)).where(where);
      const totals = await tx.select({ status: claimStatusSql, n: sql<number>`count(*)::int`, paise: sql<number>`coalesce(sum(coalesce(${c.approvedPaise}, ${c.amountPaise})), 0)::bigint`.mapWith(Number) }).from(c).groupBy(claimStatusSql);
      return { rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), total: n?.n ?? 0, page: q.data.page, pageSize: q.data.pageSize, totals };
    });
  }

  @Get(':id')
  @Auth('user', STAFF_ROLES)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.view(tx, await this.svc.visible(tx, p, id)));
  }

  @Post(':id/decide')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.view(tx, await this.svc.decide(tx, p, id, b)));
  }
}
