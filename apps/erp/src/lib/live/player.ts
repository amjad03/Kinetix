// The board's lesson events, rebuilt into pages of elements.
// A TypeScript port of `LessonPlayer` in packages/kinetix_ink/lib/src/lesson.dart (format v2;
// version 1 streams are a subset):
//
//   [t, 'L', pages, index]     every page's elements ([[[id, element], …], …]) and the open page
//   [t, 'b', id, stroke]       a stroke started, with its first points
//   [t, 'p', id, x, y, …]      points added to a stroke being drawn
//   [t, 'u', id, x, y, …]      all points of a shape being dragged out
//   [t, 'e', id]               the stroke was finished
//   [t, 'a', id, element, i?]  a whole element appeared (added, undone, edited), at that position
//   [t, 'x', id, …]            elements removed
//   [t, 'm', dx, dy, id, …]    elements moved
//   [t, 'g', index]            turned to another page
//   [t, 'n', index]            inserted a blank page there and opened it
//   [t, 'k', background]       the background changed
//   [t, 'v', l, t, w, h]       (v2) the part of the endless board the class sees
//   [t, 'z', x, y, …]          (v2) laser pointer points (a trail that fades in a second)
//
// Strokes use the saved-board encoding: {t: pen|highlighter|shape, c: ARGB int, w, s?, f?, p: [x0, y0, …]}.
// Other elements carry their own t: text, image, math, graph, polygon, note. A picture's bytes
// come once per stream ({d: base64, ri: n}); later events refer to them as {ref: n}.

export type InkTool = 'pen' | 'highlighter' | 'shape';

export const SHAPES = [
  'line',
  'arrow',
  'doubleArrow',
  'circle',
  'ellipse',
  'triangle',
  'rightTriangle',
  'rectangle',
  'parallelogram',
  'trapezium',
  'rhombus',
  'pentagon',
  'hexagon',
] as const;
export type ShapeKind = (typeof SHAPES)[number];

export const BACKGROUNDS = ['plain', 'ruled', 'grid', 'dots', 'chalkboard', 'fourLine'] as const;
export type BoardBackground = (typeof BACKGROUNDS)[number];

export interface Stroke {
  tool: InkTool;
  /** 32-bit ARGB, unsigned. */
  color: number;
  width: number;
  shape: ShapeKind | null;
  /** Flat [x0, y0, x1, y1, …] in canvas pixels. */
  points: number[];
  /** Inside colour of a filled shape (ARGB). */
  fill?: number;
  /** A dashed or dotted line (the board's line styles). */
  dash?: 'dashed' | 'dotted';
  /** An arrow's heads are filled. */
  filledHead?: boolean;
}

/** A box on the board: left, top, width, height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextElement {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: number;
  fontSize: number;
  w: number;
  h: number;
  bold: boolean;
  font: 'inter' | 'andika';
  rotation: number;
}

export interface ImageElement {
  kind: 'image';
  box: Box;
  /** A data: URL. */
  src: string;
  rotation: number;
  /** What the picture is a snapshot of (a 3D model or lab), if anything. */
  link: { kind: string; id: string } | null;
}

export interface MathElement {
  kind: 'math';
  x: number;
  y: number;
  latex: string;
  color: number;
  fontSize: number;
  w: number;
  h: number;
  rotation: number;
}

export interface GraphElement {
  kind: 'graph';
  box: Box;
  expression: string;
  color: number;
  range: [number, number, number, number];
  rotation: number;
  /** Further curves (supply with demand), already with the graph's letters put in. */
  curves: string[];
  points: { x: number; y: number; label: string }[];
  title: string;
}

/** A flowchart block or mind-map topic. */
export interface FlowNodeElement {
  kind: 'flow';
  box: Box;
  shape: string;
  text: string;
  color: number;
  fill?: number;
  fontSize: number;
}

