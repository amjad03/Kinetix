import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** A Google-admin-style stat tile: label, one big number, one line of context, an optional small bar. */
export function StatTile({
  label,
  value,
  unit,
  caption,
  icon,
  bar,
  tone = 'default',
  testId,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  bar?: ReactNode;
  tone?: 'default' | 'warning' | 'live';
  testId?: string;
}) {
  return (
    <Card data-testid={testId} sx={{ height: '100%' }}>
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', minHeight: 24 }}>
          {icon && <Box sx={{ display: 'flex', '& svg': { fontSize: 20 } }}>{icon}</Box>}
          <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary' }} noWrap>
            {label}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 1.5 }}>
          <Typography
            component="p"
            sx={{
              fontSize: '2rem',
              lineHeight: '40px',
              fontWeight: 400,
              fontVariantNumeric: 'tabular-nums',
              color: tone === 'warning' ? 'error.main' : tone === 'live' ? 'kx.live' : 'text.primary',
            }}
          >
            {value}
          </Typography>
          {unit && (
            <Typography variant="body2" color="text.secondary" component="span">
              {unit}
            </Typography>
          )}
        </Box>
        {bar && <Box sx={{ mt: 1.25 }}>{bar}</Box>}
        {caption && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: bar ? 1 : 0.5 }}>
            {caption}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

export function StatGrid({ children, min = 160 }: { children: ReactNode; min?: number }) {
  return <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</Box>;
}
