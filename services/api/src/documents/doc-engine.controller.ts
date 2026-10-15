import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { BRAND_ASSETS, type BrandAssetKind, DOC_BINDINGS, DOC_SAMPLES, DOC_TYPE_INFO, DOC_TYPES, type DocType, FONT_FAMILIES, PALETTE_KEYS, SIGNATORY_ROLES } from '@zynetix/shared';
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { sections, staffProfiles, students, userRoles, users } from '../db/schema.js';
import { STAFF_ROLES } from '../hr/hr.access.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { BRAND_IMAGE_KINDS, type BrandImageKind, BrandingService } from './branding.service.js';
import { staffBlock, studentBlock } from './doc-data.js';
import { DocTemplatesService, parseLayout } from './doc-templates.service.js';
import { DocumentEngine } from './document-engine.service.js';
import { CERT_APPROVERS, OFFICE_ROLES } from './documents.access.js';
import { IssuedDocsService } from './issued-docs.service.js';

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1f3a5f');
const BrandingBody = z.object({
  palette: z.object(Object.fromEntries(PALETTE_KEYS.map((k) => [k, HEX.optional()])) as Record<(typeof PALETTE_KEYS)[number], z.ZodOptional<typeof HEX>>).optional(),
  fonts: z.object({ heading: z.enum(FONT_FAMILIES).optional(), body: z.enum(FONT_FAMILIES).optional() }).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  gstin: z.string().trim().toUpperCase().regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])?$/, 'That is not a valid GSTIN').nullable().optional(),
  signatories: z.object(Object.fromEntries(SIGNATORY_ROLES.map((r) => [r, z.object({ name: z.string().max(120), designation: z.string().max(120) }).optional()])) as Record<(typeof SIGNATORY_ROLES)[number], z.ZodOptional<z.ZodObject<{ name: z.ZodString; designation: z.ZodString }>>>).optional(),
});
const AssetBody = z.object({ contentType: z.string().max(40), contentBase64: z.string().min(8).max(6_000_000) });
const DuplicateBody = z.object({ from: z.string().min(1).max(80), name: z.string().trim().max(80).optional() });
const UpdateBody = z.object({ name: z.string().trim().min(1).max(80).optional(), layout: z.unknown().optional(), note: z.string().trim().max(200).optional() });
const DefaultBody = z.object({ templateId: z.string().min(1).max(80) });
const PreviewBody = z.object({
  layout: z.unknown(),
  format: z.enum(['svg', 'png', 'pdf']).default('png'),
  side: z.string().max(40).optional(),
  width: z.number().int().min(80).max(2400).optional(),
  /** Preview with a real student's or staff member's details and photo instead of the sample person. */
  subject: z.object({ type: z.enum(['student', 'staff']), id: z.uuid() }).optional(),
});
/** The document fonts the editor loads to draw text as the PDF does (assets/fonts). */
const FONT_DIR = new URL('../../assets/fonts/', import.meta.url);
const FONT_FILES = new Set(readdirSync(FONT_DIR).filter((f) => /^[A-Za-z-]+\.ttf$/.test(f)));
const RevokeBody = z.object({ reason: z.string().trim().min(3).max(300) });

const docType = (v: string): DocType => {
  if (!(DOC_TYPES as readonly string[]).includes(v)) throw new NotFoundException('Unknown document type');
  return v as DocType;
};
const imageKind = (v: string): BrandImageKind => {
  if (!(BRAND_IMAGE_KINDS as string[]).includes(v)) throw new NotFoundException('Unknown image');
  return v as BrandImageKind;
};

/** Sends a rendered preview with the right type. */
function sendPreview(res: Response, out: Buffer | string, format: 'svg' | 'png' | 'pdf', name: string): StreamableFile {
  res.setHeader('Content-Type', format === 'svg' ? 'image/svg+xml; charset=utf-8' : format === 'png' ? 'image/png' : 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}.${format}"`);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (format === 'svg') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  return new StreamableFile(Buffer.isBuffer(out) ? out : Buffer.from(out, 'utf8'));
}

