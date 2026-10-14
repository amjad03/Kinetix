import type { DocData, DocLayout } from '@kinetix/shared';
import sharp from 'sharp';
import { type Matrix, Path, type Surface } from './canvas.js';
import { LayoutRenderer, MM, pagePt, type RenderContext } from './layout-render.js';
import { PdfSurface } from './pdf-surface.js';
import { SvgSurface } from './svg-surface.js';

/**
 * The document engine: a layout (packages/shared/src/doc-layout.ts) plus data and the
 * institution's branding becomes a PDF, an SVG preview or a PNG. See
 * docs/architecture/documents-certificates.md.
 */
export type { RenderContext } from './layout-render.js';
export { MM } from './layout-render.js';

export interface RenderItem {
  data: DocData;
  ctx: RenderContext;
}

export interface PdfMeta {
  title: string;
  author?: string;
  subject?: string;
  created?: Date;
}

function drawAll(surface: Surface, layout: DocLayout, item: RenderItem, only?: string): void {
  const r = new LayoutRenderer(surface, layout, item.ctx);
  const { w, h } = pagePt(layout);
  for (const side of layout.sides) {
    if (only && side.id !== only) continue;
    const pages = r.pagesFor(side, item.data);
    for (let p = 0; p < pages; p++) {
      surface.beginPage(w, h);
      r.drawSide(side, item.data, p, pages);
    }
  }
}

/** Every side (and continuation page) of every item, in order, as one PDF. */
export function renderPdf(layout: DocLayout, items: RenderItem[], meta: PdfMeta): Buffer {
  const pdf = new PdfSurface(meta);
  for (const item of items) drawAll(pdf, layout, item);
  return pdf.build();
}

/** One page of one side as SVG (`page` counts continuation pages of that side). */
export function renderSvg(layout: DocLayout, item: RenderItem, o: { side?: string; page?: number; animate?: boolean; pxWidth?: number } = {}): string {
  const svg = new SvgSurface({ animate: o.animate });
  const side = layout.sides.find((s) => s.id === o.side) ?? layout.sides[0];
  drawAll(svg, layout, item, side.id);
  return svg.toSvg(Math.min(o.page ?? 0, svg.pageCount - 1), o.pxWidth);
}

/** Rasterises an SVG (from {@link renderSvg}) to PNG at `pxWidth`. */
export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72, limitInputPixels: 80_000_000 }).flatten({ background: '#ffffff' }).png({ compressionLevel: 8 }).toBuffer();
}

/** Card sheet geometry: CR80 slots on A4, two across and five down (10-up). */
const SHEET = { w: 210, h: 297, cols: 2, rows: 5, slotW: 85.6, slotH: 53.98, gapX: 7, gapY: 3.6 };

/**
 * ID cards imposed 10-up on A4 for bulk printing: a sheet of fronts, then (for two-sided
 * cards) a sheet of backs laid out for long-edge duplex, with crop marks at every card corner.
 * Portrait cards are turned a quarter so ten fit on the sheet.
 */
export function renderCardSheets(layout: DocLayout, items: RenderItem[], meta: PdfMeta & { label?: string }): Buffer {
  const pdf = new PdfSurface(meta);
  const card = pagePt(layout);
  const portrait = card.h > card.w;
  const perSheet = SHEET.cols * SHEET.rows;
  const left = ((SHEET.w - SHEET.cols * SHEET.slotW - (SHEET.cols - 1) * SHEET.gapX) / 2) * MM;
  const top = ((SHEET.h - SHEET.rows * SHEET.slotH - (SHEET.rows - 1) * SHEET.gapY) / 2) * MM;
  const slotW = SHEET.slotW * MM;
  const slotH = SHEET.slotH * MM;
  const sheets = Math.max(1, Math.ceil(items.length / perSheet));
  for (let s = 0; s < sheets; s++) {
    const batch = items.slice(s * perSheet, (s + 1) * perSheet);
    layout.sides.forEach((side, sideIndex) => {
      const back = sideIndex > 0;
      pdf.beginPage(SHEET.w * MM, SHEET.h * MM);
      batch.forEach((item, i) => {
        const row = Math.floor(i / SHEET.cols);
        // Backs mirror the columns so each back lands behind its front when printed duplex.
        const col = back ? SHEET.cols - 1 - (i % SHEET.cols) : i % SHEET.cols;
        const x = left + col * (slotW + SHEET.gapX * MM);
        const y = top + row * (slotH + SHEET.gapY * MM);
        const m: Matrix = portrait ? (back ? [0, -1, 1, 0, x, y + card.w] : [0, 1, -1, 0, x + card.h, y]) : [1, 0, 0, 1, x, y];
        pdf.save();
        pdf.transform(m);
        pdf.clip(new Path().rect(0, 0, card.w, card.h));
        new LayoutRenderer(pdf, layout, item.ctx).drawSide(side, item.data, 0, 1);
        pdf.restore();
        cropMarks(pdf, x, y, slotW, slotH);
      });
      const r = new LayoutRenderer(pdf, layout, items[0]?.ctx ?? emptyCtx());
      r.drawText(`${meta.label ?? meta.title}  ·  ${back ? 'Backs' : 'Fronts'}  ·  sheet ${s + 1} of ${sheets}  ·  ${batch.length} card${batch.length === 1 ? '' : 's'}${layout.sides.length > 1 ? '  ·  print duplex, flip on long edge' : ''}`, { font: 'body', sizePt: 6.5, weight: 400, color: 'muted', align: 'center', lineHeight: 1.2 }, { x: 0, y: SHEET.h * MM - top * 0.7, w: SHEET.w * MM, h: 10 }, { maxLines: 1 });
    });
  }
  return pdf.build();
}

function cropMarks(s: Surface, x: number, y: number, w: number, h: number): void {
  const off = 0.7 * MM;
  const len = 2.4 * MM;
  const p = new Path();
  for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]] as const) {
    p.moveTo(cx + dx * off, cy).lineTo(cx + dx * (off + len), cy);
    p.moveTo(cx, cy + dy * off).lineTo(cx, cy + dy * (off + len));
  }
  s.stroke(p, { color: '#000000', width: 0.3 });
}

const emptyCtx = (): RenderContext => ({ palette: { primary: '#1f3a5f', secondary: '#9a7b3c', tertiary: '#2f6b5e', accent: '#a8323e', ink: '#1b1f24', paper: '#ffffff' }, fonts: { heading: 'noto-serif', body: 'noto-sans' }, images: {}, signatories: {} });
