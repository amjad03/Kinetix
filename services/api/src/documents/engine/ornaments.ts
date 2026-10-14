import { Path } from './canvas.js';

/**
 * Vector security and decoration geometry, in points: guilloche bands and rosettes (the fine
 * interlaced curves of banknotes and degree certificates), wave and hatch backgrounds, decorative
 * frames, and the rings of the holographic seal. Pure functions of their box, so a document
 * renders the same every time.
 */

const TAU = Math.PI * 2;

/**
 * A smooth curve through a parametric function as cubic Bézier segments (Hermite, tangents from
 * the derivative), far fewer points than a polyline of the same smoothness.
 */
function curve(p: Path, f: (t: number) => [number, number], t0: number, t1: number, segments: number, close = false): void {
  const h = (t1 - t0) / segments;
  const e = h * 1e-3;
  const d = (t: number): [number, number] => {
    const a = f(t - e);
    const b = f(t + e);
    return [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)];
  };
  let pt = f(t0);
  let dv = d(t0);
  p.moveTo(pt[0], pt[1]);
  for (let i = 1; i <= segments; i++) {
    const t = t0 + i * h;
    const np = f(t);
    const nd = d(t);
    p.curveTo(pt[0] + (dv[0] * h) / 3, pt[1] + (dv[1] * h) / 3, np[0] - (nd[0] * h) / 3, np[1] - (nd[1] * h) / 3, np[0], np[1]);
    pt = np;
    dv = nd;
  }
  if (close) p.close();
}

/** Sine lines across a box, two families out of phase so they interlace into a moiré band. */
export function guillocheLines(x: number, y: number, w: number, h: number, density: number): [Path, Path] {
  const a = new Path();
  const b = new Path();
  const spacing = 18 - density * 1.3;
  const amp = spacing * 1.6;
  const wave = 46 + density * 2;
  const segs = Math.max(4, Math.ceil(((w + 4) / wave) * 6));
  for (let row = -2, i = 0; y + row * spacing < y + h + amp * 2; row++, i++) {
    const base = y + row * spacing;
    curve(a, (px) => [px, base + amp * Math.sin(((px - x) / wave) * TAU + i * 0.55)], x - 2, x + w + 2, segs);
    curve(b, (px) => [px, base + amp * Math.sin(((px - x) / wave) * TAU * 1.5 + Math.PI + i * 0.55) * 0.8], x - 2, x + w + 2, Math.ceil(segs * 1.5));
  }
  return [a, b];
}

/** Concentric wavy rings around (cx, cy) out to `maxR`: a rosette. */
export function rosette(cx: number, cy: number, minR: number, maxR: number, density: number, petals = 18): Path {
  const p = new Path();
  const rings = Math.max(3, Math.round(4 + density * 2.2));
  const lobes = Math.max(2, Math.round(petals));
  for (let j = 0; j < rings; j++) {
    const mid = minR + ((maxR - minR) * (j + 0.5)) / rings;
    const amp = ((maxR - minR) / rings) * 1.15;
    const phase = (j * Math.PI) / 3;
    const r = (t: number) => mid + amp * Math.sin(lobes * t + phase) * Math.cos(t * 2 + phase) * 0.9;
    curve(p, (t) => [cx + r(t) * Math.cos(t), cy + r(t) * Math.sin(t)], 0, TAU, Math.max(24, (lobes + 2) * 6), true);
  }
  return p;
}

/** A band of interlaced epicycloid-like loops between two radii (seal rings). */
export function ringGuilloche(cx: number, cy: number, r1: number, r2: number, lobes: number, curves: number): Path {
  const p = new Path();
  const mid = (r1 + r2) / 2;
  const amp = (r2 - r1) / 2;
  for (let j = 0; j < curves; j++) {
    const phase = (j * TAU) / (curves * lobes);
    const r = (t: number) => mid + amp * Math.sin(lobes * (t + phase));
    curve(p, (t) => [cx + r(t) * Math.cos(t), cy + r(t) * Math.sin(t)], 0, TAU, lobes * 6, true);
  }
  return p;
}

export function waves(x: number, y: number, w: number, h: number, density: number): Path {
  const p = new Path();
  const spacing = 14 - density;
  for (let base = y - spacing; base < y + h + spacing; base += spacing) curve(p, (px) => [px, base + 2.2 * Math.sin(((px - x) / 22) * TAU + base / 9)], x - 2, x + w + 2, Math.max(4, Math.ceil(((w + 4) / 22) * 6)));
  return p;
}

