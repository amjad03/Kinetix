import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { Day, orConflict } from '../common/ops.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { publications, researchProjects, users } from '../db/schema.js';
import { researchDatasets } from '../db/schema-pathways.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { DoiLookup } from './doi-lookup.js';
import { duplicateOf } from './publication-dupes.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './research.controller.js';
import { normalizeDoi } from './research-rules.js';

const hasRole = (p: UserPrincipal, roles: readonly string[]) => p.roles.some((r) => roles.includes(r));
const DatasetBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(3000).default(''),
    projectId: z.uuid().optional(),
    license: z.string().trim().min(2).max(40).default('CC-BY-4.0'),
    access: z.enum(['open', 'restricted', 'embargoed']).default('restricted'),
    embargoUntil: Day.optional(),
    doi: z.string().trim().max(200).optional(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  })
  .refine((b) => b.access !== 'embargoed' || !!b.embargoUntil, { message: 'An embargoed dataset needs an end date', path: ['embargoUntil'] });
const ImportBody = z.object({
  doi: z.string().trim().min(5).max(200),
  projectId: z.uuid().optional(),
  /** Typed-in details used when the registry cannot be reached: the record is kept as pending and filled in later. */
  fallback: z.object({ title: z.string().trim().min(3).max(300), venue: z.string().trim().min(1).max(200), year: z.number().int().min(1950).max(2100), kind: z.enum(['journal', 'conference', 'book', 'book_chapter']).default('journal') }).optional(),
});

