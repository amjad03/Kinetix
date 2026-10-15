import { type DocData, type DocElement, type DocLayout, type DocSide, type ElementOf, type Fill, type FontFamilyId, type ImageSource, type Palette, type SignatoryRole, type Stroke, type TextStyle, pageSizeMm, resolveColor } from '@zynetix/shared';
import { qrMatrix } from '../../common/qr.js';
import { code128 } from './barcode.js';
import { bind, list, lookup, present } from './bindings.js';
import { type Matrix, type Paint, Path, rotation, type StrokeStyle, type Surface } from './canvas.js';
import { type FontChoice, type GlyphRun, layoutText, metrics, type Weight } from './fonts.js';
import type { ImageRes } from './images.js';
import { bandChain, crosshatch, diamond, dots, flourish, guillocheLines, ringGuilloche, rosette, scallop, silhouette, sunburst, waves } from './ornaments.js';

/** Points per millimetre. */
export const MM = 72 / 25.4;

export interface RenderContext {
  palette: Palette;
  fonts: { heading: FontFamilyId; body: FontFamilyId };
  /** Branding images, the subject's photo and signatures; null or missing when there is none. */
  images: Partial<Record<ImageSource, ImageRes | null>>;
  signatories: Partial<Record<SignatoryRole, { name: string; designation: string }>>;
}

const SIGNATORY_TITLE: Record<SignatoryRole, string> = { principal: 'Principal', registrar: 'Registrar', controller: 'Controller of Examinations', finance: 'Finance Officer', hr: 'HR Manager' };

// ---------------------------------------------------------------------------------------------
// Text layout
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
  /** Width of the space before it (0 at a paragraph start). */
  space: number;
}

interface Line {
  words: Word[];
  width: number;
  /** Last line of its paragraph (not justified). */
  last: boolean;
}

const caseOf = (s: string, t: TextStyle['transform']) => (t === 'uppercase' ? s.toLocaleUpperCase('en-IN') : t === 'lowercase' ? s.toLocaleLowerCase('en-IN') : t === 'capitalize' ? s.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s);

class TextLayout {
  /** Whether the last call to lines() had to break a word that was wider than the line. */
  broke = false;

  constructor(private readonly ctx: RenderContext & { layoutFonts?: DocLayout['fonts'] }) {}

  family(ref: TextStyle['font']): FontFamilyId {
    if (ref === 'heading') return this.ctx.layoutFonts?.heading ?? this.ctx.fonts.heading;
    if (ref === 'body') return this.ctx.layoutFonts?.body ?? this.ctx.fonts.body;
    return ref;
  }

  choice(style: TextStyle, bold = false, italic = false): FontChoice {
    return { family: this.family(style.font), weight: (bold ? 700 : style.weight) as Weight, italic: italic || !!style.italic };
  }

  /** Words of each paragraph at `size`. */
  private words(spans: Span[], style: TextStyle, size: number): Word[][] {
    const paras: Word[][] = [[]];
    let cur: Word | null = null;
    let pendingSpace = false;
    const ls = style.letterSpacingPt ?? 0;
    for (const sp of spans) {
      const font = this.choice(style, sp.bold, sp.italic);
      const parts = caseOf(sp.text, style.transform).split(/(\n|[ \t]+)/);
      for (const part of parts) {
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
        const width = layoutText(part, font, size, ls).width;
        const piece = { text: part, font, emphasis: sp.bold, width };
        if (cur && !pendingSpace) {
          cur.pieces.push(piece);
          cur.width += width;
        } else {
          const para = paras[paras.length - 1];
          cur = { pieces: [piece], width, space: para.length ? layoutText(' ', font, size).width + ls : 0 };
          para.push(cur);
        }
        pendingSpace = false;
      }
    }
    return paras;
  }

  /** Greedy line breaking; a word wider than the line is split by characters. */
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
        // Break an over-long single-piece word into chunks that fit.
        this.broke = true;
        const p = w.pieces[0];
        let chunk = '';
        let first = true;
        for (const ch of [...p.text]) {
          const next = chunk + ch;
          if (chunk && layoutText(next, p.font, size).width > width) {
            const cw = layoutText(chunk, p.font, size).width;
            words.push({ pieces: [{ ...p, text: chunk, width: cw }], width: cw, space: first ? w.space : 0 });
            first = false;
            chunk = ch;
          } else chunk = next;
        }
        const cw = layoutText(chunk, p.font, size).width;
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

interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------------------------

export class LayoutRenderer {
  private readonly text: TextLayout;

