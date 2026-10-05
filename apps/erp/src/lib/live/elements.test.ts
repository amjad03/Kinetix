import { describe, expect, it } from 'vitest';
import { readableLatex, wrap } from './draw-elements';
import { compileGraph } from './graph';
import { decodeElement, isStroke, LivePlayer, type ImageElement, type TextElement } from './player';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const text = (x: number, tx = 'Fractions') => ({ t: 'text', x, y: 10, tx, c: 0xff1b1f24, fs: 32, sw: 140, sh: 40 });

describe('decodeElement (board format v2)', () => {
  it('reads every kind the board writes', () => {
    expect(decodeElement(text(5))).toMatchObject({ kind: 'text', x: 5, text: 'Fractions', font: 'inter', bold: false });
    expect(decodeElement({ ...text(0), f: 'andika', b: true, a: 0.5 })).toMatchObject({ font: 'andika', bold: true, rotation: 0.5 });
    expect(decodeElement({ t: 'math', x: 1, y: 2, tex: '\\frac{1}{2}', c: 0, fs: 34, sw: 40, sh: 80 })).toMatchObject({ kind: 'math', latex: '\\frac{1}{2}' });
    expect(decodeElement({ t: 'graph', r: [0, 0, 400, 300], e: 'x^2', v: [-5, 5, 0, 25], c: 0xff0000ff })).toMatchObject({
      kind: 'graph',
      box: { x: 0, y: 0, w: 400, h: 300 },
      range: [-5, 5, 0, 25],
    });
    expect(decodeElement({ t: 'polygon', p: [0, 0, 10, 0, 5, 8], c: 0, w: 3, o: true, f: 0x33000000 })).toMatchObject({ kind: 'polygon', closed: false, fill: 0x33000000 });
    expect(decodeElement({ t: 'note', r: [0, 0, 260, 120], tx: 'print(1)', c: 0xffffe58a, k: 'code', lg: 'python' })).toMatchObject({
      kind: 'note',
      noteKind: 'code',
      language: 'python',
    });
    const img = decodeElement({ t: 'image', r: [0, 0, 10, 10], d: PNG, ln: { k: 'model3d', id: 'heart' } }) as ImageElement;
    expect(img.src.startsWith('data:image/png;base64,')).toBe(true);
    expect(img.link).toEqual({ kind: 'model3d', id: 'heart' });
    const filled = decodeElement({ t: 'shape', s: 'rectangle', c: 0xff000000, w: 2, f: 0x2e000000, p: [0, 0, 10, 0, 10, 10, 0, 0] });
    expect(filled && isStroke(filled) ? filled.fill : null).toBe(0x2e000000);
  });

  it('reads sheets as the board shows them', () => {
    const s = decodeElement({
      t: 'sheet',
      r: [0, 0, 320, 136],
      n: [2, 2],
      d: ['Sales', '=B1*2', '10', '20'],
      out: ['Sales', '₹20.00', '10', '20'],
      c: 0xff7a4f00,
      ch: { k: 'bar', l: 'A2:A2', v: 'B2:B2' },
      cv: { l: ['10'], v: [20] },
    });
    expect(s).toMatchObject({ kind: 'sheet', rows: 2, cols: 2, cells: ['Sales', '₹20.00', '10', '20'], header: true, widths: [140, 140] });
    expect(s && 'chart' in s ? s.chart : null).toEqual({ kind: 'bar', labels: ['10'], values: [20] });
    expect(decodeElement({ t: 'sheet', r: [0, 0, 1, 1] })).toBeNull();
  });

  it('skips unknown kinds and incomplete elements', () => {
    expect(decodeElement({ t: 'hologram' })).toBeNull();
    expect(decodeElement({ t: 'text', x: 0 })).toBeNull();
    expect(decodeElement({ t: 'image', r: [0, 0, 1, 1], ref: 3 })).toBeNull(); // a picture it never got
    expect(decodeElement({ t: 'note', r: [0, 0] })).toBeNull();
  });
});

describe('LivePlayer with version 2 boards', () => {
  it('shows every element, moves them, and keeps pictures sent once', () => {
    const p = new LivePlayer();
    p.apply([
      [0, 'L', [[[1, { t: 'pen', c: 0xff000000, w: 4, p: [0, 0, 10, 10] }], [2, text(100)]]], 0],
      [10, 'a', 3, { t: 'image', r: [0, 0, 100, 100], d: PNG, ri: 0 }, 2],
      [20, 'm', 5, 5, 2, 3],
      [30, 'x', 3],
      [30, 'a', 3, { t: 'image', r: [5, 5, 150, 150], ref: 0 }, 2],
    ]);
    expect(p.elements).toHaveLength(3);
    expect(p.strokes).toHaveLength(1);
    expect((p.elements[1] as TextElement).x).toBe(105);
    expect((p.elements[2] as ImageElement).box).toEqual({ x: 5, y: 5, w: 150, h: 150 });
  });

  it('follows the part of the board the class sees, and the laser', () => {
    let now = 1000;
    const p = new LivePlayer();
    p.now = () => now;
    p.reset({ canvas: { w: 1280, h: 720 } });
    expect(p.area).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    p.apply([
      [0, 'v', 50, 0, 640, 360],
      [5, 'z', 10, 10, 20, 10],
    ]);
    expect(p.area).toEqual({ x: 50, y: 0, w: 640, h: 360 });
    expect(p.laser.map((l) => [l.x, l.y])).toEqual([
      [10, 10],
      [20, 10],
    ]);
    now += 2000;
    p.apply([[2005, 'z', 30, 10]]);
    expect(p.laser).toHaveLength(1); // the old trail has faded
    p.apply([[2006, 'v', 0, 0, 0, 0]]);
    expect(p.area.w).toBe(640); // an empty view is ignored
  });
});

describe('graphs and equations', () => {
  it('evaluates like the board does', () => {
    const f = (e: string, x: number) => compileGraph(e)!(x);
    expect(f('2x^2 - 3', 2)).toBe(5);
    expect(f('3(x+1)', 1)).toBe(6);
    expect(f('sinx', Math.PI / 2)).toBeCloseTo(1);
    expect(f('-x^2', 3)).toBe(-9);
    expect(f('2pi', 0)).toBeCloseTo(2 * Math.PI);
    expect(f('log(100) + ln(e)', 0)).toBeCloseTo(3);
    expect(compileGraph('x +')).toBeNull();
    expect(compileGraph('alert(1)')).toBeNull();
  });

  it('turns LaTeX into readable text', () => {
    expect(readableLatex('\\frac{a}{b} \\times \\pi r^2')).toBe('(a)/(b) × π r^2');
    expect(readableLatex('\\angle A = 90^\\circ')).toBe('∠ A = 90°');
  });

  it('wraps note text to its width', () => {
    const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
    expect(wrap(ctx, 'one two three\nfour', 80)).toEqual(['one two', 'three', 'four']);
  });
});
