'use client';

import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Tooltip from '@mui/material/Tooltip';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';

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
