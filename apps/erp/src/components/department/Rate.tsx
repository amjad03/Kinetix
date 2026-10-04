import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MiniBar } from '@/components/Bars';
import { formatPercent, TONE_COLOR, toneOf, type THRESHOLDS } from '@/lib/department';

/**
 * A percentage for a table cell, with a small bar; low values are red with an icon, so they read
 * without colour too. `detail` is a second line ("12 of 15").
 */
export function Rate({ value, kind, detail, testId }: { value: number | null; kind: keyof typeof THRESHOLDS; detail?: string; testId?: string }) {
  const tone = toneOf(value, kind);
  if (tone === 'none')
    return (
      <Typography variant="body2" color="text.secondary" data-testid={testId} data-tone="none">
        —
      </Typography>
    );
  const low = tone === 'low';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: 'flex-end' }} data-testid={testId} data-tone={tone}>
      <Box sx={{ width: { xs: 40, md: 64 } }}>
        <MiniBar value={value ?? 0} color={TONE_COLOR[tone]} />
      </Box>
      <Box sx={{ minWidth: 64, textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: low ? 'error.main' : 'text.primary', fontWeight: low ? 500 : 400, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          {low && <ErrorOutline sx={{ fontSize: 16 }} aria-label="Low" />}
          {formatPercent(value)}
        </Typography>
        {detail && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: '16px' }}>
            {detail}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
