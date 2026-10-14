import type { Matrix, Paint, Path, StrokeStyle, Surface } from './canvas.js';
import type { GlyphRun } from './fonts.js';
import type { ImageRes } from './images.js';

/**
 * SVG output for previews and thumbnails (and, through sharp, PNG). Text is drawn as the same
 * HarfBuzz-shaped glyph outlines the PDF embeds, so the preview matches the print exactly and
 * needs no fonts on the viewer's machine. One SVG per page.
 */

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const fine = (v: number) => String(Math.round(v * 1e6) / 1e6);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface SvgPage {
  w: number;
  h: number;
  body: string[];
  defs: string[];
  /** Open <g> count per save level. */
  levels: number[];
  shimmer: boolean;
}

export class SvgSurface implements Surface {
  private readonly pages: SvgPage[] = [];
  private seq = 0;
  private readonly glyphDefs = new Map<string, string>();
  private readonly imageDefs = new Map<string, string>();

  /** `animate` adds the moving sheen on holographic seals (ERP preview). */
  constructor(private readonly opts: { animate?: boolean } = {}) {}

  private get page(): SvgPage {
    return this.pages[this.pages.length - 1];
  }

  beginPage(width: number, height: number): void {
    this.pages.push({ w: width, h: height, body: [], defs: [], levels: [0], shimmer: false });
    this.glyphDefs.clear();
    this.imageDefs.clear();
  }

  private open(attrs: string) {
    this.page.body.push(`<g ${attrs}>`);
    this.page.levels[this.page.levels.length - 1]++;
  }

  save(): void {
    this.page.levels.push(0);
  }

  restore(): void {
    const k = this.page.levels.pop() ?? 0;
    for (let i = 0; i < k; i++) this.page.body.push('</g>');
    if (!this.page.levels.length) this.page.levels.push(0);
  }

  transform(m: Matrix): void {
    this.open(`transform="matrix(${m.map(n).join(' ')})"`);
  }

  opacity(alpha: number): void {
    this.open(`opacity="${n(alpha)}"`);
  }

  private d(p: Path): string {
    return p.segs.map((s) => (s[0] === 'Z' ? 'Z' : `${s[0]}${s.slice(1).map((v) => n(v as number)).join(' ')}`)).join('');
  }

  clip(p: Path, evenOdd = false): void {
    if (p.empty) return;
    const id = `c${++this.seq}`;
    this.page.defs.push(`<clipPath id="${id}"><path d="${this.d(p)}"${evenOdd ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    this.open(`clip-path="url(#${id})"`);
  }

  private paint(p: Paint): string {
    if (p.kind === 'solid') return p.color;
    const id = `p${++this.seq}`;
    const stops = [...p.stops].sort((a, b) => a.at - b.at).map((s) => `<stop offset="${n(s.at)}" stop-color="${s.color}"/>`).join('');
    this.page.defs.push(
      p.kind === 'linear'
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}">${stops}</linearGradient>`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}">${stops}</radialGradient>`,
    );
    return `url(#${id})`;
  }

  fill(p: Path, paint: Paint, evenOdd = false): void {
    if (p.empty) return;
    this.page.body.push(`<path d="${this.d(p)}" fill="${this.paint(paint)}"${evenOdd ? ' fill-rule="evenodd"' : ''}/>`);
  }

  stroke(p: Path, s: StrokeStyle): void {
    if (p.empty || s.width <= 0) return;
    const dash = s.dash?.length ? ` stroke-dasharray="${s.dash.map(n).join(' ')}"` : '';
    this.page.body.push(`<path d="${this.d(p)}" fill="none" stroke="${s.color}" stroke-width="${n(s.width)}" stroke-linecap="${s.cap ?? 'butt'}" stroke-linejoin="${s.join ?? 'miter'}"${dash}/>`);
  }

  glyphs(run: GlyphRun, x: number, y: number, color: string): void {
    if (!run.glyphs.length || run.sizePt <= 0) return;
    const s = run.sizePt / run.face.upem;
    const uses: string[] = [];
    for (const g of run.glyphs) {
      const key = `${run.face.name}:${g.gid}`;
      let id = this.glyphDefs.get(key);
      if (!id) {
        const d = run.face.glyphPath(g.gid);
        if (!d) continue;
        id = `g${++this.seq}`;
        this.glyphDefs.set(key, id);
        this.page.defs.push(`<path id="${id}" d="${d}"/>`);
      }
      const gx = x + run.x + g.x + g.dx;
      const gy = y + g.dy;
      uses.push(`<use xlink:href="#${id}" transform="matrix(${fine(s)} 0 ${fine(run.skew * s)} ${fine(-s)} ${n(gx)} ${n(gy)})"/>`);
    }
    if (uses.length) this.page.body.push(`<g fill="${color}" aria-label="${esc(run.text)}">${uses.join('')}</g>`);
  }

  image(img: ImageRes, x: number, y: number, w: number, h: number): void {
    let id = this.imageDefs.get(img.key);
    if (!id) {
      id = `i${++this.seq}`;
      this.imageDefs.set(img.key, id);
      this.page.defs.push(`<image id="${id}" width="${img.width}" height="${img.height}" preserveAspectRatio="none" xlink:href="data:${img.mime};base64,${img.original.toString('base64')}"/>`);
    }
    this.page.body.push(`<use xlink:href="#${id}" transform="matrix(${fine(w / img.width)} 0 0 ${fine(h / img.height)} ${n(x)} ${n(y)})"/>`);
  }

  link(): void {
    /* previews are images */
  }

  shimmer(cx: number, cy: number, r: number): void {
    if (!this.opts.animate) return;
    const id = `sh${++this.seq}`;
    const clip = `sc${this.seq}`;
    this.page.shimmer = true;
    this.page.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(cx - r)}" y1="${n(cy - r)}" x2="${n(cx + r)}" y2="${n(cy + r)}"><stop offset="0.30" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#e8f6ff" stop-opacity="0.85"/><stop offset="0.55" stop-color="#fff2fb" stop-opacity="0.55"/><stop offset="0.70" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
      `<clipPath id="${clip}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>`,
    );
    this.page.body.push(`<g clip-path="url(#${clip})" style="mix-blend-mode:screen"><rect class="kx-shimmer" x="${n(cx - 3 * r)}" y="${n(cy - 3 * r)}" width="${n(6 * r)}" height="${n(6 * r)}" fill="url(#${id})" style="transform-origin:${n(cx)}px ${n(cy)}px"/></g>`);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Page `i` as a standalone SVG; `pxWidth` sets the pixel size (aspect kept). */
  toSvg(i = 0, pxWidth?: number): string {
    const p = this.pages[i] ?? this.pages[0];
    const width = pxWidth ?? p.w;
    const height = (width * p.h) / p.w;
    const style = p.shimmer
      ? `<style>@keyframes kxsweep{0%{transform:translate(-60%,-60%)}55%,100%{transform:translate(60%,60%)}}.kx-shimmer{animation:kxsweep 3.6s ease-in-out infinite}</style>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(p.w)} ${n(p.h)}">${style}<defs>${p.defs.join('')}</defs>${p.body.join('')}${'</g>'.repeat(p.levels.reduce((a, b) => a + b, 0))}</svg>`;
  }
}
