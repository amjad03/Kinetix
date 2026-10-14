import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type BrandAssetKind, BRAND_ASSETS, type Branding, DEFAULT_FONTS, DEFAULT_PALETTE, FONT_FAMILIES, type FontFamilyId, type Palette, PALETTE_KEYS, type PublicBranding, SIGNATORY_ROLES, type SignatoryRole } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { type BrandAssetRow, institutionBranding, tenants } from '../db/schema.js';
import { ObjectStorage } from '../storage/storage.service.js';
import type { RenderContext } from './engine/index.js';
import { type ImageRes, loadImage } from './engine/images.js';

/** An uploadable branding image: a brand asset or a signatory's signature (`signature:principal`). */
export type BrandImageKind = BrandAssetKind | `signature:${SignatoryRole}`;
export const BRAND_IMAGE_KINDS: BrandImageKind[] = [...BRAND_ASSETS, ...SIGNATORY_ROLES.map((r) => `signature:${r}` as const)];

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const MAX_BYTES = 4_000_000;

type Row = typeof institutionBranding.$inferSelect;

/**
 * The institution's look (Settings > Institution > Branding): palette, fonts, logos for light and
 * dark grounds, crest, seal, favicon and the signatures of the principal, registrar, controller of
 * examinations, finance officer and HR manager. Uploads are normalised with sharp: PNG with
 * transparency, at most 1600 px; signatures scanned on white have the paper made transparent.
 */
@Injectable()
export class BrandingService {
  /** Decoded images by storage key (they never change under a key). */
  private readonly images = new Map<string, Buffer>();

  constructor(private readonly storage: ObjectStorage) {}

  async row(tx: Tx): Promise<Row | undefined> {
    const [r] = await tx.select().from(institutionBranding);
    return r;
  }