/** Research datasets with files and access rules, and publication import from a DOI. */
@Controller('v1/research')
export class DatasetsController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
    private readonly doi: DoiLookup,
    private readonly clock: Clock,
    private readonly scans: UploadScanService,
  ) {}

  /** Whether the caller may open the dataset's files: owner and office always; others when it is open, or its embargo has ended. */
  private async canOpen(tx: Tx, p: UserPrincipal, d: typeof researchDatasets.$inferSelect) {
    if (d.ownerUserId === p.userId || hasRole(p, RESEARCH_VIEW_ROLES)) return true;
    if (d.access === 'open') return true;
    if (d.access === 'embargoed' && d.embargoUntil) return d.embargoUntil <= (await tenantToday(tx, this.clock));
    return false;
  }

  /** The catalogue: every dataset's title and terms are listed; files open only where access allows. */
  @Get('datasets')
  @Auth('user', FACULTY_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ d: researchDatasets, owner: users.fullName }).from(researchDatasets).innerJoin(users, eq(users.id, researchDatasets.ownerUserId)).orderBy(desc(researchDatasets.createdAt));
      const out = [];
      for (const r of rows) out.push({ id: r.d.id, title: r.d.title, description: r.d.description, owner: r.owner, license: r.d.license, access: r.d.access, embargoUntil: r.d.embargoUntil, doi: r.d.doi, keywords: r.d.keywords, projectId: r.d.projectId, files: r.d.files.map((f, i) => ({ index: i, name: f.name, sizeBytes: f.sizeBytes })), canOpen: await this.canOpen(tx, p, r.d) });
      return out;
    });
  }

  @Post('datasets')
  @Auth('user', FACULTY_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DatasetBody)) b: z.infer<typeof DatasetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const doi = b.doi ? normalizeDoi(b.doi) : null;
      if (b.doi && !doi) throw new BadRequestException({ message: 'That is not a valid DOI', code: 'INVALID_DOI' });
      if (b.projectId) {
        const [proj] = await tx.select({ id: researchProjects.id }).from(researchProjects).where(eq(researchProjects.id, b.projectId));
        if (!proj) throw new NotFoundException('Project not found');
      }
      const { doi: _d, projectId, embargoUntil, ...rest } = b;
      const [row] = await tx.insert(researchDatasets).values({ tenantId: p.tenantId, ownerUserId: p.userId, doi, projectId: projectId ?? null, embargoUntil: embargoUntil ?? null, ...rest }).returning();
      await auditUser(tx, p, 'research.dataset_created', 'research_dataset', row.id, { access: b.access });
      return row;
    });
  }

  /** Adds a file (small files are sent inside the request as base64). */
  @Post('datasets/:id/files')
  @Auth('user', FACULTY_ROLES)
  addFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BlobBody)) b: z.infer<typeof BlobBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(researchDatasets).where(eq(researchDatasets.id, id));
      if (!d || (d.ownerUserId !== p.userId && !hasRole(p, RESEARCH_ROLES))) throw new NotFoundException('Dataset not found');
      if (d.files.length >= 20) throw new ConflictException('A dataset can hold up to 20 files');
      const stored = await putBlob(this.storage, p.tenantId, `datasets/${id}`, b, this.scans);
      const files = [...d.files, { name: stored.title, storageKey: stored.storageKey, sizeBytes: stored.sizeBytes, contentType: stored.contentType }];
      await tx.update(researchDatasets).set({ files }).where(eq(researchDatasets.id, id));
      await auditUser(tx, p, 'research.dataset_file_added', 'research_dataset', id, { name: stored.title, sizeBytes: stored.sizeBytes });
      return { index: files.length - 1, name: stored.title, sizeBytes: stored.sizeBytes };
    });
  }

  @Get('datasets/:id/files/:index/download')
  @Auth('user', FACULTY_ROLES)
  download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('index', ParseIntPipe) index: number, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(researchDatasets).where(eq(researchDatasets.id, id));
      if (!d || !(await this.canOpen(tx, p, d))) throw new NotFoundException('Dataset not found');
      const f = d.files[index];
      if (!f) throw new NotFoundException('File not found');
      await auditUser(tx, p, 'research.dataset_downloaded', 'research_dataset', id, { name: f.name });
      return sendBlob(this.storage, res, { storageKey: f.storageKey, contentType: f.contentType, title: f.name });
    });
  }

  @Delete('datasets/:id')
  @HttpCode(204)
  @Auth('user', FACULTY_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(researchDatasets).where(and(eq(researchDatasets.id, id)));
      if (!d || (d.ownerUserId !== p.userId && !hasRole(p, RESEARCH_ROLES))) throw new NotFoundException('Dataset not found');
      await tx.delete(researchDatasets).where(eq(researchDatasets.id, id));
      for (const f of d.files) await this.storage.delete(f.storageKey);
    });
  }

  // ---- DOI import -------------------------------------------------------------------------------

  /**
   * Records a publication from its DOI. The registry (Crossref) is read through the cache; when it cannot be reached the
   * typed-in fallback details are kept as a pending record (filled in by "Refresh pending DOIs"), else 502 REGISTRY_OFFLINE.
   * A DOI or a title (any punctuation, the same or the next year) already on record is refused as a duplicate.
   */
  @Post('publications/import-doi')
  @Auth('user', FACULTY_ROLES)
  async importDoi(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    const doi = normalizeDoi(b.doi);
    if (!doi) throw new BadRequestException({ message: 'That is not a valid DOI', code: 'INVALID_DOI' });
    const { source, record } = await this.doi.lookup(p.tenantId, doi);
    if (source === 'not_found') throw new NotFoundException('No publication is registered with that DOI');
    if (source === 'offline' && !b.fallback) throw new BadGatewayException({ message: 'The DOI registry could not be reached. Enter the title, venue and year and the record is completed when the registry is back.', code: 'REGISTRY_OFFLINE' });
    const rec = record ?? { ...b.fallback!, issn: null, authors: [] as { name: string }[] };
    return this.db.withTenant(p.tenantId, async (tx) => {
      const dup = await duplicateOf(tx, { doi, title: rec.title, year: rec.year });
      if (dup) throw new ConflictException({ message: dup.reason === 'doi' ? 'A publication with that DOI is already recorded' : 'This publication is already recorded (same title); add yourself as an author there', code: 'DUPLICATE_PUBLICATION', existingId: dup.id });
      const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, p.userId));
      const authors = rec.authors.length ? rec.authors : [{ name: me?.name ?? '', userId: p.userId }];
      const [row] = await orConflict('A publication with that DOI is already recorded', () =>
        tx.insert(publications).values({ tenantId: p.tenantId, ownerUserId: p.userId, doi, title: rec.title, kind: rec.kind, venue: rec.venue, year: rec.year, issn: rec.issn, authors, projectId: b.projectId ?? null, metadataSource: record ? 'crossref' : 'pending' }).returning(),
      );
      await auditUser(tx, p, 'research.publication_imported', 'publication', row.id, { doi, source });
      return { ...row, lookup: source };
    });
  }
}
