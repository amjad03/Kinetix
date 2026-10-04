import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/** A thin rounded bar. `value` 0–100. */
export function MiniBar({ value, color = 'primary.main', width = '100%', label }: { value: number; color?: string; width?: number | string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <Box role="img" aria-label={label ?? `${Math.round(v)}%`} sx={{ width, height: 6, borderRadius: 3, bgcolor: 'm3.surfaceContainerHighest', overflow: 'hidden' }}>
      <Box sx={{ width: `${v}%`, height: '100%', bgcolor: color, borderRadius: 3 }} />
    </Box>
  );
}

/** Percentage with a small bar, for table cells. */
export function RateCell({ rate }: { rate: number | null }) {
  if (rate === null)
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  const color = rate >= 90 ? 'kx.success' : rate >= 75 ? 'primary.main' : 'error.main';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }}>
      <MiniBar value={rate} color={color} width={88} />
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'right' }}>
        {rate.toFixed(1)}%
      </Typography>
    </Box>
  );
}

/** Stacked bar of parts (e.g. taught / live / missed / upcoming), with an accessible summary. */
export function SegmentBar({ parts, label }: { parts: { value: number; color: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <Box role="img" aria-label={label} sx={{ display: 'flex', gap: '2px', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'm3.surfaceContainerHighest' }}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p, i) => <Box key={i} sx={{ flex: p.value, bgcolor: p.color }} />)}
    </Box>
  );
}
