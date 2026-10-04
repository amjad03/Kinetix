import { argbFromHex, Hct } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { contrastRatio, M3_ROLES, m3Scheme, SEED, withAlpha } from './scheme';
import { paletteFor } from './palette';

const tone = (hex: string) => Hct.fromInt(argbFromHex(hex)).tone;
const hue = (hex: string) => Hct.fromInt(argbFromHex(hex)).hue;

describe('m3Scheme (ColorScheme.fromSeed, TonalSpot)', () => {
  const light = m3Scheme(SEED, false);
  const dark = m3Scheme(SEED, true);

  it('produces every role as #rrggbb', () => {
    for (const s of [light, dark]) for (const r of M3_ROLES) expect(s[r]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches the Flutter fromSeed values for #0B57D0', () => {
    // Same numbers Flutter's ColorScheme.fromSeed(seedColor: Color(0xFF0B57D0)) yields.
    expect(light.primary).toBe('#495d92');
    expect(light.onPrimary).toBe('#ffffff');
    expect(light.primaryContainer).toBe('#dae2ff');
    expect(light.surface).toBe('#faf8ff');
    expect(dark.primary).toBe('#b2c5ff');
    expect(dark.surface).toBe('#121318');
  });

  it('keeps the seed hue for primary and uses M3 tones', () => {
    expect(Math.abs(hue(light.primary) - hue(SEED))).toBeLessThan(3);
    expect(Math.round(tone(light.primary))).toBe(40);
    expect(Math.round(tone(dark.primary))).toBe(80);
    expect(Math.round(tone(light.primaryContainer))).toBe(90);
  });

  it('orders surface containers from lowest to highest emphasis', () => {
    const order = ['surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest'] as const;
    const lightTones = order.map((r) => tone(light[r]));
    const darkTones = order.map((r) => tone(dark[r]));
    expect([...lightTones].sort((a, b) => b - a)).toEqual(lightTones);
    expect([...darkTones].sort((a, b) => a - b)).toEqual(darkTones);
  });

  it('gives readable text on its surfaces (WCAG AA)', () => {
    for (const s of [light, dark]) {
      expect(contrastRatio(s.onPrimary, s.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSurface, s.surface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(s.onSurfaceVariant, s.surfaceContainerHigh)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onSecondaryContainer, s.secondaryContainer)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onErrorContainer, s.errorContainer)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('paletteFor (M3 roles → MUI palette)', () => {
  it('maps the main MUI slots to M3 roles', () => {
    const s = m3Scheme(SEED, false);
    const p = paletteFor(s, false);
    expect(p.primary).toEqual({ main: s.primary, contrastText: s.onPrimary });
    expect(p.secondary).toEqual({ main: s.secondary, contrastText: s.onSecondary });
    expect(p.error).toEqual({ main: s.error, contrastText: s.onError });
    expect(p.text.primary).toBe(s.onSurface);
    expect(p.text.secondary).toBe(s.onSurfaceVariant);
    expect(p.divider).toBe(s.outlineVariant);
    expect(p.background.paper).toBe(s.surfaceContainerLowest);
    expect(p.m3).toBe(s);
  });

  it('uses M3 state-layer opacities for hover and selection', () => {
    const s = m3Scheme(SEED, false);
    const p = paletteFor(s, false);
    expect(p.action.hover).toBe(withAlpha(s.onSurface, 0.08));
    expect(p.action.focus).toBe(withAlpha(s.onSurface, 0.1));
  });

  it('lightens fixed semantic colours in dark mode so they stay readable', () => {
    const d = m3Scheme(SEED, true);
    const p = paletteFor(d, true);
    expect(contrastRatio(p.kx.live, d.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.kx.success, d.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
