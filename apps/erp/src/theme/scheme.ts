import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

/** KINETIX seed colour, a deep trustworthy blue (mirrors `Kx.seed` in kinetix_ui). */
export const SEED = '#1D4ED8';

/**
 * The light scheme's hand-tuned roles (mirrors `KinetixTheme.lightScheme` in kinetix_ui and
 * tokens.css): white cards on a soft cool-grey ground, deep blue for the one strong action and
 * marigold (tertiary) for AI only. Every text pair is WCAG AA (scheme.test.ts).
 */
export const BRAND_LIGHT: Partial<M3Scheme> = {
  primary: '#1d4ed8',
  onPrimary: '#ffffff',
  primaryContainer: '#dbe6ff',
  onPrimaryContainer: '#0b2a7a',
  secondary: '#475569',
  onSecondary: '#ffffff',
  secondaryContainer: '#e3eafa',
  onSecondaryContainer: '#0f2a5c',
  tertiary: '#8f5b00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffe2a8',
  onTertiaryContainer: '#2b1b00',
  error: '#b3261e',
  onError: '#ffffff',
  errorContainer: '#fde3e1',
  onErrorContainer: '#5c0a06',
  surface: '#f3f6fb',
  onSurface: '#0f172a',
  surfaceVariant: '#e0e6f0',
  onSurfaceVariant: '#475569',
  surfaceDim: '#d8dfeb',
  surfaceBright: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eef2f8',
  surfaceContainer: '#e8edf5',
  surfaceContainerHigh: '#e0e6f0',
  surfaceContainerHighest: '#d8dfeb',
  inverseSurface: '#1e293b',
  inverseOnSurface: '#eef2f8',
  inversePrimary: '#9db8ff',
  outline: '#64748b',
  outlineVariant: '#d5dde9',
};

/** The dark scheme: the same roles on a deep blue-black ground. */
export const BRAND_DARK: Partial<M3Scheme> = {
  primary: '#9db8ff',
  onPrimary: '#0a2463',
  primaryContainer: '#1f3e8f',
  onPrimaryContainer: '#dbe6ff',
  secondary: '#b7c4dd',
  onSecondary: '#1e2b45',
  secondaryContainer: '#26385c',
  onSecondaryContainer: '#dce6fa',
  tertiary: '#ffc25e',
  onTertiary: '#2b1b00',
  tertiaryContainer: '#5e3f00',
  onTertiaryContainer: '#ffe2a8',
  error: '#ffb4ab',
  onError: '#5c0a06',
  errorContainer: '#7a1a14',
  onErrorContainer: '#ffdad6',
  surface: '#0b1220',
  onSurface: '#e2e8f5',
  surfaceVariant: '#26334c',
  onSurfaceVariant: '#a9b5ca',
  surfaceDim: '#0b1220',
  surfaceBright: '#26334c',
  surfaceContainerLowest: '#080d18',
  surfaceContainerLow: '#111a2c',
  surfaceContainer: '#162137',
  surfaceContainerHigh: '#1d2940',
  surfaceContainerHighest: '#26334c',
  inverseSurface: '#e2e8f5',
  inverseOnSurface: '#1e293b',
  inversePrimary: '#1d4ed8',
  outline: '#7d8ba3',
  outlineVariant: '#2e3b55',
};

/** Material 3 colour roles that the dashboard uses. */
export const M3_ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'outline',
  'outlineVariant',
  'shadow',
  'scrim',
] as const;

export type M3Role = (typeof M3_ROLES)[number];
export type M3Scheme = Record<M3Role, string>;

/**
 * The same algorithm as Flutter's `ColorScheme.fromSeed` (Material dynamic colour, TonalSpot
 * variant, standard contrast), so the dashboard matches the Board and the mobile apps.
 */
export function m3Scheme(seed: string = SEED, dark = false): M3Scheme {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
  const out = {} as M3Scheme;
  for (const role of M3_ROLES) out[role] = hexFromArgb(MaterialDynamicColors[role].getArgb(scheme));
  return out;
}

/** The KINETIX scheme: generated from [SEED], with the brand's hand-tuned roles on top. */
export function brandScheme(dark = false): M3Scheme {
  return { ...m3Scheme(SEED, dark), ...(dark ? BRAND_DARK : BRAND_LIGHT) };
}

/** Fixed semantic colours from the design system. They do not follow the theme. */
export const SEMANTIC = {
  live: '#E8710A',
  record: '#D93025',
  success: '#15803D',
  warning: '#B45309',
} as const;

/** `#rrggbb` → `rgba(r, g, b, a)`; used for M3 state layers. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** WCAG relative luminance contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
