'use client';

import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';

/** Library courses are drafted, then checked by a subject expert; unreviewed ones say so. */
export function ReviewChip({ reviewed }: { reviewed: boolean }) {
  return reviewed ? (
    <Chip size="small" icon={<VerifiedOutlined />} label="Reviewed" sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer', '& .MuiChip-icon': { color: 'inherit' } }} />
  ) : (
    <Tooltip title="Not yet checked by a subject expert. Compare it with your university syllabus before relying on it.">
      <Chip
        size="small"
        icon={<RateReviewOutlined />}
        label="Not reviewed"
        variant="outlined"
        data-testid="unreviewed"
        sx={{ borderColor: 'kx.live', color: 'kx.onLiveContainer', '& .MuiChip-icon': { color: 'kx.live' } }}
      />
    </Tooltip>
  );
}
