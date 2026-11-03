import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { taxDeclarationItems, taxDeclarations } from '../db/schema-hr3.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { DECLARATION_SECTIONS } from './tax-declaration.logic.js';
import { fyOfDate, TaxDeclarationsService } from './tax-declarations.service.js';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const Paise = z.number().int().min(0).max(1_00_00_000_00);
const Fy = z.coerce.number().int().min(2020).max(2100);
const SaveBody = z.object({
  fy: Fy,
  regime: z.enum(['old', 'new']),
  rentMonthlyPaise: Paise.default(0),
  rentMonths: z.number().int().min(0).max(12).default(0),
  metro: z.boolean().default(false),
  landlordName: z.string().trim().max(120).default(''),
  landlordPan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN looks like ABCDE1234F').nullish(),
  items: z.array(z.object({ section: z.enum(DECLARATION_SECTIONS), label: z.string().trim().max(120).default(''), declaredPaise: Paise.refine((v) => v > 0, 'Enter an amount') })).max(40).default([]),
  expectedVersion: z.number().int().optional(),
});
const FyBody = z.object({ fy: Fy });
const DecideBody = z.object({ expectedVersion: z.number().int().optional(), note: z.string().trim().max(500).default('') });
const RejectBody = z.object({ expectedVersion: z.number().int().optional(), note: z.string().trim().min(3, 'Say what needs changing').max(500) });
const VerifyBody = z.object({
  expectedVersion: z.number().int().optional(),
  note: z.string().trim().max(500).default(''),
  items: z.array(z.object({ id: z.uuid(), accepted: z.boolean(), acceptedPaise: Paise.optional(), note: z.string().trim().max(300).optional() })).max(40),
});
const ListQuery = z.object({
  fy: Fy.optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'proofs_submitted', 'verified', 'rejected']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Investment declarations (Form 12BB) and proofs: staff declare for the year and choose their regime, HR or accounts
 * approve (TDS uses the declared figures), staff attach proofs, and the proofs are verified (TDS uses what is accepted).
 */
@Controller('v1/hr/tax-declarations')
export class TaxDeclarationsController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly svc: TaxDeclarationsService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  /** My declaration for a year (this financial year by default), or null before the first save. */
  @Get('me')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('fy') fy?: string) {
    const parsed = fy === undefined ? null : Fy.safeParse(fy);
    if (parsed && !parsed.success) throw new BadRequestException('Use a financial year like 2026');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const year = parsed?.data ?? fyOfDate(await this.hr.today(tx));
      return { fy: year, declaration: await this.svc.mine(tx, p.userId, year) };
    });
  }

  @Get('me/all')
  @Auth('user', STAFF_ROLES)
  allMine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.listMine(tx, p.userId));
  }

  @Put('me')
  @Auth('user', STAFF_ROLES)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SaveBody)) b: z.infer<typeof SaveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.save(tx, p, { ...b, landlordPan: b.landlordPan ?? null }));
  }

  @Post('me/submit')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  submit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FyBody)) b: z.infer<typeof FyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.submit(tx, p, b.fy, false));
  }

  @Post('me/submit-proofs')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  submitProofs(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FyBody)) b: z.infer<typeof FyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.submit(tx, p, b.fy, true));
  }

  /** Attaches the proof of one item (PDF, JPEG or PNG, up to 5 MB). Multipart field `file`. */
  @Post('items/:id/proof')
  @Auth('user', STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PROOF_BYTES, files: 1 } }))
  async proof(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The proof must be a PDF, JPEG or PNG');
    const before = await this.db.withTenant(p.tenantId, (tx) => this.svc.itemForProof(tx, p, id));
    await this.scans.assertClean(file.buffer, 'The proof');
    const key = `tenants/${p.tenantId}/hr/tax-proofs/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_PROOF_BYTES, type);
    try {
      const out = await this.db.withTenant(p.tenantId, async (tx) => {
        await this.svc.itemForProof(tx, p, id);
        await tx.update(taxDeclarationItems).set({ proofKey: key, proofType: type, proofName: file.originalname.slice(0, 200), proofStatus: 'submitted' }).where(eq(taxDeclarationItems.id, id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tax_declaration.proof_attached', subjectType: 'tax_declaration', subjectId: before.d.id, data: { itemId: id, type } });
        return this.svc.view(tx, await this.svc.load(tx, before.d.id));
      });
      if (before.item.proofKey) await this.storage.delete(before.item.proofKey).catch(() => undefined);
      return out;
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  @Get('items/:id/proof')
  @Auth('user', STAFF_ROLES)
  async proofFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const it = await this.db.withTenant(p.tenantId, async (tx) => {
      const x = await this.svc.itemForDownload(tx, p, id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tax_declaration.proof_viewed', subjectType: 'tax_declaration', subjectId: x.declarationId, data: { itemId: id } });
      return x;
    });
    const { stream, size } = await this.storage.get(it.proofKey!);
    res.set({ 'content-type': it.proofType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }

  /** Every declaration, for HR and accounts: by year and status, searched by name or code, a page at a time. */
  @Get()
  @Auth('user', PAYROLL_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = ListQuery.safeParse(raw);
    if (!q.success) throw new BadRequestException(q.error.issues[0]?.message ?? 'Bad query');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fy = q.data.fy ?? fyOfDate(await this.hr.today(tx));
      const conds: (SQL | undefined)[] = [eq(taxDeclarations.fy, fy), q.data.status ? eq(taxDeclarations.status, q.data.status) : undefined, q.data.q ? or(ilike(users.fullName, `%${q.data.q}%`), ilike(staffProfiles.employeeCode, `%${q.data.q}%`)) : undefined];
      const where = and(...conds);
      const declared = sql<number>`(select coalesce(sum(i.declared_paise), 0)::bigint from tax_declaration_items i where i.declaration_id = ${taxDeclarations.id})`.mapWith(Number);
      const proofs = sql<number>`(select count(*)::int from tax_declaration_items i where i.declaration_id = ${taxDeclarations.id} and i.proof_status <> 'none')`;
      const rows = await tx
        .select({ id: taxDeclarations.id, userId: taxDeclarations.userId, fullName: users.fullName, employeeCode: staffProfiles.employeeCode, fy: taxDeclarations.fy, regime: taxDeclarations.regime, status: taxDeclarations.status, declaredPaise: declared, proofs, submittedAt: taxDeclarations.submittedAt, version: taxDeclarations.version })
        .from(taxDeclarations)
        .innerJoin(users, eq(users.id, taxDeclarations.userId))
        .leftJoin(staffProfiles, eq(staffProfiles.userId, taxDeclarations.userId))
        .where(where)
        .orderBy(sql`case ${taxDeclarations.status} when 'submitted' then 0 when 'proofs_submitted' then 1 else 2 end`, desc(taxDeclarations.submittedAt), asc(users.fullName))
        .limit(q.data.pageSize)
        .offset((q.data.page - 1) * q.data.pageSize);
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(taxDeclarations).innerJoin(users, eq(users.id, taxDeclarations.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, taxDeclarations.userId)).where(where);
      const counts = await tx.select({ status: taxDeclarations.status, n: sql<number>`count(*)::int` }).from(taxDeclarations).where(eq(taxDeclarations.fy, fy)).groupBy(taxDeclarations.status);
      return { fy, rows: rows.map((r) => ({ ...r, submittedAt: r.submittedAt?.toISOString() ?? null })), total: n?.n ?? 0, page: q.data.page, pageSize: q.data.pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
    });
  }

  @Get(':id')
  @Auth('user', PAYROLL_ROLES)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.svc.view(tx, await this.svc.load(tx, id)));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.approve(tx, p, id, b.expectedVersion, b.note));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RejectBody)) b: z.infer<typeof RejectBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.reject(tx, p, id, b.expectedVersion, b.note));
  }

  @Post(':id/verify')
  @HttpCode(200)
  @Auth('user', PAYROLL_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.verify(tx, p, id, b.expectedVersion, b.items, b.note));
  }
}
