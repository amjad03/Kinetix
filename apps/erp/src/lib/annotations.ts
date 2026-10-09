// Marks drawn on a scanned script page: ticks, crosses, comment pins and highlight boxes. Positions are fractions
// of the page (0 to 1) so they stay put at any zoom and screen size; the API stores them the same way.

export type AnnotationKind = 'tick' | 'cross' | 'comment' | 'highlight';
export const ANNOTATION_TOOLS: readonly AnnotationKind[] = ['tick', 'cross', 'comment', 'highlight'];

export interface Annotation {
  id: string;
  pageIndex: number;
  kind: AnnotationKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string | null;
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
}

/** The request body for a tool used from `start` to `end`, or null when it should not be saved (a highlight with no size, a comment with no text). */
export function newAnnotation(pageIndex: number, tool: AnnotationKind, start: Point, end: Point, text = ''): NewAnnotation | null {
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
  const out: Record<AnnotationKind, number> = { tick: 0, cross: 0, comment: 0, highlight: 0 };
  for (const a of list) out[a.kind] += 1;
  return out;
}
