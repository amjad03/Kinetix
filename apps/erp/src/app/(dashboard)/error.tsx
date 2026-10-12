'use client';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';

import { Button } from '@/components/kx';
import { CircleAlert as ErrorOutline, RefreshCw as Refresh } from 'lucide-react';
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<ErrorOutline />}
      title={t('state.somethingWrong')}
      testId="error-state"
      actions={
        <Button variant="outlined" startIcon={<Refresh />} onClick={() => reset()}>
          {t('common.tryAgain')}
        </Button>
      }
    >
      {t('state.pageFailed')}
    </EmptyState>
  );
}
