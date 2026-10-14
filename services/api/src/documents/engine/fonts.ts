import { readFileSync } from 'node:fs';
import * as hb from 'harfbuzzjs';
import type { FontFamilyId } from '@kinetix/shared';

/**
 * The curated document fonts (assets/fonts, all SIL OFL). A family is a Latin face plus Devanagari
 * and Kannada faces that suit it; text is split by script and by which face has each character,
 * shaped with HarfBuzz (conjuncts, matras, kerning, ligatures) and measured in points.
 */

export type Weight = 400 | 600 | 700;

interface FamilySpec {
  /** Latin faces by weight and the italic (regular weight). */
  latin: Partial<Record<Weight, string>> & { italic?: string };
  /** Indic companions: serif or sans Noto. */
  indic: 'serif' | 'sans';
  /** Characters the Latin face lacks (₹, Greek, symbols) come from this Noto family. */
  fallback: 'serif' | 'sans';
}

const FAMILIES: Record<FontFamilyId, FamilySpec> = {
  'noto-serif': { latin: { 400: 'NotoSerif-Regular', 600: 'NotoSerif-SemiBold', 700: 'NotoSerif-Bold', italic: 'NotoSerif-Italic' }, indic: 'serif', fallback: 'serif' },
  'noto-sans': { latin: { 400: 'NotoSans-Regular', 600: 'NotoSans-SemiBold', 700: 'NotoSans-Bold' }, indic: 'sans', fallback: 'sans' },
  playfair: { latin: { 400: 'PlayfairDisplay-Regular', 700: 'PlayfairDisplay-Bold', italic: 'PlayfairDisplay-Italic' }, indic: 'serif', fallback: 'serif' },
  'eb-garamond': { latin: { 400: 'EBGaramond-Regular', 700: 'EBGaramond-Bold', italic: 'EBGaramond-Italic' }, indic: 'serif', fallback: 'serif' },
  cinzel: { latin: { 400: 'Cinzel-Regular', 700: 'Cinzel-Bold' }, indic: 'serif', fallback: 'serif' },
  poppins: { latin: { 400: 'Poppins-Regular', 600: 'Poppins-SemiBold', 700: 'Poppins-Bold', italic: 'Poppins-Italic' }, indic: 'sans', fallback: 'sans' },
};

const INDIC: Record<'serif' | 'sans', Record<'dev' | 'kn', [string, string]>> = {
  serif: { dev: ['NotoSerifDevanagari-Regular', 'NotoSerifDevanagari-Bold'], kn: ['NotoSerifKannada-Regular', 'NotoSerifKannada-Bold'] },
  sans: { dev: ['NotoSansDevanagari-Regular', 'NotoSansDevanagari-Bold'], kn: ['NotoSansKannada-Regular', 'NotoSansKannada-Bold'] },
};

export class Face {
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly bbox: number[];
  readonly hbFont: hb.Font;
  private readonly has = new Map<number, boolean>();
  private readonly paths = new Map<number, string>();

  constructor(
    readonly name: string,
    readonly data: Buffer,
  ) {
    const face = new hb.Face(new hb.Blob(data));
    this.hbFont = new hb.Font(face);
    this.upem = face.upem;
    const ext = this.hbFont.hExtents();
    this.ascender = ext.ascender;
    this.descender = ext.descender;
    const head = tableOffset(data, 'head');
    this.bbox = [36, 38, 40, 42].map((o) => data.readInt16BE(head + o));
    const os2 = tableOffset(data, 'OS/2');
    this.capHeight = os2 && data.readUInt16BE(os2) >= 2 ? data.readInt16BE(os2 + 88) : Math.round(this.ascender * 0.7);
  }

  hasChar(cp: number): boolean {
    let v = this.has.get(cp);
    if (v === undefined) this.has.set(cp, (v = (this.hbFont.nominalGlyph(cp) ?? 0) > 0));
    return v;
  }

