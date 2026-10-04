'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useI18n } from '@/i18n/client';
import { BANDS } from '@/lib/results';

/**
 * How the class did: one bar per score band, a single series in the primary colour. Bars are
 * anchored to the baseline with rounded tops; the count sits above each bar that has students,
 * and hovering a band names it. The marks table below is the full data.
 */
export function Distribution({ bands, total }: { bands: { label: string; count: number }[]; total: number }) {
  const { t } = useI18n();
  const name = (label: string) => (label === BANDS[0].label ? t('results.band.below40') : label);
  const max = Math.max(1, ...bands.map((b) => b.count));
  const H = 160;
  return (
    <Box data-testid="distribution" role="img" aria-label={t('results.chartLabel', { bands: bands.map((b) => `${name(b.label)}: ${b.count}`).join(', ') })}>
      <Box sx={{ position: 'relative', height: H + 24, display: 'grid', gridTemplateColumns: `repeat(${bands.length}, 1fr)`, gap: '2px', alignItems: 'end', px: 0.5 }}>
        {/* Recessive gridlines at half and full scale */}
        {[0.5, 1].map((f) => (
          <Box key={f} aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: H * f, borderTop: 1, borderColor: 'm3.outlineVariant', borderStyle: 'dashed', opacity: 0.6 }} />
        ))}
        {bands.map((b) => (
          <Tooltip key={b.label} title={`${t.plural('results.bandTip', b.count, { band: name(b.label) })}${total ? ` (${Math.round((b.count / total) * 100)}%)` : ''}`} placement="top" followCursor>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default', '&:hover .kx-bar': { bgcolor: 'primary.dark' } }} data-band={b.label} data-count={b.count}>
              {b.count > 0 && (
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary', fontWeight: 500, mb: 0.5 }}>
                  {b.count}
                </Typography>
              )}
              <Box
                className="kx-bar"
                sx={{
                  width: '100%',
                  maxWidth: 56,
                  height: b.count ? Math.max(4, (b.count / max) * H) : 2,
                  bgcolor: b.count ? 'primary.main' : 'm3.outlineVariant',
                  borderRadius: b.count ? '4px 4px 0 0' : 1,
                  transition: 'background-color 120ms',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'm3.outline', display: 'grid', gridTemplateColumns: `repeat(${bands.length}, 1fr)`, gap: '2px', pt: 0.75, px: 0.5 }}>
        {bands.map((b) => (
          <Typography key={b.label} variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.2, fontSize: { xs: '0.625rem', sm: '0.75rem' } }}>
            {name(b.label)}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