/** A flowchart arrow, as its route ([x0, y0, x1, y1, …]). */
export interface FlowLinkElement {
  kind: 'flowlink';
  points: number[];
  label: string;
  color: number;
  curved: boolean;
}

export interface PolygonElement {
  kind: 'polygon';
  points: number[];
  color: number;
  width: number;
  closed: boolean;
  fill?: number;
}

export type NoteKind = 'note' | 'code' | 'card' | 'answer';

export interface NoteElement {
  kind: 'note';
  box: Box;
  text: string;
  color: number;
  fontSize: number;
  noteKind: NoteKind;
  language: string | null;
  rotation: number;
}

/**
 * A spreadsheet. The board sends each cell as it shows it (`out`) and its chart's labels and
 * numbers (`cv`), so the web view needs no formula engine.
 */
export interface SheetElement {
  kind: 'sheet';
  box: Box;
  rows: number;
  cols: number;
  /** Each cell as shown, row by row. */
  cells: string[];
  color: number;
  widths: number[];
  header: boolean;
  chart: { kind: 'bar' | 'line' | 'pie'; labels: string[]; values: number[] } | null;
  rotation: number;
}

/** Anything on a page. Strokes have no `kind` (they keep the version 1 shape). */
export type BoardElement =
  | Stroke
  | TextElement
  | ImageElement
  | MathElement
  | GraphElement
  | PolygonElement
  | NoteElement
  | SheetElement
  | FlowNodeElement
  | FlowLinkElement;

export const isStroke = (e: BoardElement): e is Stroke => !('kind' in e);

/** A laser point and when it arrived (ms). */
export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

export interface Canvas {
  w: number;
  h: number;
}

export type LessonEvent = unknown[];

export interface LiveSnapshot {
  canvas?: { w?: number; h?: number };
  background?: string;
  events?: LessonEvent[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown, fallback = 0) => (isNum(v) ? Math.trunc(v) : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function isBackground(v: unknown): v is BoardBackground {
  return typeof v === 'string' && (BACKGROUNDS as readonly string[]).includes(v);
}

/** Reads a stroke; unknown tools or shapes (from a newer board) are skipped, as on the board. */
export function decodeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  const tool = j.t === 'pen' || j.t === 'highlighter' || j.t === 'shape' ? j.t : null;
  const flat = Array.isArray(j.p) ? j.p : null;
  if (!tool || !flat || flat.length < 2 || !flat.every(isNum)) return null;
  const shape = j.s == null ? null : (SHAPES as readonly unknown[]).includes(j.s) ? (j.s as ShapeKind) : undefined;
  if (shape === undefined || (tool === 'shape' && shape === null)) return null;
  const points = flat.length % 2 === 0 ? [...flat] : flat.slice(0, -1);
  const stroke: Stroke = { tool, color: int(j.c, 0xff000000) >>> 0, width: isNum(j.w) ? j.w : 3, shape, points };
  if (isNum(j.f)) stroke.fill = int(j.f) >>> 0;
  if (j.n === 'dashed' || j.n === 'dotted') stroke.dash = j.n;
  if (j.ah === 1) stroke.filledHead = true;
  return stroke;
}

const num = (v: unknown, fallback = 0) => (isNum(v) ? v : fallback);
const argb = (v: unknown, fallback = 0xff1b1f24) => int(v, fallback) >>> 0;

function box(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(isNum)) return null;
  return { x: v[0], y: v[1], w: v[2], h: v[3] };
}

/** `data:` URL for base64 picture bytes (PNG or JPEG). */
export function dataUrl(base64: string): string {
  return `data:${base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${base64}`;
}

/**
 * Reads any element. Unknown kinds, and malformed or incomplete ones, are skipped (null), as on
 * the board. `images` resolves and remembers pictures sent once per stream.
 */
