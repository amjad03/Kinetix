'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { reviewStory } from '@/app/(dashboard)/alumni/actions';
import { Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Col } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { StoryRow } from '@/lib/pathways-a';

const STATUSES = ['submitted', 'published', 'rejected'] as const;

/** The alumni office's queue of success stories written by alumni: read, publish (optionally featured) or send back. */
export function SuccessStoriesQueue({ stories }: { stories: StoryRow[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('submitted');
  const [review, setReview] = useState<StoryRow | null>(null);
  const rows = stories.filter((s) => s.status === status);

  const cols: Col<StoryRow>[] = [
    { label: t('ops.f.title'), cell: (s) => s.title, sort: (s) => s.title },
    { label: t('ssq.col.alumnus'), cell: (s) => `${s.alumnus} (${s.graduationYear})`, sort: (s) => s.alumnus },
    { label: t('ops.f.date'), cell: (s) => fmt.date(s.createdAt.slice(0, 10), 'short'), sort: (s) => s.createdAt },
    { label: t('ssq.col.featured'), cell: (s) => (s.featured ? <Pill label={t('ssq.featured')} /> : '-') },
    { label: t('ops.f.note'), cell: (s) => s.reviewNote || '-' },
    { label: '', cell: (s) => <Button size="small" onClick={() => setReview(s)} data-testid={`ssq-story-${s.id}`}>{s.status === 'submitted' ? t('ssq.review') : t('ssq.read')}</Button> },
  ];

  return (
    <>
      <Bar>
        {STATUSES.map((s) => (
          <Button key={s} variant={s === status ? 'contained' : 'outlined'} size="small" onClick={() => setStatus(s)} data-testid={`ssq-stories-${s}`}>
            {t(`ssq.storyStatus.${s}` as MessageKey)} ({stories.filter((x) => x.status === s).length})
          </Button>
        ))}
      </Bar>
      <Grid testId="ssq-stories" empty={t('ssq.empty.stories')} rows={rows} cols={cols} />
      {review && review.status === 'submitted' && (
        <FormDialog
          title={review.title}
          intro={<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{review.body}</Typography>}
          fields={[
            { name: 'decision', label: t('ssq.decision'), kind: 'select', required: true, init: 'publish', options: [{ value: 'publish', label: t('ssq.publish') }, { value: 'reject', label: t('ssq.sendBack') }] },
            { name: 'note', label: t('ops.f.note') },
            { name: 'featured', label: t('ssq.featureIt'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }] },
          ]}
          onSubmit={(v) => reviewStory(review.id, v)}
          onClose={(m) => {
            setReview(null);
            if (m) toast(m);
          }}
        />
      )}
      {review && review.status !== 'submitted' && (
        <InfoDialog title={review.title} onClose={() => setReview(null)}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{review.body}</Typography>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
