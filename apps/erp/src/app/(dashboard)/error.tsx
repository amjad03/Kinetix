'use client';

import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import Refresh from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import { EmptyState } from '@/components/States';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<ErrorOutline />}
      title="Something went wrong"
      testId="error-state"
      actions={
        <Button variant="outlined" startIcon={<Refresh />} onClick={() => reset()}>
          Try again
        </Button>
      }
    >
      This page couldn&apos;t be shown. Try again; if it keeps happening, tell your KINETIX administrator.
    </EmptyState>
  );
}
