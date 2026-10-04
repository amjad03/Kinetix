'use client';

import PublishOutlined from '@mui/icons-material/PublishOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { publishAssessment } from '@/app/(dashboard)/results/actions';
import { useI18n } from '@/i18n/client';

/** Rendered on published assessments too (with `published`), so the confirmation outlives the refresh. */
export function PublishButton({ id, title, className, entered, missing, published }: { id: string; title: string; className: string; entered: number; missing: number; published: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toastBar = <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />;
  if (published) return toastBar;
  return (
    <>
      <Button variant="contained" startIcon={<PublishOutlined />} onClick={() => setOpen(true)} disabled={entered === 0}>
        {t('results.publish')}
      </Button>
      <Dialog open={open} onClose={pending ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth aria-labelledby="publish-title">
        <DialogTitle id="publish-title">{t('results.publish.title')}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2">
            {t('results.publish.body', { className, title })}
          </Typography>
          {missing > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t.plural('results.publish.missing', missing)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={pending}>
            {t('results.publish.notNow')}
          </Button>
          <Button
            variant="contained"
            disabled={pending}
            startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() =>
              start(async () => {
                const res = await publishAssessment(id);
                if (res.ok) {
                  setOpen(false);
                  setToast(t('results.publish.done'));
                } else setError(res.error);
              })
            }
          >
            {t('results.publish.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
      {toastBar}
    </>
  );
}
