// Draws the board's elements beyond strokes (text, pictures, equations, graphs, figures, notes, sheets)
// and the laser, as packages/kinetix_ink/lib/src/element_painting.dart does. Equations are shown
// as readable text (the board typesets them; the web view has no TeX engine).

import { compileGraph } from './graph';
import { isStroke, type BoardElement, type BoardBackground, type Box, type GraphElement, type LaserPoint, type NoteElement, type SheetElement } from './player';
import { argbToCss, drawBackground, drawStroke, inkColorFor } from './render';

export const BOARD_FONT = "Inter, 'Noto Sans Devanagari', 'Noto Sans Kannada', system-ui, sans-serif";
export const PRIMARY_FONT = "Andika, 'Comic Neue', " + BOARD_FONT;
export const CODE_FONT = "'JetBrains Mono', ui-monospace, monospace";

export interface DrawOptions {
  /** Shown on a covered answer note, in the viewer's language. */
  answerLabel?: string;
  /** The laser trail and the time it fades against. */
  laser?: readonly LaserPoint[];
  now?: number;
  /** Called when a picture has loaded, to redraw with it. */
  onImageLoad?: () => void;
}

/** LaTeX made readable as plain text (as `readableLatex` on the board). */
export function readableLatex(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\cdot/g, '·')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\angle/g, '∠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\^\\circ/g, '°')
    .replace(/\\(left|right|quad|,|;|!|text|mathrm)/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const images = new Map<string, HTMLImageElement>();

function picture(src: string, onLoad?: () => void): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = src;
    images.set(src, img);
    if (images.size > 200) images.delete(images.keys().next().value as string);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, lineHeight: number) {
  text.split('\n').forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/** Words wrapped to fit `width`, newlines kept. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, b: Box, r: number) {
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, r);
}

function drawNote(ctx: CanvasRenderingContext2D, n: NoteElement, opts: DrawOptions) {
  const b = n.box;
  ctx.textBaseline = 'top';
  switch (n.noteKind) {
    case 'code': {
      ctx.fillStyle = '#1e2430';
      roundRect(ctx, b, 10);
      ctx.fill();
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(b.x + 18 + i * 16, b.y + 16, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      ctx.clip();
      ctx.fillStyle = '#d7e3f4';
      ctx.font = `${n.fontSize * 0.85}px ${CODE_FONT}`;
      lines(ctx, n.text.replace(/\t/g, '    '), b.x + 16, b.y + 34, n.fontSize * 0.85 * 1.35);
      ctx.restore();
      return;
    }
    case 'card': {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, b, 16);
      ctx.fill();
      ctx.strokeStyle = argbToCss(n.color | 0xff000000);
      ctx.lineWidth = 4;
      roundRect(ctx, { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 }, 14);
      ctx.stroke();
      ctx.fillStyle = '#1b1f24';
      ctx.font = `700 ${n.fontSize * 1.8}px ${BOARD_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.text, b.x + b.w / 2, b.y + b.h / 2, b.w - 24);
      ctx.textAlign = 'start';
      return;
    }
    case 'answer': {
      // Covered: a striped card with no trace of the answer.
      ctx.fillStyle = '#e2ece5';
      roundRect(ctx, b, 14);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#d3e2d8';
      ctx.lineWidth = 12;
      ctx.beginPath();
      for (let x = b.x - b.h; x < b.x + b.w; x += 30) {
        ctx.moveTo(x, b.y + b.h);
        ctx.lineTo(x + b.h, b.y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#006545';
      ctx.font = `500 18px ${BOARD_FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.answerLabel ?? '?', b.x + 20, b.y + b.h / 2, b.w - 40);
      return;
    }
    default: {
      ctx.fillStyle = argbToCss(n.color);
      roundRect(ctx, b, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(b.x, b.y, b.w, 18);
      ctx.fillStyle = '#1b1f24';
      ctx.font = `${n.fontSize}px ${BOARD_FONT}`;
      const lh = n.fontSize * 1.3;
      const max = Math.max(1, Math.floor((b.h - 36) / lh));
      wrap(ctx, n.text, b.w - 28)
        .slice(0, max)
        .forEach((l, i) => ctx.fillText(l, b.x + 14, b.y + 26 + i * lh));
    }
  }
}

function drawGraph(ctx: CanvasRenderingContext2D, g: GraphElement) {
  const b = g.box;
  const [xMin, xMax, yMin, yMax] = g.range;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, b, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (xMax <= xMin || yMax <= yMin) return;
  const map = (x: number, y: number): [number, number] => [b.x + ((x - xMin) / (xMax - xMin)) * b.w, b.y + b.h - ((y - yMin) / (yMax - yMin)) * b.h];
  ctx.save();
  roundRect(ctx, b, 10);
  ctx.clip();
  ctx.strokeStyle = '#3a4048';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(...map(xMin, 0));
  ctx.lineTo(...map(xMax, 0));
  ctx.moveTo(...map(0, yMin));
  ctx.lineTo(...map(0, yMax));
  ctx.stroke();
  const f = compileGraph(g.expression);
  if (f) {
    const span = yMax - yMin;
    ctx.strokeStyle = argbToCss(g.color);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let pen = false;
    let prev: number | null = null;
    for (let i = 0; i <= 400; i++) {
      const x = xMin + ((xMax - xMin) * i) / 400;
      const y = f(x);
      if (!Number.isFinite(y) || (prev !== null && Math.abs(y - prev) > span * 2)) {
        pen = false;
        prev = Number.isFinite(y) ? y : null;
        continue;
      }
      const [px, py] = map(x, Math.min(Math.max(y, yMin - span), yMax + span));
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
      prev = y;
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = argbToCss(g.color);
  ctx.font = `700 14px ${BOARD_FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`y = ${g.expression}`, b.x + 10, b.y + 8);
}

const CHART_COLORS = ['#0057c2', '#d97706', '#0f8a5f', '#b4235a', '#6d4bc4', '#00838f', '#7a4f00'];

function cellText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, w: number, align: CanvasTextAlign) {
  let s = t;
  while (s.length > 1 && ctx.measureText(s).width > w) s = s.slice(0, -2) + '…';
  ctx.textAlign = align;
  ctx.fillText(s, align === 'right' ? x + w : align === 'center' ? x + w / 2 : x, y);
}

/** A sheet, as `paintSheet` on the board: letters and numbers, the grid, cells as shown, its chart. */
export function drawSheet(ctx: CanvasRenderingContext2D, s: SheetElement) {
  const HH = 28, HW = 40, RH = 40, CH = 300;
  const natW = HW + s.widths.reduce((a, b) => a + b, 0);
  const natH = HH + s.rows * RH + (s.chart ? CH : 0);
  ctx.save();
  ctx.translate(s.box.x, s.box.y);
  ctx.scale(s.box.w / natW, s.box.h / natH);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, { x: 0, y: 0, w: natW, h: natH }, 8);
  ctx.fill();
  const accent = argbToCss(s.color);
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, natW, HH);
  ctx.fillRect(0, HH, HW, s.rows * RH);
  if (s.header) ctx.fillRect(HW, HH, natW - HW, RH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1;
  const xs = [HW];
  for (const w of s.widths) xs.push(xs[xs.length - 1] + w);
  ctx.beginPath();
  for (const x of [0, ...xs]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HH + s.rows * RH);
  }
  for (let r = 0; r <= s.rows; r++) {
    ctx.moveTo(0, HH + r * RH);
    ctx.lineTo(natW, HH + r * RH);
  }
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = `13px ${BOARD_FONT}`;
  ctx.fillStyle = '#6a7078';
  for (let c = 0; c < s.cols; c++) cellText(ctx, colName(c), xs[c], HH / 2, s.widths[c], 'center');
  for (let r = 0; r < s.rows; r++) cellText(ctx, String(r + 1), 0, HH + r * RH + RH / 2, HW, 'center');
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const t = s.cells[r * s.cols + c];
      if (!t) continue;
      const head = s.header && r === 0;
      const numeric = /^-?₹?[\d,.]+( L| Cr|%)?$/.test(t);
      ctx.font = `${head ? 700 : 400} 16px ${BOARD_FONT}`;
      ctx.fillStyle = t.startsWith('#') ? '#c62828' : head ? accent : '#1b1f24';
      cellText(ctx, t, xs[c] + 8, HH + r * RH + RH / 2, s.widths[c] - 16, numeric ? 'right' : head ? 'center' : 'left');
    }
  }
  if (s.chart && s.chart.values.length) drawSheetChart(ctx, s, { x: HW, y: HH + s.rows * RH + 16, w: natW - HW - 16, h: CH - 32 });
  ctx.restore();
}