  /** SVG path data of a glyph in font units (y up). */
  glyphPath(gid: number): string {
    let p = this.paths.get(gid);
    if (p === undefined) this.paths.set(gid, (p = this.hbFont.glyphToPath(gid)));
    return p;
  }

  advance(gid: number): number {
    return this.hbFont.glyphHAdvance(gid);
  }
}

function tableOffset(data: Buffer, tag: string): number {
  const n = data.readUInt16BE(4);
  for (let i = 0; i < n; i++) if (data.toString('latin1', 12 + i * 16, 16 + i * 16) === tag) return data.readUInt32BE(20 + i * 16);
  return 0;
}

const faces = new Map<string, Face>();

export function loadFace(name: string): Face {
  let f = faces.get(name);
  if (!f) {
    f = new Face(name, readFileSync(new URL(`../../../assets/fonts/${name}.ttf`, import.meta.url)));
    faces.set(name, f);
  }
  return f;
}

const isDev = (cp: number) => (cp >= 0x900 && cp <= 0x97f) || (cp >= 0xa8e0 && cp <= 0xa8ff) || (cp >= 0x1cd0 && cp <= 0x1cff);
const isKn = (cp: number) => cp >= 0xc80 && cp <= 0xcff;
/** Characters that take the face of their neighbours: spaces, joiners, marks, digits, punctuation. */
const isNeutral = (cp: number) => cp === 0x20 || cp === 0xa0 || cp === 0x200c || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f) || (cp < 0x80 && !/[A-Za-z]/.test(String.fromCharCode(cp))) || cp === 0x964 || cp === 0x965;

export interface FontChoice {
  family: FontFamilyId;
  weight: Weight;
  italic: boolean;
}

/** The face for a script within a family, falling back to the nearest weight. */
function faceFor(c: FontChoice, script: 'latin' | 'dev' | 'kn' | 'fallback'): Face {
  const spec = FAMILIES[c.family] ?? FAMILIES['noto-sans'];
  if (script === 'dev' || script === 'kn') return loadFace(INDIC[spec.indic][script][c.weight >= 600 ? 1 : 0]);
  if (script === 'fallback') {
    const fb = spec.fallback === 'serif' ? FAMILIES['noto-serif'] : FAMILIES['noto-sans'];
    return loadFace(fb.latin[c.weight] ?? fb.latin[c.weight >= 600 ? 700 : 400]!);
  }
  if (c.italic && spec.latin.italic && c.weight < 600) return loadFace(spec.latin.italic);
  return loadFace(spec.latin[c.weight] ?? spec.latin[c.weight >= 600 ? 700 : 400] ?? spec.latin[400]!);
}

/** Whether the family draws italics itself (otherwise the renderer slants the upright face). */
export const hasTrueItalic = (c: FontChoice) => !!FAMILIES[c.family]?.latin.italic && c.weight < 600;

export interface PlacedGlyph {
  gid: number;
  /** Pen position before this glyph, from the start of the run, in points. */
  x: number;
  /** Offsets of this glyph (marks), in points; y down. */
  dx: number;
  dy: number;
  /** Advance in points. */
  adv: number;
  /** Source text of the cluster this glyph starts ('' for the rest of a cluster). */
  text: string;
}

export interface GlyphRun {
  face: Face;
  sizePt: number;
  /** Start of the run from the start of the line, points. */
  x: number;
  glyphs: PlacedGlyph[];
  width: number;
  text: string;
  /** Slant for a synthetic italic (tan of the angle). */
  skew: number;
}

interface ShapedGlyph {
  gid: number;
  adv: number;
  dx: number;
  dy: number;
  text: string;
}
const shapeCache = new Map<string, ShapedGlyph[]>();

