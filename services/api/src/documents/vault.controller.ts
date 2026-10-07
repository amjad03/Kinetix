import { BadRequestException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, PayloadTooLargeException, Query, Req, Res, StreamableFile, UnsupportedMediaTypeException } from '@nestjs/common';
import type { VaultDocument, VaultOwner, VaultVisibility } from '@kinetix/shared';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { addDays } from '../hr/dates.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, students, users, vaultDocuments } from '../db/schema.js';
import { HrService } from '../hr/hr.service.js';
import { bufferStream, ObjectStorage } from '../storage/storage.service.js';
import { hasRole, MAX_VAULT_BYTES, STAFF_VAULT_MANAGERS, STUDENT_VAULT_MANAGERS, VAULT_TYPES } from './documents.access.js';

const Meta = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use a short name like aadhaar or marks_card'),
  visibility: z.enum(['staff', 'owner']).default('staff'),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  replacesId: z.uuid().optional(),
});
const OwnerType = z.enum(['student', 'staff']);

type Row = typeof vaultDocuments.$inferSelect;

/** The request body as bytes, refusing more than the vault allows. */
async function readBody(req: Request): Promise<Buffer> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_VAULT_BYTES) throw new PayloadTooLargeException('Files can be at most 10 MB');
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > MAX_VAULT_BYTES) throw new PayloadTooLargeException('Files can be at most 10 MB');
    chunks.push(c);
  }
  if (n === 0) throw new UnsupportedMediaTypeException('Send the file itself as a PDF, JPEG or PNG body');
  return Buffer.concat(chunks);
}

/**
 * The document vault: files kept per student or staff member (Aadhaar, marks cards, offer letters…).
 * Managers see everything of the owner types they manage; the owner (or a student's family) sees only
 * documents marked `owner`. Every download and archive is audited.
 */