function drawSheetChart(ctx: CanvasRenderingContext2D, s: SheetElement, a: Box) {
  const { kind, labels, values } = s.chart!;
  ctx.font = `13px ${BOARD_FONT}`;
  if (kind === 'pie') {
    const total = values.filter((v) => v > 0).reduce((x, y) => x + y, 0);
    if (total <= 0) return;
    const r = Math.min(a.h / 2, a.w / 4);
    const cx = a.x + r + 8, cy = a.y + a.h / 2;
    let start = -Math.PI / 2;
    values.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = (v / total) * Math.PI * 2;
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + sweep);
      ctx.fill();
      start += sweep;
      ctx.fillRect(cx + r + 24, a.y + i * 26 + 7, 12, 12);
      ctx.fillStyle = '#1b1f24';
      ctx.textAlign = 'left';
      ctx.fillText(`${labels[i] ?? ''}  ${((v / total) * 100).toFixed(1)}%`, cx + r + 42, a.y + i * 26 + 13);
    });
    return;
  }
  const hi = Math.max(0, ...values), lo = Math.min(0, ...values);
  const span = hi - lo || 1;
  const top = a.y + 22, bottom = a.y + a.h - 24;
  const yOf = (v: number) => bottom - ((v - lo) / span) * (bottom - top);
  const step = (a.w - 8) / values.length;
  ctx.strokeStyle = '#3a4048';
  ctx.beginPath();
  ctx.moveTo(a.x + 8, yOf(0));
  ctx.lineTo(a.x + a.w, yOf(0));
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle = argbToCss(s.color);
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((v, i) => {
    const cx = a.x + 8 + step * (i + 0.5);
    if (kind === 'bar') ctx.fillRect(cx - step * 0.32, Math.min(yOf(v), yOf(0)), step * 0.64, Math.abs(yOf(v) - yOf(0)));
    else if (i === 0) ctx.moveTo(cx, yOf(v));
    else ctx.lineTo(cx, yOf(v));
  });
  if (kind === 'line') ctx.stroke();
  ctx.fillStyle = '#1b1f24';
  ctx.textAlign = 'center';
  values.forEach((v, i) => {
    const cx = a.x + 8 + step * (i + 0.5);
    ctx.fillText(labels[i] ?? '', cx, bottom + 14);
    ctx.fillText(String(Math.round(v * 100) / 100), cx, yOf(v) - 10);
  });
}

