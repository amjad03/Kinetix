'use client';

import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useI18n } from '@/i18n/client';

/**
 * A lesson plan's "AI draft" label and review status. A client component: chips with icons (and
 * tooltips) clone their children, which server-rendered elements do not survive in hydration.
 */
export function LessonPlanBadges({ aiDrafted, reviewedAt, reviewedBy }: { aiDrafted: boolean; reviewedAt: string | null; reviewedBy?: string | null }) {
  const { t, fmt } = useI18n();
  const date = reviewedAt ? fmt.dateTime(reviewedAt, undefined, false) : '';
  return (
    <>
      {aiDrafted && (
        <Tooltip title={t('plan.lesson.aiDraftHelp')}>
          <Chip size="small" icon={<AutoAwesomeOutlined />} label={t('plan.lesson.aiDraft')} variant="outlined" data-testid="ai-draft" sx={{ '& .MuiChip-icon': { color: 'primary.main' } }} />
        </Tooltip>
      )}
      {reviewedAt ? (
        <Chip
          size="small"
          icon={<VerifiedOutlined />}
          label={reviewedBy ? t('plan.lesson.reviewedBy', { date, name: reviewedBy }) : t('plan.lesson.reviewed', { date })}
          data-testid="review-status"
          sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer', '& .MuiChip-icon': { color: 'inherit' }, maxWidth: '100%' }}
        />
      ) : (
        <Chip size="small" label={t('plan.lesson.notReviewed')} variant="outlined" data-testid="review-status" sx={{ color: 'text.secondary' }} />
      )}
    </>
  );
}
