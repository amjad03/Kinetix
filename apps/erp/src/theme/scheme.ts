import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

/** KINETIX seed colour, chalkboard green (mirrors `Kx.seed` in kinetix_ui). */
export const SEED = '#16805A';

/**
 * The light scheme's hand-tuned roles (mirrors `KinetixTheme.lightScheme` in kinetix_ui and
 * tokens.css): quiet, nearly neutral surfaces, the brand green `#006545` and marigold for AI.
 */
export const BRAND_LIGHT: Partial<M3Scheme> = {
  primary: '#006545',
  onPrimary: '#ffffff',
  primaryContainer: '#b4f0d2',
  onPrimaryContainer: '#002114',
  secondary: '#4d6357',
  secondaryContainer: '#d3e8da',
  onSecondaryContainer: '#0e1f16',
  tertiary: '#835400',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffddb5',
  onTertiaryContainer: '#2a1800',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',
  surface: '#f4f7f4',
  onSurface: '#171d19',
  onSurfaceVariant: '#4e5852',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f0f4f0',
  surfaceContainer: '#ecf1ec',
  surfaceContainerHigh: '#e4eae4',
  surfaceContainerHighest: '#dee4de',
  inverseSurface: '#2c322e',
  inverseOnSurface: '#edf2ec',
  inversePrimary: '#8dd7b1',
  outline: '#707973',
  outlineVariant: '#d7ded8',
};

/** Marigold for AI in the dark scheme (as `KinetixTheme.dark` in kinetix_ui). */
const BRAND_DARK: Partial<M3Scheme> = { tertiary: '#ffb95c' };

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
  success: '#188038',
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
