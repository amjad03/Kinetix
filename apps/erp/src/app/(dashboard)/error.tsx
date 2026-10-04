'use client';

import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import Refresh from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';

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
