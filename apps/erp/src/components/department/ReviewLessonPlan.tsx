'use client';
import { useId, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { reviewLessonPlan } from '@/app/(dashboard)/department/plan/actions';
import { useI18n } from '@/i18n/client';
import { REMARK_MAX } from '@/lib/plans';

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar } from '@/components/kx';
import { MessageSquareText as RateReviewOutlined } from 'lucide-react';
/** Review a lesson plan, with an optional remark (POST /v1/lesson-plans/:id/review). */
export function ReviewLessonPlan({ id, date, reviewed, remark }: { id: string; date: string; reviewed: boolean; remark: string | null }) {
  const { t, fmt } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(remark ?? '');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tooLong = text.trim().length > REMARK_MAX;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  return (
    <>
      <Button
        variant={reviewed ? 'outlined' : 'contained'}
        size="small"
        startIcon={<RateReviewOutlined />}
        onClick={() => {
          setText(remark ?? '');
          setOpen(true);
        }}
        data-testid="review-plan"
      >
        {reviewed ? t('plan.reviewAgain') : t('plan.review')}
      </Button>
      <Dialog open={open} onClose={close} maxWidth="sm" fullWidth aria-labelledby={titleId}>
        <DialogTitle id={titleId}>{t('plan.review.title')}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert className="mb-4" severity="error" data-testid="review-error">
              {error}
            </Alert>
          )}
          <p className="text-[13px] leading-[19px] mb-4">
            {t('plan.review.body', { date: fmt.date(date, 'long') })}
          </p>
          <FormField label={t('plan.review.remark')}>
            <TextInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              error={tooLong}
              helperText={tooLong ? t('plan.review.tooLong', { n: REMARK_MAX }) : t('plan.review.remarkHelp', { n: REMARK_MAX })}
              slotProps={{ htmlInput: { maxLength: REMARK_MAX + 200 } }}
            />
          </FormField>
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3">
            {t('plan.review.again')}
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={pending || tooLong}
            startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await reviewLessonPlan(id, text);
                if (res.ok) {
                  setOpen(false);
                  setToast(t('plan.review.done'));
                } else setError(res.error);
              })
            }
          >
            {t('plan.review.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}
