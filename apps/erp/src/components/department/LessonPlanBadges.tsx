'use client';

import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Tooltip from '@mui/material/Tooltip';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** A lesson plan's "AI draft" label (marigold: it is AI) and review status. */
export function LessonPlanBadges({ aiDrafted, reviewedAt, reviewedBy }: { aiDrafted: boolean; reviewedAt: string | null; reviewedBy?: string | null }) {
  const { t, fmt } = useI18n();
  const date = reviewedAt ? fmt.dateTime(reviewedAt, undefined, false) : '';
  return (
    <>
      {aiDrafted && (
        <Tooltip title={t('plan.lesson.aiDraftHelp')}>
          <span tabIndex={0}>
            <StatusPill tone="ai" icon={<AutoAwesomeOutlined />} testId="ai-draft">
              {t('plan.lesson.aiDraft')}
            </StatusPill>
          </span>
        </Tooltip>
      )}
      {reviewedAt ? (
        <StatusPill tone="success" icon={<VerifiedOutlined />} testId="review-status">
          {reviewedBy ? t('plan.lesson.reviewedBy', { date, name: reviewedBy }) : t('plan.lesson.reviewed', { date })}
        </StatusPill>
      ) : (
        <StatusPill tone="neutral" testId="review-status">
          {t('plan.lesson.notReviewed')}
        </StatusPill>
      )}
    </>
  );
}
