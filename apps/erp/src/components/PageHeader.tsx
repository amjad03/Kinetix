import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, minHeight: 48 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
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
      <Typography variant="h6" component="h2" id={id} sx={{ fontSize: '1.125rem', lineHeight: '24px' }}>
        {children}
      </Typography>
      {action}
    </Box>
  );
}