  constructor(
    private readonly s: Surface,
    private readonly layout: DocLayout,
    private readonly ctx: RenderContext,
  ) {
    this.text = new TextLayout({ ...ctx, layoutFonts: layout.fonts });
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
    return { kind: 'radial', cx: x + w * fill.cx, cy: y + h * fill.cy, r: (fill.r * Math.hypot(w, h)) / 2, stops };
  }

  private strokeStyle(s: Stroke): StrokeStyle {
    return { color: this.color(s.color), width: s.widthPt, dash: s.dashMm?.map((d) => d * MM), cap: s.cap };
  }

  /** Pages this side needs with `data` (long tables continue on more pages). */
  pagesFor(side: DocSide, data: DocData): number {
    let pages = 1;
    for (const e of side.elements) {
      if (e.type !== 'table' || e.hidden || e.overflow !== 'paginate') continue;
      const cap = this.tableCapacity(e);
      pages = Math.max(pages, Math.ceil(Math.max(1, list(data, e.source).length) / cap));
    }
    return Math.min(pages, 50);
  }

  /** Draws one page of a side at the surface's current origin (top-left of the side). */
  drawSide(side: DocSide, data: DocData, page = 0, pages = 1): void {
    const { w, h } = pageSizeMm(this.layout.page);
    if (side.background) this.s.fill(new Path().rect(0, 0, w * MM, h * MM), this.paint(side.background, 0, 0, w * MM, h * MM));
    // flowAfter: how far each element moved up, and the height each left unused.
    const shift = new Map<string, number>();
    const unused = new Map<string, number>();
    for (const e of side.elements) {
      const dy = e.flowAfter ? (shift.get(e.flowAfter) ?? 0) + (unused.get(e.flowAfter) ?? 0) : 0;
      shift.set(e.id, dy);
      if (e.hidden || (e.pages === 'first' && page !== 0) || (e.pages === 'last' && page !== pages - 1) || (e.showIf && !present(data, e.showIf))) {
        unused.set(e.id, e.h * MM);
        continue;
      }
      this.s.save();
      const box = { x: e.x * MM, y: e.y * MM - dy, w: e.w * MM, h: e.h * MM };
      if (e.rotationDeg) this.s.transform(rotation(e.rotationDeg, box.x + box.w / 2, box.y + box.h / 2));
      if (e.opacity !== undefined && e.opacity < 1) this.s.opacity(e.opacity);
      unused.set(e.id, Math.max(0, this.element(e, box, data, page, pages)));
      this.s.restore();
    }
  }

  /** Draws an element; returns the height it left unused at the bottom of its box (for flowAfter). */
  private element(e: DocElement, b: TextBox, data: DocData, page: number, pages: number): number {
    switch (e.type) {
      case 'text':
        return this.textElement(e, b, data);
      case 'fieldList':
        return this.fieldList(e, b, data);
      case 'table':
        return this.table(e, b, data, page, pages);
      case 'field':
        this.field(e, b, data);
        break;
      case 'image':
        this.imageElement(e, b, data);
        break;
      case 'signature':
        this.signature(e, b);
        break;
      case 'qr':
        this.qr(e, b, data);
        break;
      case 'barcode':
        this.barcode(e, b, data);
        break;
      case 'shape':
        this.shape(e, b);
        break;
      case 'watermark':
        this.watermark(e, b, data);
        break;
      case 'pattern':
        this.pattern(e, b, data);
        break;
      case 'frame':
        this.frame(e, b);
        break;
      case 'seal':
        this.seal(e, b, data);
        break;
    }
    return 0;
  }

  // --- text ------------------------------------------------------------------------------------

