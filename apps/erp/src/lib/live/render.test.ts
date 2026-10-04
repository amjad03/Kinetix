import { describe, expect, it } from 'vitest';
import { argbToCss, fitContain, inkColorFor, luminance, strokeStyle } from './render';

describe('board colours', () => {
  it('turns ARGB into rgba()', () => {
    expect(argbToCss(0xff0b57d0)).toBe('rgba(11, 87, 208, 1)');
    expect(argbToCss(-16777216)).toBe('rgba(0, 0, 0, 1)');
    expect(argbToCss(0x80ffffff, 0.5)).toBe('rgba(255, 255, 255, 0.251)');
  });

  it('computes luminance like Flutter', () => {
    expect(luminance(0xff000000)).toBe(0);
    expect(luminance(0xffffffff)).toBeCloseTo(1, 5);
  });

  it('shows dark ink as chalk white on the chalkboard only', () => {
    expect(inkColorFor(0xff000000, 'chalkboard')).toBe(0xfff4f4ee);
    expect(inkColorFor(0xff202124, 'chalkboard')).toBe(0xfff4f4ee);
    expect(inkColorFor(0xff000000, 'plain')).toBe(0xff000000);
    expect(inkColorFor(0xffd93025, 'chalkboard')).toBe(0xffd93025);
  });

  it('draws highlighters wide and see-through', () => {
    const base = { color: 0xffffeb3b, width: 5, shape: null, points: [0, 0] };
    expect(strokeStyle({ ...base, tool: 'highlighter' }, 'plain')).toEqual({ color: 'rgba(255, 235, 59, 0.35)', width: 20, cap: 'square' });
    expect(strokeStyle({ ...base, tool: 'pen' }, 'plain')).toEqual({ color: 'rgba(255, 235, 59, 1)', width: 5, cap: 'round' });
  });

  it('fits the board inside its frame', () => {
    expect(fitContain({ w: 1920, h: 1080 }, { w: 960, h: 960 })).toEqual({ scale: 0.5, dx: 0, dy: 210 });
  });
});
