'use client';

import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useI18n } from '@/i18n/client';

/** Library courses are drafted, then checked by a subject expert; unreviewed ones say so. */
export function ReviewChip({ reviewed }: { reviewed: boolean }) {
  const { t } = useI18n();
  return reviewed ? (
    <Chip size="small" icon={<VerifiedOutlined />} label={t('syl.reviewed')} sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer', '& .MuiChip-icon': { color: 'inherit' } }} />
  ) : (
    <Tooltip title={t('syl.notReviewedTip')}>
      <Chip
        size="small"
        icon={<RateReviewOutlined />}
        label={t('syl.notReviewed')}
        variant="outlined"
        data-testid="unreviewed"
        sx={{ borderColor: 'kx.live', color: 'kx.onLiveContainer', '& .MuiChip-icon': { color: 'kx.live' } }}
      />
    </Tooltip>
  );
}
