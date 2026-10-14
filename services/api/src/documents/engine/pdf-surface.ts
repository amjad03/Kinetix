import { deflateSync } from 'node:zlib';
import { apply, IDENTITY, type Matrix, multiply, type Paint, type Path, type Surface, type StrokeStyle } from './canvas.js';
import { type Face, type GlyphRun, subsetTrueType } from './fonts.js';
import type { ImageRes } from './images.js';

/**
 * PDF 1.7 output: compressed content streams, subset TrueType fonts embedded as Identity-H CID
 * fonts (with ToUnicode maps and ActualText spans, so text copies and searches correctly in every
 * script), axial and radial shadings, soft-masked images, opacity groups and link annotations.
 * Pages are drawn in a flipped coordinate system so callers use top-left points like the SVG.
 */

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
/** Path coordinates: a hundredth of a point is finer than any printer. */
const n2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const rgb = (hex: string) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
const hex4 = (v: number) => v.toString(16).padStart(4, '0');
const utf16 = (s: string) => {
  let o = '';
  for (let i = 0; i < s.length; i++) o += hex4(s.charCodeAt(i));
  return o;
};
const pdfString = (s: string) => `<FEFF${utf16(s)}>`;

interface PageState {
  w: number;
  h: number;
  ops: string[];
  links: { rect: [number, number, number, number]; url: string }[];
  fonts: Set<string>;
  images: Set<string>;
  shadings: Set<number>;
  states: Set<number>;
}

interface FontUse {
  face: Face;
  res: string;
  gids: Map<number, string>;
}

export class PdfSurface implements Surface {
  private readonly pages: PageState[] = [];
  private readonly fonts = new Map<string, FontUse>();
  private readonly images = new Map<string, { img: ImageRes; res: string }>();
  private readonly shadings: { paint: Exclude<Paint, { kind: 'solid' }> }[] = [];
  private readonly alphas = new Map<string, number>();
  private stack: { ctm: Matrix; alpha: number }[] = [];
  private ctm: Matrix = IDENTITY;
  private alpha = 1;

  constructor(private readonly meta: { title: string; author?: string; subject?: string; created?: Date }) {}

  private get page(): PageState {
    return this.pages[this.pages.length - 1];
  }

  beginPage(width: number, height: number): void {
    this.pages.push({ w: width, h: height, ops: [`1 0 0 -1 0 ${n(height)} cm`], links: [], fonts: new Set(), images: new Set(), shadings: new Set(), states: new Set() });
    this.stack = [];
    this.ctm = IDENTITY;
    this.alpha = 1;
  }

