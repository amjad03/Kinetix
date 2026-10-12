'use client';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';

import { Tooltip } from '@/components/kx';
import { BadgeCheck as VerifiedOutlined, MessageSquareText as RateReviewOutlined } from 'lucide-react';
/** Library courses are drafted, then checked by a subject expert; unreviewed ones say so. */
export function ReviewChip({ reviewed }: { reviewed: boolean }) {
  const { t } = useI18n();
  return reviewed ? (
    <StatusPill tone="success" icon={<VerifiedOutlined />}>
      {t('syl.reviewed')}
    </StatusPill>
  ) : (
    <Tooltip title={t('syl.notReviewedTip')}>
      <span tabIndex={0} data-testid="unreviewed">
        <StatusPill tone="warning" icon={<RateReviewOutlined />}>
          {t('syl.notReviewed')}
        </StatusPill>
      </span>
    </Tooltip>
  );
}
