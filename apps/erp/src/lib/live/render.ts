// Draws a live board on an HTML canvas, as the board itself paints it
// (packages/kinetix_ink: board_background.dart `BackgroundPainter`, ink_canvas.dart `paintStroke`).

import type { BoardBackground, Canvas, Stroke } from './player';

/** 1 cm on the board, in canvas pixels (96 dpi). */
export const PX_PER_CM = 96 / 2.54;

const CHALK_WHITE = 0xfff4f4ee;

export const isDark = (bg: BoardBackground) => bg === 'chalkboard';

/** The board's paper colour. */
export const paperColor = (bg: BoardBackground) => (isDark(bg) ? '#1F2A24' : '#FCFCFA');

/** Ruling, grid and dot colour (ARGB). */
const linesArgb = (bg: BoardBackground) => (isDark(bg) ? 0x33ffffff : 0x1f1a3a6b);

/** `rgba()` for a 32-bit ARGB colour, with its alpha multiplied by `opacity`. */
export function argbToCss(argb: number, opacity = 1): string {
  const c = argb >>> 0;
  const a = ((c >>> 24) & 0xff) / 255;
  const r = (c >>> 16) & 0xff;
  const g = (c >>> 8) & 0xff;
  const b = c & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${+(a * opacity).toFixed(3)})`;
}

/** Relative luminance, as Flutter's `Color.computeLuminance`. */
export function luminance(argb: number): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const c = argb >>> 0;
  return 0.2126 * lin((c >>> 16) & 0xff) + 0.7152 * lin((c >>> 8) & 0xff) + 0.0722 * lin(c & 0xff);
}

/** Dark ink on a dark board is invisible, so near-black ink is shown as chalk white there. */
export function inkColorFor(argb: number, bg: BoardBackground): number {
  return isDark(bg) && luminance(argb) < 0.05 ? CHALK_WHITE : argb >>> 0;
}

/** Paint settings for a stroke: highlighters are wide, see-through and square-ended. */
export function strokeStyle(s: Stroke, bg: BoardBackground) {
  const highlighter = s.tool === 'highlighter';
  return {
    color: argbToCss(inkColorFor(s.color, bg), highlighter ? 0.35 : 1),
    width: s.width * (highlighter ? 4 : 1),
    cap: (highlighter ? 'square' : 'round') as CanvasLineCap,
  };
}

export function drawBackground(ctx: CanvasRenderingContext2D, bg: BoardBackground, size: Canvas) {
  ctx.fillStyle = paperColor(bg);
  ctx.fillRect(0, 0, size.w, size.h);
  const line = argbToCss(linesArgb(bg));
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  switch (bg) {
    case 'ruled':
      for (let y = 72; y < size.h; y += 44) {
        ctx.moveTo(0, y);
        ctx.lineTo(size.w, y);
      }
      break;
    case 'grid':
      for (let x = 0; x < size.w; x += PX_PER_CM) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.h);
      }
      for (let y = 0; y < size.h; y += PX_PER_CM) {
        ctx.moveTo(0, y);
        ctx.lineTo(size.w, y);
      }
      break;
    case 'dots':
      ctx.fillStyle = argbToCss(linesArgb(bg), 0.35);
      for (let x = PX_PER_CM; x < size.w; x += PX_PER_CM) {
        for (let y = PX_PER_CM; y < size.h; y += PX_PER_CM) {
          ctx.moveTo(x + 1.6, y);
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      return;
    default:
      return;
  }
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, width: number) {
  const dx = tx - fx, dy = ty - fy;
  if (Math.hypot(dx, dy) < 1) return;
  const a = Math.atan2(dy, dx);
  const len = 10 + width * 2.5;
  ctx.beginPath();
  ctx.moveTo(tx - len * Math.cos(a - 0.45), ty - len * Math.sin(a - 0.45));
  ctx.lineTo(tx, ty);
  ctx.lineTo(tx - len * Math.cos(a + 0.45), ty - len * Math.sin(a + 0.45));
  ctx.stroke();
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, bg: BoardBackground) {
  const p = s.points;
  const n = p.length >> 1;
  if (n === 0) return;
  const style = strokeStyle(s, bg);
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = style.cap;
  ctx.lineJoin = 'round';
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], style.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (s.shape) {
    // Shapes are exact geometry: straight segments.
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  } else {
    // Quadratic curves through the midpoints, as on the board.
    for (let i = 1; i < n - 1; i++) {
      const x = p[2 * i], y = p[2 * i + 1];
      ctx.quadraticCurveTo(x, y, (x + p[2 * i + 2]) / 2, (y + p[2 * i + 3]) / 2);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
  if (s.shape === 'arrow' || s.shape === 'doubleArrow') {
    const [x0, y0, x1, y1] = [p[0], p[1], p[p.length - 2], p[p.length - 1]];
    arrowHead(ctx, x0, y0, x1, y1, style.width);
    if (s.shape === 'doubleArrow') arrowHead(ctx, x1, y1, x0, y0, style.width);
  }
}

/** Paints a page at canvas scale; the caller sets the transform that fits it to the element. */
export function drawBoard(ctx: CanvasRenderingContext2D, size: Canvas, bg: BoardBackground, strokes: readonly Stroke[]) {
  drawBackground(ctx, bg, size);
  for (const s of strokes) drawStroke(ctx, s, bg);
}

/** Largest scale at which `canvas` fits inside `box`, and the offsets that centre it. */
export function fitContain(canvas: Canvas, box: { w: number; h: number }) {
  const scale = Math.max(0, Math.min(box.w / canvas.w, box.h / canvas.h));
  return { scale, dx: (box.w - canvas.w * scale) / 2, dy: (box.h - canvas.h * scale) / 2 };
}
