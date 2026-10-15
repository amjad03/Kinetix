import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

/** ZYNETIX seed colour, a deep trustworthy blue (mirrors `Kx.seed` in zynetix_ui). */
export const SEED = '#1D4ED8';

/**
 * The light scheme's hand-tuned roles (mirrors `ZynetixTheme.lightScheme` in zynetix_ui and
 * tokens.css): white cards on a soft cool-grey ground, near-black for the one strong action, teal for
 * focus and charts, amber (tertiary) for AI. Every text pair is WCAG AA (scheme.test.ts).
 */
export const BRAND_LIGHT: Partial<M3Scheme> = {
  primary: '#18181b',
  onPrimary: '#ffffff',
  primaryContainer: '#e3f5f2',
  onPrimaryContainer: '#0f5e57',
  secondary: '#475569',
  onSecondary: '#ffffff',
  secondaryContainer: '#f3f3f5',
  onSecondaryContainer: '#18181b',
  tertiary: '#a35c06',
  onTertiary: '#ffffff',
  tertiaryContainer: '#fdf2d6',
  onTertiaryContainer: '#5a2a00',
  error: '#b91c1c',
  onError: '#ffffff',
  errorContainer: '#fde6e6',
  onErrorContainer: '#7f1d1d',
  surface: '#f7f7f8',
  onSurface: '#18181b',
  surfaceVariant: '#ededf0',
  onSurfaceVariant: '#5d5e66',
  surfaceDim: '#e4e4e7',
  surfaceBright: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#fafafb',
  surfaceContainer: '#f3f3f5',
  surfaceContainerHigh: '#ededf0',
  surfaceContainerHighest: '#e4e4e7',
  inverseSurface: '#18181b',
  inverseOnSurface: '#f4f4f5',
  inversePrimary: '#5eead4',
  outline: '#8b8c94',
  outlineVariant: '#ececee',
};

/** The dark scheme: the same roles on a deep blue-black ground. */
export const BRAND_DARK: Partial<M3Scheme> = {
  primary: '#f4f4f5',
  onPrimary: '#18181b',
  primaryContainer: '#173b38',
  onPrimaryContainer: '#5eead4',
  secondary: '#cbd5e1',
  onSecondary: '#1e293b',
  secondaryContainer: '#1e1e23',
  onSecondaryContainer: '#f4f4f5',
  tertiary: '#fcd34d',
  onTertiary: '#2b1b00',
  tertiaryContainer: '#3b2f12',
  onTertiaryContainer: '#fcd34d',
  error: '#fca5a5',
  onError: '#450a0a',
  errorContainer: '#3a1c1e',
  onErrorContainer: '#fca5a5',
  surface: '#0c0c0e',
  onSurface: '#f4f4f5',
  surfaceVariant: '#26262c',
  onSurfaceVariant: '#a6a6b0',
  surfaceDim: '#0c0c0e',
  surfaceBright: '#34343b',
  surfaceContainerLowest: '#09090b',
  surfaceContainerLow: '#151518',
  surfaceContainer: '#1a1a1e',
  surfaceContainerHigh: '#1e1e23',
  surfaceContainerHighest: '#26262c',
  inverseSurface: '#f4f4f5',
  inverseOnSurface: '#18181b',
  inversePrimary: '#0f766e',
  outline: '#7c7c86',
  outlineVariant: '#26262c',
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

/** The ZYNETIX scheme: generated from [SEED], with the brand's hand-tuned roles on top. */
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
