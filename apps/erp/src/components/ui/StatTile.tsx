import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import Remove from '@mui/icons-material/Remove';
import Box from '@mui/material/Box';
import MuiCard from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { LinkBox } from './LinkBox';
import type { ReactNode } from 'react';

export interface Trend {
  /** Change versus the comparison period: a percentage (or points); null when there is nothing to compare. */
  delta: number | null;
  /** What the change is measured against, already translated ("vs last month"). */
  label?: string;
  /** Which direction is good news (default up). A rise in overdue fees is bad. */
  goodWhen?: 'up' | 'down';
  /** Suffix after the number; default %. */
  suffix?: string;
}

/** A change pill: arrow, signed number and what it is against. Direction is shown by the arrow and the sign, not only colour. */
export function TrendPill({ delta, label, goodWhen = 'up', suffix = '%' }: Trend) {
  if (delta === null) return null;
  const flat = delta === 0;
  const up = delta > 0;
  const good = flat ? null : up === (goodWhen === 'up');
  const Icon = flat ? Remove : up ? ArrowUpward : ArrowDownward;
  const shown = `${up ? '+' : ''}${Math.round(delta * 10) / 10}${suffix}`;
  return (
    <Box component="span" data-trend={flat ? 'flat' : up ? 'up' : 'down'} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: '0.75rem', fontWeight: 600, color: good === null ? 'text.secondary' : good ? 'kx.success' : 'error.main' }}>
      <Icon aria-hidden sx={{ fontSize: 14 }} />
      {shown}
      {label && (
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 0.5 }}>
          {label}
        </Box>
      )}
    </Box>
  );
}

/**
 * A KPI tile: label, one big number, a trend, one line of context and an optional small bar or chart.
 * With `href` the whole tile is a link.
 */
export function StatTile({
  label,
  value,
  unit,
  caption,
  icon,
  bar,
  trend,
  spark,
  tone = 'default',
  href,
  testId,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  bar?: ReactNode;
  trend?: Trend;
  spark?: ReactNode;
  tone?: 'default' | 'warning' | 'live';
  href?: string;
  testId?: string;
}) {
  const body = (
    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', minHeight: 24 }}>
        {icon && (
          <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '10px', bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer', '& svg': { fontSize: 18 } }}>
            {icon}
          </Box>
        )}
        <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
      {/* Wraps the unit ("4 of 7 topics") under the number when the tile is narrow, instead of clipping it. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75, mt: 1.5, minWidth: 0 }}>
        <Typography
          component="p"
          sx={{ fontSize: '1.875rem', lineHeight: '40px', fontWeight: 600, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', color: tone === 'warning' ? 'error.main' : tone === 'live' ? 'kx.live' : 'text.primary' }}
        >
          {value}
        </Typography>
        {unit && (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {unit}
          </Typography>
        )}
        {trend && (
          <Box sx={{ ml: 'auto', pl: 1 }}>
            <TrendPill {...trend} />
          </Box>
        )}
      </Box>
      {spark && <Box sx={{ mt: 1 }}>{spark}</Box>}
      {bar && <Box sx={{ mt: 1.25 }}>{bar}</Box>}
      {caption && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: bar || spark ? 1 : 0.5 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
  return (
    <MuiCard data-testid={testId} sx={{ height: '100%', position: 'relative', ...(href && { transition: 'border-color 150ms', '&:hover': { borderColor: 'm3.primary' } }) }}>
      {href ? (
        <LinkBox href={href} sx={{ display: 'block', height: '100%', color: 'inherit', textDecoration: 'none', borderRadius: 'inherit' }}>
          {body}
        </LinkBox>
      ) : (
        body
      )}
    </MuiCard>
  );
}

export function StatGrid({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return <Box sx={{ display: 'grid', gap: 2, mb: 3, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</Box>;
}