  /**
   * Lays out and draws text in a box. Returns the height used. `fit: 'shrink'` lowers the size
   * until it fits; `maxLines` cuts with an ellipsis.
   */
  drawText(raw: string, style: TextStyle, b: TextBox, o: { vAlign?: 'top' | 'middle' | 'bottom'; fit?: 'none' | 'shrink'; minSizePt?: number; markdown?: boolean; emphasisColor?: string; maxLines?: number; draw?: boolean } = {}): { height: number; width: number; lines: number } {
    const spans = o.markdown ? parseMarkdown(raw) : [{ text: raw, bold: false, italic: false }];
    if (!raw.trim()) return { height: 0, width: 0, lines: 0 };
    let size = style.sizePt;
    const min = Math.min(size, o.minSizePt ?? size * 0.5);
    let lines = this.text.lines(spans, style, size, b.w);
    // Shrinking comes before breaking a word in the middle.
    const tooBig = (ls: typeof lines, sz: number) => this.text.broke || ls.length * sz * style.lineHeight > b.h + 0.5 || ls.some((l) => l.width > b.w + 0.5) || (o.maxLines !== undefined && ls.length > o.maxLines);
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
    const m = metrics(this.text.choice(style), size);
    const total = lines.length * lh;
    let top = b.y;
    if (o.vAlign === 'middle') top = b.y + (b.h - total) / 2;
    else if (o.vAlign === 'bottom') top = b.y + b.h - total;
    if (o.draw === false) return { height: total, width: Math.max(0, ...lines.map((l) => l.width)), lines: lines.length };
    const color = this.color(style.color);
    const emph = o.emphasisColor ? this.color(o.emphasisColor) : color;
    const ls = style.letterSpacingPt ?? 0;
    lines.forEach((line, i) => {
      // Baseline: the line box centred on the font's ascent and descent.
      const base = top + i * lh + (lh - (m.ascent + m.descent)) / 2 + m.ascent;
      const justify = style.align === 'justify' && !line.last && line.words.length > 1;
      const gaps = line.words.length - 1;
      const extra = justify ? (b.w - line.width) / gaps : 0;
      let x = b.x;
      if (style.align === 'center') x = b.x + (b.w - line.width) / 2;
      else if (style.align === 'right') x = b.x + b.w - line.width;
      // Letter spacing adds after the last character too; take it back so centring is exact.
      if (ls && (style.align === 'center' || style.align === 'right')) x += style.align === 'center' ? ls / 2 : ls;
      line.words.forEach((w, wi) => {
        if (wi > 0) x += w.space + extra;
        for (const p of w.pieces) {
          const run = layoutText(p.text, p.font, size, ls);
          for (const r of run.runs) this.s.glyphs(r, x, base, p.emphasis ? emph : color);
          x += run.width;
        }
      });
    });
    return { height: total, width: Math.max(0, ...lines.map((l) => l.width)), lines: lines.length };
  }

  private textElement(e: ElementOf<'text'>, b: TextBox, data: DocData): number {
    const r = this.drawText(bind(e.text, data), e.style, b, { vAlign: e.vAlign, fit: e.fit, minSizePt: e.minSizePt, markdown: e.markdown, emphasisColor: e.emphasisColor, maxLines: e.maxLines });
    return e.vAlign === 'top' ? b.h - r.height : 0;
  }

  private field(e: ElementOf<'field'>, b: TextBox, data: DocData): void {
    const label = bind(e.label, data);
    const value = bind(e.value, data);
    this.pair(label, value, b, e.direction, e.labelWidthMm, e.separator, e.labelStyle, e.valueStyle, e.rule);
  }

  private pair(label: string, value: string, b: TextBox, direction: 'row' | 'column', labelWidthMm: number | undefined, sep: string | undefined, ls: TextStyle, vs: TextStyle, rule?: Stroke): void {
    if (direction === 'column') {
      const lh = label ? ls.sizePt * ls.lineHeight : 0;
      if (label) this.drawText(label, ls, { x: b.x, y: b.y, w: b.w, h: lh }, { fit: 'shrink', maxLines: 1 });
      const vb = { x: b.x, y: b.y + lh, w: b.w, h: b.h - lh };
      this.drawText(value || '—', vs, vb, { fit: 'shrink', minSizePt: vs.sizePt * 0.6, vAlign: 'top' });
      if (rule) this.s.stroke(new Path().moveTo(b.x, b.y + b.h).lineTo(b.x + b.w, b.y + b.h), this.strokeStyle(rule));
      return;
    }
    const lw = labelWidthMm !== undefined ? labelWidthMm * MM : b.w * 0.38;
    const sepW = sep ? Math.max(ls.sizePt * 0.9, 6) : 0;
    this.drawText(label, ls, { x: b.x, y: b.y, w: Math.max(4, lw - sepW), h: b.h }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 });
    if (sep) this.drawText(sep, ls, { x: b.x + lw - sepW, y: b.y, w: sepW, h: b.h }, { vAlign: 'middle' });
    const vx = b.x + lw + (sep ? 2 : 0);
    this.drawText(value || '—', vs, { x: vx, y: b.y, w: Math.max(4, b.x + b.w - vx), h: b.h }, { vAlign: 'middle', fit: 'shrink', minSizePt: vs.sizePt * 0.6, maxLines: Math.max(1, Math.floor(b.h / (vs.sizePt * vs.lineHeight))) });
    if (rule) this.s.stroke(new Path().moveTo(vx, b.y + b.h - 1).lineTo(b.x + b.w, b.y + b.h - 1), this.strokeStyle(rule));
  }

