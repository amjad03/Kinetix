'use client';

import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** Published (green, with the date) or Draft (neutral): families see published marks only. */
export function PublishedChip({ publishedAt }: { publishedAt: string | null }) {
  const { t, fmt } = useI18n();
  if (publishedAt)
    return (
      <span data-status="published">
        <StatusPill tone="success">{t('results.published', { date: fmt.dateTime(publishedAt, undefined, false) })}</StatusPill>
      </span>
    );
  return (
    <span data-status="draft">
      <StatusPill tone="neutral">{t('results.draft')}</StatusPill>
    </span>
  );
}
