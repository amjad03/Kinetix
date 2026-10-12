'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/shadcn/button';
import { useI18n } from '@/i18n/client';

export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        onRetry?.();
        start(() => router.refresh());
      }}
    >
      <RefreshCw className={pending ? 'animate-spin' : undefined} />
      {pending ? t('common.tryingAgain') : t('common.tryAgain')}
    </Button>
  );
}
