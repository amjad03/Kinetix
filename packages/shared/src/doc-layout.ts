/**
 * Document layout: the JSON a document template is made of, rendered by the API's document
 * engine (services/api/src/documents/engine) to PDF, SVG and PNG. One schema for every document
 * the institution issues: ID cards, marks cards, receipts, certificates, letters, report covers.
 *
 * Reference: docs/architecture/documents-certificates.md ("Layout JSON").
 *
 * Units: positions and sizes (`x`, `y`, `w`, `h`, anything ending in `Mm`) are millimetres from
 * the top-left corner of the page side; font sizes and line widths (anything ending in `Pt`) are
 * points (1 pt = 0.3528 mm). Angles are degrees, clockwise.
 *
 * Colours are {@link ColorRef}s: a palette token (`primary`, `secondary`, `tertiary`, `accent`,
 * `ink`, `paper`, plus derived `muted`, `line`, `white`, `black`) or a `#rrggbb` hex. Tokens follow
 * the institution's branding, so changing the palette restyles every template.
 *
 * Text may hold bindings, `{{student.name}}`, resolved against the document's data (see
 * {@link DOC_BINDINGS}), with optional filters: `{{fee.amount | money}}`, `{{doc.issuedOn | date}}`,
 * `{{fee.amount | words}}`, `{{student.name | upper}}`. Text elements with `markdown: true` also
 * take `**bold**` and `*italic*` spans.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------------------------

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

/** Who a document of the type is about. */
export type DocSubjectKind = 'student' | 'staff' | 'candidate' | 'none';

export interface DocTypeInfo {
  type: DocType;
  /** English name; the ERP shows its own translation (`dt.type.<type>`). */
  label: string;
  subject: DocSubjectKind;
  /** Serial prefix of issued documents of this type. */
  serialPrefix: string;
  /** Group in the template gallery. */
  group: 'identity' | 'academic' | 'finance' | 'certificate' | 'hr' | 'report';
}

export const DOC_TYPE_INFO: Record<DocType, DocTypeInfo> = {
  student_id_card: { type: 'student_id_card', label: 'Student ID card', subject: 'student', serialPrefix: 'SID', group: 'identity' },
  staff_id_card: { type: 'staff_id_card', label: 'Staff ID card', subject: 'staff', serialPrefix: 'EID', group: 'identity' },
  marks_card: { type: 'marks_card', label: 'Marks card / grade card', subject: 'student', serialPrefix: 'MC', group: 'academic' },
  transcript: { type: 'transcript', label: 'Consolidated marks memo / transcript', subject: 'student', serialPrefix: 'TR', group: 'academic' },
  hall_ticket: { type: 'hall_ticket', label: 'Hall ticket', subject: 'student', serialPrefix: 'HT', group: 'academic' },
  fee_receipt: { type: 'fee_receipt', label: 'Fee receipt', subject: 'student', serialPrefix: 'RCT', group: 'finance' },
  fee_invoice: { type: 'fee_invoice', label: 'Fee invoice', subject: 'student', serialPrefix: 'INV', group: 'finance' },
  bonafide_certificate: { type: 'bonafide_certificate', label: 'Bonafide certificate', subject: 'student', serialPrefix: 'BON', group: 'certificate' },
  transfer_certificate: { type: 'transfer_certificate', label: 'Transfer certificate', subject: 'student', serialPrefix: 'TC', group: 'certificate' },
  conduct_certificate: { type: 'conduct_certificate', label: 'Conduct / character certificate', subject: 'student', serialPrefix: 'CON', group: 'certificate' },
  course_completion_certificate: { type: 'course_completion_certificate', label: 'Course completion certificate', subject: 'student', serialPrefix: 'CC', group: 'certificate' },
  salary_slip: { type: 'salary_slip', label: 'Salary slip', subject: 'staff', serialPrefix: 'PAY', group: 'hr' },
  offer_letter: { type: 'offer_letter', label: 'Offer letter', subject: 'candidate', serialPrefix: 'OFR', group: 'hr' },
  appointment_letter: { type: 'appointment_letter', label: 'Appointment letter', subject: 'staff', serialPrefix: 'APT', group: 'hr' },
  report_cover: { type: 'report_cover', label: 'Report cover page', subject: 'none', serialPrefix: 'RPT', group: 'report' },
  generic_certificate: { type: 'generic_certificate', label: 'Certificate (merit / participation)', subject: 'student', serialPrefix: 'CRT', group: 'certificate' },
};