function colName(c: number): string {
  let n = c + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Paints one element at board scale. */
export function drawElement(ctx: CanvasRenderingContext2D, e: BoardElement, bg: BoardBackground, opts: DrawOptions = {}) {
  if (isStroke(e)) {
    drawStroke(ctx, e, bg);
    return;
  }
  ctx.save();
  if ('rotation' in e && e.rotation) {
    const c = e.kind === 'text' || e.kind === 'math' ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : { x: e.box.x + e.box.w / 2, y: e.box.y + e.box.h / 2 };
    ctx.translate(c.x, c.y);
    ctx.rotate(e.rotation);
    ctx.translate(-c.x, -c.y);
  }
  switch (e.kind) {
    case 'text':
      ctx.fillStyle = argbToCss(inkColorFor(e.color, bg));
      ctx.font = `${e.bold ? 700 : 400} ${e.fontSize}px ${e.font === 'andika' ? PRIMARY_FONT : BOARD_FONT}`;
      ctx.textBaseline = 'top';
      lines(ctx, e.text, e.x, e.y + e.fontSize * 0.12, e.fontSize * 1.25);
      break;
    case 'math':
      ctx.fillStyle = argbToCss(inkColorFor(e.color, bg));
      ctx.font = `italic ${e.fontSize * 0.8}px 'Times New Roman', serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(readableLatex(e.latex), e.x, e.y + e.h / 2);
      break;
    case 'image': {
      const img = picture(e.src, opts.onImageLoad);
      if (img) {
        ctx.drawImage(img, e.box.x, e.box.y, e.box.w, e.box.h);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        roundRect(ctx, e.box, 8);
        ctx.fill();
      }
      break;
    }
    case 'graph':
      drawGraph(ctx, e);
      break;
    case 'polygon': {
      ctx.beginPath();
      ctx.moveTo(e.points[0], e.points[1]);
      for (let i = 2; i + 1 < e.points.length; i += 2) ctx.lineTo(e.points[i], e.points[i + 1]);
      if (e.closed) ctx.closePath();
      if (e.fill !== undefined) {
        ctx.fillStyle = argbToCss(e.fill);
        ctx.fill();
      }
      ctx.strokeStyle = argbToCss(inkColorFor(e.color, bg));
      ctx.lineWidth = e.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      break;
    }
    case 'note':
      drawNote(ctx, e, opts);
      break;
    case 'sheet':
      drawSheet(ctx, e);
      break;
  }
  ctx.restore();
}

/** The laser trail: a soft red glow with a bright core, fading over a second. */
export function drawLaser(ctx: CanvasRenderingContext2D, pts: readonly LaserPoint[], now: number) {
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const age = now - pts[i].t;
    if (age > 900) continue;
    const a = Math.max(0, 1 - age / 900);
    ctx.strokeStyle = `rgba(255, 59, 48, ${(a * 0.35).toFixed(3)})`;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 69, 58, ${a.toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

/** Paints `area` of a page (board units; the caller sets the transform that fits it to the element). */
export function drawPage(ctx: CanvasRenderingContext2D, area: Box, bg: BoardBackground, elements: readonly BoardElement[], opts: DrawOptions = {}) {
  ctx.save();
  ctx.translate(-area.x, -area.y);
  drawBackground(ctx, bg, area);
  for (const e of elements) drawElement(ctx, e, bg, opts);
  if (opts.laser?.length) drawLaser(ctx, opts.laser, opts.now ?? Date.now());
  ctx.restore();
}
