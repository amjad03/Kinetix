import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'live' | 'ai';

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'm3.surfaceContainer', fg: 'm3.onSurfaceVariant', dot: 'm3.outline' },
  info: { bg: 'm3.primaryContainer', fg: 'm3.onPrimaryContainer', dot: 'm3.primary' },
  success: { bg: 'kx.successContainer', fg: 'kx.onSuccessContainer', dot: 'kx.success' },
  warning: { bg: 'kx.warningContainer', fg: 'kx.onWarningContainer', dot: 'kx.warning' },
  danger: { bg: 'm3.errorContainer', fg: 'm3.onErrorContainer', dot: 'm3.error' },
  live: { bg: 'kx.liveContainer', fg: 'kx.onLiveContainer', dot: 'kx.live' },
  ai: { bg: 'm3.tertiaryContainer', fg: 'm3.onTertiaryContainer', dot: 'm3.tertiary' },
};

/**
 * A status pill: a coloured dot and a word. Colour is never the only signal; the label always says it.
 * Pass `icon` instead of the dot when an icon helps (it is hidden from screen readers).
 */
export function StatusPill({ tone = 'neutral', children, icon, testId, title }: { tone?: Tone; children: ReactNode; icon?: ReactNode; testId?: string; title?: string }) {
  const c = TONES[tone];
  return (
    <Box
      component="span"
      data-testid={testId}
      data-tone={tone}
      title={title}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, height: 24, borderRadius: 999, bgcolor: c.bg, color: c.fg, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}
    >
      {icon ? (
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', '& svg': { fontSize: 14 } }}>
          {icon}
        </Box>
      ) : (
        <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: c.dot, flexShrink: 0 }} />
      )}
      {children}
    </Box>
  );
}

/** A small count, for nav items and tabs ("12 pending"). Zero renders nothing unless `showZero`. */
export function CountBadge({ count, tone = 'info', label, showZero }: { count: number; tone?: Tone; label?: string; showZero?: boolean }) {
  if (count === 0 && !showZero) return null;
  const c = TONES[tone];
  return (
    <Box
      component="span"
      aria-label={label ? `${count} ${label}` : undefined}
      sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 20, px: 0.75, borderRadius: 10, bgcolor: c.bg, color: c.fg, fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
    >
      {count > 999 ? '999+' : count}
    </Box>
  );
}
