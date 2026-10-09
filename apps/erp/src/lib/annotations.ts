// Marks drawn on a scanned script page: ticks, crosses, comment pins and highlight boxes. Positions are fractions
// of the page (0 to 1) so they stay put at any zoom and screen size; the API stores them the same way.

export type AnnotationKind = 'tick' | 'cross' | 'comment' | 'highlight' | 'ink';
export const ANNOTATION_TOOLS: readonly AnnotationKind[] = ['tick', 'cross', 'comment', 'highlight', 'ink'];

/** One pen stroke: points as fractions of the page. */
export type Stroke = [number, number][];

export interface Annotation {
  id: string;
  pageIndex: number;
  kind: AnnotationKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string | null;
  /** Freehand ink only: the pen strokes. */
  strokes?: Stroke[] | null;
  /** The valuation round that drew it; set on earlier rounds shown read only to a third valuer. */
  round?: number;
}

/** What GET /v1/evaluation/allocations/:id/annotations returns. */
export interface AnnotationSet {
  mine: Annotation[];
  earlier: Annotation[];
}

export interface Point {
  x: number;
  y: number;
}
export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** A pointer position on screen as a fraction of the page; null for a page that has no size yet. */
export function pointOnPage(clientX: number, clientY: number, rect: PageRect): Point | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: r6(clamp01((clientX - rect.left) / rect.width)), y: r6(clamp01((clientY - rect.top) / rect.height)) };
}

/** The box between two corners, whichever way it was dragged. */
export function boxBetween(a: Point, b: Point): { x: number; y: number; w: number; h: number } {
  return { x: r6(Math.min(a.x, b.x)), y: r6(Math.min(a.y, b.y)), w: r6(Math.abs(a.x - b.x)), h: r6(Math.abs(a.y - b.y)) };
}

/** A drag shorter than this (a fraction of the page) is a click, not a highlight. */
export const MIN_HIGHLIGHT = 0.01;

export interface NewAnnotation {
  pageIndex: number;
  kind: AnnotationKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  strokes?: Stroke[];
}

/** The request body for a tool used from `start` to `end`, or null when it should not be saved (a highlight with no size, a comment with no text). */
export function newAnnotation(pageIndex: number, tool: AnnotationKind, start: Point, end: Point, text = ''): NewAnnotation | null {
  if (tool === 'ink') return null; // drawings are saved from their strokes (inkAnnotation)
  if (tool === 'highlight') {
    const box = boxBetween(start, end);
    return box.w < MIN_HIGHLIGHT || box.h < MIN_HIGHLIGHT ? null : { pageIndex, kind: tool, ...box };
  }
  if (tool === 'comment') return text.trim() ? { pageIndex, kind: tool, x: start.x, y: start.y, text: text.trim().slice(0, 500) } : null;
  return { pageIndex, kind: tool, x: start.x, y: start.y };
}

export const onPage = (list: readonly Annotation[], pageIndex: number) => list.filter((a) => a.pageIndex === pageIndex);

/** Counts per kind, for the summary line under the page. */
export function annotationCounts(list: readonly Annotation[]): Record<AnnotationKind, number> {
  const out: Record<AnnotationKind, number> = { tick: 0, cross: 0, comment: 0, highlight: 0, ink: 0 };
  for (const a of list) out[a.kind] += 1;
  return out;
}

/** The API takes at most this many strokes of this many points in one drawing. */
export const MAX_STROKES = 60;
export const MAX_STROKE_POINTS = 400;
/** A point closer than this (a fraction of the page) to the last kept point is dropped, so a drawing stays small. */
export const INK_MIN_STEP = 0.002;

/** Adds a pointer position to a stroke unless it is hardly a move from the last one. */
export function extendStroke(stroke: Stroke, p: Point): Stroke {
  const last = stroke[stroke.length - 1];
  if (last && Math.hypot(p.x - last[0], p.y - last[1]) < INK_MIN_STEP) return stroke;
  return stroke.length >= MAX_STROKE_POINTS ? stroke : [...stroke, [p.x, p.y]];
}

/** Thins a stroke to at most MAX_STROKE_POINTS points, always keeping the first and the last. */
export function thinStroke(stroke: Stroke): Stroke {
  if (stroke.length <= MAX_STROKE_POINTS) return stroke;
  const step = (stroke.length - 1) / (MAX_STROKE_POINTS - 1);
  return Array.from({ length: MAX_STROKE_POINTS }, (_, i) => stroke[Math.round(i * step)]);
}

/** The request body for the strokes drawn so far, or null when there is nothing worth saving (a lone dot is dropped). */
export function inkAnnotation(pageIndex: number, strokes: readonly Stroke[]): NewAnnotation | null {
  const kept = strokes.filter((s) => s.length >= 2).slice(0, MAX_STROKES).map(thinStroke);
  return kept.length ? { pageIndex, kind: 'ink', x: 0, y: 0, strokes: kept } : null;
}

/** An SVG path for a stroke in a 0 to 1 box. */
export function strokePath(stroke: Stroke): string {
  return stroke.map((q, i) => `${i === 0 ? 'M' : 'L'}${q[0]} ${q[1]}`).join(' ');
}
