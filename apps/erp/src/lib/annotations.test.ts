import { describe, expect, it } from 'vitest';
import { annotationCounts, boxBetween, newAnnotation, onPage, pointOnPage, type Annotation } from './annotations';

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
    expect(annotationCounts(list)).toEqual({ tick: 2, cross: 1, comment: 0, highlight: 0 });
  });
});