  save(): void {
    this.stack.push({ ctm: this.ctm, alpha: this.alpha });
    this.page.ops.push('q');
  }

  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.ctm = s.ctm;
    this.alpha = s.alpha;
    this.page.ops.push('Q');
  }

  transform(m: Matrix): void {
    this.ctm = multiply(this.ctm, m);
    this.page.ops.push(`${m.map(n).join(' ')} cm`);
  }

  opacity(alpha: number): void {
    this.alpha *= alpha;
    this.page.ops.push(`/${this.gs(this.alpha)} gs`);
  }

  private gs(a: number): string {
    const key = n(Math.max(0, Math.min(1, a)));
    let id = this.alphas.get(key);
    if (id === undefined) this.alphas.set(key, (id = this.alphas.size));
    this.page.states.add(id);
    return `GS${id}`;
  }

  private path(p: Path): string {
    const o: string[] = [];
    const c = n2;
    for (const s of p.segs) {
      if (s[0] === 'M') o.push(`${c(s[1])} ${c(s[2])} m`);
      else if (s[0] === 'L') o.push(`${c(s[1])} ${c(s[2])} l`);
      else if (s[0] === 'C') o.push(`${c(s[1])} ${c(s[2])} ${c(s[3])} ${c(s[4])} ${c(s[5])} ${c(s[6])} c`);
      else o.push('h');
    }
    return o.join(' ');
  }

  clip(p: Path, evenOdd = false): void {
    if (p.empty) return;
    this.page.ops.push(`${this.path(p)} ${evenOdd ? 'W*' : 'W'} n`);
  }

  fill(p: Path, paint: Paint, evenOdd = false): void {
    if (p.empty) return;
    if (paint.kind === 'solid') {
      this.page.ops.push(`${rgb(paint.color)} rg ${this.path(p)} ${evenOdd ? 'f*' : 'f'}`);
      return;
    }
    const id = this.shadings.push({ paint }) - 1;
    this.page.shadings.add(id);
    this.page.ops.push(`q ${this.path(p)} ${evenOdd ? 'W*' : 'W'} n /Sh${id} sh Q`);
  }

  stroke(p: Path, s: StrokeStyle): void {
    if (p.empty || s.width <= 0) return;
    const cap = s.cap === 'round' ? 1 : s.cap === 'square' ? 2 : 0;
    const join = s.join === 'round' ? 1 : s.join === 'bevel' ? 2 : 0;
    this.page.ops.push(`${rgb(s.color)} RG ${n(s.width)} w ${cap} J ${join} j [${(s.dash ?? []).map(n).join(' ')}] 0 d ${this.path(p)} S`);
  }

  private font(face: Face): FontUse {
    let f = this.fonts.get(face.name);
    if (!f) this.fonts.set(face.name, (f = { face, res: `F${this.fonts.size}`, gids: new Map() }));
    return f;
  }

  glyphs(run: GlyphRun, x: number, y: number, color: string): void {
    if (!run.glyphs.length) return;
    const f = this.font(run.face);
    this.page.fonts.add(run.face.name);
    const size = run.sizePt;
    if (size <= 0) return;
    const scale = 1000 / run.face.upem;
    // Glyph runs with no mark offsets go out as one TJ; offset glyphs (matras, nuktas) get their own matrix.
    const ops: string[] = [`/Span << /ActualText ${pdfString(run.text)} >> BDC BT /${f.res} 1 Tf ${rgb(color)} rg`];
    const k = run.skew;
    let tj: string[] = [];
    let pen: number | null = null;
    const flush = () => {
      if (tj.length) ops.push(`[${tj.join(' ')}] TJ`);
      tj = [];
    };
    const place = (gx: number, gy: number) => {
      flush();
      ops.push(`${n(size)} 0 ${n(k * size)} ${n(-size)} ${n(gx)} ${n(gy)} Tm`);
    };
    for (const g of run.glyphs) {
      if (g.text && !f.gids.get(g.gid)) f.gids.set(g.gid, g.text);
      else if (!f.gids.has(g.gid)) f.gids.set(g.gid, '');
      const natural = (run.face.advance(g.gid) * scale * size) / 1000;
      const gx = x + run.x + g.x;
      if (g.dx || g.dy) {
        // Marks with an offset get their own position; the next glyph starts afresh.
        place(gx + g.dx, y + g.dy);
        tj.push(`<${hex4(g.gid)}>`);
        flush();
        pen = null;
        continue;
      }
      if (pen === null) {
        place(gx, y);
        pen = gx;
      } else if (Math.abs(pen - gx) > 0.0005) tj.push(n(((pen - gx) * 1000) / size));
      tj.push(`<${hex4(g.gid)}>`);
      pen = gx + natural;
    }
    flush();
    ops.push('ET EMC');
    this.page.ops.push(ops.join(' '));
  }

  image(img: ImageRes, x: number, y: number, w: number, h: number): void {
    let im = this.images.get(img.key);
    if (!im) this.images.set(img.key, (im = { img, res: `Im${this.images.size}` }));
    this.page.images.add(img.key);
    // Flip back so the image is upright in the y-down page.
    this.page.ops.push(`q ${n(w)} 0 0 ${n(-h)} ${n(x)} ${n(y + h)} cm /${im.res} Do Q`);
  }

  link(x: number, y: number, w: number, h: number, url: string): void {
    const pts = [apply(this.ctm, x, y), apply(this.ctm, x + w, y), apply(this.ctm, x, y + h), apply(this.ctm, x + w, y + h)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => this.page.h - p[1]);
    this.page.links.push({ rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], url });
  }

  shimmer(): void {
    /* print has no motion */
  }

  /** The finished file. */
  build(): Buffer {
    if (!this.pages.length) this.beginPage(595.28, 841.89);
    const objs: (Buffer | null)[] = [];
    const reserve = () => objs.push(null);
    const set = (id: number, body: string | Buffer) => (objs[id - 1] = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    const add = (body: string | Buffer) => {
      objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
      return objs.length;
    };
    const stream = (dict: string, data: Buffer, compress = true) => {
      const body = compress ? deflateSync(data) : data;
      return Buffer.concat([Buffer.from(`<< ${dict} /Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n`, 'latin1'), body, Buffer.from('\nendstream', 'latin1')]);
    };

    const catalog = reserve();
    const pagesId = reserve();
    const created = this.meta.created ?? new Date();
    const d = created.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const info = add(`<< /Title ${pdfString(this.meta.title)} /Producer (KINETIX document engine) /Creator (KINETIX)${this.meta.author ? ` /Author ${pdfString(this.meta.author)}` : ''}${this.meta.subject ? ` /Subject ${pdfString(this.meta.subject)}` : ''} /CreationDate (D:${d}Z) >>`);

    // Fonts.
    const fontIds = new Map<string, number>();
    let tagSeed = 0;
    for (const [name, f] of this.fonts) {
      const gids = [...f.gids.keys()].sort((a, b) => a - b);
      const sub = subsetTrueType(f.face.data, gids);
      const tag = Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + ((tagSeed * 7 + i * 3 + name.length) % 26))).join('');
      tagSeed++;
      const base = `${tag}+${name.replace(/[^A-Za-z0-9-]/g, '')}`;
      const scale = 1000 / f.face.upem;
      const file = add(stream(`/Length1 ${sub.length}`, sub));
      const desc = add(`<< /Type /FontDescriptor /FontName /${base} /Flags 4 /FontBBox [${f.face.bbox.map((v) => Math.round(v * scale)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(f.face.ascender * scale)} /Descent ${Math.round(f.face.descender * scale)} /CapHeight ${Math.round(f.face.capHeight * scale)} /StemV 80 /FontFile2 ${file} 0 R >>`);
      const widths = gids.map((g) => `${g} [${Math.round(f.face.advance(g) * scale)}]`).join(' ');
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW 0 /W [${widths}] >>`);
      const map = gids.filter((g) => f.gids.get(g)).map((g) => `<${hex4(g)}> <${utf16(f.gids.get(g)!)}>`);
      const chunks: string[] = [];
      for (let i = 0; i < map.length; i += 100) chunks.push(`${Math.min(100, map.length - i)} beginbfchar\n${map.slice(i, i + 100).join('\n')}\nendbfchar`);
      const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n${chunks.join('\n')}\nendcmap CMapName currentdict /CMap defineresource pop end end`;
      const toUni = add(stream('', Buffer.from(cmap, 'latin1')));
      fontIds.set(name, add(`<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUni} 0 R >>`));
    }

    // Images.
    const imageIds = new Map<string, number>();
    for (const [key, { img }] of this.images) {
      const p = img.pdf;
      const smask = p.alpha ? add(stream(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, p.alpha, false)) : 0;
      const decode = p.invertCmyk ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      imageIds.set(key, add(stream(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /${p.colorSpace} /BitsPerComponent 8 /Filter /${p.filter}${decode}${smask ? ` /SMask ${smask} 0 R` : ''}`, p.data, false)));
    }

    // Shadings: a stitching function over linear interpolations between the stops.
    const shadingIds = this.shadings.map(({ paint }) => {
      const stops = [...paint.stops].sort((a, b) => a.at - b.at);
      const fns = stops.slice(1).map((s, i) => `<< /FunctionType 2 /Domain [0 1] /C0 [${rgb(stops[i].color)}] /C1 [${rgb(s.color)}] /N 1 >>`);
      const fn = fns.length === 1 ? fns[0] : `<< /FunctionType 3 /Domain [0 1] /Functions [${fns.join(' ')}] /Bounds [${stops.slice(1, -1).map((s) => n(s.at)).join(' ')}] /Encode [${fns.map(() => '0 1').join(' ')}] >>`;
      // Stops that do not start at 0 or end at 1 extend their colours.
      const lo = stops[0].at;
      const hi = stops[stops.length - 1].at;
      if (paint.kind === 'linear') {
        const x1 = paint.x1 + (paint.x2 - paint.x1) * lo;
        const y1 = paint.y1 + (paint.y2 - paint.y1) * lo;
        const x2 = paint.x1 + (paint.x2 - paint.x1) * hi;
        const y2 = paint.y1 + (paint.y2 - paint.y1) * hi;
        return add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${[x1, y1, x2, y2].map(n).join(' ')}] /Function ${rescale(fn, stops)} /Extend [true true] >>`);
      }
      return add(`<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${n(paint.cx)} ${n(paint.cy)} ${n(paint.r * lo)} ${n(paint.cx)} ${n(paint.cy)} ${n(paint.r * hi)}] /Function ${rescale(fn, stops)} /Extend [true true] >>`);
    });
    const gsIds = new Map<number, number>();
    for (const [a, id] of this.alphas) gsIds.set(id, add(`<< /Type /ExtGState /ca ${a} /CA ${a} >>`));

    const pageIds: number[] = [];
    for (const p of this.pages) {
      const content = add(stream('', Buffer.from(p.ops.join('\n'), 'latin1')));
      const fontRes = [...p.fonts].map((f) => `/${this.fonts.get(f)!.res} ${fontIds.get(f)} 0 R`).join(' ');
      const imgRes = [...p.images].map((k) => `/${this.images.get(k)!.res} ${imageIds.get(k)} 0 R`).join(' ');
      const shRes = [...p.shadings].map((i) => `/Sh${i} ${shadingIds[i]} 0 R`).join(' ');
      const gsRes = [...p.states].map((i) => `/GS${i} ${gsIds.get(i)} 0 R`).join(' ');
      const annots = p.links.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(n).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${l.url.replace(/[\\()]/g, '\\$&')}) >> >>`));
      const res = `<< /ProcSet [/PDF /Text /ImageB /ImageC]${fontRes ? ` /Font << ${fontRes} >>` : ''}${imgRes ? ` /XObject << ${imgRes} >>` : ''}${shRes ? ` /Shading << ${shRes} >>` : ''}${gsRes ? ` /ExtGState << ${gsRes} >>` : ''} >>`;
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(p.w)} ${n(p.h)}] /Resources ${res} /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`));
    }
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`);

    const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets: number[] = [];
    let pos = parts[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o ?? Buffer.from('null', 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
      parts.push(b);
      pos += b.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts);
  }

  get pageCount(): number {
    return this.pages.length;
  }
}

/** Maps a stitching function's domain to the stops' span (stops not starting at 0 or ending at 1). */
function rescale(fn: string, stops: { at: number }[]): string {
  const lo = stops[0].at;
  const hi = stops[stops.length - 1].at;
  if (lo === 0 && hi === 1) return fn;
  // Bounds were given in absolute positions; re-express them relative to [lo, hi].
  const span = hi - lo || 1;
  return fn.replace(/\/Bounds \[([^\]]*)\]/, (_, b: string) => `/Bounds [${b.split(' ').filter(Boolean).map((v) => n((Number(v) - lo) / span)).join(' ')}]`);
}
