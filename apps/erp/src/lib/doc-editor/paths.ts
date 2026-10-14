/**
 * Paths and transforms in page points for the editor's canvas renderer: the API's engine/canvas.ts
 * (the same geometry the PDF and the server preview draw), plus SVG path data output.
 */

export interface GradientStop {
  at: number;
  /** `#rrggbb`. */
  color: string;
}

export type Paint =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] };

export interface StrokeStyle {
  color: string;
  width: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

export type Seg = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

const K = 0.5522847498;

/** A path in page points. */
export class Path {
  readonly segs: Seg[] = [];

  moveTo(x: number, y: number): this {
    this.segs.push(['M', x, y]);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.segs.push(['L', x, y]);
    return this;
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.segs.push(['C', x1, y1, x2, y2, x, y]);
    return this;
  }

  close(): this {
    this.segs.push(['Z']);
    return this;
  }

  rect(x: number, y: number, w: number, h: number): this {
    return this.moveTo(x, y).lineTo(x + w, y).lineTo(x + w, y + h).lineTo(x, y + h).close();
  }

  roundRect(x: number, y: number, w: number, h: number, r: number): this {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (rr <= 0.01) return this.rect(x, y, w, h);
    const c = rr * K;
    return this.moveTo(x + rr, y)
      .lineTo(x + w - rr, y)
      .curveTo(x + w - rr + c, y, x + w, y + rr - c, x + w, y + rr)
      .lineTo(x + w, y + h - rr)
      .curveTo(x + w, y + h - rr + c, x + w - rr + c, y + h, x + w - rr, y + h)
      .lineTo(x + rr, y + h)
      .curveTo(x + rr - c, y + h, x, y + h - rr + c, x, y + h - rr)
      .lineTo(x, y + rr)
      .curveTo(x, y + rr - c, x + rr - c, y, x + rr, y)
      .close();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    const kx = rx * K;
    const ky = ry * K;
    return this.moveTo(cx + rx, cy)
      .curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
      .curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
      .curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
      .curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
      .close();
  }

  circle(cx: number, cy: number, r: number): this {
    return this.ellipse(cx, cy, r, r);
  }

  /** A polyline through points (closed when `close`). */
  poly(points: [number, number][], close = false): this {
    points.forEach(([x, y], i) => (i ? this.lineTo(x, y) : this.moveTo(x, y)));
    if (close) this.close();
    return this;
  }

  /** Appends another path's segments. */
  add(p: Path): this {
    this.segs.push(...p.segs);
    return this;
  }

  get empty(): boolean {
    return this.segs.length === 0;
  }
}

/** A 2D affine matrix [a b c d e f] (x' = a x + c y + e, y' = b x + d y + f). */
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const multiply = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const rotation = (deg: number, cx: number, cy: number): Matrix => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
};

/** A number for SVG output (two decimals). */
export const num = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** SVG path data of a path. */
export const pathData = (p: Path): string => p.segs.map((s) => (s[0] === 'Z' ? 'Z' : `${s[0]}${s.slice(1).map((v) => num(v as number)).join(' ')}`)).join('');
