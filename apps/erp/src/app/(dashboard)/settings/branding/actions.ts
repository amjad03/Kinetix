'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { BRAND_ASSETS, type Branding, FONT_FAMILIES, HEX, PALETTE_KEYS, SIGNATORY_ROLES } from '@/lib/doc-designs';
import type { ActionResult } from '@/lib/types';

const KINDS = new Set<string>([...BRAND_ASSETS, ...SIGNATORY_ROLES.map((r) => `signature:${r}`)]);
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export interface BrandingInput {
  palette: Record<string, string>;
  fonts: { heading: string; body: string };
  tagline: string;
  gstin: string;
  signatories: Record<string, { name: string; designation: string }>;
}

/** Saves palette, fonts, tagline, GSTIN and signatory names (PUT /v1/admin/branding). */
export async function saveBranding(b: BrandingInput): Promise<ActionResult<Branding>> {
  const palette = Object.fromEntries(PALETTE_KEYS.filter((k) => HEX.test(b.palette[k] ?? '')).map((k) => [k, b.palette[k].toLowerCase()]));
  const fonts = Object.fromEntries((['heading', 'body'] as const).filter((k) => (FONT_FAMILIES as readonly string[]).includes(b.fonts[k])).map((k) => [k, b.fonts[k]]));
  const signatories = Object.fromEntries(SIGNATORY_ROLES.filter((r) => b.signatories[r]).map((r) => [r, { name: b.signatories[r].name.trim().slice(0, 120), designation: b.signatories[r].designation.trim().slice(0, 120) }]));
  const res = await act(() => api<Branding>('/v1/admin/branding', { method: 'PUT', body: { palette, fonts, signatories, tagline: b.tagline.trim() || null, gstin: b.gstin.trim() || null } }));
  // The sidebar, sign-in page and every preview follow the branding.
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

/** Uploads a logo, crest, seal, favicon or signature from the form's file input. */
export async function uploadBrandImage(form: FormData): Promise<ActionResult<Branding>> {
  const kind = String(form.get('kind') ?? '');
  const file = form.get('file');
  if (!KINDS.has(kind) || !(file instanceof File) || !TYPES.has(file.type) || file.size === 0 || file.size > 4_000_000) return { ok: false, error: 'Choose an image file up to 4 MB.' };
  const contentBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const res = await act(() => api<Branding>(`/v1/admin/branding/assets/${encodeURIComponent(kind)}`, { method: 'PUT', body: { contentType: file.type, contentBase64 } }));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

export async function removeBrandImage(kind: string): Promise<ActionResult<Branding>> {
  if (!KINDS.has(kind)) return { ok: false, error: 'Unknown image.' };
  const res = await act(() => api<Branding>(`/v1/admin/branding/assets/${encodeURIComponent(kind)}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}