/** Settings > Institution > Branding. */
@Controller('v1')
export class BrandingController {
  constructor(
    private readonly db: DbService,
    private readonly branding: BrandingService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  @Get('admin/branding')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hr_manager', 'accountant'])
  get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.branding.get(tx));
  }

  @Put('admin/branding')
  @Auth('user', STAFF_ADMIN_ROLES)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BrandingBody)) b: z.infer<typeof BrandingBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.branding.save(tx, p, b));
  }

  /** Uploads a logo, crest, seal, favicon or signature (`signature:principal`…) as base64 JSON. */
  @Put('admin/branding/assets/:kind')
  @Auth('user', STAFF_ADMIN_ROLES)
  upload(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Body(new ZodBody(AssetBody)) b: z.infer<typeof AssetBody>) {
    const k = imageKind(kind);
    return this.db.withTenant(p.tenantId, (tx) => this.branding.upload(tx, p, k, b.contentType, Buffer.from(b.contentBase64, 'base64')));
  }

  @Delete('admin/branding/assets/:kind')
  @Auth('user', STAFF_ADMIN_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string) {
    const k = imageKind(kind);
    return this.db.withTenant(p.tenantId, (tx) => this.branding.removeAsset(tx, p, k));
  }

  /** Any branding image, signatures included, for the settings page. */
  @Get('admin/branding/assets/:kind')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hr_manager', 'accountant'])
  asset(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Res({ passthrough: true }) res: Response) {
    const k = imageKind(kind);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = this.branding.assetRow(await this.branding.row(tx), k);
      const bytes = a ? await this.branding.bytes(a.key) : null;
      if (!bytes) throw new NotFoundException('There is no such image');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return new StreamableFile(bytes);
    });
  }

  /** The institution's look for the login page, apps and emails. No sign-in. */
  @Get('public/branding/:slug')
  async publicBranding(@Param('slug') slug: string, @Ip() ip: string) {
    await this.limiter.hit(`branding:${ip}`, 120, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('Institution not found');
    return this.db.withTenant(tenant.id, (tx) => this.branding.publicView(tx, slug));
  }

  /** A public branding image (logo, logo_dark, emblem, seal, favicon), cached by its version. */
  @Get('public/branding/:slug/:kind')
  async publicAsset(@Param('slug') slug: string, @Param('kind') kind: string, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit(`branding:${ip}`, 240, 60_000);
    if (!(BRAND_ASSETS as readonly string[]).includes(kind)) throw new NotFoundException('Unknown image');
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('Institution not found');
    return this.db.withTenant(tenant.id, async (tx) => {
      const a = (await this.branding.row(tx))?.assets[kind as BrandAssetKind];
      const bytes = a ? await this.branding.bytes(a.key) : null;
      if (!bytes) throw new NotFoundException('There is no such image');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('ETag', `"${a!.version}"`);
      return new StreamableFile(bytes);
    });
  }
}

/** Documents > Templates: presets, the institution's templates, defaults, versions and previews. */
@Controller('v1/documents')
export class DocTemplatesController {
  constructor(
    private readonly db: DbService,
    private readonly templates: DocTemplatesService,
    private readonly engine: DocumentEngine,
  ) {}

