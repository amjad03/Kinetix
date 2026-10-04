import { describe, expect, it } from 'vitest';
import { decodeStroke, LivePlayer } from './player';

const pen = (p: number[], c = 0xff000000) => ({ t: 'pen', c, w: 4, p });

describe('decodeStroke', () => {
  it('reads the saved-board encoding', () => {
    expect(decodeStroke({ t: 'highlighter', c: -16777216, w: 6, p: [1, 2, 3, 4] })).toEqual({
      tool: 'highlighter',
      color: 0xff000000,
      width: 6,
      shape: null,
      points: [1, 2, 3, 4],
    });
    expect(decodeStroke({ t: 'shape', c: 0xff0b57d0, w: 3, s: 'arrow', p: [0, 0, 10, 0] })?.shape).toBe('arrow');
  });

  it('skips what a newer board might send', () => {
    expect(decodeStroke({ t: 'laser', c: 0, w: 1, p: [0, 0] })).toBeNull();
    expect(decodeStroke({ t: 'shape', c: 0, w: 1, s: 'star', p: [0, 0] })).toBeNull();
    expect(decodeStroke({ t: 'shape', c: 0, w: 1, p: [0, 0] })).toBeNull();
    expect(decodeStroke({ t: 'pen', c: 0, w: 1, p: [0] })).toBeNull();
    expect(decodeStroke(null)).toBeNull();
  });
});

describe('LivePlayer', () => {
  it('starts as one empty plain page', () => {
    const p = new LivePlayer();
    expect(p.pageCount).toBe(1);
    expect(p.strokes).toEqual([]);
    expect(p.background).toBe('plain');
    expect(p.canvas).toEqual({ w: 1920, h: 1080 });
  });

  it('applies a snapshot, then strokes as they are drawn', () => {
    const p = new LivePlayer();
    p.reset({ canvas: { w: 1280, h: 720 }, background: 'chalkboard', events: [[0, 'L', [[[7, pen([5, 5, 6, 6])]], []], 1]] });
    expect(p.canvas).toEqual({ w: 1280, h: 720 });
    expect(p.background).toBe('chalkboard');
    expect(p.pageCount).toBe(2);
    expect(p.index).toBe(1);
    expect(p.strokes).toHaveLength(0);

    p.apply([
      [120, 'b', 1, pen([10, 10])],
      [140, 'p', 1, 20, 20, 30, 30],
      [160, 'e', 1],
    ]);
    expect(p.strokes).toHaveLength(1);
    expect(p.strokes[0].points).toEqual([10, 10, 20, 20, 30, 30]);
    p.apply([[200, 'g', 0]]);
    expect(p.strokes[0].points).toEqual([5, 5, 6, 6]);
  });

  it('replaces a shape being dragged out, removes and moves strokes', () => {
    const p = new LivePlayer();
    p.apply([
      [0, 'b', 1, { t: 'shape', c: 0xff000000, w: 3, s: 'line', p: [0, 0, 1, 1] }],
      [10, 'u', 1, 0, 0, 50, 50],
      [20, 'b', 2, pen([1, 1, 2, 2])],
      [30, 'm', 5, -1, 1, 2],
    ]);
    expect(p.strokes.map((s) => s.points)).toEqual([
      [5, -1, 55, 49],
      [6, 0, 7, 1],
    ]);
    p.apply([[40, 'x', 1, 99]]);
    expect(p.strokes.map((s) => s.points)).toEqual([[6, 0, 7, 1]]);
  });

  it('puts a stroke back where it was (undo of an erase) and replaces one with the same id', () => {
    const p = new LivePlayer();
    p.apply([
      [0, 'a', 1, pen([1, 1])],
      [0, 'a', 2, pen([2, 2])],
      [0, 'a', 3, pen([3, 3])],
      [5, 'x', 2],
      [6, 'a', 2, pen([2, 2]), 1],
    ]);
    expect(p.strokes.map((s) => s.points[0])).toEqual([1, 2, 3]);
    // Changed in a way the player cannot follow: removed and added back at its index.
    p.apply([
      [7, 'x', 1],
      [7, 'a', 1, pen([9, 9, 10, 10]), 0],
    ]);
    expect(p.strokes.map((s) => s.points[0])).toEqual([9, 2, 3]);
  });

  it('inserts pages, turns pages, and changes the background', () => {
    const p = new LivePlayer();
    p.apply([
      [0, 'b', 1, pen([1, 1])],
      [10, 'n', 1],
      [11, 'b', 2, pen([2, 2])],
      [12, 'n', 0],
      [13, 'k', 'grid'],
    ]);
    expect(p.pageCount).toBe(3);
    expect(p.index).toBe(0);
    expect(p.strokes).toHaveLength(0);
    expect(p.background).toBe('grid');
    p.apply([[14, 'g', 2]]);
    expect(p.strokes[0].points).toEqual([2, 2]);
    p.apply([[15, 'g', 99]]);
    expect(p.index).toBe(2);
    p.apply([[16, 'k', 'neon']]);
    expect(p.background).toBe('grid');
  });

  it('ignores unknown kinds and malformed events, and a new snapshot starts over', () => {
    const p = new LivePlayer();
    p.apply([[0, 'z', 1], 'nonsense' as unknown as unknown[], [0, 'p', 42, 1, 1], [0, 'L', [], 3]]);
    expect(p.pageCount).toBe(1);
    expect(p.index).toBe(0);
    p.apply([[1, 'b', 1, pen([1, 1])]]);
    const v = p.version;
    p.reset({ canvas: { w: 1920, h: 1080 }, background: 'plain', events: [[0, 'L', [[]], 0]] });
    expect(p.strokes).toHaveLength(0);
    expect(p.version).toBeGreaterThan(v);
  });
});