export function crosshatch(x: number, y: number, w: number, h: number, density: number): Path {
  const p = new Path();
  const gap = 16 - density * 1.2;
  for (let d = -h; d < w + h; d += gap) {
    p.moveTo(x + d, y).lineTo(x + d + h, y + h);
    p.moveTo(x + d + h, y).lineTo(x + d, y + h);
  }
  return p;
}

export function dots(x: number, y: number, w: number, h: number, density: number): Path {
  const p = new Path();
  const gap = 12 - density * 0.8;
  const r = gap * 0.12;
  let odd = false;
  for (let py = y; py <= y + h; py += gap * 0.866, odd = !odd) for (let px = x + (odd ? gap / 2 : 0); px <= x + w; px += gap) p.circle(px, py, r);
  return p;
}

/** A diamond centred on (cx, cy). */
export const diamond = (cx: number, cy: number, r: number) => new Path().poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], true);

/** Corner flourish at (x, y) facing into the frame (dx, dy = ±1). */
export function flourish(x: number, y: number, dx: number, dy: number, s: number): Path {
  const p = new Path();
  // Two scrolls curling from the corner along each edge, a leaf between them.
  p.moveTo(x, y + dy * s * 1.6).curveTo(x, y + dy * s * 0.6, x + dx * s * 0.2, y + dy * s * 0.2, x + dx * s * 0.6, y + dy * s * 0.2);
  p.curveTo(x + dx * s * 1.1, y + dy * s * 0.2, x + dx * s * 1.1, y + dy * s * 0.75, x + dx * s * 0.75, y + dy * s * 0.75);
  p.curveTo(x + dx * s * 0.5, y + dy * s * 0.75, x + dx * s * 0.5, y + dy * s * 0.45, x + dx * s * 0.7, y + dy * s * 0.45);
  p.moveTo(x + dx * s * 1.6, y).curveTo(x + dx * s * 0.6, y, x + dx * s * 0.2, y + dy * s * 0.2, x + dx * s * 0.2, y + dy * s * 0.6);
  p.curveTo(x + dx * s * 0.2, y + dy * s * 1.1, x + dx * s * 0.75, y + dy * s * 1.1, x + dx * s * 0.75, y + dy * s * 0.75);
  p.curveTo(x + dx * s * 0.75, y + dy * s * 0.5, x + dx * s * 0.45, y + dy * s * 0.5, x + dx * s * 0.45, y + dy * s * 0.7);
  return p;
}

/** A chain of interlaced loops along a straight band (frame edges). */
export function bandChain(x1: number, y1: number, x2: number, y2: number, width: number, period: number): Path {
  const p = new Path();
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = -uy;
  const ny = ux;
  const cycles = Math.max(1, Math.round(len / period));
  const k = (cycles * TAU) / len;
  for (const phase of [0, Math.PI, Math.PI / 2, (3 * Math.PI) / 2]) {
    const amp = phase === 0 || phase === Math.PI ? width / 2 : width / 3.2;
    curve(p, (s) => [x1 + ux * s + nx * amp * Math.sin(k * s + phase), y1 + uy * s + ny * amp * Math.sin(k * s + phase)], 0, len, cycles * 6);
  }
  return p;
}

/** A scalloped disc edge: `n` rounded points around (cx, cy). */
export function scallop(cx: number, cy: number, r: number, n: number, depth: number): Path {
  const pts: [number, number][] = [];
  const steps = n * 8;
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * TAU;
    const rr = r - depth * (1 - Math.abs(Math.cos((n * t) / 2)));
    pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return new Path().poly(pts, true);
}

/** Thin radial lines between two radii (the seal's "engine turning"). */
export function sunburst(cx: number, cy: number, r1: number, r2: number, count: number): Path {
  const p = new Path();
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    p.moveTo(cx + r1 * Math.cos(t), cy + r1 * Math.sin(t)).lineTo(cx + r2 * Math.cos(t), cy + r2 * Math.sin(t));
  }
  return p;
}

/** A simple person silhouette for a missing photo, inside the box. */
export function silhouette(x: number, y: number, w: number, h: number): Path {
  const cx = x + w / 2;
  const head = Math.min(w, h) * 0.2;
  const p = new Path().circle(cx, y + h * 0.36, head);
  const sw = w * 0.36;
  p.moveTo(cx - sw, y + h).curveTo(cx - sw, y + h * 0.66, cx - sw * 0.5, y + h * 0.6, cx, y + h * 0.6).curveTo(cx + sw * 0.5, y + h * 0.6, cx + sw, y + h * 0.66, cx + sw, y + h).close();
  return p;
}
