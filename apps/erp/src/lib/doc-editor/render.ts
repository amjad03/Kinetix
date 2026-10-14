/**
 * The editor canvas renderer: the API's LayoutRenderer (services/api/src/documents/engine/
 * layout-render.ts) ported to the browser. It draws the same geometry, line breaking, shrink-to-fit,
 * tables, ornaments, seal and codes, as SVG markup in page points; text is set with the document
 * fonts the ERP loads (`DocFonts`) and measured with the browser instead of HarfBuzz, so the canvas
 * follows the print closely. The server's PDF stays the reference ("Print preview").
 *
 * Each element is drawn on its own, in local coordinates (its box at 0,0), so the canvas can move
 * it with a transform and only redraw the elements that change.
 */
import { code128 as barcodeWidths } from './barcode';
import { bind, list, lookup, present } from './bindings';
import { bandChain, crosshatch, diamond, dots, flourish, guillocheLines, ringGuilloche, rosette, scallop, silhouette, sunburst, waves } from './ornaments';
import { type Matrix, num, type Paint, Path, pathData, rotation, type StrokeStyle } from './paths';
import { qrMatrix } from './qr';
import { type DocData, type DocElement, type DocLayout, type DocSide, type ElementOf, type Fill, type FontFamilyId, type ImageSource, MM, type Palette, resolveColor, type SignatoryRole, type Stroke, type TextStyle } from './schema';

export interface FontChoice {
  family: FontFamilyId;
  weight: 400 | 600 | 700;
  italic: boolean;
}

/** Text measurement in points (the browser's, or an estimate where there is no canvas). */
export interface TextMeasurer {
  width(text: string, font: FontChoice, sizePt: number, letterSpacingPt?: number): number;
  metrics(font: FontChoice, sizePt: number): { ascent: number; descent: number };
}

/** A branding image as the canvas shows it: a URL and its natural size. */
export interface CanvasImage {
  href: string;
  width: number;
  height: number;
}

export interface RenderContext {
  palette: Palette;
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  images: Partial<Record<ImageSource, CanvasImage | null>>;
  signatories: Partial<Record<SignatoryRole, { name: string; designation: string }>>;
}

/** The CSS family the editor registers for a document font (see `fontFaceCss`). */
export const cssFamily = (f: FontFamilyId) => `kx-doc-${f}`;

