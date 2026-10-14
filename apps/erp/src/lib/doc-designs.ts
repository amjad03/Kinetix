/**
 * Document templates, branding and the register of issued documents, as the API returns them
 * (packages/shared/src/doc-layout.ts on the server side), and the colour helpers the branding page
 * uses for its contrast warnings.
 */

export const DOC_TYPES = [
  'student_id_card',
  'staff_id_card',
  'marks_card',
  'transcript',
  'hall_ticket',
  'fee_receipt',
  'fee_invoice',
  'bonafide_certificate',
  'transfer_certificate',
  'conduct_certificate',
  'course_completion_certificate',
  'salary_slip',
  'offer_letter',
  'appointment_letter',
  'report_cover',
  'generic_certificate',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_GROUPS: { id: string; types: DocType[] }[] = [
  { id: 'identity', types: ['student_id_card', 'staff_id_card'] },
  { id: 'academic', types: ['marks_card', 'transcript', 'hall_ticket'] },
  { id: 'finance', types: ['fee_receipt', 'fee_invoice'] },
  { id: 'certificate', types: ['bonafide_certificate', 'transfer_certificate', 'conduct_certificate', 'course_completion_certificate', 'generic_certificate'] },
  { id: 'hr', types: ['salary_slip', 'offer_letter', 'appointment_letter'] },
  { id: 'report', types: ['report_cover'] },
];

/** Card types have a front and a back. */
export const CARD_TYPES: DocType[] = ['student_id_card', 'staff_id_card'];
/** Landscape pages (thumbnails are wider). */
export const isCard = (t: DocType) => CARD_TYPES.includes(t);

export type PresetStyle = 'classic' | 'modern' | 'minimal' | 'heritage';

export interface DocTemplateSummary {
  id: string;
  docType: DocType;
  name: string;
  system: boolean;
  style: PresetStyle | null;
  basedOn: string | null;
  version: number;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface DocTemplateVersion {
  version: number;
  name: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const PALETTE_KEYS = ['primary', 'secondary', 'tertiary', 'accent', 'ink', 'paper'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

export const FONT_FAMILIES = ['noto-serif', 'noto-sans', 'playfair', 'eb-garamond', 'cinzel', 'poppins'] as const;
export type FontFamilyId = (typeof FONT_FAMILIES)[number];
export const FONT_INFO: Record<FontFamilyId, { label: string; css: string }> = {
  'noto-serif': { label: 'Noto Serif', css: 'Georgia, "Noto Serif", serif' },
  'noto-sans': { label: 'Noto Sans', css: '"Noto Sans", system-ui, sans-serif' },
  playfair: { label: 'Playfair Display', css: '"Playfair Display", Georgia, serif' },
  'eb-garamond': { label: 'EB Garamond', css: '"EB Garamond", Garamond, Georgia, serif' },
  cinzel: { label: 'Cinzel', css: 'Cinzel, "Trajan Pro", Georgia, serif' },
  poppins: { label: 'Poppins', css: 'Poppins, system-ui, sans-serif' },
};

export const BRAND_ASSETS = ['logo', 'logo_dark', 'emblem', 'seal', 'favicon'] as const;
export type BrandAssetKind = (typeof BRAND_ASSETS)[number];
export const SIGNATORY_ROLES = ['principal', 'registrar', 'controller', 'finance', 'hr'] as const;
export type SignatoryRole = (typeof SIGNATORY_ROLES)[number];

export interface Branding {
  palette: Palette;
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  assets: Partial<Record<BrandAssetKind, { version: string; contentType: string; width: number; height: number }>>;
  signatories: Partial<Record<SignatoryRole, { name: string; designation: string; hasSignature: boolean; signatureVersion?: string }>>;
  tagline: string | null;
  gstin: string | null;
  updatedAt: string | null;
}

export interface PublicBranding {
  slug: string;
  name: string;
  palette: Palette;
  tagline: string | null;
  assets: Partial<Record<BrandAssetKind, string>>;
}

export type IssuedStatus = 'valid' | 'revoked' | 'superseded';

export interface IssuedDocument {
  id: string;
  docType: DocType;
  serial: string;
  title: string;
  subjectName: string | null;
  status: IssuedStatus;
  issuedAt: string;
  issuedBy: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  supersededBy: string | null;
  fingerprint: string;
  verifyUrl: string;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21 (AA: 4.5 for text, 3 for large text). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour pairs documents set text in, with their contrast. */
export function paletteChecks(p: Palette): { fg: PaletteKey | 'white'; bg: PaletteKey; ratio: number; level: 'aa' | 'large' | 'fail' }[] {
  const pairs: [PaletteKey | 'white', PaletteKey][] = [['ink', 'paper'], ['primary', 'paper'], ['secondary', 'paper'], ['tertiary', 'paper'], ['accent', 'paper'], ['white', 'primary'], ['white', 'tertiary'], ['white', 'accent']];
  return pairs.map(([fg, bg]) => {
    const ratio = contrast(fg === 'white' ? '#ffffff' : p[fg], p[bg]);
    return { fg, bg, ratio: Math.round(ratio * 10) / 10, level: ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'large' : 'fail' };
  });
}

/** `color` mixed with paper: a tint as the documents draw it (`primary.12`). */
export function tint(color: string, paper: string, strength: number): string {
  const a = rgb(color);
  const b = rgb(paper);
  return `#${a.map((c, i) => Math.round(c * strength + b[i] * (1 - strength)).toString(16).padStart(2, '0')).join('')}`;
}

/** Where the ERP serves a template preview image (proxied with the session). */
export const previewUrl = (id: string, o: { format?: 'png' | 'svg' | 'pdf'; side?: string; width?: number; animate?: boolean; v?: string | number } = {}) => {
  const q = new URLSearchParams({ kind: 'preview', id, format: o.format ?? 'png' });
  if (o.side) q.set('side', o.side);
  if (o.width) q.set('width', String(o.width));
  if (o.animate) q.set('animate', '1');
  if (o.v !== undefined) q.set('v', String(o.v));
  return `/api/doc-image?${q.toString()}`;
};

export const brandImageUrl = (kind: string, version?: string) => `/api/doc-image?kind=brand&asset=${encodeURIComponent(kind)}${version ? `&v=${version}` : ''}`;
