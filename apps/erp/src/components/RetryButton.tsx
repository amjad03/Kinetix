'use client';

import Refresh from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useI18n } from '@/i18n/client';

export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
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
      {pending ? t('common.tryingAgain') : t('common.tryAgain')}
    </Button>
  );
}