const SIGNATORY_TITLE: Record<SignatoryRole, string> = { principal: 'Principal', registrar: 'Registrar', controller: 'Controller of Examinations', finance: 'Finance Officer', hr: 'HR Manager' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------
// SVG output
// ---------------------------------------------------------------------------------------------

/** An SVG fragment builder with the engine Surface's save/restore, clip and paint semantics. */
class SvgOut {
  private readonly body: string[] = [];
  private readonly defs: string[] = [];
  private levels: number[] = [0];
  private seq = 0;

  constructor(private readonly prefix: string) {}

  private id(kind: string) {
    return `${this.prefix}${kind}${++this.seq}`;
  }

  private open(attrs: string) {
    this.body.push(`<g ${attrs}>`);
    this.levels[this.levels.length - 1]++;
  }

  save(): void {
    this.levels.push(0);
  }

  restore(): void {
    const k = this.levels.pop() ?? 0;
    for (let i = 0; i < k; i++) this.body.push('</g>');
    if (!this.levels.length) this.levels.push(0);
  }

  transform(m: Matrix): void {
    this.open(`transform="matrix(${m.map(num).join(' ')})"`);
  }

  opacity(alpha: number): void {
    this.open(`opacity="${num(alpha)}"`);
  }

  clip(p: Path, evenOdd = false): void {
    if (p.empty) return;
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><path d="${pathData(p)}"${evenOdd ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    this.open(`clip-path="url(#${id})"`);
  }

  private paint(p: Paint): string {
    if (p.kind === 'solid') return p.color;
    const id = this.id('p');
    const stops = [...p.stops].sort((a, b) => a.at - b.at).map((s) => `<stop offset="${num(s.at)}" stop-color="${s.color}"/>`).join('');
    this.defs.push(
      p.kind === 'linear'
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}">${stops}</linearGradient>`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}">${stops}</radialGradient>`,
    );
    return `url(#${id})`;
  }

  fill(p: Path, paint: Paint, evenOdd = false): void {
    if (p.empty) return;
    this.body.push(`<path d="${pathData(p)}" fill="${this.paint(paint)}"${evenOdd ? ' fill-rule="evenodd"' : ''}/>`);
  }

  stroke(p: Path, s: StrokeStyle): void {
    if (p.empty || s.width <= 0) return;
    const dash = s.dash?.length ? ` stroke-dasharray="${s.dash.map(num).join(' ')}"` : '';
    this.body.push(`<path d="${pathData(p)}" fill="none" stroke="${s.color}" stroke-width="${num(s.width)}" stroke-linecap="${s.cap ?? 'butt'}" stroke-linejoin="${s.join ?? 'miter'}"${dash}/>`);
  }

  text(t: string, x: number, y: number, font: FontChoice, size: number, ls: number, color: string, extra = ''): void {
    if (!t) return;
    this.body.push(
      `<text x="${num(x)}" y="${num(y)}" font-family="${cssFamily(font.family)}" font-size="${num(size)}" font-weight="${font.weight}"${font.italic ? ' font-style="italic"' : ''}${ls ? ` letter-spacing="${num(ls)}"` : ''} fill="${color}" xml:space="preserve"${extra}>${esc(t)}</text>`,
    );
  }

  image(img: CanvasImage, x: number, y: number, w: number, h: number): void {
    this.body.push(`<image href="${esc(img.href)}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="none"/>`);
  }

  /** The moving sheen over a holographic seal. */
  shimmer(cx: number, cy: number, r: number): void {
    const id = this.id('sh');
    const clip = this.id('sc');
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(cx - r)}" y1="${num(cy - r)}" x2="${num(cx + r)}" y2="${num(cy + r)}"><stop offset="0.30" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#e8f6ff" stop-opacity="0.85"/><stop offset="0.55" stop-color="#fff2fb" stop-opacity="0.55"/><stop offset="0.70" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
      `<clipPath id="${clip}"><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"/></clipPath>`,
    );
    this.body.push(`<g clip-path="url(#${clip})" style="mix-blend-mode:screen"><rect class="kx-shimmer" x="${num(cx - 3 * r)}" y="${num(cy - 3 * r)}" width="${num(6 * r)}" height="${num(6 * r)}" fill="url(#${id})" style="transform-origin:${num(cx)}px ${num(cy)}px"/></g>`);
  }

  toString(): string {
    return `${this.defs.length ? `<defs>${this.defs.join('')}</defs>` : ''}${this.body.join('')}${'</g>'.repeat(this.levels.reduce((a, b) => a + b, 0))}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Text layout (the engine's TextLayout with the browser's measurements)
// ---------------------------------------------------------------------------------------------

interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** `**bold**` and `*italic*` spans (no nesting beyond bold-italic). */
export function parseMarkdown(s: string): Span[] {
  const out: Span[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const push = () => {
    if (buf) out.push({ text: buf, bold, italic });
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('**', i)) {
      push();
      bold = !bold;
      i++;
    } else if (s[i] === '*' && s[i + 1] !== ' ' && (italic || /\S/.test(s[i + 1] ?? ''))) {
      push();
      italic = !italic;
    } else buf += s[i];
  }
  push();
  return out;
}

interface Piece {
  text: string;
  font: FontChoice;
  emphasis: boolean;
  width: number;
}

interface Word {
  pieces: Piece[];
  width: number;
  space: number;
}

interface Line {
  words: Word[];
  width: number;
  last: boolean;
}

const caseOf = (s: string, t: TextStyle['transform']) => (t === 'uppercase' ? s.toLocaleUpperCase('en-IN') : t === 'lowercase' ? s.toLocaleLowerCase('en-IN') : t === 'capitalize' ? s.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s);

class TextLayout {
  broke = false;

  constructor(
    private readonly ctx: RenderContext & { layoutFonts?: DocLayout['fonts'] },
    private readonly m: TextMeasurer,
  ) {}

  family(ref: TextStyle['font']): FontFamilyId {
    if (ref === 'heading') return this.ctx.layoutFonts?.heading ?? this.ctx.fonts.heading;
    if (ref === 'body') return this.ctx.layoutFonts?.body ?? this.ctx.fonts.body;
    return ref;
  }

  choice(style: TextStyle, bold = false, italic = false): FontChoice {
    return { family: this.family(style.font), weight: bold ? 700 : style.weight, italic: italic || !!style.italic };
  }

  width(text: string, font: FontChoice, size: number, ls = 0): number {
    return this.m.width(text, font, size, ls);
  }

  private words(spans: Span[], style: TextStyle, size: number): Word[][] {
    const paras: Word[][] = [[]];
    let cur: Word | null = null;
    let pendingSpace = false;
    const ls = style.letterSpacingPt ?? 0;
    for (const sp of spans) {
      const font = this.choice(style, sp.bold, sp.italic);
      for (const part of caseOf(sp.text, style.transform).split(/(\n|[ \t]+)/)) {
        if (part === '') continue;
        if (part === '\n') {
          paras.push([]);
          cur = null;
          pendingSpace = false;
          continue;
        }
        if (/^[ \t]+$/.test(part)) {
          cur = null;
          pendingSpace = true;
          continue;
        }
        const width = this.width(part, font, size, ls);
        const piece = { text: part, font, emphasis: sp.bold, width };
        if (cur && !pendingSpace) {
          cur.pieces.push(piece);
          cur.width += width;
        } else {
          const para = paras[paras.length - 1];
          cur = { pieces: [piece], width, space: para.length ? this.width(' ', font, size) + ls : 0 };
          para.push(cur);
        }
        pendingSpace = false;
      }
    }
    return paras;
  }

  lines(spans: Span[], style: TextStyle, size: number, width: number): Line[] {
    const out: Line[] = [];
    this.broke = false;
    for (const para of this.words(spans, style, size)) {
      let line: Line = { words: [], width: 0, last: false };
      const words: Word[] = [];
      for (const w of para) {
        if (w.width <= width || w.pieces.length !== 1) {
          words.push(w);
          continue;
        }
        this.broke = true;
        const p = w.pieces[0];
        let chunk = '';
        let first = true;
        for (const ch of [...p.text]) {
          const next = chunk + ch;
          if (chunk && this.width(next, p.font, size) > width) {
            const cw = this.width(chunk, p.font, size);
            words.push({ pieces: [{ ...p, text: chunk, width: cw }], width: cw, space: first ? w.space : 0 });
            first = false;
            chunk = ch;
          } else chunk = next;
        }
        const cw = this.width(chunk, p.font, size);
        words.push({ pieces: [{ ...p, text: chunk, width: cw }], width: cw, space: first ? w.space : 0 });
      }
      for (const w of words) {
        const add = line.words.length ? w.space + w.width : w.width;
        if (line.words.length && line.width + add > width + 0.01) {
          out.push(line);
          line = { words: [w], width: w.width, last: false };
        } else {
          line.words.push(w);
          line.width += add;
        }
      }
      line.last = true;
      out.push(line);
    }
    return out;
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------------------------

export class CanvasRenderer {
  private readonly text: TextLayout;
  private s: SvgOut = new SvgOut('k');

  constructor(
    private readonly layout: Pick<DocLayout, 'fonts' | 'page'>,
    private readonly ctx: RenderContext,
    private readonly measure: TextMeasurer,
  ) {
    this.text = new TextLayout({ ...ctx, layoutFonts: layout.fonts }, measure);
  }

  color(ref: string): string {
    return resolveColor(ref, this.ctx.palette);
  }

  private paint(fill: Fill, x: number, y: number, w: number, h: number): Paint {
    if (typeof fill === 'string') return { kind: 'solid', color: this.color(fill) };
    const stops = fill.stops.map((st) => ({ at: st.at, color: this.color(st.color) }));
    if (fill.kind === 'linear') {
      const a = (fill.angleDeg * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      return { kind: 'linear', x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half, stops };
    }
    return { kind: 'radial', cx: x + w * (fill.cx ?? 0.5), cy: y + h * (fill.cy ?? 0.5), r: ((fill.r ?? 1) * Math.hypot(w, h)) / 2, stops };
  }

  private strokeStyle(s: Stroke): StrokeStyle {
    return { color: this.color(s.color), width: s.widthPt, dash: s.dashMm?.map((d) => d * MM), cap: s.cap };
  }

  /** The side's background over a page of `w` x `h` points. */
  background(side: DocSide, w: number, h: number, prefix: string): string {
    if (!side.background) return '';
    this.s = new SvgOut(prefix);
    this.s.fill(new Path().rect(0, 0, w, h), this.paint(side.background, 0, 0, w, h));
    return this.s.toString();
  }

  /**
   * One element in local coordinates (its box from 0,0, in points), without its rotation and
   * opacity (the canvas applies those). Returns the markup and the height it left unused at the
   * bottom of its box (for `flowAfter`).
   */
  element(e: DocElement, data: DocData, prefix: string): { svg: string; unused: number } {
    this.s = new SvgOut(prefix);
    const box = { x: 0, y: 0, w: e.w * MM, h: e.h * MM };
    let unused = 0;
    switch (e.type) {
      case 'text':
        unused = this.textElement(e, box, data);
        break;
      case 'fieldList':
        unused = this.fieldList(e, box, data);
        break;
      case 'table':
        unused = this.table(e, box, data);
        break;
      case 'field':
        this.field(e, box, data);
        break;
      case 'image':
        this.imageElement(e, box, data);
        break;
      case 'signature':
        this.signature(e, box);
        break;
      case 'qr':
        this.qr(e, box, data);
        break;
      case 'barcode':
        this.barcode(e, box, data);
        break;
      case 'shape':
        this.shape(e, box);
        break;
      case 'watermark':
        this.watermark(e, box, data);
        break;
      case 'pattern':
        this.pattern(e, box, data);
        break;
      case 'frame':
        this.frame(e, box);
        break;
      case 'seal':
        this.seal(e, box, data);
        break;
    }
    return { svg: this.s.toString(), unused: Math.max(0, unused) };
  }

  /** Whether an element is drawn with this data (its `showIf` binding has a value). */
  static shows(e: DocElement, data: DocData): boolean {
    return !e.showIf || present(data, e.showIf);
  }

  // --- text ------------------------------------------------------------------------------------

  drawText(raw: string, style: TextStyle, b: Box, o: { vAlign?: 'top' | 'middle' | 'bottom'; fit?: 'none' | 'shrink'; minSizePt?: number; markdown?: boolean; emphasisColor?: string; maxLines?: number } = {}): { height: number; width: number; lines: number } {
    const spans = o.markdown ? parseMarkdown(raw) : [{ text: raw, bold: false, italic: false }];
    if (!raw.trim()) return { height: 0, width: 0, lines: 0 };
    let size = style.sizePt;
    const min = Math.min(size, o.minSizePt ?? size * 0.5);
    let lines = this.text.lines(spans, style, size, b.w);
    const tooBig = (ls: Line[], sz: number) => this.text.broke || ls.length * sz * style.lineHeight > b.h + 0.5 || ls.some((l) => l.width > b.w + 0.5) || (o.maxLines !== undefined && ls.length > o.maxLines);
    if (o.fit === 'shrink') {
      while (size > min && tooBig(lines, size)) {
        size = Math.max(min, size - Math.max(0.25, size * 0.04));
        lines = this.text.lines(spans, style, size, b.w);
      }
    }
    if (o.maxLines !== undefined && lines.length > o.maxLines) {
      lines = lines.slice(0, o.maxLines);
      const last = lines[lines.length - 1];
      last.last = true;
      const lw = last.words[last.words.length - 1];
      if (lw) {
        const p = lw.pieces[lw.pieces.length - 1];
        p.text = `${p.text.replace(/[\s.,;:]+$/, '')}…`;
      }
    }
    const lh = size * style.lineHeight;
    const m = this.measure.metrics(this.text.choice(style), size);
    const total = lines.length * lh;
    let top = b.y;
    if (o.vAlign === 'middle') top = b.y + (b.h - total) / 2;
    else if (o.vAlign === 'bottom') top = b.y + b.h - total;
    const color = this.color(style.color);
    const emph = o.emphasisColor ? this.color(o.emphasisColor) : color;
    const ls = style.letterSpacingPt ?? 0;
    lines.forEach((line, i) => {
      const base = top + i * lh + (lh - (m.ascent + m.descent)) / 2 + m.ascent;
      const justify = style.align === 'justify' && !line.last && line.words.length > 1;
      const gaps = line.words.length - 1;
      const extra = justify ? (b.w - line.width) / gaps : 0;
      let x = b.x;
      if (style.align === 'center') x = b.x + (b.w - line.width) / 2;
      else if (style.align === 'right') x = b.x + b.w - line.width;
      if (ls && (style.align === 'center' || style.align === 'right')) x += style.align === 'center' ? ls / 2 : ls;
      line.words.forEach((w, wi) => {
        if (wi > 0) x += w.space + extra;
        for (const p of w.pieces) {
          this.s.text(p.text, x, base, p.font, size, ls, p.emphasis ? emph : color);
          x += this.text.width(p.text, p.font, size, ls);
        }
      });
    });
    return { height: total, width: Math.max(0, ...lines.map((l) => l.width)), lines: lines.length };
  }

  private textElement(e: ElementOf<'text'>, b: Box, data: DocData): number {
    const r = this.drawText(bind(e.text, data), e.style, b, { vAlign: e.vAlign, fit: e.fit, minSizePt: e.minSizePt, markdown: e.markdown, emphasisColor: e.emphasisColor, maxLines: e.maxLines });
    return (e.vAlign ?? 'top') === 'top' ? b.h - r.height : 0;
  }

  private field(e: ElementOf<'field'>, b: Box, data: DocData): void {
    this.pair(bind(e.label, data), bind(e.value, data), b, e.direction ?? 'row', e.labelWidthMm, e.separator, e.labelStyle, e.valueStyle, e.rule);
  }

  private pair(label: string, value: string, b: Box, direction: 'row' | 'column', labelWidthMm: number | undefined, sep: string | undefined, ls: TextStyle, vs: TextStyle, rule?: Stroke): void {
    if (direction === 'column') {
      const lh = label ? ls.sizePt * (ls.lineHeight ?? 1.3) : 0;
      if (label) this.drawText(label, ls, { x: b.x, y: b.y, w: b.w, h: lh }, { fit: 'shrink', maxLines: 1 });
      this.drawText(value || '—', vs, { x: b.x, y: b.y + lh, w: b.w, h: b.h - lh }, { fit: 'shrink', minSizePt: vs.sizePt * 0.6, vAlign: 'top' });
      if (rule) this.s.stroke(new Path().moveTo(b.x, b.y + b.h).lineTo(b.x + b.w, b.y + b.h), this.strokeStyle(rule));
      return;
    }
    const lw = labelWidthMm !== undefined ? labelWidthMm * MM : b.w * 0.38;
    const sepW = sep ? Math.max(ls.sizePt * 0.9, 6) : 0;
    this.drawText(label, ls, { x: b.x, y: b.y, w: Math.max(4, lw - sepW), h: b.h }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 });
    if (sep) this.drawText(sep, ls, { x: b.x + lw - sepW, y: b.y, w: sepW, h: b.h }, { vAlign: 'middle' });
    const vx = b.x + lw + (sep ? 2 : 0);
    this.drawText(value || '—', vs, { x: vx, y: b.y, w: Math.max(4, b.x + b.w - vx), h: b.h }, { vAlign: 'middle', fit: 'shrink', minSizePt: vs.sizePt * 0.6, maxLines: Math.max(1, Math.floor(b.h / (vs.sizePt * (vs.lineHeight ?? 1.3)))) });
    if (rule) this.s.stroke(new Path().moveTo(vx, b.y + b.h - 1).lineTo(b.x + b.w, b.y + b.h - 1), this.strokeStyle(rule));
  }

  private fieldList(e: ElementOf<'fieldList'>, b: Box, data: DocData): number {
    const items = list(data, e.source).filter((i) => i && (i.label || i.value));
    const cols = e.columns ?? 1;
    const rowH = e.rowHeightMm * MM;
    const perCol = Math.max(1, Math.ceil(items.length / cols));
    const colW = b.w / cols;
    items.forEach((it, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      this.pair(String(it.label ?? ''), String(it.value ?? ''), { x: b.x + col * colW + (col ? 6 : 0), y: b.y + row * rowH, w: colW - (col ? 6 : 0), h: rowH }, 'row', e.labelWidthMm, e.separator, e.labelStyle, e.valueStyle, e.rule);
    });
    return b.h - perCol * rowH;
  }

  // --- images ----------------------------------------------------------------------------------

  private cropPath(crop: 'rect' | 'rounded' | 'circle', b: Box, radiusMm?: number): Path {
    if (crop === 'circle') return new Path().ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2);
    if (crop === 'rounded') return new Path().roundRect(b.x, b.y, b.w, b.h, (radiusMm ?? Math.min(b.w, b.h) / MM / 8) * MM);
    return new Path().rect(b.x, b.y, b.w, b.h);
  }

  private drawImage(img: CanvasImage, b: Box, fit: 'contain' | 'cover' | 'fill' = 'contain'): void {
    if (fit === 'fill') return this.s.image(img, b.x, b.y, b.w, b.h);
    const ar = img.width / img.height;
    const boxAr = b.w / b.h;
    const scaleW = fit === 'contain' ? ar > boxAr : ar < boxAr;
    const w = scaleW ? b.w : b.h * ar;
    const h = scaleW ? b.w / ar : b.h;
    if (fit === 'cover') {
      this.s.save();
      this.s.clip(new Path().rect(b.x, b.y, b.w, b.h));
      this.s.image(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
      this.s.restore();
      return;
    }
    this.s.image(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
  }

  private imageElement(e: ElementOf<'image'>, b: Box, data: DocData): void {
    const img = this.ctx.images[e.source] ?? null;
    const clip = this.cropPath(e.crop ?? 'rect', b, e.radiusMm);
    if (!img && e.placeholder !== 'none' && (e.source === 'logo' || e.source === 'logo_dark' || e.source === 'emblem')) return this.monogram(b, data, e.source === 'logo_dark');
    if (!img && (e.source !== 'photo' || e.placeholder === 'none')) {
      // Nothing uploaded for this image yet: a dashed placeholder, on the canvas only.
      this.s.fill(clip, { kind: 'solid', color: this.color('primary.6') });
      this.s.stroke(clip, { color: this.color('primary.40'), width: 0.6, dash: [2, 2] });
      return;
    }
    this.s.save();
    this.s.clip(clip);
    if (e.background) this.s.fill(clip, this.paint(e.background, b.x, b.y, b.w, b.h));
    if (img) this.drawImage(img, b, e.fit);
    else {
      if (!e.background) this.s.fill(clip, { kind: 'solid', color: this.color('primary.12') });
      if (e.placeholder === 'silhouette') this.s.fill(silhouette(b.x, b.y, b.w, b.h), { kind: 'solid', color: this.color('primary.35') });
      else {
        const name = String(lookup(data, 'student.name') ?? lookup(data, 'staff.name') ?? lookup(data, 'award.recipient') ?? '');
        const initials = bind('{{n | initials}}', { n: name }) || '?';
        this.drawText(initials, { font: 'heading', sizePt: Math.min(b.w, b.h) * 0.36, weight: 600, color: 'primary.70', align: 'center', lineHeight: 1 }, b, { vAlign: 'middle' });
      }
    }
    this.s.restore();
    if (e.border) this.s.stroke(clip, this.strokeStyle(e.border));
  }

  private monogram(b: Box, data: DocData, onDark: boolean): void {
    const r = Math.min(b.w, b.h) / 2;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const ink = onDark ? '#ffffff' : this.color('primary');
    if (!onDark) this.s.fill(new Path().circle(cx, cy, r), { kind: 'solid', color: this.color('paper') });
    this.s.stroke(new Path().circle(cx, cy, r - r * 0.04), { color: ink, width: Math.max(0.4, r * 0.06) });
    this.s.stroke(new Path().circle(cx, cy, r * 0.82), { color: onDark ? '#ffffff' : this.color('secondary'), width: Math.max(0.3, r * 0.025) });
    const initials = bind('{{n | initials}}', { n: String(lookup(data, 'institution.name') ?? '') }) || 'K';
    this.drawText(initials, { font: 'heading', sizePt: r * 0.95, weight: 700, color: onDark ? 'white' : 'primary', align: 'center', lineHeight: 1, letterSpacingPt: r * 0.04 }, { x: b.x, y: b.y, w: b.w, h: b.h }, { vAlign: 'middle', maxLines: 1, fit: 'shrink' });
  }

  private signature(e: ElementOf<'signature'>, b: Box): void {
    const who = this.ctx.signatories[e.role];
    const showImage = e.showImage ?? true;
    const showName = e.showName ?? true;
    const showDesignation = e.showDesignation ?? true;
    const img = showImage ? (this.ctx.images[`signature:${e.role}`] ?? null) : null;
    const nameH = showName && who?.name ? e.nameStyle.sizePt * (e.nameStyle.lineHeight ?? 1.3) : 0;
    const desH = showDesignation ? e.designationStyle.sizePt * (e.designationStyle.lineHeight ?? 1.3) : 0;
    const lineY = b.y + b.h - nameH - desH - 2;
    const align = e.nameStyle.align ?? 'left';
    if (img) {
      const ib = { x: b.x, y: b.y, w: b.w, h: Math.max(4, lineY - b.y - 1) };
      const ar = img.width / img.height;
      const h = Math.min(ib.h, ib.w / ar);
      const w = h * ar;
      const x = align === 'left' ? ib.x : align === 'right' ? ib.x + ib.w - w : ib.x + (ib.w - w) / 2;
      this.s.image(img, x, lineY - h + h * 0.12, w, h);
    }
    if (e.line) {
      const lw = Math.min(b.w, Math.max(b.w * 0.8, 60));
      const x = align === 'left' ? b.x : align === 'right' ? b.x + b.w - lw : b.x + (b.w - lw) / 2;
      this.s.stroke(new Path().moveTo(x, lineY).lineTo(x + lw, lineY), this.strokeStyle(e.line));
    }
    let y = lineY + 2;
    if (nameH) {
      this.drawText(who!.name, e.nameStyle, { x: b.x, y, w: b.w, h: nameH }, { fit: 'shrink', maxLines: 1 });
      y += nameH;
    }
    if (desH) this.drawText(who?.designation || SIGNATORY_TITLE[e.role], e.designationStyle, { x: b.x, y, w: b.w, h: desH }, { fit: 'shrink', maxLines: 1 });
  }

  // --- codes -----------------------------------------------------------------------------------

  private qr(e: ElementOf<'qr'>, b: Box, data: DocData): void {
    const value = bind(e.value ?? '{{verify.url}}', data).trim();
    if (!value) return;
    let m: boolean[][];
    try {
      m = qrMatrix(value);
    } catch {
      return;
    }
    const quiet = e.quietZone ?? 2;
    const size = Math.min(b.w, b.h);
    const x0 = b.x + (b.w - size) / 2;
    const y0 = b.y + (b.h - size) / 2;
    if (e.background) this.s.fill(new Path().rect(x0, y0, size, size), { kind: 'solid', color: this.color(e.background) });
    const cell = size / (m.length + 2 * quiet);
    const p = new Path();
    m.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        if (!row[c]) {
          c++;
          continue;
        }
        const start = c;
        while (c < row.length && row[c]) c++;
        p.rect(x0 + (start + quiet) * cell, y0 + (r + quiet) * cell, (c - start) * cell + 0.02, cell + 0.02);
      }
    });
    this.s.fill(p, { kind: 'solid', color: this.color(e.color ?? 'ink') });
  }

  private barcode(e: ElementOf<'barcode'>, b: Box, data: DocData): void {
    const value = bind(e.value, data).trim();
    if (!value) return;
    const widths = barcodeWidths(value);
    const total = widths.reduce((a, v) => a + v, 0) + 20;
    const color = e.color ?? 'ink';
    const style: TextStyle = e.textStyle ?? { font: 'body', sizePt: Math.max(4, Math.min(9, b.h * 0.22)), weight: 400, color, align: 'center', lineHeight: 1.1, letterSpacingPt: 1 };
    const showText = e.showText ?? true;
    const textH = showText ? style.sizePt * 1.25 : 0;
    const mod = b.w / total;
    const p = new Path();
    let x = b.x + 10 * mod;
    widths.forEach((wd, i) => {
      if (i % 2 === 0) p.rect(x, b.y, wd * mod, b.h - textH);
      x += wd * mod;
    });
    this.s.fill(p, { kind: 'solid', color: this.color(color) });
    if (showText) this.drawText(value, style, { x: b.x, y: b.y + b.h - textH, w: b.w, h: textH }, { vAlign: 'bottom', fit: 'shrink', maxLines: 1 });
  }

  // --- tables ----------------------------------------------------------------------------------

  private footerHeight(e: ElementOf<'table'>): number {
    return (e.footer?.length ?? 0) * e.body.rowHeightMm * MM;
  }

  /** Rows that fit on one page of the table's box. */
  tableCapacity(e: ElementOf<'table'>): number {
    return Math.max(1, Math.floor((e.h * MM - e.header.heightMm * MM - this.footerHeight(e)) / (e.body.rowHeightMm * MM) + 1e-6));
  }

  private table(e: ElementOf<'table'>, b: Box, data: DocData): number {
    const all = list(data, e.source);
    const weights = e.columns.reduce((a, c) => a + (c.width ?? 1), 0);
    const widths = e.columns.map((c) => ((c.width ?? 1) / weights) * b.w);
    const xs = widths.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [b.x]);
    const pad = (e.cellPaddingMm ?? 1.6) * MM;
    const headH = e.header.heightMm * MM;
    let rowH = e.body.rowHeightMm * MM;
    let rows = all;
    let bodyStyle = e.body.style;
    const overflow = e.overflow ?? 'paginate';
    const borders = e.borders ?? {};
    if (overflow === 'paginate') rows = all.slice(0, this.tableCapacity(e));
    else if (all.length) {
      const avail = b.h - headH - this.footerHeight(e);
      if (all.length * rowH > avail) {
        const k = Math.max(0.55, avail / (all.length * rowH));
        rowH *= k;
        bodyStyle = { ...bodyStyle, sizePt: Math.max(5, bodyStyle.sizePt * Math.max(k, 0.7)) };
      }
    }
    const pages = overflow === 'paginate' ? Math.ceil(Math.max(1, all.length) / this.tableCapacity(e)) : 1;
    const last = pages <= 1;
    if (e.background) {
      const shown = Math.max(rows.length, rows.length || e.emptyText ? 1 : 0) + (last ? (e.footer?.length ?? 0) : 0);
      const th = headH + shown * rowH;
      this.s.fill(new Path().rect(b.x, b.y, b.w, th), this.paint(e.background, b.x, b.y, b.w, th));
    }
    if (e.header.fill) this.s.fill(new Path().rect(b.x, b.y, b.w, headH), this.paint(e.header.fill, b.x, b.y, b.w, headH));
    e.columns.forEach((c, i) => this.drawText(bind(c.header, data), { ...e.header.style, align: c.align ?? 'left' }, { x: xs[i] + pad, y: b.y, w: widths[i] - 2 * pad, h: headH }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 }));
    let y = b.y + headH;
    if (!rows.length && e.emptyText) {
      this.drawText(e.emptyText, { ...bodyStyle, align: 'center', color: 'muted' }, { x: b.x, y, w: b.w, h: rowH }, { vAlign: 'middle' });
      y += rowH;
    }
    const maxLines = Math.max(1, Math.floor(rowH / (bodyStyle.sizePt * (bodyStyle.lineHeight ?? 1.3)) + 0.05));
    rows.forEach((row, ri) => {
      if (e.body.zebra && ri % 2 === 1) this.s.fill(new Path().rect(b.x, y, b.w, rowH), this.paint(e.body.zebra, b.x, y, b.w, rowH));
      e.columns.forEach((c, i) => this.drawText(bind(c.value, data, row), { ...bodyStyle, align: c.align ?? 'left' }, { x: xs[i] + pad, y, w: widths[i] - 2 * pad, h: rowH }, { vAlign: 'middle', fit: 'shrink', minSizePt: bodyStyle.sizePt * 0.75, maxLines }));
      y += rowH;
      if (borders.horizontal && (ri < rows.length - 1 || (last && e.footer?.length))) this.s.stroke(new Path().moveTo(b.x, y).lineTo(b.x + b.w, y), this.strokeStyle(borders.horizontal));
    });
    const bodyBottom = y;
    if (last && e.footer)
      for (const f of e.footer) {
        if (f.fill) this.s.fill(new Path().rect(b.x, y, b.w, rowH), this.paint(f.fill, b.x, y, b.w, rowH));
        let col = 0;
        for (const cell of f.cells) {
          const span = Math.min(cell.span ?? 1, e.columns.length - col);
          if (span <= 0) break;
          const cx = xs[col];
          const cw = xs[col + span] - cx;
          this.drawText(bind(cell.text, data), { ...(f.style ?? { ...bodyStyle, weight: 700 }), align: cell.align ?? 'left' }, { x: cx + pad, y, w: cw - 2 * pad, h: rowH }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 });
          col += span;
        }
        y += rowH;
      }
    if (borders.headerBottom) this.s.stroke(new Path().moveTo(b.x, b.y + headH).lineTo(b.x + b.w, b.y + headH), this.strokeStyle(borders.headerBottom));
    if (borders.vertical) {
      const p = new Path();
      for (let i = 1; i < e.columns.length; i++) p.moveTo(xs[i], b.y).lineTo(xs[i], last && e.footer ? bodyBottom : y);
      this.s.stroke(p, this.strokeStyle(borders.vertical));
    }
    if (borders.outer) this.s.stroke(new Path().rect(b.x, b.y, b.w, y - b.y), this.strokeStyle(borders.outer));
    return b.h - (y - b.y);
  }

  // --- shapes, marks, patterns, frames --------------------------------------------------------

  private shape(e: ElementOf<'shape'>, b: Box): void {
    if (e.shape === 'line') {
      if (e.stroke) this.s.stroke(new Path().moveTo(b.x, b.y).lineTo(b.x + b.w, b.y + b.h), this.strokeStyle(e.stroke));
      return;
    }
    const p = e.shape === 'ellipse' ? new Path().ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2) : new Path().roundRect(b.x, b.y, b.w, b.h, (e.radiusMm ?? 0) * MM);
    if (e.fill) this.s.fill(p, this.paint(e.fill, b.x, b.y, b.w, b.h));
    if (e.stroke) this.s.stroke(p, this.strokeStyle(e.stroke));
  }

  private watermark(e: ElementOf<'watermark'>, b: Box, data: DocData): void {
    const img = e.image ? this.ctx.images[e.image] : null;
    const text = e.text ? bind(e.text, data) : '';
    if (!img && !text) return;
    const style: TextStyle = e.style ?? { font: 'heading', sizePt: 54, weight: 700, color: 'primary.10', align: 'center', lineHeight: 1, letterSpacingPt: 6, transform: 'uppercase' };
    const angle = e.angleDeg ?? -30;
    const one = (cx: number, cy: number) => {
      this.s.save();
      this.s.transform(rotation(angle, cx, cy));
      if (img) {
        const size = Math.min(b.w, b.h) * (e.repeat === 'tile' ? 0.25 : 0.62);
        this.drawImage(img, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'contain');
      } else {
        const tw = Math.max(b.w, b.h) * 1.4;
        this.drawText(text, style, { x: cx - tw / 2, y: cy - style.sizePt, w: tw, h: style.sizePt * 2 }, { vAlign: 'middle', maxLines: 1 });
      }
      this.s.restore();
    };
    this.s.save();
    this.s.clip(new Path().rect(b.x, b.y, b.w, b.h));
    if (e.repeat === 'tile') {
      const gap = (e.gapMm ?? 40) * MM;
      for (let yy = b.y + gap / 2, r = 0; yy < b.y + b.h + gap; yy += gap, r++) for (let xx = b.x + (r % 2 ? gap / 2 : 0); xx < b.x + b.w + gap; xx += gap) one(xx, yy);
    } else one(b.x + b.w / 2, b.y + b.h / 2);
    this.s.restore();
  }

  private pattern(e: ElementOf<'pattern'>, b: Box, data: DocData): void {
    const clip = new Path().roundRect(b.x, b.y, b.w, b.h, (e.radiusMm ?? 0) * MM);
    const c1 = this.color(e.color);
    const c2 = this.color(e.color2 ?? e.color);
    const density = e.density ?? 5;
    const lw = e.lineWidthPt ?? 0.25;
    const st = (color: string, k = 1): StrokeStyle => ({ color, width: lw * k, join: 'round', cap: 'round' });
    this.s.save();
    this.s.clip(clip);
    switch (e.pattern) {
      case 'guilloche': {
        const [a, c] = guillocheLines(b.x, b.y, b.w, b.h, density);
        this.s.stroke(a, st(c1));
        this.s.stroke(c, st(c2, 0.8));
        break;
      }
      case 'rosette': {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const maxR = Math.hypot(b.w, b.h) / 2;
        this.s.stroke(rosette(cx, cy, maxR * 0.04, maxR, density, 14 + Math.round(density)), st(c1));
        this.s.stroke(rosette(cx, cy, maxR * 0.1, maxR * 0.95, density * 0.6, 9), st(c2, 0.7));
        break;
      }
      case 'waves':
        this.s.stroke(waves(b.x, b.y, b.w, b.h, density), st(c1));
        break;
      case 'crosshatch':
        this.s.stroke(crosshatch(b.x, b.y, b.w, b.h, density), st(c1));
        break;
      case 'dots':
        this.s.fill(dots(b.x, b.y, b.w, b.h, density), { kind: 'solid', color: c1 });
        break;
      case 'microtext': {
        const text = `${bind(e.text ?? '{{institution.name | upper}}', data)}  •  `;
        const size = 3.4 - density * 0.16;
        const font = this.text.choice({ font: 'body', sizePt: size, weight: 400, color: e.color, align: 'left', lineHeight: 1 });
        const line = text.repeat(Math.max(2, Math.ceil(b.w / Math.max(20, text.length * size * 0.5)) + 1));
        const gap = size * (2.4 - density * 0.1);
        let i = 0;
        for (let yy = b.y; yy < b.y + b.h; yy += gap, i++) this.s.text(line, b.x - (i % 3) * size * 3, yy + size, font, size, 0.25, i % 2 ? c2 : c1);
        break;
      }
    }
    this.s.restore();
  }

  private frame(e: ElementOf<'frame'>, b: Box): void {
    const c1 = this.color(e.color);
    const c2 = this.color(e.color2 ?? e.color);
    const w = e.widthPt ?? 1;
    const gap = (e.gapMm ?? 1.6) * MM;
    const r = (e.radiusMm ?? 0) * MM;
    const inset = (k: number) => ({ x: b.x + k, y: b.y + k, w: b.w - 2 * k, h: b.h - 2 * k });
    const rr = (k: number, width: number, color: string, radius = r) => {
      const q = inset(k + width / 2);
      this.s.stroke(new Path().roundRect(q.x, q.y, q.w, q.h, Math.max(0, radius - k)), { color, width });
    };
    switch (e.style) {
      case 'single':
        rr(0, w, c1);
        break;
      case 'double':
        rr(0, w, c1);
        rr(w + gap, Math.max(0.35, w * 0.35), c2);
        break;
      case 'triple':
        rr(0, Math.max(0.35, w * 0.35), c2);
        rr(gap, w, c1);
        rr(gap * 2 + w, Math.max(0.35, w * 0.35), c2);
        break;
      case 'ornamental': {
        rr(0, w, c1);
        rr(w + gap, Math.max(0.4, w * 0.3), c2);
        const q = inset(w + gap * 2.2);
        const s = Math.min(b.w, b.h) * 0.07;
        const corners: [number, number, number, number][] = [[q.x, q.y, 1, 1], [q.x + q.w, q.y, -1, 1], [q.x, q.y + q.h, 1, -1], [q.x + q.w, q.y + q.h, -1, -1]];
        for (const [x, y, dx, dy] of corners) {
          this.s.stroke(flourish(x, y, dx, dy, s), { color: c1, width: Math.max(0.5, w * 0.45), cap: 'round', join: 'round' });
          this.s.fill(diamond(x + dx * s * 0.28, y + dy * s * 0.28, s * 0.12), { kind: 'solid', color: c2 });
        }
        const mids: [number, number][] = [[b.x + b.w / 2, q.y], [b.x + b.w / 2, q.y + q.h], [q.x, b.y + b.h / 2], [q.x + q.w, b.y + b.h / 2]];
        for (const [x, y] of mids) {
          this.s.fill(diamond(x, y, s * 0.16), { kind: 'solid', color: c2 });
          this.s.stroke(diamond(x, y, s * 0.3), { color: c1, width: Math.max(0.35, w * 0.3) });
        }
        break;
      }
      case 'guilloche': {
        const band = Math.max(6, gap * 3.2);
        rr(0, Math.max(0.5, w * 0.6), c1);
        const q = inset(w + band / 2 + 1);
        const period = band * 1.25;
        const p = new Path();
        p.add(bandChain(q.x, q.y, q.x + q.w, q.y, band, period)).add(bandChain(q.x + q.w, q.y, q.x + q.w, q.y + q.h, band, period)).add(bandChain(q.x + q.w, q.y + q.h, q.x, q.y + q.h, band, period)).add(bandChain(q.x, q.y + q.h, q.x, q.y, band, period));
        this.s.save();
        const outer = inset(w + 1);
        const inner = inset(w + band + 1);
        this.s.clip(new Path().rect(outer.x, outer.y, outer.w, outer.h).add(new Path().rect(inner.x, inner.y, inner.w, inner.h)), true);
        this.s.stroke(p, { color: c2, width: Math.max(0.2, w * 0.25) });
        this.s.restore();
        rr(w + band + 2, Math.max(0.4, w * 0.4), c1);
        const cr = band * 0.62;
        for (const [x, y] of [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h]]) {
          this.s.fill(new Path().circle(x, y, cr), { kind: 'solid', color: this.color('paper') });
          this.s.stroke(rosette(x, y, cr * 0.15, cr, 3, 8), { color: c1, width: 0.3 });
          this.s.stroke(new Path().circle(x, y, cr), { color: c1, width: Math.max(0.4, w * 0.4) });
        }
        break;
      }
      case 'corners': {
        const len = Math.min(b.w, b.h) * 0.12;
        const q = inset(w / 2);
        const p = new Path();
        p.moveTo(q.x, q.y + len).lineTo(q.x, q.y).lineTo(q.x + len, q.y);
        p.moveTo(q.x + q.w - len, q.y).lineTo(q.x + q.w, q.y).lineTo(q.x + q.w, q.y + len);
        p.moveTo(q.x + q.w, q.y + q.h - len).lineTo(q.x + q.w, q.y + q.h).lineTo(q.x + q.w - len, q.y + q.h);
        p.moveTo(q.x + len, q.y + q.h).lineTo(q.x, q.y + q.h).lineTo(q.x, q.y + q.h - len);
        this.s.stroke(p, { color: c1, width: w, cap: 'square' });
        const sq = Math.max(2, w * 2.2);
        for (const [x, y] of [[q.x + gap, q.y + gap], [q.x + q.w - gap - sq, q.y + gap], [q.x + gap, q.y + q.h - gap - sq], [q.x + q.w - gap - sq, q.y + q.h - gap - sq]]) this.s.fill(new Path().rect(x, y, sq, sq), { kind: 'solid', color: c2 });
        break;
      }
    }
  }

  // --- the holographic seal --------------------------------------------------------------------

  private seal(e: ElementOf<'seal'>, b: Box, data: DocData): void {
    const R = Math.min(b.w, b.h) / 2;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const silver = (e.tone ?? 'silver') === 'silver';
    const metal = silver ? ['#f7f8fa', '#c7ccd3', '#8e959e', '#eef1f4', '#b0b6bf', '#e4e7eb', '#7d848d', '#d9dde2'] : ['#fcf4d4', '#e2c26a', '#a9822c', '#f8e8a8', '#c99f3e', '#f1dd96', '#94702a', '#e7cd7e'];
    const dark = silver ? '#5e656e' : '#6f521c';
    const mid = silver ? '#9aa1aa' : '#b48d3a';
    const sheen = (x1: number, y1: number, x2: number, y2: number, colors: string[]): Paint => ({ kind: 'linear', x1, y1, x2, y2, stops: colors.map((c, i) => ({ at: i / (colors.length - 1), color: c })) });
    const rim = scallop(cx, cy, R, 40, R * 0.035);
    this.s.fill(rim, sheen(cx - R, cy - R, cx + R, cy + R, metal));
    this.s.stroke(rim, { color: dark, width: Math.max(0.3, R * 0.008) });
    const r1 = R * 0.79;
    const r2 = R * 0.93;
    this.s.fill(new Path().circle(cx, cy, r2).add(new Path().circle(cx, cy, r1)), sheen(cx + R, cy - R, cx - R, cy + R, metal.slice(2).concat(metal.slice(0, 2))), true);
    this.s.stroke(ringGuilloche(cx, cy, r1 + R * 0.01, r2 - R * 0.01, 30, 5), { color: dark, width: Math.max(0.15, R * 0.0045) });
    this.s.stroke(new Path().circle(cx, cy, r2), { color: dark, width: Math.max(0.25, R * 0.007) });
    this.s.stroke(new Path().circle(cx, cy, r1), { color: dark, width: Math.max(0.25, R * 0.007) });
    const r3 = R * 0.64;
    this.s.fill(new Path().circle(cx, cy, r1).add(new Path().circle(cx, cy, r3)), { kind: 'radial', cx, cy, r: r1, stops: [{ at: 0.75, color: metal[3] }, { at: 0.9, color: metal[1] }, { at: 1, color: metal[0] }] }, true);
    const ring = bind(e.ringText ?? '{{institution.name | upper}} • GENUINE • {{doc.serial}}', data).replace(/\s+/g, ' ').trim();
    if (ring) this.textOnCircle(`${ring}  •  `, cx, cy, (r1 + r3) / 2, (r1 - r3) * 0.5, dark);
    this.s.stroke(new Path().circle(cx, cy, r3), { color: dark, width: Math.max(0.25, R * 0.007) });
    this.s.fill(new Path().circle(cx, cy, r3), { kind: 'radial', cx: cx - r3 * 0.25, cy: cy - r3 * 0.3, r: r3 * 1.3, stops: [{ at: 0, color: '#ffffff' }, { at: 0.45, color: metal[3] }, { at: 0.8, color: metal[1] }, { at: 1, color: metal[2] }] });
    this.s.stroke(sunburst(cx, cy, r3 * 0.68, r3 * 0.97, 96), { color: mid, width: Math.max(0.12, R * 0.0035) });
    this.s.stroke(rosette(cx, cy, r3 * 0.7, r3 * 0.96, 2, 16), { color: dark, width: Math.max(0.12, R * 0.003) });
    const emblemR = r3 * 0.62;
    this.s.stroke(new Path().circle(cx, cy, emblemR), { color: dark, width: Math.max(0.2, R * 0.005) });
    const emblem = e.emblem ?? 'emblem';
    const img = emblem === 'none' ? null : (this.ctx.images[emblem] ?? this.ctx.images.logo ?? null);
    const serial = bind(e.serial ?? '{{doc.serial}}', data).trim();
    if (img) {
      this.s.save();
      this.s.clip(new Path().circle(cx, cy, emblemR * 0.96));
      this.s.fill(new Path().circle(cx, cy, emblemR), { kind: 'solid', color: '#ffffff' });
      const size = emblemR * 1.45;
      this.drawImage(img, { x: cx - size / 2, y: cy - size / 2 - (serial ? emblemR * 0.08 : 0), w: size, h: size }, 'contain');
      this.s.restore();
    } else {
      const initials = bind('{{n | initials}}', { n: String(lookup(data, 'institution.name') ?? '') }) || 'K';
      this.drawText(initials, { font: 'heading', sizePt: emblemR * 0.8, weight: 700, color: dark, align: 'center', lineHeight: 1 }, { x: cx - emblemR, y: cy - emblemR, w: emblemR * 2, h: emblemR * (serial ? 1.75 : 2) }, { vAlign: 'middle' });
    }
    if (serial) {
      const sw = emblemR * 1.7;
      const sh = R * 0.11;
      this.s.fill(new Path().roundRect(cx - sw / 2, cy + emblemR * 0.6, sw, sh, sh / 2), { kind: 'solid', color: dark });
      this.drawText(serial, { font: 'body', sizePt: sh * 0.62, weight: 600, color: '#ffffff', align: 'center', lineHeight: 1, letterSpacingPt: 0.2 }, { x: cx - sw / 2, y: cy + emblemR * 0.6, w: sw, h: sh }, { vAlign: 'middle', fit: 'shrink', maxLines: 1 });
    }
    this.s.save();
    this.s.opacity(0.22);
    this.s.fill(new Path().circle(cx, cy, R * 0.97), sheen(cx - R, cy + R * 0.2, cx + R, cy - R * 0.2, ['#ffc4e1', '#c4ecff', '#d4ffd0', '#fff1b8', '#d8c8ff', '#ffc4e1']));
    this.s.restore();
    this.s.save();
    this.s.opacity(0.35);
    this.s.fill(new Path().ellipse(cx - R * 0.28, cy - R * 0.38, R * 0.42, R * 0.22), { kind: 'radial', cx: cx - R * 0.28, cy: cy - R * 0.38, r: R * 0.45, stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: metal[3] }] });
    this.s.restore();
    this.s.shimmer(cx, cy, R);
  }

  /** Text around a circle, clockwise from the top, letters upright to the outside. */
  private textOnCircle(text: string, cx: number, cy: number, r: number, size: number, color: string): void {
    const font: FontChoice = { family: this.layout.fonts?.body ?? this.ctx.fonts.body, weight: 600, italic: false };
    const circ = Math.PI * 2 * r;
    let s = size;
    const ls = () => s * 0.08;
    const one = this.text.width(text, font, s, ls());
    const reps = Math.max(1, Math.floor(circ / Math.max(1, one)));
    const full = text.repeat(reps);
    let total = this.text.width(full, font, s, ls());
    if (total > circ) {
      s *= circ / total;
      total = this.text.width(full, font, s, ls());
    }
    const spread = circ / total;
    let x = 0;
    for (const ch of [...full]) {
      const adv = this.text.width(ch, font, s, ls());
      const mid = (x + adv / 2) * spread;
      x += adv;
      if (ch === ' ') continue;
      const ang = mid / r - Math.PI / 2;
      const px = cx + r * Math.cos(ang);
      const py = cy + r * Math.sin(ang);
      const c = Math.cos(ang + Math.PI / 2);
      const sn = Math.sin(ang + Math.PI / 2);
      this.s.save();
      this.s.transform([c, sn, -sn, c, px, py]);
      this.s.text(ch, 0, s * 0.35, font, s, 0, color, ' text-anchor="middle"');
      this.s.restore();
    }
  }
}

/** Elements' vertical shift from `flowAfter` (points), given what each one left unused. */
export function flowShifts(elements: DocElement[], unused: (e: DocElement) => number): Map<string, number> {
  const shift = new Map<string, number>();
  const left = new Map<string, number>();
  for (const e of elements) {
    const dy = e.flowAfter ? (shift.get(e.flowAfter) ?? 0) + (left.get(e.flowAfter) ?? 0) : 0;
    shift.set(e.id, dy);
    left.set(e.id, unused(e));
  }
  return shift;
}

// ---------------------------------------------------------------------------------------------
// Measuring text in the browser
// ---------------------------------------------------------------------------------------------

/** An estimate for where there is no canvas (tests, server rendering): half an em per character. */
export const ESTIMATE: TextMeasurer = {
  width: (text, _f, size, ls = 0) => [...text].length * (size * 0.5 + ls),
  metrics: (_f, size) => ({ ascent: size * 0.8, descent: size * 0.2 }),
};

/**
 * Measures with a 2D canvas in the document fonts (once they have loaded; until then the browser's
 * fallback), at 100 px and scaled, cached per text and font.
 */
export function browserMeasurer(): TextMeasurer {
  if (typeof document === 'undefined') return ESTIMATE;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return ESTIMATE;
  const cache = new Map<string, number>();
  const metricCache = new Map<string, { ascent: number; descent: number }>();
  const fontCss = (f: FontChoice) => `${f.italic ? 'italic ' : ''}${f.weight} 100px "${cssFamily(f.family)}", serif`;
  return {
    width(text, f, size, ls = 0) {
      const key = `${f.family}|${f.weight}|${f.italic ? 1 : 0}|${text}`;
      let w = cache.get(key);
      if (w === undefined) {
        ctx.font = fontCss(f);
        w = ctx.measureText(text).width;
        if (cache.size > 20_000) cache.clear();
        cache.set(key, w);
      }
      return (w * size) / 100 + ls * [...text].length;
    },
    metrics(f, size) {
      const key = `${f.family}|${f.weight}|${f.italic ? 1 : 0}`;
      let m = metricCache.get(key);
      if (!m) {
        ctx.font = fontCss(f);
        const t = ctx.measureText('Hg');
        m = { ascent: t.fontBoundingBoxAscent || 80, descent: t.fontBoundingBoxDescent || 20 };
        metricCache.set(key, m);
      }
      return { ascent: (m.ascent * size) / 100, descent: (m.descent * size) / 100 };
    },
  };
}