  palette(r: Row | undefined): Palette {
    const p = { ...DEFAULT_PALETTE };
    for (const k of PALETTE_KEYS) if (r?.palette?.[k] && /^#[0-9a-f]{6}$/i.test(r.palette[k])) p[k] = r.palette[k].toLowerCase();
    return p;
  }

  fonts(r: Row | undefined): Branding['fonts'] {
    const ok = (f: string | undefined): f is FontFamilyId => !!f && (FONT_FAMILIES as readonly string[]).includes(f);
    return { heading: ok(r?.fonts?.heading) ? r.fonts.heading : DEFAULT_FONTS.heading, body: ok(r?.fonts?.body) ? r.fonts.body : DEFAULT_FONTS.body };
  }

  view(r: Row | undefined): Branding & { gstin: string | null } {
    const asset = (a: BrandAssetRow) => ({ version: a.version, contentType: a.contentType, width: a.width, height: a.height });
    return {
      palette: this.palette(r),
      fonts: this.fonts(r),
      assets: Object.fromEntries(Object.entries(r?.assets ?? {}).map(([k, a]) => [k, asset(a)])),
      signatories: Object.fromEntries(Object.entries(r?.signatories ?? {}).map(([role, s]) => [role, { name: s.name, designation: s.designation, hasSignature: !!s.signature, ...(s.signature ? { signatureVersion: s.signature.version } : {}) }])),
      tagline: r?.tagline ?? null,
      gstin: r?.gstin ?? null,
      updatedAt: r?.updatedAt.toISOString() ?? null,
    };
  }

  async get(tx: Tx): Promise<Branding & { gstin: string | null }> {
    return this.view(await this.row(tx));
  }

  async save(tx: Tx, p: UserPrincipal, b: { palette?: Partial<Palette>; fonts?: Partial<Branding['fonts']>; tagline?: string | null; gstin?: string | null; signatories?: Partial<Record<SignatoryRole, { name: string; designation: string }>> }) {
    const cur = await this.row(tx);
    const signatories = { ...(cur?.signatories ?? {}) };
    for (const [role, s] of Object.entries(b.signatories ?? {})) {
      if (!s) continue;
      if (!s.name.trim() && !signatories[role]?.signature) delete signatories[role];
      else signatories[role] = { ...signatories[role], name: s.name.trim(), designation: s.designation.trim() };
    }
    const values = {
      palette: { ...this.palette(cur), ...(b.palette ?? {}) },
      fonts: { ...this.fonts(cur), ...(b.fonts ?? {}) },
      tagline: b.tagline === undefined ? (cur?.tagline ?? null) : b.tagline?.trim() || null,
      gstin: b.gstin === undefined ? (cur?.gstin ?? null) : b.gstin?.trim().toUpperCase() || null,
      signatories,
      updatedBy: p.userId,
      updatedAt: new Date(),
    };
    await tx.insert(institutionBranding).values({ tenantId: p.tenantId, ...values }).onConflictDoUpdate({ target: institutionBranding.tenantId, set: values });
    await auditUser(tx, p, 'branding.updated', 'tenant', p.tenantId, { palette: values.palette, fonts: values.fonts, signatories: Object.keys(signatories) });
    return this.get(tx);
  }

  /** Normalises and stores an uploaded image, replacing the one before. */
  async upload(tx: Tx, p: UserPrincipal, kind: BrandImageKind, contentType: string, bytes: Buffer) {
    if (!(ACCEPTED as readonly string[]).includes(contentType)) throw new BadRequestException('Upload a PNG, JPEG, WebP or SVG image');
    if (!bytes.length || bytes.length > MAX_BYTES) throw new BadRequestException('Images can be up to 4 MB');
    const out = await normalise(kind, bytes).catch(() => {
      throw new BadRequestException('That file could not be read as an image');
    });
    const key = `tenants/${p.tenantId}/branding/${kind.replace(':', '-')}-${randomUUID()}.png`;
    await this.storage.put(key, Readable.from(out.data), MAX_BYTES * 2, 'image/png');
    const asset: BrandAssetRow = { key, version: createHash('sha1').update(out.data).digest('hex').slice(0, 12), contentType: 'image/png', width: out.width, height: out.height };
    const cur = await this.row(tx);
    const assets = { ...(cur?.assets ?? {}) };
    const signatories = { ...(cur?.signatories ?? {}) };
    if (kind.startsWith('signature:')) {
      const role = kind.slice(10) as SignatoryRole;
      signatories[role] = { name: signatories[role]?.name ?? '', designation: signatories[role]?.designation ?? '', signature: asset };
    } else assets[kind] = asset;
    await tx.insert(institutionBranding).values({ tenantId: p.tenantId, assets, signatories, updatedBy: p.userId }).onConflictDoUpdate({ target: institutionBranding.tenantId, set: { assets, signatories, updatedBy: p.userId, updatedAt: new Date() } });
    await auditUser(tx, p, 'branding.asset_uploaded', 'tenant', p.tenantId, { kind, version: asset.version });
    return this.get(tx);
  }

  async removeAsset(tx: Tx, p: UserPrincipal, kind: BrandImageKind) {
    const cur = await this.row(tx);
    if (!cur) throw new NotFoundException('There is no such image');
    const assets = { ...cur.assets };
    const signatories = { ...cur.signatories };
    if (kind.startsWith('signature:')) {
      const role = kind.slice(10);
      if (!signatories[role]?.signature) throw new NotFoundException('There is no such image');
      signatories[role] = { ...signatories[role], signature: null };
    } else {
      if (!assets[kind]) throw new NotFoundException('There is no such image');
      delete assets[kind];
    }
    await tx.update(institutionBranding).set({ assets, signatories, updatedBy: p.userId, updatedAt: new Date() }).where(eq(institutionBranding.tenantId, p.tenantId));
    await auditUser(tx, p, 'branding.asset_removed', 'tenant', p.tenantId, { kind });
    return this.get(tx);
  }

  assetRow(r: Row | undefined, kind: BrandImageKind): BrandAssetRow | null {
    if (!r) return null;
    return kind.startsWith('signature:') ? (r.signatories[kind.slice(10)]?.signature ?? null) : (r.assets[kind] ?? null);
  }

  /** The stored bytes of an image (cached: a key's content never changes). */
  async bytes(key: string): Promise<Buffer | null> {
    const hit = this.images.get(key);
    if (hit) return hit;
    try {
      const b = await readAll((await this.storage.get(key)).stream);
      if (this.images.size > 300) this.images.delete(this.images.keys().next().value!);
      this.images.set(key, b);
      return b;
    } catch {
      return null;
    }
  }

  async image(r: Row | undefined, kind: BrandImageKind): Promise<ImageRes | null> {
    const a = this.assetRow(r, kind);
    const b = a ? await this.bytes(a.key) : null;
    return b ? loadImage(b) : null;
  }

  /** Palette, fonts, images and signatories for the engine; the logo stands in for a missing dark logo or crest. */
  async renderContext(tx: Tx, photo?: Buffer | null): Promise<RenderContext> {
    const r = await this.row(tx);
    const [logo, logoDark, emblem, seal] = await Promise.all((['logo', 'logo_dark', 'emblem', 'seal'] as const).map((k) => this.image(r, k)));
    const sigs = await Promise.all(SIGNATORY_ROLES.map(async (role) => [`signature:${role}`, await this.image(r, `signature:${role}`)] as const));
    return {
      palette: this.palette(r),
      fonts: this.fonts(r),
      images: { logo: logo ?? emblem, logo_dark: logoDark ?? logo ?? emblem, emblem: emblem ?? logo, seal, photo: photo ? loadImage(photo) : null, ...Object.fromEntries(sigs) },
      signatories: Object.fromEntries(Object.entries(r?.signatories ?? {}).filter(([, s]) => s.name).map(([role, s]) => [role, { name: s.name, designation: s.designation }])),
    };
  }

  /** What anyone may see: name, palette, fonts and the public images (never signatures). */
  async publicView(tx: Tx, slug: string): Promise<PublicBranding> {
    const r = await this.row(tx);
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const assets: PublicBranding['assets'] = {};
    for (const k of BRAND_ASSETS) {
      const a = r?.assets[k];
      if (a) assets[k] = `/v1/public/branding/${slug}/${k}?v=${a.version}`;
    }
    return { slug, name: t?.name ?? '', palette: this.palette(r), fonts: this.fonts(r), tagline: r?.tagline ?? null, assets };
  }
}

/** Reads a stored object into memory. */
export async function readAll(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
  return Buffer.concat(parts);
}

/** Every upload becomes a PNG with transparency, sized for print. */
async function normalise(kind: BrandImageKind, bytes: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const max = kind === 'favicon' ? 256 : kind.startsWith('signature:') ? 1000 : 1600;
  let img = sharp(bytes, { density: 300, limitInputPixels: 60_000_000 }).rotate().ensureAlpha();
  if (kind === 'favicon') img = img.resize({ width: max, height: max, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  else img = img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  if (kind.startsWith('signature:')) {
    // Paper to transparency: alpha follows how far each pixel is from white, ink keeps its colour.
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const a = Math.max(0, Math.min(255, Math.round(((235 - lum) / 95) * 255)));
      data[i + 3] = Math.min(data[i + 3], a);
    }
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    return { data: png.data, width: png.info.width, height: png.info.height };
  }
  const out = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}
