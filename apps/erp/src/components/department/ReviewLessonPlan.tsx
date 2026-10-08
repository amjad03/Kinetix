'use client';

import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useId, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { reviewLessonPlan } from '@/app/(dashboard)/department/plan/actions';
import { useI18n } from '@/i18n/client';
import { REMARK_MAX } from '@/lib/plans';

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
            <Alert severity="error" sx={{ mb: 2 }} data-testid="review-error">
              {error}
            </Alert>
          )}
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t('plan.review.body', { date: fmt.date(date, 'long') })}
          </Typography>
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
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            {t('plan.review.again')}
          </Typography>
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
