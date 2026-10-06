// Draws a live board on an HTML canvas, as the board itself paints it
// (packages/kinetix_ink: board_background.dart `BackgroundPainter`, ink_canvas.dart `paintStroke`).

import type { BoardBackground, Box, Canvas, Stroke } from './player';

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

/**
 * Paints the paper over `area` (board units; a canvas size means the area from the origin). The
 * board is endless, so lines run on either side of the origin, as on the board.
 */
export function drawBackground(ctx: CanvasRenderingContext2D, bg: BoardBackground, area: Canvas | Box) {
  const x0 = 'x' in area ? area.x : 0, y0 = 'y' in area ? area.y : 0;
  const x1 = x0 + area.w, y1 = y0 + area.h;
  const first = (from: number, origin: number, step: number) => origin + Math.floor((from - origin) / step) * step;
  ctx.fillStyle = paperColor(bg);
  ctx.fillRect(x0, y0, area.w, area.h);
  const line = argbToCss(linesArgb(bg));
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  switch (bg) {
    case 'ruled':
      for (let y = first(y0, 72, 44); y < y1; y += 44) {
        if (y < y0) continue;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      break;
    case 'grid':
      for (let x = first(x0, 0, PX_PER_CM); x < x1; x += PX_PER_CM) {
        if (x < x0) continue;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = first(y0, 0, PX_PER_CM); y < y1; y += PX_PER_CM) {
        if (y < y0) continue;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      break;
    case 'dots':
      ctx.fillStyle = argbToCss(linesArgb(bg), 0.35);
      for (let x = first(x0, 0, PX_PER_CM); x < x1; x += PX_PER_CM) {
        for (let y = first(y0, 0, PX_PER_CM); y < y1; y += PX_PER_CM) {
          if (x <= x0 || y <= y0) continue;
          ctx.moveTo(x + 1.6, y);
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      return;
    case 'fourLine': {
      // Handwriting paper: a red top line, two blue lines and a dashed middle, every 120 units.
      const band = 120, gap = band / 4;
      for (let y = first(y0, 0, band); y < y1; y += band) {
        ctx.strokeStyle = 'rgba(215, 38, 61, 0.333)';
        ctx.beginPath();
        ctx.moveTo(x0, y + gap * 0.5);
        ctx.lineTo(x1, y + gap * 0.5);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(47, 111, 181, 0.333)';
        ctx.beginPath();
        ctx.moveTo(x0, y + gap * 1.5);
        ctx.lineTo(x1, y + gap * 1.5);
        ctx.moveTo(x0, y + gap * 3.5);
        ctx.lineTo(x1, y + gap * 3.5);
        for (let x = first(x0, 0, 12); x < x1; x += 12) {
          ctx.moveTo(x, y + gap * 2.5);
          ctx.lineTo(x + 6, y + gap * 2.5);
        }
        ctx.stroke();
      }
      return;
    }
    default:
      return;
  }
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, width: number, filled = false) {
  const dx = tx - fx, dy = ty - fy;
  if (Math.hypot(dx, dy) < 1) return;
  const a = Math.atan2(dy, dx);
  const len = 10 + width * 2.5;
  ctx.beginPath();
  ctx.moveTo(tx - len * Math.cos(a - 0.45), ty - len * Math.sin(a - 0.45));
  ctx.lineTo(tx, ty);
  ctx.lineTo(tx - len * Math.cos(a + 0.45), ty - len * Math.sin(a + 0.45));
  if (filled) {
    ctx.closePath();
    ctx.fill();
  }
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
  // Dashes and dots as the board draws them (about three widths, or one, apart).
  if (s.dash) ctx.setLineDash(s.dash === 'dotted' ? [0.01, Math.max(4, style.width * 2)] : [Math.max(8, style.width * 3), Math.max(6, style.width * 2.2)]);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (s.shape) {
    // Shapes are exact geometry: straight segments.
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    if (s.fill !== undefined && n > 2) {
      ctx.fillStyle = argbToCss(s.fill);
      ctx.fill();
      ctx.fillStyle = style.color;
    }
  } else {
    // Quadratic curves through the midpoints, as on the board.
    for (let i = 1; i < n - 1; i++) {
      const x = p[2 * i], y = p[2 * i + 1];
      ctx.quadraticCurveTo(x, y, (x + p[2 * i + 2]) / 2, (y + p[2 * i + 3]) / 2);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
  if (s.dash) ctx.setLineDash([]);
  if (s.shape === 'arrow' || s.shape === 'doubleArrow') {
    const [x0, y0, x1, y1] = [p[0], p[1], p[p.length - 2], p[p.length - 1]];
    arrowHead(ctx, x0, y0, x1, y1, style.width, s.filledHead);
    if (s.shape === 'doubleArrow') arrowHead(ctx, x1, y1, x0, y0, style.width, s.filledHead);
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