export function decodeElement(raw: unknown, images?: Map<number, string>): BoardElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  const rotation = num(j.a);
  switch (j.t) {
    case 'pen':
    case 'highlighter':
    case 'shape':
      return decodeStroke(raw);
    case 'text':
      if (typeof j.tx !== 'string') return null;
      return {
        kind: 'text',
        x: num(j.x),
        y: num(j.y),
        text: j.tx,
        color: argb(j.c),
        fontSize: num(j.fs, 32),
        w: num(j.sw, 32),
        h: num(j.sh, 40),
        bold: j.b === true,
        font: j.f === 'andika' ? 'andika' : 'inter',
        rotation,
      };
    case 'image': {
      const b = box(j.r);
      let src: string | undefined;
      if (typeof j.d === 'string') {
        src = dataUrl(j.d);
        if (isNum(j.ri)) images?.set(int(j.ri), src);
      } else if (isNum(j.ref)) {
        src = images?.get(int(j.ref));
      }
      if (!b || !src) return null;
      const ln = j.ln as Record<string, unknown> | undefined;
      const link = ln && typeof ln.k === 'string' && typeof ln.id === 'string' ? { kind: ln.k, id: ln.id } : null;
      return { kind: 'image', box: b, src, rotation, link };
    }
    case 'math':
      if (typeof j.tex !== 'string') return null;
      return { kind: 'math', x: num(j.x), y: num(j.y), latex: j.tex, color: argb(j.c), fontSize: num(j.fs, 34), w: num(j.sw, 160), h: num(j.sh, 48), rotation };
    case 'graph': {
      const b = box(j.r);
      if (!b || typeof j.e !== 'string') return null;
      const v: [number, number, number, number] =
        Array.isArray(j.v) && j.v.length === 4 && j.v.every(isNum) ? [j.v[0], j.v[1], j.v[2], j.v[3]] : [-10, 10, -10, 10];
      const curves = Array.isArray(j.x) ? j.x.filter((c): c is string => typeof c === 'string') : [];
      const points = Array.isArray(j.pt)
        ? j.pt
            .filter((p): p is unknown[] => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))
            .map((p) => ({ x: p[0] as number, y: p[1] as number, label: typeof p[2] === 'string' ? p[2] : '' }))
        : [];
      const title = typeof j.ti === 'string' ? j.ti : '';
      return { kind: 'graph', box: b, expression: j.e, color: argb(j.c), range: v, rotation, curves, points, title };
    }
    case 'flow': {
      const b = box(j.r);
      if (!b || typeof j.k !== 'string') return null;
      const n: FlowNodeElement = { kind: 'flow', box: b, shape: j.k, text: typeof j.tx === 'string' ? j.tx : '', color: argb(j.c), fontSize: num(j.fs, 22) };
      if (isNum(j.f)) n.fill = argb(j.f);
      return n;
    }
    case 'flowlink': {
      if (!Array.isArray(j.p) || j.p.length < 4 || !j.p.every(isNum)) return null;
      return { kind: 'flowlink', points: [...(j.p as number[])], label: typeof j.l === 'string' ? j.l : '', color: argb(j.c), curved: j.cv === true };
    }
    case 'polygon': {
      if (!Array.isArray(j.p) || j.p.length < 4 || !j.p.every(isNum)) return null;
      const p: PolygonElement = { kind: 'polygon', points: [...(j.p as number[])], color: argb(j.c), width: num(j.w, 3), closed: j.o !== true };
      if (isNum(j.f)) p.fill = argb(j.f);
      return p;
    }
    case 'note': {
      const b = box(j.r);
      if (!b) return null;
      const k = j.k === 'code' || j.k === 'card' || j.k === 'answer' ? j.k : 'note';
      return {
        kind: 'note',
        box: b,
        text: typeof j.tx === 'string' ? j.tx : '',
        color: argb(j.c, 0xffffe58a),
        fontSize: num(j.fs, 22),
        noteKind: k,
        language: typeof j.lg === 'string' ? j.lg : null,
        rotation,
      };
    }
    case 'sheet': {
      const b = box(j.r);
      const n = j.n;
      if (!b || !Array.isArray(n) || n.length !== 2 || !n.every(isNum)) return null;
      const rows = Math.max(1, int(n[0]));
      const cols = Math.max(1, int(n[1]));
      const src = Array.isArray(j.out) ? j.out : Array.isArray(j.d) ? j.d : [];
      const cells = Array.from({ length: rows * cols }, (_, i) => (typeof src[i] === 'string' ? (src[i] as string) : ''));
      const cw = Array.isArray(j.cw) ? j.cw : [];
      const widths = Array.from({ length: cols }, (_, i) => (isNum(cw[i]) ? (cw[i] as number) : 140));
      const ch = j.ch as Record<string, unknown> | undefined;
      const cv = j.cv as Record<string, unknown> | undefined;
      const kind: 'bar' | 'line' | 'pie' | null = ch && (ch.k === 'bar' || ch.k === 'line' || ch.k === 'pie') ? ch.k : null;
      const chart =
        kind && cv && Array.isArray(cv.l) && Array.isArray(cv.v) && cv.v.every(isNum)
          ? { kind, labels: cv.l.map((l) => String(l)), values: [...(cv.v as number[])] }
          : null;
      return { kind: 'sheet', box: b, rows, cols, cells, color: argb(j.c, 0xff7a4f00), widths, header: j.h !== false, chart, rotation };
    }
    default:
      return null;
  }
}

