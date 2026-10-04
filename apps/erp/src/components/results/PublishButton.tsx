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

export function PublishButton({ id, title, className, entered, missing }: { id: string; title: string; className: string; entered: number; missing: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="contained" startIcon={<PublishOutlined />} onClick={() => setOpen(true)} disabled={entered === 0}>
        Publish marks
      </Button>
      <Dialog open={open} onClose={pending ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth aria-labelledby="publish-title">
        <DialogTitle id="publish-title">Publish these marks?</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2">
            Students of {className} and their families will see their marks for <strong>{title}</strong>, with the class average and highest, in the KINETIX apps.
          </Typography>
          {missing > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {missing} student{missing === 1 ? ' has' : 's have'} no marks yet. Teachers can still add or correct marks after publishing.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={pending}>
            Not now
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
                  setToast('Marks published. Families have been notified.');
                } else setError(res.error);
              })
            }
          >
            Publish
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}
