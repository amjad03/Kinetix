'use client';

import { useI18n } from '@/i18n/client';
import { StatusPill } from '@/components/ui';

/** "Live" as a pill in the fixed live colour. */
export function LiveChip({ label }: { label?: string }) {
  const { t } = useI18n();
  return <StatusPill tone="live">{label ?? t('live.live')}</StatusPill>;
}
