import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { RetryButton } from './RetryButton';

/** Calm, helpful empty state: icon in a tonal circle, a title, one line of help, and next steps. */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  dense,
  testId,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        textAlign: 'center',
        py: dense ? 4 : 7,
        px: 3,
        border: 1,
        borderColor: 'm3.outlineVariant',
        borderRadius: '12px',
        borderStyle: 'dashed',
      }}
    >
      <Box
        sx={{
          width: dense ? 48 : 64,
          height: dense ? 48 : 64,
          mx: 'auto',
          mb: 2,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'm3.secondaryContainer',
          color: 'm3.onSecondaryContainer',
          '& svg': { fontSize: dense ? 24 : 32 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" component="p">
        {title}
      </Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5, maxWidth: 460, mx: 'auto' }}>
          {children}
        </Typography>
      )}
      {actions && <Box sx={{ mt: 2.5, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

export function ErrorState({ message, title = "Couldn't load this page" }: { message: string; title?: string }) {
  return (
    <EmptyState icon={<CloudOffOutlined />} title={title} actions={<RetryButton />} testId="error-state">
      {message}
    </EmptyState>
  );
}