  @Get('designs')
  @Auth('user', OFFICE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('docType') t?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.list(tx, t ? docType(t) : undefined));
  }

  /**
   * The bindings each document type offers and its sample data (for the template editor), with the
   * institution's own name and contacts in place of the sample's, as previews print them.
   */
  @Get('designs/bindings/:docType')
  @Auth('user', OFFICE_ROLES)
  bindings(@CurrentPrincipal() p: UserPrincipal, @Param('docType') t: string) {
    const d = docType(t);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sample = DOC_SAMPLES[d];
      const common = await this.engine.common(tx);
      const own = Object.fromEntries(Object.entries(common.institution as Record<string, unknown>).filter(([, v]) => v));
      const signatory = { ...(sample.signatory as object), ...(common.signatory as object) };
      return { docType: d, bindings: DOC_BINDINGS[d], sample: { ...sample, institution: { ...(sample.institution as object), ...own }, signatory } };
    });
  }

  /** Students or staff to preview a template with (`kind=student|staff&q=` name, roll number or employee code). */
  @Get('designs/subjects')
  @Auth('user', OFFICE_ROLES)
  subjects(@CurrentPrincipal() p: UserPrincipal, @Query('kind') kind?: string, @Query('q') q?: string) {
    const k = z.enum(['student', 'staff']).safeParse(kind);
    if (!k.success) throw new BadRequestException('Choose students or staff');
    const term = (q ?? '').trim().replace(/[%_\\]/g, '').slice(0, 60);
    const like = `%${term}%`;
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (k.data === 'student') {
        const rows = await tx
          .select({ id: students.id, name: students.fullName, code: students.rollNo, detail: sections.displayName })
          .from(students)
          .innerJoin(sections, eq(sections.id, students.sectionId))
          .where(term ? or(ilike(students.fullName, like), ilike(students.rollNo, like)) : undefined)
          .orderBy(asc(students.fullName))
          .limit(20);
        return rows.map((r) => ({ type: 'student' as const, id: r.id, name: r.name, detail: [r.code, r.detail].filter(Boolean).join(' · ') }));
      }
      const rows = await tx
        .selectDistinct({ id: users.id, name: users.fullName, code: staffProfiles.employeeCode })
        .from(users)
        .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, STAFF_ROLES)))
        .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
        .where(and(eq(users.status, 'active'), term ? or(ilike(users.fullName, like), ilike(staffProfiles.employeeCode, like)) : undefined))
        .orderBy(asc(users.fullName))
        .limit(20);
      return rows.map((r) => ({ type: 'staff' as const, id: r.id, name: r.name, detail: r.code ?? '' }));
    });
  }

  /** One person's data block (`student` or `staff`), so the editor's canvas can show their real details. */
  @Get('designs/subjects/:type/:id')
  @Auth('user', OFFICE_ROLES)
  subjectData(@CurrentPrincipal() p: UserPrincipal, @Param('type') type: string, @Param('id', ParseUUIDPipe) id: string) {
    if (type !== 'student' && type !== 'staff') throw new NotFoundException('Unknown kind of person');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const block = type === 'student' ? await studentBlock(tx, id) : await staffBlock(tx, id);
      if (!Object.keys(block[type] as object).length) throw new NotFoundException(type === 'student' ? 'Student not found' : 'Staff member not found');
      return block;
    });
  }

  /** A document font file (SIL OFL), so the editor's canvas sets text in the faces the PDF embeds. */
  @Get('designs/fonts/:file')
  @Auth('user', OFFICE_ROLES)
  async font(@Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    if (!FONT_FILES.has(file)) throw new NotFoundException('Unknown font');
    res.setHeader('Content-Type', 'font/ttf');
    res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
    return new StreamableFile(await readFile(new URL(file, FONT_DIR)));
  }

  @Get('designs/:id')
  @Auth('user', OFFICE_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.get(tx, id));
  }

  @Post('designs')
  @Auth('user', CERT_APPROVERS)
  duplicate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DuplicateBody)) b: z.infer<typeof DuplicateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.duplicate(tx, p, b.from, b.name));
  }

  @Put('designs/:id')
  @Auth('user', CERT_APPROVERS)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string, @Body(new ZodBody(UpdateBody)) b: z.infer<typeof UpdateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.update(tx, p, id, b));
  }

  @Delete('designs/:id')
  @HttpCode(204)
  @Auth('user', CERT_APPROVERS)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.remove(tx, p, id));
  }

  @Get('designs/:id/versions')
  @Auth('user', OFFICE_ROLES)
  versions(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.versions(tx, id));
  }

  @Post('designs/:id/versions/:version/restore')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  restore(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string, @Param('version') version: string) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1) throw new BadRequestException('Bad version');
    return this.db.withTenant(p.tenantId, (tx) => this.templates.restore(tx, p, id, v));
  }

  @Put('designs/defaults/:docType')
  @Auth('user', CERT_APPROVERS)
  setDefault(@CurrentPrincipal() p: UserPrincipal, @Param('docType') t: string, @Body(new ZodBody(DefaultBody)) b: z.infer<typeof DefaultBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.templates.setDefault(tx, p, docType(t), b.templateId));
  }

  /** `preview.svg|png|pdf?side=front&page=0&width=480&animate=1`, rendered with sample data and the institution's branding. */
  @Get('designs/:id/preview.:format')
  @Auth('user', OFFICE_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string, @Param('format') format: string, @Res({ passthrough: true }) res: Response, @Query('side') side?: string, @Query('page') page?: string, @Query('width') width?: string, @Query('animate') animate?: string) {
    const f = z.enum(['svg', 'png', 'pdf']).safeParse(format);
    if (!f.success) throw new NotFoundException('Use .svg, .png or .pdf');
    const w = width ? Math.max(80, Math.min(2400, Number(width) || 600)) : 900;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = await this.templates.get(tx, id);
      const out = await this.engine.preview(tx, t.layout, { format: f.data, side, page: page ? Number(page) || 0 : 0, width: w, animate: animate === '1' });
      return sendPreview(res, out, f.data, `${t.docType}-${t.name}`.replace(/[^A-Za-z0-9-]+/g, '-'));
    });
  }

  /** Renders an unsaved layout (the editor's live preview). */
  @Post('designs/preview')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  previewLayout(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>, @Res({ passthrough: true }) res: Response) {
    const layout = parseLayout(b.layout);
    const wants = DOC_TYPE_INFO[layout.docType].subject;
    if (b.subject && b.subject.type !== wants) throw new BadRequestException(wants === 'staff' ? 'This document is about a staff member' : wants === 'student' ? 'This document is about a student' : 'This document is not about a person');
    return this.db.withTenant(p.tenantId, async (tx) => sendPreview(res, await this.engine.preview(tx, layout, { format: b.format, side: b.side, width: b.width ?? 900, subject: b.subject }), b.format, `preview-${layout.docType}`));
  }
}

/** The register of issued documents: list, reprint, revoke, reissue. */
@Controller('v1/documents/issued')
export class IssuedDocsController {
  constructor(
    private readonly db: DbService,
    private readonly issued: IssuedDocsService,
    private readonly engine: DocumentEngine,
  ) {}

  @Get()
  @Auth('user', OFFICE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('docType') t?: string, @Query('status') status?: string, @Query('q') q?: string) {
    const st = z.enum(['valid', 'revoked', 'superseded']).optional().parse(status || undefined);
    return this.db.withTenant(p.tenantId, (tx) => this.issued.list(tx, { docType: t ? docType(t) : undefined, status: st, q: q?.slice(0, 80) }));
  }

  @Get(':id/pdf')
  @Auth('user', OFFICE_ROLES)
  pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.engine.reprint(tx, id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${r.serial.replace(/\//g, '-')}.pdf"`);
      return new StreamableFile(r.pdf);
    });
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RevokeBody)) b: z.infer<typeof RevokeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.issued.revoke(tx, p, id, b.reason));
  }

  @Post(':id/reissue')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  reissue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.issued.reissue(tx, p, id));
  }
}
