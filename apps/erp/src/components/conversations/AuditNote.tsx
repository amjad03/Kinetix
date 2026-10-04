import PolicyOutlined from '@mui/icons-material/PolicyOutlined';
import Alert from '@mui/material/Alert';
import type { ReactNode } from 'react';

/** The safeguarding notice: leaders may read threads, and every reading is recorded. */
export function AuditNote({ children }: { children: ReactNode }) {
  return (
    <Alert severity="info" icon={<PolicyOutlined />} sx={{ mb: 2.5, borderRadius: '12px' }} data-testid="audit-note">
      {children}
    </Alert>
  );
}