/** `e` moved by (dx, dy), in place. */
export function moveElement(e: BoardElement, dx: number, dy: number) {
  if (isStroke(e) || e.kind === 'polygon' || e.kind === 'flowlink') {
    for (let i = 0; i + 1 < e.points.length; i += 2) {
      e.points[i] += dx;
      e.points[i + 1] += dy;
    }
  } else if (e.kind === 'text' || e.kind === 'math') {
    e.x += dx;
    e.y += dy;
  } else {
    e.box.x += dx;
    e.box.y += dy;
  }
}

function pointsFrom(e: LessonEvent, from: number): number[] {
  const out: number[] = [];
  for (let i = from; i + 1 < e.length; i += 2) {
    if (isNum(e[i]) && isNum(e[i + 1])) out.push(e[i] as number, e[i + 1] as number);
  }
  return out;
}

/** One page: elements in drawing order, found by id. */
export class Page {
  readonly elements: BoardElement[] = [];
  private readonly byId = new Map<number, BoardElement>();

  /** The page's strokes (pen, highlighter, shapes), oldest first. */
  get strokes(): Stroke[] {
    return this.elements.filter(isStroke);
  }

  get(id: number): BoardElement | undefined {
    return this.byId.get(id);
  }

  insert(id: number, s: BoardElement, at?: number | null) {
    this.byId.set(id, s);
    if (at == null || at >= this.elements.length) this.elements.push(s);
    else this.elements.splice(Math.max(0, at), 0, s);
  }

  remove(id: number) {
    const s = this.byId.get(id);
    if (!s) return;
    this.byId.delete(id);
    const i = this.elements.indexOf(s);
    if (i >= 0) this.elements.splice(i, 1);
  }
}

/**
 * Applies live lesson events as they arrive. A snapshot ({@link reset}) replaces everything;
 * the events after it continue from there.
 */
export class LivePlayer {
  canvas: Canvas = { w: 1920, h: 1080 };
  background: BoardBackground = 'plain';
  pages: Page[] = [new Page()];
  index = 0;
  /** Bumped on every change, for renderers that redraw on demand. */
  version = 0;
  /** The part of the board the class sees (v2 boards), or null for the canvas from the origin. */
  view: Box | null = null;
  /** The laser trail, with arrival times. */
  laser: LaserPoint[] = [];
  /** Pictures sent once in this stream, by number. */
  private readonly images = new Map<number, string>();
  /** The clock for the laser (tests replace it). */
  now: () => number = () => Date.now();