/** HarfBuzz shaping of one face's run, in font units. */
function shape(face: Face, text: string): ShapedGlyph[] {
  const key = `${face.name}\u0000${text}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(face.hbFont, buf);
  const infos = buf.getGlyphInfos();
  const pos = buf.getGlyphPositions();
  // Clusters are UTF-16 offsets; the first glyph of each cluster carries the cluster's text.
  const starts = [...new Set(infos.map((i) => i.cluster))].sort((a, b) => a - b);
  const seen = new Set<number>();
  const out = infos.map((g, i) => {
    let t = '';
    if (!seen.has(g.cluster)) {
      seen.add(g.cluster);
      t = text.slice(g.cluster, starts[starts.indexOf(g.cluster) + 1] ?? text.length);
    }
    return { gid: g.codepoint, adv: pos[i].xAdvance, dx: pos[i].xOffset, dy: pos[i].yOffset, text: t };
  });
  if (shapeCache.size > 20000) shapeCache.clear();
  shapeCache.set(key, out);
  return out;
}

/** Splits text into runs that each use one face. */
function itemize(text: string, c: FontChoice): { face: Face; text: string }[] {
  const chars = [...text];
  const latin = faceFor(c, 'latin');
  const picks: (Face | null)[] = chars.map((ch) => {
    const cp = ch.codePointAt(0)!;
    if (isDev(cp)) return latin.hasChar(cp) ? latin : faceFor(c, 'dev');
    if (isKn(cp)) return faceFor(c, 'kn');
    if (isNeutral(cp)) return null;
    if (latin.hasChar(cp)) return latin;
    const fb = faceFor(c, 'fallback');
    return fb.hasChar(cp) ? fb : latin;
  });
  // Neutral characters join the run before them when that face has them, else the one after.
  for (let i = 0; i < picks.length; i++) {
    if (picks[i]) continue;
    const cp = chars[i].codePointAt(0)!;
    const prev = i > 0 ? picks[i - 1] : null;
    let next: Face | null = null;
    for (let j = i + 1; j < picks.length && !next; j++) next = picks[j];
    picks[i] = prev && (prev.hasChar(cp) || cp === 0x200c || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) ? prev : next && next.hasChar(cp) ? next : latin;
  }
  const runs: { face: Face; text: string }[] = [];
  chars.forEach((ch, i) => {
    const last = runs[runs.length - 1];
    if (last && last.face === picks[i]) last.text += ch;
    else runs.push({ face: picks[i]!, text: ch });
  });
  return runs;
}

/** Shapes a line of text into positioned glyph runs, `letterSpacingPt` added after each cluster. */
export function layoutText(text: string, c: FontChoice, sizePt: number, letterSpacingPt = 0): { runs: GlyphRun[]; width: number } {
  const runs: GlyphRun[] = [];
  let pen = 0;
  const skew = c.italic && !hasTrueItalic(c) ? 0.2 : 0;
  for (const r of itemize(text, c)) {
    const scale = sizePt / r.face.upem;
    const glyphs: PlacedGlyph[] = [];
    let x = 0;
    for (const g of shape(r.face, r.text)) {
      const adv = g.adv * scale + (g.text && letterSpacingPt ? letterSpacingPt : 0);
      glyphs.push({ gid: g.gid, x, dx: g.dx * scale, dy: -g.dy * scale, adv, text: g.text });
      x += adv;
    }
    runs.push({ face: r.face, sizePt, x: pen, glyphs, width: x, text: r.text, skew });
    pen += x;
  }
  return { runs, width: pen };
}

/** Width of `text` in points. */
export function measure(text: string, c: FontChoice, sizePt: number, letterSpacingPt = 0): number {
  return layoutText(text, c, sizePt, letterSpacingPt).width;
}

/** Ascent and descent (points, both positive) of the family's Latin face at a size. */
export function metrics(c: FontChoice, sizePt: number): { ascent: number; descent: number; capHeight: number } {
  const f = faceFor(c, 'latin');
  return { ascent: (f.ascender / f.upem) * sizePt, descent: (-f.descender / f.upem) * sizePt, capHeight: (f.capHeight / f.upem) * sizePt };
}

// ---------------------------------------------------------------------------------------------
// TrueType subsetting for PDF embedding
// ---------------------------------------------------------------------------------------------

const KEEP = ['cvt ', 'fpgm', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'prep'];

const checksum = (b: Buffer): number => {
  let sum = 0;
  const padded = b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
};

/**
 * A copy of a TrueType font that keeps only the outlines of `gids` (and the glyphs composites
 * use). Glyph ids stay the same, so an Identity CIDToGIDMap still works; the tables a PDF
 * CIDFontType2 needs are kept and everything else dropped.
 */
export function subsetTrueType(data: Buffer, gids: Iterable<number>): Buffer {
  const tables = new Map<string, Buffer>();
  const n = data.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    const tag = data.toString('latin1', rec, rec + 4);
    if (KEEP.includes(tag)) tables.set(tag, Buffer.from(data.subarray(data.readUInt32BE(rec + 8), data.readUInt32BE(rec + 8) + data.readUInt32BE(rec + 12))));
  }
  const head = tables.get('head')!;
  const maxp = tables.get('maxp')!;
  const loca = tables.get('loca')!;
  const glyf = tables.get('glyf')!;
  const numGlyphs = maxp.readUInt16BE(4);
  const longLoca = head.readInt16BE(50) === 1;
  const off = (g: number) => (longLoca ? loca.readUInt32BE(g * 4) : loca.readUInt16BE(g * 2) * 2);

  const keep = new Set<number>([0]);
  const queue = [...gids].filter((g) => g >= 0 && g < numGlyphs);
  while (queue.length) {
    const g = queue.pop()!;
    if (keep.has(g) && g !== 0) continue;
    keep.add(g);
    const start = off(g);
    const end = off(g + 1);
    if (end - start < 10 || glyf.readInt16BE(start) >= 0) continue;
    // Composite glyph: collect its components.
    let p = start + 10;
    for (;;) {
      const flags = glyf.readUInt16BE(p);
      const comp = glyf.readUInt16BE(p + 2);
      if (!keep.has(comp)) queue.push(comp);
      p += 4 + (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0);
      if (!(flags & 0x0020)) break;
    }
  }

  const parts: Buffer[] = [];
  const newLoca = Buffer.alloc((numGlyphs + 1) * 4);
  let pos = 0;
  for (let g = 0; g < numGlyphs; g++) {
    newLoca.writeUInt32BE(pos, g * 4);
    if (!keep.has(g)) continue;
    const piece = glyf.subarray(off(g), off(g + 1));
    if (!piece.length) continue;
    const pad = (4 - (piece.length % 4)) % 4;
    parts.push(piece, Buffer.alloc(pad));
    pos += piece.length + pad;
  }
  newLoca.writeUInt32BE(pos, numGlyphs * 4);
  tables.set('glyf', Buffer.concat(parts));
  tables.set('loca', newLoca);
  head.writeInt16BE(1, 50);
  head.writeUInt32BE(0, 8);

  const tags = [...tables.keys()].sort();
  const count = tags.length;
  let sr = 1;
  let es = 0;
  while (sr * 2 <= count) {
    sr *= 2;
    es++;
  }
  const dir = Buffer.alloc(12 + count * 16);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(count, 4);
  dir.writeUInt16BE(sr * 16, 6);
  dir.writeUInt16BE(es, 8);
  dir.writeUInt16BE(count * 16 - sr * 16, 10);
  const bodies: Buffer[] = [];
  let offset = dir.length;
  tags.forEach((tag, i) => {
    const t = tables.get(tag)!;
    const rec = 12 + i * 16;
    dir.write(tag, rec, 'latin1');
    dir.writeUInt32BE(checksum(t), rec + 4);
    dir.writeUInt32BE(offset, rec + 8);
    dir.writeUInt32BE(t.length, rec + 12);
    const pad = (4 - (t.length % 4)) % 4;
    bodies.push(t, Buffer.alloc(pad));
    offset += t.length + pad;
  });
  const font = Buffer.concat([dir, ...bodies]);
  // checkSumAdjustment makes the whole file sum to 0xB1B0AFBA.
  const headAt = font.indexOf(head);
  if (headAt >= 0) font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headAt + 8);
  return font;
}