/** The four looks every document type has as a system preset. */
export const PRESET_STYLES = ['classic', 'modern', 'minimal', 'heritage'] as const;
export type PresetStyle = (typeof PRESET_STYLES)[number];

// ---------------------------------------------------------------------------------------------
// Palette, colours and fonts
// ---------------------------------------------------------------------------------------------

export const PALETTE_KEYS = ['primary', 'secondary', 'tertiary', 'accent', 'ink', 'paper'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

/** Tokens a {@link ColorRef} may name: the palette plus `muted` (ink at 60 % on paper), `line` (ink at 18 %), `white` and `black`. */
export const COLOR_TOKENS = [...PALETTE_KEYS, 'muted', 'line', 'white', 'black'] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const DEFAULT_PALETTE: Palette = {
  primary: '#1f3a5f',
  secondary: '#9a7b3c',
  tertiary: '#2f6b5e',
  accent: '#a8323e',
  ink: '#1b1f24',
  paper: '#ffffff',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
/**
 * A colour: `#rrggbb`, a token (`primary`), a tint of a token toward paper (`primary.15` = 15 %
 * of primary over paper, for washes and zebra rows) or a shade toward black (`primary!30` = primary
 * darkened by 30 %).
 */
export const COLOR_REF = /^(#[0-9a-fA-F]{6}|(primary|secondary|tertiary|accent|ink|paper|muted|line|white|black)([.!](100|[1-9]?[0-9]))?)$/;
export const ColorRefSchema = z.string().regex(COLOR_REF, 'A colour is #rrggbb or a palette token such as primary, primary.15 or primary!30');
export type ColorRef = string;

export const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const rgbToHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((c, i) => c * t + y[i] * (1 - t)));
};

/** The `#rrggbb` a colour reference stands for under `palette`. */
export function resolveColor(ref: ColorRef, palette: Palette): string {
  if (HEX.test(ref)) return ref.toLowerCase();
  const m = /^([a-z]+)(?:([.!])(\d{1,3}))?$/.exec(ref);
  if (!m) return palette.ink;
  const base = m[1] === 'muted' ? mix(palette.ink, palette.paper, 0.6) : m[1] === 'line' ? mix(palette.ink, palette.paper, 0.18) : m[1] === 'white' ? '#ffffff' : m[1] === 'black' ? '#000000' : (palette[m[1] as PaletteKey] ?? palette.ink);
  if (!m[2]) return base.toLowerCase();
  const n = Math.min(100, Number(m[3])) / 100;
  return m[2] === '.' ? mix(base, palette.paper, n) : mix('#000000', base, n);
}

/** WCAG 2.x relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. AA needs 4.5 for body text and 3 for large text. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs of a palette that carry text on documents, with their WCAG contrast. */
export function paletteContrast(p: Palette): { pair: [PaletteKey | 'white', PaletteKey]; ratio: number; aa: boolean; aaLarge: boolean }[] {
  const pairs: [PaletteKey | 'white', PaletteKey][] = [['ink', 'paper'], ['primary', 'paper'], ['secondary', 'paper'], ['tertiary', 'paper'], ['accent', 'paper'], ['white', 'primary'], ['white', 'secondary'], ['white', 'tertiary'], ['white', 'accent']];
  return pairs.map((pair) => {
    const ratio = contrastRatio(pair[0] === 'white' ? '#ffffff' : p[pair[0]], p[pair[1]]);
    return { pair, ratio: Math.round(ratio * 100) / 100, aa: ratio >= 4.5, aaLarge: ratio >= 3 };
  });
}

/**
 * Curated font families. Each covers Latin, Devanagari (Hindi) and Kannada: the Latin face of the
 * family, with Noto Serif or Noto Sans Devanagari and Kannada faces matched to it. All are embedded
 * (subset) in every PDF.
 */
export const FONT_FAMILIES = ['noto-serif', 'noto-sans', 'playfair', 'eb-garamond', 'cinzel', 'poppins'] as const;
export type FontFamilyId = (typeof FONT_FAMILIES)[number];
export const FONT_FAMILY_INFO: Record<FontFamilyId, { label: string; category: 'serif' | 'sans' | 'display'; weights: (400 | 600 | 700)[]; italic: boolean }> = {
  'noto-serif': { label: 'Noto Serif', category: 'serif', weights: [400, 600, 700], italic: true },
  'noto-sans': { label: 'Noto Sans', category: 'sans', weights: [400, 600, 700], italic: false },
  playfair: { label: 'Playfair Display', category: 'display', weights: [400, 700], italic: true },
  'eb-garamond': { label: 'EB Garamond', category: 'serif', weights: [400, 700], italic: true },
  cinzel: { label: 'Cinzel', category: 'display', weights: [400, 700], italic: false },
  poppins: { label: 'Poppins', category: 'sans', weights: [400, 600, 700], italic: true },
};
/** `heading` and `body` follow the institution's branding fonts; a family id pins one. */
export const FontRefSchema = z.union([z.enum(['heading', 'body']), z.enum(FONT_FAMILIES)]);
export type FontRef = z.infer<typeof FontRefSchema>;

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

export const GradientStopSchema = z.object({ at: z.number().min(0).max(1), color: ColorRefSchema });
/** A linear gradient across the element's box; `angleDeg` 0 runs left to right, 90 top to bottom. */
export const LinearGradientSchema = z.object({ kind: z.literal('linear'), angleDeg: z.number().min(-360).max(360), stops: z.array(GradientStopSchema).min(2).max(12) });
/** A radial gradient; centre (`cx`, `cy`) and radius `r` are fractions of the box (r of half its diagonal). */
export const RadialGradientSchema = z.object({ kind: z.literal('radial'), cx: z.number().min(-1).max(2).default(0.5), cy: z.number().min(-1).max(2).default(0.5), r: z.number().min(0.01).max(3).default(1), stops: z.array(GradientStopSchema).min(2).max(12) });
export const FillSchema = z.union([ColorRefSchema, LinearGradientSchema, RadialGradientSchema]);
export type Fill = z.infer<typeof FillSchema>;

export const StrokeSchema = z.object({
  color: ColorRefSchema,
  widthPt: z.number().min(0.05).max(40),
  /** Dash pattern in mm (`[2, 1]` = 2 mm on, 1 mm off). */
  dashMm: z.array(z.number().min(0.05).max(50)).max(6).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const TextStyleSchema = z.object({
  font: FontRefSchema.default('body'),
  sizePt: z.number().min(2).max(200),
  weight: z.union([z.literal(400), z.literal(600), z.literal(700)]).default(400),
  italic: z.boolean().optional(),
  color: ColorRefSchema.default('ink'),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  /** Line height as a multiple of the size. */
  lineHeight: z.number().min(0.8).max(3).default(1.3),
  /** Extra space after every character, in points (small caps titles use 1 to 4). */
  letterSpacingPt: z.number().min(-2).max(30).optional(),
  transform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/** Images an element can show: branding assets, the subject's photo, or a signatory's signature. */
export const IMAGE_SOURCES = ['logo', 'logo_dark', 'emblem', 'seal', 'photo', 'signature:principal', 'signature:registrar', 'signature:controller', 'signature:finance', 'signature:hr'] as const;
export const ImageSourceSchema = z.enum(IMAGE_SOURCES);
export type ImageSource = z.infer<typeof ImageSourceSchema>;

/** Who signs: principal, registrar, controller of examinations, finance officer, HR manager. */
export const SIGNATORY_ROLES = ['principal', 'registrar', 'controller', 'finance', 'hr'] as const;
export type SignatoryRole = (typeof SIGNATORY_ROLES)[number];

// ---------------------------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------------------------

const Base = {
  /** Stable id within the layout (the editor's selection key). */
  id: z.string().min(1).max(64),
  /** Name in the editor's layer list. */
  name: z.string().max(80).optional(),
  x: z.number().min(-500).max(2000),
  y: z.number().min(-500).max(2000),
  w: z.number().min(0).max(2000),
  h: z.number().min(0).max(2000),
  rotationDeg: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  /** Editor only: elements with the same group id are selected, moved and resized together. */
  group: z.string().min(1).max(64).optional(),
  /** On documents that run to several pages (a long table): every page (default), the first or the last only. */
  pages: z.enum(['all', 'first', 'last']).optional(),
  /** A binding path; the element is drawn only when it has a value (e.g. `student.bloodGroup`). */
  showIf: z.string().max(120).optional(),
  /**
   * The id of an earlier element on the same side. This element moves up by the height that one
   * leaves unused (and by however far that one moved), so a summary sits right under a table or
   * paragraph of any length.
   */
  flowAfter: z.string().max(64).optional(),
};

export const TextElementSchema = z.object({
  ...Base,
  type: z.literal('text'),
  text: z.string().max(6000),
  style: TextStyleSchema,
  vAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  /** `shrink` lowers the size (down to `minSizePt`) until the text fits the box. */
  fit: z.enum(['none', 'shrink']).default('none'),
  minSizePt: z.number().min(2).max(200).optional(),
  /** Read `**bold**` and `*italic*` spans. */
  markdown: z.boolean().optional(),
  /** Colour of `**bold**` spans (default: the text colour). */
  emphasisColor: ColorRefSchema.optional(),
  maxLines: z.number().int().min(1).max(500).optional(),
});

/** A label and its value: stacked (label above) or in a row (label column, then value). */
export const FieldElementSchema = z.object({
  ...Base,
  type: z.literal('field'),
  label: z.string().max(200),
  value: z.string().max(2000),
  direction: z.enum(['row', 'column']).default('row'),
  /** Width of the label column in a row, mm. */
  labelWidthMm: z.number().min(0).max(1000).optional(),
  /** Printed between label and value in a row, e.g. ":". */
  separator: z.string().max(4).optional(),
  labelStyle: TextStyleSchema,
  valueStyle: TextStyleSchema,
  /** A line under the value, like a filled-in form. */
  rule: StrokeSchema.optional(),
});

/** Label-value pairs from a data list (`doc.fields`), laid out in columns. */
export const FieldListElementSchema = z.object({
  ...Base,
  type: z.literal('fieldList'),
  /** Binding path of a list of `{ label, value }`. */
  source: z.string().min(1).max(120),
  columns: z.number().int().min(1).max(4).default(1),
  rowHeightMm: z.number().min(2).max(100),
  labelWidthMm: z.number().min(0).max(1000).optional(),
  separator: z.string().max(4).optional(),
  labelStyle: TextStyleSchema,
  valueStyle: TextStyleSchema,
  rule: StrokeSchema.optional(),
});

export const ImageElementSchema = z.object({
  ...Base,
  type: z.literal('image'),
  source: ImageSourceSchema,
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  crop: z.enum(['rect', 'rounded', 'circle']).default('rect'),
  radiusMm: z.number().min(0).max(100).optional(),
  border: StrokeSchema.optional(),
  /** What a photo without a picture shows: the person's initials, a silhouette, or nothing. */
  placeholder: z.enum(['initials', 'silhouette', 'none']).optional(),
  /** Background behind a contained image (and the placeholder). */
  background: FillSchema.optional(),
});

/** A signatory's signature image, the signing line, name and designation (from branding). */
export const SignatureElementSchema = z.object({
  ...Base,
  type: z.literal('signature'),
  role: z.enum(SIGNATORY_ROLES),
  showImage: z.boolean().default(true),
  showName: z.boolean().default(true),
  showDesignation: z.boolean().default(true),
  line: StrokeSchema.optional(),
  nameStyle: TextStyleSchema,
  designationStyle: TextStyleSchema,
});

export const QrElementSchema = z.object({
  ...Base,
  type: z.literal('qr'),
  /** What the code holds; default the document's verification link. */
  value: z.string().max(400).default('{{verify.url}}'),
  color: ColorRefSchema.default('ink'),
  background: ColorRefSchema.optional(),
  /** Quiet zone in modules (2 to 4). */
  quietZone: z.number().int().min(0).max(4).default(2),
});

export const BarcodeElementSchema = z.object({
  ...Base,
  type: z.literal('barcode'),
  value: z.string().max(200),
  symbology: z.literal('code128').default('code128'),
  color: ColorRefSchema.default('ink'),
  /** The value printed under the bars. */
  showText: z.boolean().default(true),
  textStyle: TextStyleSchema.optional(),
});

export const TableColumnSchema = z.object({
  header: z.string().max(120),
  /** Cell text, with `{{row.<key>}}` bindings into the list item. */
  value: z.string().max(400),
  /** Relative width (weights are shared out over the table width). */
  width: z.number().min(0.1).max(100).default(1),
  align: z.enum(['left', 'center', 'right']).default('left'),
});

export const TableElementSchema = z.object({
  ...Base,
  type: z.literal('table'),
  /** Binding path of the row list, e.g. `marks.rows`, `fee.lines`. */
  source: z.string().min(1).max(120),
  columns: z.array(TableColumnSchema).min(1).max(16),
  header: z.object({ style: TextStyleSchema, fill: FillSchema.optional(), heightMm: z.number().min(2).max(60) }),
  body: z.object({ style: TextStyleSchema, rowHeightMm: z.number().min(2).max(60), zebra: FillSchema.optional() }),
  borders: z
    .object({ outer: StrokeSchema.optional(), horizontal: StrokeSchema.optional(), vertical: StrokeSchema.optional(), headerBottom: StrokeSchema.optional() })
    .default({}),
  /** Summary rows after the data (totals): cells with bindings, spanning columns. */
  footer: z
    .array(z.object({ cells: z.array(z.object({ text: z.string().max(400), span: z.number().int().min(1).max(16).default(1), align: z.enum(['left', 'center', 'right']).default('left') })).min(1), style: TextStyleSchema.optional(), fill: FillSchema.optional() }))
    .max(6)
    .optional(),
  cellPaddingMm: z.number().min(0).max(10).default(1.6),
  /** Fill behind the drawn table (not the unused part of its box). */
  background: FillSchema.optional(),
  emptyText: z.string().max(200).optional(),
  /** Rows that do not fit: continue on another page of the same side (`paginate`) or shrink the rows. */
  overflow: z.enum(['paginate', 'shrink']).default('paginate'),
});

export const ShapeElementSchema = z.object({
  ...Base,
  type: z.literal('shape'),
  /** `line` runs from (x, y) to (x + w, y + h). */
  shape: z.enum(['rect', 'ellipse', 'line']),
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  /** Corner radius of a rect. */
  radiusMm: z.number().min(0).max(500).optional(),
});

export const WatermarkElementSchema = z.object({
  ...Base,
  type: z.literal('watermark'),
  /** Text, or an image when `image` is set. */
  text: z.string().max(200).optional(),
  image: ImageSourceSchema.optional(),
  angleDeg: z.number().min(-90).max(90).default(-30),
  style: TextStyleSchema.optional(),
  /** One mark centred in the box, or tiled over it. */
  repeat: z.enum(['none', 'tile']).default('none'),
  gapMm: z.number().min(2).max(200).optional(),
});

/** Security backgrounds, drawn in fine vector lines and clipped to the box. */
export const PATTERNS = ['guilloche', 'rosette', 'waves', 'microtext', 'crosshatch', 'dots'] as const;
export const PatternElementSchema = z.object({
  ...Base,
  type: z.literal('pattern'),
  pattern: z.enum(PATTERNS),
  color: ColorRefSchema,
  color2: ColorRefSchema.optional(),
  lineWidthPt: z.number().min(0.05).max(3).default(0.25),
  /** 1 (sparse) to 10 (dense). */
  density: z.number().min(1).max(10).default(5),
  /** Microtext line content; default the institution name. */
  text: z.string().max(200).optional(),
  /** Corner radius of the clip box. */
  radiusMm: z.number().min(0).max(100).optional(),
});

/** Decorative borders drawn inside the box. */
export const FRAMES = ['single', 'double', 'triple', 'ornamental', 'guilloche', 'corners'] as const;
export const FrameElementSchema = z.object({
  ...Base,
  type: z.literal('frame'),
  style: z.enum(FRAMES),
  color: ColorRefSchema,
  color2: ColorRefSchema.optional(),
  widthPt: z.number().min(0.1).max(20).default(1),
  /** Space between the rules of a double or triple frame, mm. */
  gapMm: z.number().min(0).max(20).optional(),
  radiusMm: z.number().min(0).max(50).optional(),
});

/**
 * The holographic seal: metallic silver (or gold) gradients, guilloche rings, a micro-text ring
 * ("INSTITUTION • GENUINE • serial"), the emblem in the centre and the document's serial. The
 * ERP preview adds a moving shimmer.
 */
export const SealElementSchema = z.object({
  ...Base,
  type: z.literal('seal'),
  tone: z.enum(['silver', 'gold']).default('silver'),
  emblem: z.enum(['emblem', 'logo', 'none']).default('emblem'),
  ringText: z.string().max(200).default('{{institution.name | upper}} • GENUINE • {{doc.serial}}'),
  serial: z.string().max(80).default('{{doc.serial}}'),
});

export const ElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  FieldElementSchema,
  FieldListElementSchema,
  ImageElementSchema,
  SignatureElementSchema,
  QrElementSchema,
  BarcodeElementSchema,
  TableElementSchema,
  ShapeElementSchema,
  WatermarkElementSchema,
  PatternElementSchema,
  FrameElementSchema,
  SealElementSchema,
]);
export type DocElement = z.infer<typeof ElementSchema>;
export type DocElementType = DocElement['type'];
export type ElementOf<T extends DocElementType> = Extract<DocElement, { type: T }>;

// ---------------------------------------------------------------------------------------------
// Pages and the layout
// ---------------------------------------------------------------------------------------------

/** Named sizes in mm, portrait. CR80 is the ISO/IEC 7810 ID-1 card (85.6 x 54 mm). */
export const PAGE_SIZES = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, CR80: { w: 53.98, h: 85.6 } } as const;

export const PageSchema = z
  .object({
    size: z.enum(['A4', 'A5', 'CR80', 'custom']),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    /** Custom sizes only. */
    widthMm: z.number().min(20).max(1000).optional(),
    heightMm: z.number().min(20).max(1000).optional(),
    /** Editor guide: the safe margin, mm. */
    marginMm: z.number().min(0).max(50).default(10),
  })
  .refine((p) => p.size !== 'custom' || (p.widthMm && p.heightMm), 'A custom page needs widthMm and heightMm');
export type PageSpec = z.infer<typeof PageSchema>;

export const SideSchema = z.object({
  /** `front` and `back` for cards, `page` for single-sided documents. */
  id: z.string().min(1).max(40),
  label: z.string().max(60).optional(),
  background: FillSchema.optional(),
  elements: z.array(ElementSchema).max(400),
});
export type DocSide = z.infer<typeof SideSchema>;

export const LAYOUT_SCHEMA_VERSION = 1;

export const DocLayoutSchema = z
  .object({
    schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
    docType: z.enum(DOC_TYPES),
    page: PageSchema,
    /** Fonts for this template instead of the institution's (`heading`, `body`). */
    fonts: z.object({ heading: z.enum(FONT_FAMILIES).optional(), body: z.enum(FONT_FAMILIES).optional() }).optional(),
    sides: z.array(SideSchema).min(1).max(4),
    meta: z.object({ style: z.enum(PRESET_STYLES).optional(), description: z.string().max(300).optional() }).optional(),
  })
  .superRefine((l, ctx) => {
    const ids = new Set<string>();
    for (const s of l.sides)
      for (const e of s.elements) {
        if (ids.has(`${s.id}/${e.id}`)) ctx.addIssue({ code: 'custom', message: `Duplicate element id ${e.id} on ${s.id}` });
        ids.add(`${s.id}/${e.id}`);
      }
  });
export type DocLayout = z.infer<typeof DocLayoutSchema>;
/** The layout as written (defaults not yet applied), e.g. by the editor. */
export type DocLayoutInput = z.input<typeof DocLayoutSchema>;

/** Page width and height in mm, orientation applied. */
export function pageSizeMm(p: Pick<PageSpec, 'size' | 'orientation' | 'widthMm' | 'heightMm'>): { w: number; h: number } {
  const base = p.size === 'custom' ? { w: p.widthMm ?? 210, h: p.heightMm ?? 297 } : PAGE_SIZES[p.size];
  const [short, long] = [Math.min(base.w, base.h), Math.max(base.w, base.h)];
  return p.size === 'custom' ? base : p.orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

// ---------------------------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------------------------

export const BRAND_ASSETS = ['logo', 'logo_dark', 'emblem', 'seal', 'favicon'] as const;
export type BrandAssetKind = (typeof BRAND_ASSETS)[number];

export interface BrandAssetInfo {
  /** Changes whenever the file does (use it to bust caches). */
  version: string;
  contentType: string;
  width: number;
  height: number;
}

export interface Signatory {
  name: string;
  designation: string;
  /** A signature image is on file. */
  hasSignature: boolean;
  signatureVersion?: string;
}

export interface Branding {
  palette: Palette;
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  assets: Partial<Record<BrandAssetKind, BrandAssetInfo>>;
  signatories: Partial<Record<SignatoryRole, Signatory>>;
  /** A line under the institution name on documents (motto or affiliation). */
  tagline: string | null;
  updatedAt: string | null;
}

/** What anyone may read about an institution's look (login page, apps, emails). */
export interface PublicBranding {
  slug: string;
  name: string;
  palette: Palette;
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  tagline: string | null;
  /** Absolute API paths of the public images, with a version query for caching. */
  assets: Partial<Record<BrandAssetKind, string>>;
}

export const DEFAULT_FONTS: Branding['fonts'] = { heading: 'noto-serif', body: 'noto-sans' };

// ---------------------------------------------------------------------------------------------
// Templates and issued documents (API contracts)
// ---------------------------------------------------------------------------------------------

export interface DocTemplateSummary {
  /** A uuid for the institution's templates; `preset:<docType>:<style>` for system presets. */
  id: string;
  docType: DocType;
  name: string;
  system: boolean;
  style: PresetStyle | null;
  /** The preset it was copied from. */
  basedOn: string | null;
  version: number;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface DocTemplate extends DocTemplateSummary {
  layout: DocLayout;
}

export interface DocTemplateVersion {
  version: number;
  name: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type IssuedDocStatus = 'valid' | 'revoked' | 'superseded';

export interface IssuedDocument {
  id: string;
  docType: DocType;
  serial: string;
  title: string;
  subjectName: string | null;
  status: IssuedDocStatus;
  issuedAt: string;
  issuedBy: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  supersededBy: string | null;
  /** Short form of the payload hash, printed on the document for the tamper check. */
  fingerprint: string;
  verifyUrl: string;
}

/** What the public verification page shows for a document from the registry. */
export interface DocumentVerification {
  status: 'valid' | 'revoked' | 'superseded' | 'not_found';
  institution?: string;
  /** Public logo path for the page header. */
  logo?: string | null;
  docType?: DocType;
  title?: string;
  serial?: string;
  subjectName?: string | null;
  /** Key fields as printed on the document. */
  fields?: { label: string; value: string }[];
  issuedOn?: string;
  revokedOn?: string;
  revokedReason?: string | null;
  /** The signature over the recorded payload checks out against the institution's key. */
  signatureValid?: boolean;
  keyId?: string;
  fingerprint?: string;
  palette?: Palette;
}