  private fieldList(e: ElementOf<'fieldList'>, b: TextBox, data: DocData): number {
    const items = list(data, e.source).filter((i) => i && (i.label || i.value));
    const rowH = e.rowHeightMm * MM;
    const perCol = Math.max(1, Math.ceil(items.length / e.columns));
    const colW = b.w / e.columns;
    items.forEach((it, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      this.pair(String(it.label ?? ''), String(it.value ?? ''), { x: b.x + col * colW + (col ? 6 : 0), y: b.y + row * rowH, w: colW - (col ? 6 : 0), h: rowH }, 'row', e.labelWidthMm, e.separator, e.labelStyle, e.valueStyle, e.rule);
    });
    return b.h - perCol * rowH;
  }

  // --- images ----------------------------------------------------------------------------------

  private cropPath(crop: 'rect' | 'rounded' | 'circle', b: TextBox, radiusMm?: number): Path {
    if (crop === 'circle') return new Path().ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2);
    if (crop === 'rounded') return new Path().roundRect(b.x, b.y, b.w, b.h, (radiusMm ?? Math.min(b.w, b.h) / MM / 8) * MM);
    return new Path().rect(b.x, b.y, b.w, b.h);
  }

  /** Draws an image fitted to a box (no clipping beyond the box for `cover`). */
  drawImage(img: ImageRes, b: TextBox, fit: 'contain' | 'cover' | 'fill' = 'contain'): void {
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

  private imageElement(e: ElementOf<'image'>, b: TextBox, data: DocData): void {
    const img = this.ctx.images[e.source] ?? null;
    const clip = this.cropPath(e.crop, b, e.radiusMm);
    if (!img && e.placeholder !== 'none' && (e.source === 'logo' || e.source === 'logo_dark' || e.source === 'emblem')) return this.monogram(b, data, e.source === 'logo_dark');
    if (!img && (e.source !== 'photo' || e.placeholder === 'none')) return;
    this.s.save();
    this.s.clip(clip);
    if (e.background) this.s.fill(clip, this.paint(e.background, b.x, b.y, b.w, b.h));
    if (img) this.drawImage(img, b, e.fit);
    else {
      // A photo placeholder: initials or a silhouette on a soft tint.
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

  /** Until a logo or crest is uploaded: the institution's initials in a double ring. */
  private monogram(b: TextBox, data: DocData, onDark: boolean): void {
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

  private signature(e: ElementOf<'signature'>, b: TextBox): void {
    const who = this.ctx.signatories[e.role];
    const img = e.showImage ? (this.ctx.images[`signature:${e.role}`] ?? null) : null;
    const nameH = e.showName && who?.name ? e.nameStyle.sizePt * e.nameStyle.lineHeight : 0;
    const desH = e.showDesignation ? e.designationStyle.sizePt * e.designationStyle.lineHeight : 0;
    const lineY = b.y + b.h - nameH - desH - 2;
    if (img) {
      const ib = { x: b.x, y: b.y, w: b.w, h: Math.max(4, lineY - b.y - 1) };
      const ar = img.width / img.height;
      const h = Math.min(ib.h, ib.w / ar);
      const w = h * ar;
      const align = e.nameStyle.align;
      const x = align === 'left' ? ib.x : align === 'right' ? ib.x + ib.w - w : ib.x + (ib.w - w) / 2;
      this.s.image(img, x, lineY - h + h * 0.12, w, h);
    }
    if (e.line) {
      const lw = Math.min(b.w, Math.max(b.w * 0.8, 60));
      const align = e.nameStyle.align;
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

  private qr(e: ElementOf<'qr'>, b: TextBox, data: DocData): void {
    const value = bind(e.value, data).trim();
    if (!value) return;
    const m = qrMatrix(value);
    const size = Math.min(b.w, b.h);
    const x0 = b.x + (b.w - size) / 2;
    const y0 = b.y + (b.h - size) / 2;
    if (e.background) this.s.fill(new Path().rect(x0, y0, size, size), { kind: 'solid', color: this.color(e.background) });
    const cell = size / (m.length + 2 * e.quietZone);
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
        p.rect(x0 + (start + e.quietZone) * cell, y0 + (r + e.quietZone) * cell, (c - start) * cell + 0.02, cell + 0.02);
      }
    });
    this.s.fill(p, { kind: 'solid', color: this.color(e.color) });
    if (/^https?:\/\//.test(value)) this.s.link(x0, y0, size, size, value);
  }

  private barcode(e: ElementOf<'barcode'>, b: TextBox, data: DocData): void {
    const value = bind(e.value, data).trim();
    if (!value) return;
    const widths = code128(value);
    const total = widths.reduce((a, v) => a + v, 0) + 20;
    const style: TextStyle = e.textStyle ?? { font: 'body', sizePt: Math.max(4, Math.min(9, b.h * 0.22)), weight: 400, color: e.color, align: 'center', lineHeight: 1.1, letterSpacingPt: 1 };
    const textH = e.showText ? style.sizePt * 1.25 : 0;
    const mod = b.w / total;
    const p = new Path();
    let x = b.x + 10 * mod;
    widths.forEach((wd, i) => {
      if (i % 2 === 0) p.rect(x, b.y, wd * mod, b.h - textH);
      x += wd * mod;
    });
    this.s.fill(p, { kind: 'solid', color: this.color(e.color) });
    if (e.showText) this.drawText(value, style, { x: b.x, y: b.y + b.h - textH, w: b.w, h: textH }, { vAlign: 'bottom', fit: 'shrink', maxLines: 1 });
  }

  // --- tables ----------------------------------------------------------------------------------

  private footerHeight(e: ElementOf<'table'>): number {
    return (e.footer?.length ?? 0) * e.body.rowHeightMm * MM;
  }

  tableCapacity(e: ElementOf<'table'>): number {
    return Math.max(1, Math.floor((e.h * MM - e.header.heightMm * MM - this.footerHeight(e)) / (e.body.rowHeightMm * MM) + 1e-6));
  }

  private table(e: ElementOf<'table'>, b: TextBox, data: DocData, page: number, pages: number): number {
    const all = list(data, e.source);
    const weights = e.columns.reduce((a, c) => a + c.width, 0);
    const widths = e.columns.map((c) => (c.width / weights) * b.w);
    const xs = widths.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [b.x]);
    const pad = e.cellPaddingMm * MM;
    const headH = e.header.heightMm * MM;
    let rowH = e.body.rowHeightMm * MM;
    let rows = all;
    let bodyStyle = e.body.style;
    if (e.overflow === 'paginate') {
      const cap = this.tableCapacity(e);
      rows = all.slice(page * cap, (page + 1) * cap);
    } else if (all.length) {
      const avail = b.h - headH - this.footerHeight(e);
      if (all.length * rowH > avail) {
        const k = Math.max(0.55, avail / (all.length * rowH));
        rowH *= k;
        bodyStyle = { ...bodyStyle, sizePt: Math.max(5, bodyStyle.sizePt * Math.max(k, 0.7)) };
      }
    }
    const last = page >= pages - 1 || e.overflow !== 'paginate';
    if (e.background) {
      const shown = Math.max(rows.length, rows.length || e.emptyText ? 1 : 0) + (last ? (e.footer?.length ?? 0) : 0);
      const th = headH + shown * rowH;
      this.s.fill(new Path().rect(b.x, b.y, b.w, th), this.paint(e.background, b.x, b.y, b.w, th));
    }
    // Header
    if (e.header.fill) this.s.fill(new Path().rect(b.x, b.y, b.w, headH), this.paint(e.header.fill, b.x, b.y, b.w, headH));
    e.columns.forEach((c, i) => this.drawText(bind(c.header, data), { ...e.header.style, align: c.align }, { x: xs[i] + pad, y: b.y, w: widths[i] - 2 * pad, h: headH }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 }));
    let y = b.y + headH;
    if (!rows.length && e.emptyText && page === 0) {
      this.drawText(e.emptyText, { ...bodyStyle, align: 'center', color: 'muted' }, { x: b.x, y, w: b.w, h: rowH }, { vAlign: 'middle' });
      y += rowH;
    }
    const maxLines = Math.max(1, Math.floor(rowH / (bodyStyle.sizePt * bodyStyle.lineHeight) + 0.05));
    rows.forEach((row, ri) => {
      if (e.body.zebra && (page * this.tableCapacity(e) + ri) % 2 === 1) this.s.fill(new Path().rect(b.x, y, b.w, rowH), this.paint(e.body.zebra, b.x, y, b.w, rowH));
      e.columns.forEach((c, i) => this.drawText(bind(c.value, data, row), { ...bodyStyle, align: c.align }, { x: xs[i] + pad, y, w: widths[i] - 2 * pad, h: rowH }, { vAlign: 'middle', fit: 'shrink', minSizePt: bodyStyle.sizePt * 0.75, maxLines }));
      y += rowH;
      if (e.borders.horizontal && (ri < rows.length - 1 || (last && e.footer?.length))) this.s.stroke(new Path().moveTo(b.x, y).lineTo(b.x + b.w, y), this.strokeStyle(e.borders.horizontal));
    });
    const bodyBottom = y;
    if (last && e.footer)
      for (const f of e.footer) {
        if (f.fill) this.s.fill(new Path().rect(b.x, y, b.w, rowH), this.paint(f.fill, b.x, y, b.w, rowH));
        let col = 0;
        for (const cell of f.cells) {
          const span = Math.min(cell.span, e.columns.length - col);
          if (span <= 0) break;
          const cx = xs[col];
          const cw = xs[col + span] - cx;
          this.drawText(bind(cell.text, data), { ...(f.style ?? { ...bodyStyle, weight: 700 }), align: cell.align }, { x: cx + pad, y, w: cw - 2 * pad, h: rowH }, { vAlign: 'middle', fit: 'shrink', maxLines: 2 });
          col += span;
        }
        y += rowH;
      }
    if (e.borders.headerBottom) this.s.stroke(new Path().moveTo(b.x, b.y + headH).lineTo(b.x + b.w, b.y + headH), this.strokeStyle(e.borders.headerBottom));
    if (e.borders.vertical) {
      const p = new Path();
      for (let i = 1; i < e.columns.length; i++) p.moveTo(xs[i], b.y).lineTo(xs[i], last && e.footer ? bodyBottom : y);
      this.s.stroke(p, this.strokeStyle(e.borders.vertical));
    }
    if (e.borders.outer) this.s.stroke(new Path().rect(b.x, b.y, b.w, y - b.y), this.strokeStyle(e.borders.outer));
    return b.h - (y - b.y);
  }

  // --- shapes, marks, patterns, frames --------------------------------------------------------

  private shape(e: ElementOf<'shape'>, b: TextBox): void {
    if (e.shape === 'line') {
      if (e.stroke) this.s.stroke(new Path().moveTo(b.x, b.y).lineTo(b.x + b.w, b.y + b.h), this.strokeStyle(e.stroke));
      return;
    }
    const p = e.shape === 'ellipse' ? new Path().ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2) : new Path().roundRect(b.x, b.y, b.w, b.h, (e.radiusMm ?? 0) * MM);
    if (e.fill) this.s.fill(p, this.paint(e.fill, b.x, b.y, b.w, b.h));
    if (e.stroke) this.s.stroke(p, this.strokeStyle(e.stroke));
  }

  private watermark(e: ElementOf<'watermark'>, b: TextBox, data: DocData): void {
    const img = e.image ? this.ctx.images[e.image] : null;
    const text = e.text ? bind(e.text, data) : '';
    if (!img && !text) return;
    const style: TextStyle = e.style ?? { font: 'heading', sizePt: 54, weight: 700, color: 'primary.10', align: 'center', lineHeight: 1, letterSpacingPt: 6, transform: 'uppercase' };
    const one = (cx: number, cy: number) => {
      this.s.save();
      this.s.transform(rotation(e.angleDeg, cx, cy));
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

  private pattern(e: ElementOf<'pattern'>, b: TextBox, data: DocData): void {
    const clip = new Path().roundRect(b.x, b.y, b.w, b.h, (e.radiusMm ?? 0) * MM);
    const c1 = this.color(e.color);
    const c2 = this.color(e.color2 ?? e.color);
    const st = (color: string, k = 1): StrokeStyle => ({ color, width: e.lineWidthPt * k, join: 'round', cap: 'round' });
    this.s.save();
    this.s.clip(clip);
    switch (e.pattern) {
      case 'guilloche': {
        const [a, c] = guillocheLines(b.x, b.y, b.w, b.h, e.density);
        this.s.stroke(a, st(c1));
        this.s.stroke(c, st(c2, 0.8));
        break;
      }
      case 'rosette': {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const maxR = Math.hypot(b.w, b.h) / 2;
        this.s.stroke(rosette(cx, cy, maxR * 0.04, maxR, e.density, 14 + Math.round(e.density)), st(c1));
        this.s.stroke(rosette(cx, cy, maxR * 0.1, maxR * 0.95, e.density * 0.6, 9), st(c2, 0.7));
        break;
      }
      case 'waves':
        this.s.stroke(waves(b.x, b.y, b.w, b.h, e.density), st(c1));
        break;
      case 'crosshatch':
        this.s.stroke(crosshatch(b.x, b.y, b.w, b.h, e.density), st(c1));
        break;
      case 'dots':
        this.s.fill(dots(b.x, b.y, b.w, b.h, e.density), { kind: 'solid', color: c1 });
        break;
      case 'microtext': {
        const text = `${bind(e.text ?? '{{institution.name | upper}}', data)}  •  `;
        const size = 3.4 - e.density * 0.16;
        const style: TextStyle = { font: 'body', sizePt: size, weight: 400, color: e.color, align: 'left', lineHeight: 1, letterSpacingPt: 0.25 };
        const line = text.repeat(Math.max(2, Math.ceil(b.w / Math.max(20, text.length * size * 0.5)) + 1));
        const gap = size * (2.4 - e.density * 0.1);
        let i = 0;
        for (let yy = b.y; yy < b.y + b.h; yy += gap, i++) {
          const off = (i % 3) * size * 3;
          const run = layoutText(line, this.text.choice(style), size, 0.25);
          for (const r of run.runs) this.s.glyphs(r, b.x - off, yy + size, i % 2 ? c2 : c1);
        }
        break;
      }
    }
    this.s.restore();
  }

  private frame(e: ElementOf<'frame'>, b: TextBox): void {
    const c1 = this.color(e.color);
    const c2 = this.color(e.color2 ?? e.color);
    const w = e.widthPt;
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
        const k = w + gap * 2.2;
        const q = inset(k);
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

  private seal(e: ElementOf<'seal'>, b: TextBox, data: DocData): void {
    const R = Math.min(b.w, b.h) / 2;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const silver = e.tone === 'silver';
    const metal = silver
      ? ['#f7f8fa', '#c7ccd3', '#8e959e', '#eef1f4', '#b0b6bf', '#e4e7eb', '#7d848d', '#d9dde2']
      : ['#fcf4d4', '#e2c26a', '#a9822c', '#f8e8a8', '#c99f3e', '#f1dd96', '#94702a', '#e7cd7e'];
    const dark = silver ? '#5e656e' : '#6f521c';
    const mid = silver ? '#9aa1aa' : '#b48d3a';
    const sheen = (x1: number, y1: number, x2: number, y2: number, colors: string[]): Paint => ({ kind: 'linear', x1, y1, x2, y2, stops: colors.map((c, i) => ({ at: i / (colors.length - 1), color: c })) });
    // Scalloped metal rim.
    const rim = scallop(cx, cy, R, 40, R * 0.035);
    this.s.fill(rim, sheen(cx - R, cy - R, cx + R, cy + R, metal));
    this.s.stroke(rim, { color: dark, width: Math.max(0.3, R * 0.008) });
    // Outer guilloche band.
    const r1 = R * 0.79;
    const r2 = R * 0.93;
    this.s.fill(new Path().circle(cx, cy, r2).add(new Path().circle(cx, cy, r1)), sheen(cx + R, cy - R, cx - R, cy + R, metal.slice(2).concat(metal.slice(0, 2))), true);
    this.s.stroke(ringGuilloche(cx, cy, r1 + R * 0.01, r2 - R * 0.01, 30, 5), { color: dark, width: Math.max(0.15, R * 0.0045) });
    this.s.stroke(new Path().circle(cx, cy, r2), { color: dark, width: Math.max(0.25, R * 0.007) });
    this.s.stroke(new Path().circle(cx, cy, r1), { color: dark, width: Math.max(0.25, R * 0.007) });
    // Micro-text ring.
    const r3 = R * 0.64;
    this.s.fill(new Path().circle(cx, cy, r1).add(new Path().circle(cx, cy, r3)), { kind: 'radial', cx, cy, r: r1, stops: [{ at: 0.75, color: metal[3] }, { at: 0.9, color: metal[1] }, { at: 1, color: metal[0] }] }, true);
    const ring = bind(e.ringText, data).replace(/\s+/g, ' ').trim();
    if (ring) this.textOnCircle(`${ring}  •  `, cx, cy, (r1 + r3) / 2, (r1 - r3) * 0.5, dark);
    this.s.stroke(new Path().circle(cx, cy, r3), { color: dark, width: Math.max(0.25, R * 0.007) });
    // Inner disc: radial metal, engine turning and fine rings.
    this.s.fill(new Path().circle(cx, cy, r3), { kind: 'radial', cx: cx - r3 * 0.25, cy: cy - r3 * 0.3, r: r3 * 1.3, stops: [{ at: 0, color: '#ffffff' }, { at: 0.45, color: metal[3] }, { at: 0.8, color: metal[1] }, { at: 1, color: metal[2] }] });
    this.s.stroke(sunburst(cx, cy, r3 * 0.68, r3 * 0.97, 96), { color: mid, width: Math.max(0.12, R * 0.0035) });
    this.s.stroke(rosette(cx, cy, r3 * 0.7, r3 * 0.96, 2, 16), { color: dark, width: Math.max(0.12, R * 0.003) });
    const emblemR = r3 * 0.62;
    this.s.stroke(new Path().circle(cx, cy, emblemR), { color: dark, width: Math.max(0.2, R * 0.005) });
    const img = e.emblem === 'none' ? null : (this.ctx.images[e.emblem] ?? this.ctx.images.logo ?? null);
    const serial = bind(e.serial, data).trim();
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
    // Holographic iridescence and a highlight.
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
    let s = size;
    let run = layoutText(text, font, s, s * 0.08);
    const circ = Math.PI * 2 * r;
    // Repeat to fill the ring, then scale to close it exactly.
    const reps = Math.max(1, Math.floor(circ / Math.max(1, run.width)));
    run = layoutText(text.repeat(reps), font, s, s * 0.08);
    if (run.width > circ) {
      s *= circ / run.width;
      run = layoutText(text.repeat(reps), font, s, s * 0.08);
    }
    const spread = circ / run.width;
    for (const g of run.runs)
      for (const gl of g.glyphs) {
        const mid = (g.x + gl.x + gl.adv / 2) * spread;
        const ang = mid / r - Math.PI / 2;
        const px = cx + r * Math.cos(ang);
        const py = cy + r * Math.sin(ang);
        const one: GlyphRun = { ...g, x: 0, glyphs: [{ ...gl, x: -gl.adv / 2 }], width: gl.adv, text: gl.text };
        this.s.save();
        const c = Math.cos(ang + Math.PI / 2);
        const sn = Math.sin(ang + Math.PI / 2);
        this.s.transform([c, sn, -sn, c, px, py] as Matrix);
        this.s.glyphs(one, 0, s * 0.35, color);
        this.s.restore();
      }
  }
}

/** Page size of a layout in points. */
export function pagePt(layout: DocLayout): { w: number; h: number } {
  const { w, h } = pageSizeMm(layout.page);
  return { w: w * MM, h: h * MM };
}
