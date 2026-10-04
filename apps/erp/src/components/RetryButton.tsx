'use client';

import Refresh from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outlined"
      startIcon={<Refresh />}
      disabled={pending}
      onClick={() => {
        onRetry?.();
        start(() => router.refresh());
      }}
    >
      {pending ? 'Trying again…' : 'Try again'}
    </Button>
  );
}