@Controller('v1/documents/vault')
export class VaultController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
    @Inject(HrService) private readonly hr: HrService,
  ) {}

  private isManager(p: UserPrincipal, type: VaultOwner) {
    return hasRole(p, type === 'student' ? STUDENT_VAULT_MANAGERS : STAFF_VAULT_MANAGERS);
  }

  /** The owner's own side: the staff member themselves, or the student and their guardians. */
  private async isOwnerSide(tx: Tx, p: UserPrincipal, type: VaultOwner, ownerId: string): Promise<boolean> {
    if (type === 'staff') return ownerId === p.userId;
    const [s] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, ownerId), eq(students.userId, p.userId)));
    if (s) return true;
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, ownerId), eq(guardians.userId, p.userId)));
    return !!g;
  }

  private async assertOwnerExists(tx: Tx, type: VaultOwner, ownerId: string) {
    const found = type === 'student' ? await tx.select({ id: students.id }).from(students).where(eq(students.id, ownerId)) : (await this.hr.isStaff(tx, ownerId)) ? [1] : [];
    if (!found.length) throw new NotFoundException(type === 'student' ? 'Student not found' : 'Staff member not found');
  }

  private ownerOf = (r: Row) => ({ type: r.ownerType as VaultOwner, id: (r.studentId ?? r.staffUserId)! });

  private async canRead(tx: Tx, p: UserPrincipal, r: Row): Promise<boolean> {
    const o = this.ownerOf(r);
    if (this.isManager(p, o.type)) return true;
    return r.visibility === 'owner' && (await this.isOwnerSide(tx, p, o.type, o.id));
  }

  private async views(tx: Tx, rows: Row[]): Promise<VaultDocument[]> {
    const ids = [...new Set(rows.map((r) => r.uploadedBy))];
    const names = new Map((ids.length ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(sql`${users.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`) : []).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ id: r.id, ownerType: r.ownerType as VaultOwner, ownerId: this.ownerOf(r).id, title: r.title, category: r.category, contentType: r.contentType, sizeBytes: r.sizeBytes, version: r.version, visibility: r.visibility as VaultVisibility, expiresOn: r.expiresOn, uploadedBy: { id: r.uploadedBy, fullName: names.get(r.uploadedBy) ?? '' }, createdAt: r.createdAt.toISOString() }));
  }

  /** Documents expiring within `days` (default 30), for the owner types the caller manages. */
  @Get('expiring')
  @Auth('user', STAFF_VAULT_MANAGERS)
  expiring(@CurrentPrincipal() p: UserPrincipal, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('days must be 1 to 365');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.hr.today(tx);
      const rows = await tx.select().from(vaultDocuments).where(and(isNull(vaultDocuments.archivedAt), lte(vaultDocuments.expiresOn, addDays(today, n)))).orderBy(asc(vaultDocuments.expiresOn));
      return this.views(tx, rows.filter((r) => this.isManager(p, r.ownerType as VaultOwner)));
    });
  }

  @Get('files/:id')
  @Auth('user')
  download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(vaultDocuments).where(eq(vaultDocuments.id, id));
      if (!r || (r.archivedAt && !this.isManager(p, r.ownerType as VaultOwner)) || !(await this.canRead(tx, p, r))) throw new NotFoundException('Document not found');
      const { stream } = await this.storage.get(r.storageKey);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'vault.downloaded', subjectType: 'vault_document', subjectId: id, data: { owner: this.ownerOf(r), category: r.category } });
      res.setHeader('Content-Type', r.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${r.title.replace(/[^A-Za-z0-9._ -]/g, '_')}.${r.contentType === 'application/pdf' ? 'pdf' : r.contentType === 'image/png' ? 'png' : 'jpg'}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(stream);
    });
  }

  /** Archiving hides a document and keeps the file and its audit trail. */
  @Delete('files/:id')
  @HttpCode(204)
  @Auth('user')
  archive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(vaultDocuments).where(eq(vaultDocuments.id, id));
      if (!r || r.archivedAt || !this.isManager(p, r.ownerType as VaultOwner)) throw new NotFoundException('Document not found');
      await tx.update(vaultDocuments).set({ archivedAt: new Date() }).where(eq(vaultDocuments.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'vault.archived', subjectType: 'vault_document', subjectId: id, data: { owner: this.ownerOf(r), category: r.category, version: r.version } });
    });
  }

  @Get(':ownerType/:ownerId')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Param('ownerType') ownerType: string, @Param('ownerId', ParseUUIDPipe) ownerId: string, @Query('history') history?: string) {
    const type = OwnerType.parse(ownerType);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const manager = this.isManager(p, type);
      if (!manager && !(await this.isOwnerSide(tx, p, type, ownerId))) throw new NotFoundException(type === 'student' ? 'Student not found' : 'Staff member not found');
      if (manager) await this.assertOwnerExists(tx, type, ownerId);
      const rows = await tx
        .select()
        .from(vaultDocuments)
        .where(and(eq(type === 'student' ? vaultDocuments.studentId : vaultDocuments.staffUserId, ownerId), manager && history === '1' ? undefined : isNull(vaultDocuments.archivedAt), manager ? undefined : eq(vaultDocuments.visibility, 'owner')))
        .orderBy(desc(vaultDocuments.createdAt));
      return this.views(tx, rows);
    });
  }

  /** The file is the request body (PDF, JPEG or PNG, up to 10 MB); details go in the query string. */
  @Post(':ownerType/:ownerId')
  @Auth('user')
  upload(@CurrentPrincipal() p: UserPrincipal, @Param('ownerType') ownerType: string, @Param('ownerId', ParseUUIDPipe) ownerId: string, @Query() query: Record<string, string>, @Req() req: Request) {
    const type = OwnerType.parse(ownerType);
    const meta = Meta.safeParse(query);
    if (!meta.success) throw new BadRequestException(z.flattenError(meta.error));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const body = await readBody(req);
      const contentType = Object.keys(VAULT_TYPES).find((t) => body.subarray(0, VAULT_TYPES[t].length).equals(VAULT_TYPES[t]));
      if (!contentType) throw new UnsupportedMediaTypeException('Only PDF, JPEG and PNG files are accepted');
      const manager = this.isManager(p, type);
      const self = type === 'staff' && ownerId === p.userId;
      if (!manager && !self) throw new NotFoundException(type === 'student' ? 'Student not found' : 'Staff member not found');
      await this.assertOwnerExists(tx, type, ownerId);
      let version = 1;
      let replaced: Row | undefined;
      if (meta.data.replacesId) {
        [replaced] = await tx.select().from(vaultDocuments).where(and(eq(vaultDocuments.id, meta.data.replacesId), isNull(vaultDocuments.archivedAt)));
        if (!replaced || (replaced.studentId ?? replaced.staffUserId) !== ownerId) throw new NotFoundException('The document to replace was not found');
        version = replaced.version + 1;
      }
      const [row] = await tx
        .insert(vaultDocuments)
        .values({ tenantId: p.tenantId, ownerType: type, studentId: type === 'student' ? ownerId : null, staffUserId: type === 'staff' ? ownerId : null, title: meta.data.title, category: meta.data.category, contentType, sizeBytes: body.length, storageKey: 'pending', version, replacesId: replaced?.id ?? null, visibility: manager ? meta.data.visibility : 'owner', expiresOn: meta.data.expiresOn ?? null, uploadedBy: p.userId })
        .returning();
      const key = `tenants/${p.tenantId}/vault/${row.id}`;
      await this.storage.put(key, bufferStream(body), MAX_VAULT_BYTES, contentType);
      await tx.update(vaultDocuments).set({ storageKey: key }).where(eq(vaultDocuments.id, row.id));
      if (replaced) await tx.update(vaultDocuments).set({ archivedAt: new Date() }).where(eq(vaultDocuments.id, replaced.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'vault.uploaded', subjectType: 'vault_document', subjectId: row.id, data: { owner: { type, id: ownerId }, category: meta.data.category, version, bytes: body.length } });
      return (await this.views(tx, [{ ...row, storageKey: key }]))[0];
    });
  }
}