  get pageCount() {
    return this.pages.length;
  }

  get page(): Page {
    return this.pages[this.index];
  }

  /** The open page's strokes, oldest first. */
  get strokes(): readonly Stroke[] {
    return this.page.strokes;
  }

  /** Everything on the open page, bottom first. */
  get elements(): readonly BoardElement[] {
    return this.page.elements;
  }

  /** The board area to show: the class's view, or the canvas. */
  get area(): Box {
    return this.view ?? { x: 0, y: 0, w: this.canvas.w, h: this.canvas.h };
  }

  reset(snapshot?: LiveSnapshot) {
    this.pages = [new Page()];
    this.index = 0;
    this.view = null;
    this.laser = [];
    this.background = isBackground(snapshot?.background) ? snapshot.background : 'plain';
    const w = snapshot?.canvas?.w, h = snapshot?.canvas?.h;
    if (isNum(w) && isNum(h) && w > 0 && h > 0) this.canvas = { w, h };
    if (snapshot?.events) this.apply(snapshot.events);
    this.version++;
  }

  apply(events: readonly LessonEvent[]) {
    for (const e of events) {
      if (Array.isArray(e)) this.applyOne(e);
    }
    this.version++;
  }

  private applyOne(e: LessonEvent) {
    const page = this.page;
    switch (e[1]) {
      case 'L': {
        const raw = Array.isArray(e[2]) ? e[2] : [];
        this.pages = raw.map((entries) => {
          const built = new Page();
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (!Array.isArray(entry) || !isNum(entry[0])) continue;
              const s = decodeElement(entry[1], this.images);
              if (s) built.insert(int(entry[0]), s);
            }
          }
          return built;
        });
        if (this.pages.length === 0) this.pages.push(new Page());
        this.index = clamp(int(e[3]), 0, this.pages.length - 1);
        break;
      }
      case 'b':
      case 'a': {
        if (!isNum(e[2])) break;
        const id = int(e[2]);
        const s = decodeElement(e[3], this.images);
        if (s) {
          page.remove(id);
          page.insert(id, s, e.length > 4 && isNum(e[4]) ? int(e[4]) : null);
        }
        break;
      }
      case 'p': {
        const s = isNum(e[2]) ? page.get(int(e[2])) : undefined;
        if (s && isStroke(s)) s.points.push(...pointsFrom(e, 3));
        break;
      }
      case 'u': {
        const s = isNum(e[2]) ? page.get(int(e[2])) : undefined;
        if (s && isStroke(s)) s.points = pointsFrom(e, 3);
        break;
      }
      case 'x':
        for (const id of e.slice(2)) if (isNum(id)) page.remove(int(id));
        break;
      case 'm': {
        if (!isNum(e[2]) || !isNum(e[3])) break;
        const dx = e[2], dy = e[3];
        for (const id of e.slice(4)) {
          const s = isNum(id) ? page.get(int(id)) : undefined;
          if (s) moveElement(s, dx, dy);
        }
        break;
      }
      case 'g':
        this.index = clamp(int(e[2]), 0, this.pages.length - 1);
        break;
      case 'n': {
        const at = clamp(int(e[2]), 0, this.pages.length);
        this.pages.splice(at, 0, new Page());
        this.index = at;
        break;
      }
      case 'k':
        if (isBackground(e[2])) this.background = e[2];
        break;
      case 'v': {
        const b = box(e.slice(2, 6));
        if (b && b.w > 0 && b.h > 0) this.view = b;
        break;
      }
      case 'z': {
        const at = this.now();
        const pts = pointsFrom(e, 2);
        for (let i = 0; i + 1 < pts.length; i += 2) this.laser.push({ x: pts[i], y: pts[i + 1], t: at });
        this.laser = this.laser.filter((p) => at - p.t < 1000).slice(-400);
        break;
      }
      default:
        break; // 'e', and kinds added by newer boards
    }
  }
}
