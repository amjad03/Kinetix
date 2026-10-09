import { describe, expect, it } from 'vitest';
import { annotationCounts, boxBetween, extendStroke, inkAnnotation, MAX_STROKE_POINTS, newAnnotation, onPage, pointOnPage, strokePath, thinStroke, type Annotation, type Stroke } from './annotations';

const rect = { left: 100, top: 50, width: 400, height: 800 };

describe('annotation geometry', () => {
  it('turns a pointer position into fractions of the page and keeps it inside', () => {
    expect(pointOnPage(300, 450, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointOnPage(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(pointOnPage(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
    expect(pointOnPage(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });

  it('builds a box whichever way it was dragged', () => {
    expect(boxBetween({ x: 0.6, y: 0.4 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.3 });
  });

  it('makes request bodies for each tool', () => {
    const a = { x: 0.2, y: 0.3 };
    expect(newAnnotation(1, 'tick', a, a)).toEqual({ pageIndex: 1, kind: 'tick', x: 0.2, y: 0.3 });
    expect(newAnnotation(0, 'highlight', a, { x: 0.5, y: 0.35 })).toEqual({ pageIndex: 0, kind: 'highlight', x: 0.2, y: 0.3, w: 0.3, h: 0.05 });
    // A tiny drag is a click, not a highlight; a comment needs words.
    expect(newAnnotation(0, 'highlight', a, { x: 0.205, y: 0.305 })).toBeNull();
    expect(newAnnotation(0, 'comment', a, a, '   ')).toBeNull();
    expect(newAnnotation(0, 'comment', a, a, ' Well argued ')).toMatchObject({ kind: 'comment', text: 'Well argued' });
  });

  it('filters and counts marks', () => {
    const mk = (id: string, pageIndex: number, kind: Annotation['kind']): Annotation => ({ id, pageIndex, kind, x: 0, y: 0, w: 0, h: 0, text: null });
    const list = [mk('a', 0, 'tick'), mk('b', 0, 'cross'), mk('c', 1, 'tick')];
    expect(onPage(list, 0).map((x) => x.id)).toEqual(['a', 'b']);
    expect(annotationCounts(list)).toEqual({ tick: 2, cross: 1, comment: 0, highlight: 0, ink: 0 });
  });
});

describe('freehand ink', () => {
  it('skips tiny moves, keeps the rest, and bounds a stroke', () => {
    let st: Stroke = [[0.1, 0.1]];
    st = extendStroke(st, { x: 0.1005, y: 0.1 });
    expect(st).toHaveLength(1);
    st = extendStroke(st, { x: 0.2, y: 0.15 });
    expect(st).toEqual([[0.1, 0.1], [0.2, 0.15]]);
    const long: Stroke = Array.from({ length: 1000 }, (_, i) => [i / 1000, 0.5]);
    const thin = thinStroke(long);
    expect(thin).toHaveLength(MAX_STROKE_POINTS);
    expect(thin[0]).toEqual(long[0]);
    expect(thin[thin.length - 1]).toEqual(long[999]);
  });

  it('builds one request from the strokes and drops lone dots', () => {
    expect(inkAnnotation(2, [])).toBeNull();
    expect(inkAnnotation(2, [[[0.3, 0.3]]])).toBeNull();
    const body = inkAnnotation(2, [[[0.3, 0.3]], [[0.1, 0.1], [0.2, 0.2]]]);
    expect(body).toEqual({ pageIndex: 2, kind: 'ink', x: 0, y: 0, strokes: [[[0.1, 0.1], [0.2, 0.2]]] });
    expect(newAnnotation(0, 'ink', { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 })).toBeNull();
    expect(strokePath([[0.1, 0.2], [0.3, 0.4]])).toBe('M0.1 0.2 L0.3 0.4');
  });
});
