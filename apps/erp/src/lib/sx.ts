// Runtime helpers for the few style values computed at render time (static ones are Tailwind classes).

const PAL: Record<string, string> = {
  'text.secondary': 'var(--muted-foreground)', 'text.primary': 'var(--foreground)', 'text.disabled': 'var(--faint)',
  divider: 'var(--border)', 'm3.outlineVariant': 'var(--border)', 'm3.outline': 'var(--border-strong)',
  'primary.main': 'var(--teal)', primary: 'var(--teal)', 'm3.primary': 'var(--teal)',
  'error.main': 'var(--destructive)', error: 'var(--destructive)', 'success.main': 'var(--green-ink)', 'kx.success': 'var(--green-ink)', success: 'var(--green-ink)',
  'warning.main': 'var(--amber-ink)', 'kx.warning': 'var(--amber-ink)', warning: 'var(--amber-ink)', 'info.main': 'var(--blue-ink)', info: 'var(--blue-ink)',
  'kx.live': 'var(--orange)', 'kx.liveContainer': 'var(--orange-soft)', 'kx.onLiveContainer': 'var(--orange-ink)',
  'kx.successContainer': 'var(--green-soft)', 'kx.onSuccessContainer': 'var(--green-ink)', 'kx.warningContainer': 'var(--amber-soft)', 'kx.onWarningContainer': 'var(--amber-ink)',
  'm3.errorContainer': 'var(--red-soft)', 'm3.onErrorContainer': 'var(--red-ink)', 'm3.primaryContainer': 'var(--teal-soft)', 'm3.onPrimaryContainer': 'var(--teal-ink)',
  'm3.secondaryContainer': 'var(--secondary)', 'm3.onSecondaryContainer': 'var(--secondary-foreground)', 'm3.tertiary': 'var(--amber-ink)',
  'm3.surfaceContainerHighest': 'var(--accent)', 'm3.surfaceContainerHigh': 'var(--accent)', 'm3.surfaceContainer': 'var(--muted)', 'm3.surfaceContainerLow': 'var(--muted)', 'm3.surfaceContainerLowest': 'var(--card)',
  'm3.onSurface': 'var(--foreground)', 'm3.onSurfaceVariant': 'var(--muted-foreground)',
  'kx.frame': 'var(--background)', 'kx.pane': 'var(--card)', 'kx.tonal': 'var(--muted)', 'background.paper': 'var(--card)', 'background.default': 'var(--background)',
  'action.hover': 'var(--accent)', 'action.selected': 'var(--teal-soft)', 'common.white': '#fff',
};

/** A palette name ('text.secondary', 'kx.success') as a CSS colour; other strings pass through. */
export function pal(v: unknown): string | undefined {
  return typeof v === 'string' ? (PAL[v] ?? v) : (v as undefined);
}
/** Spacing units (8 px) to CSS. */
export function sp(v: unknown): string | undefined {
  return typeof v === 'number' ? `${v * 8}px` : (v as string | undefined);
}
/** A size: a fraction is a percentage, any other number pixels. */
export function size(v: unknown): string | undefined {
  return typeof v === 'number' ? (v > 0 && v <= 1 ? `${v * 100}%` : `${v}px`) : (v as string | undefined);
}
/** Corner radius in units of 10 px. */
export function radius(v: unknown): string | undefined {
  return typeof v === 'number' ? `${v * 10}px` : (v as string | undefined);
}
