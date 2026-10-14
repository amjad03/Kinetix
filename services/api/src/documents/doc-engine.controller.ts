import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { BRAND_ASSETS, type BrandAssetKind, DOC_BINDINGS, DOC_SAMPLES, DOC_TYPES, type DocType, FONT_FAMILIES, PALETTE_KEYS, SIGNATORY_ROLES } from '@kinetix/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { BRAND_IMAGE_KINDS, type BrandImageKind, BrandingService } from './branding.service.js';
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
const PreviewBody = z.object({ layout: z.unknown(), format: z.enum(['svg', 'png', 'pdf']).default('png'), side: z.string().max(40).optional(), width: z.number().int().min(80).max(2400).optional() });
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

  /** The bindings each document type offers and its sample data (for the template editor). */
  @Get('designs/bindings/:docType')
  @Auth('user', OFFICE_ROLES)
  bindings(@Param('docType') t: string) {
    const d = docType(t);
    return { docType: d, bindings: DOC_BINDINGS[d], sample: DOC_SAMPLES[d] };
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
    return this.db.withTenant(p.tenantId, async (tx) => sendPreview(res, await this.engine.preview(tx, layout, { format: b.format, side: b.side, width: b.width ?? 900 }), b.format, `preview-${layout.docType}`));
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
