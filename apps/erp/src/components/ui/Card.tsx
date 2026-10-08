import Box from '@mui/material/Box';
import MuiCard from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';

/**
 * A white card on the cool-grey ground: an optional header (title, subtitle, one action) and a body.
 * It is a labelled region when it has a title, so screen readers can jump between cards.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  padded = true,
  tone = 'default',
  sx,
  testId,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** false: the body runs edge to edge (tables, lists). */
  padded?: boolean;
  /** `ai` tints the card marigold; use only for AI content. */
  tone?: 'default' | 'ai' | 'tonal';
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  const id = useId();
  return (
    <MuiCard
      component="section"
      aria-labelledby={title ? id : undefined}
      data-testid={testId}
      sx={[
        { display: 'flex', flexDirection: 'column', minWidth: 0 },
        tone === 'ai' && { bgcolor: 'm3.tertiaryContainer', borderColor: 'transparent', color: 'm3.onTertiaryContainer' },
        tone === 'tonal' && { bgcolor: 'kx.tonal' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2.5, pt: 2, pb: padded ? 0.5 : 1.5, minHeight: 48 }}>
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography id={id} variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: '24px' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" component="p" sx={{ color: tone === 'ai' ? 'inherit' : 'text.secondary' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>{action}</Box>}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0, ...(padded ? { px: 2.5, pb: 2.5, pt: title || action ? 1 : 2.5 } : {}) }}>{children}</Box>
    </MuiCard>
  );
}
