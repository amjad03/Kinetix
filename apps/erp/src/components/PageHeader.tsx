import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** The title row every page starts with: one h1, a line of context and the page's primary actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, minHeight: 48 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.375rem', md: '1.625rem' }, lineHeight: 1.25, fontWeight: 600, letterSpacing: '-0.2px' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

export function SectionTitle({ children, action, id, flush }: { children: ReactNode; action?: ReactNode; id?: string; flush?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: flush ? 0 : 4, mb: 1.5, minHeight: 36 }}>
      <Typography variant="h6" component="h2" id={id} sx={{ fontSize: '1.0625rem', lineHeight: '24px', fontWeight: 600 }}>
        {children}
      </Typography>
      {action}
    </Box>
  );
}
