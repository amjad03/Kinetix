// The board's ink as lesson events, rebuilt into pages of strokes.
// A TypeScript port of `LessonPlayer` in packages/kinetix_ink/lib/src/lesson.dart (format v1):
//
//   [t, 'L', pages, index]     every page's strokes ([[[id, stroke], …], …]) and the open page
//   [t, 'b', id, stroke]       a stroke started, with its first points
//   [t, 'p', id, x, y, …]      points added to a stroke being drawn
//   [t, 'u', id, x, y, …]      all points of a shape being dragged out
//   [t, 'e', id]               the stroke was finished
//   [t, 'a', id, stroke, i?]   a whole stroke appeared (undo, redo), at that position
//   [t, 'x', id, …]            strokes removed
//   [t, 'm', dx, dy, id, …]    strokes moved
//   [t, 'g', index]            turned to another page
//   [t, 'n', index]            inserted a blank page there and opened it
//   [t, 'k', background]       the background changed
//
// Strokes use the saved-board encoding: {t: pen|highlighter|shape, c: ARGB int, w, s?, p: [x0, y0, …]}.

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

export const BACKGROUNDS = ['plain', 'ruled', 'grid', 'dots', 'chalkboard'] as const;
export type BoardBackground = (typeof BACKGROUNDS)[number];

export interface Stroke {
  tool: InkTool;
  /** 32-bit ARGB, unsigned. */
  color: number;
  width: number;
  shape: ShapeKind | null;
  /** Flat [x0, y0, x1, y1, …] in canvas pixels. */
  points: number[];
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
  return { tool, color: int(j.c, 0xff000000) >>> 0, width: isNum(j.w) ? j.w : 3, shape, points };
}

function pointsFrom(e: LessonEvent, from: number): number[] {
  const out: number[] = [];
  for (let i = from; i + 1 < e.length; i += 2) {
    if (isNum(e[i]) && isNum(e[i + 1])) out.push(e[i] as number, e[i + 1] as number);
  }
  return out;
}

/** One page: strokes in drawing order, found by id. */
export class Page {
  readonly strokes: Stroke[] = [];
  private readonly byId = new Map<number, Stroke>();

  get(id: number): Stroke | undefined {
    return this.byId.get(id);
  }

  insert(id: number, s: Stroke, at?: number | null) {
    this.byId.set(id, s);
    if (at == null || at >= this.strokes.length) this.strokes.push(s);
    else this.strokes.splice(Math.max(0, at), 0, s);
  }

  remove(id: number) {
    const s = this.byId.get(id);
    if (!s) return;
    this.byId.delete(id);
    const i = this.strokes.indexOf(s);
    if (i >= 0) this.strokes.splice(i, 1);
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

  reset(snapshot?: LiveSnapshot) {
    this.pages = [new Page()];
    this.index = 0;
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
              const s = decodeStroke(entry[1]);
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
        const s = decodeStroke(e[3]);
        if (s) {
          page.remove(id);
          page.insert(id, s, e.length > 4 && isNum(e[4]) ? int(e[4]) : null);
        }
        break;
      }
      case 'p':
        if (isNum(e[2])) page.get(int(e[2]))?.points.push(...pointsFrom(e, 3));
        break;
      case 'u': {
        const s = isNum(e[2]) ? page.get(int(e[2])) : undefined;
        if (s) s.points = pointsFrom(e, 3);
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
          if (!s) continue;
          for (let i = 0; i + 1 < s.points.length; i += 2) {
            s.points[i] += dx;
            s.points[i + 1] += dy;
          }
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
      default:
        break; // 'e', and kinds added by newer boards
    }
  }
}
