'use client';

import Chip from '@mui/material/Chip';
import { useI18n } from '@/i18n/client';

/** Published (green, with the date) or Draft (outlined): families see published marks only. */
export function PublishedChip({ publishedAt }: { publishedAt: string | null }) {
  const { t, fmt } = useI18n();
  if (publishedAt)
    return (
      <Chip
        size="small"
        label={t('results.published', { date: fmt.dateTime(publishedAt, undefined, false) })}
        sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' }}
        data-status="published"
      />
    );
  return <Chip size="small" label={t('results.draft')} variant="outlined" sx={{ color: 'text.secondary' }} data-status="draft" />;
}
