'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import type { ActionResult } from '@/lib/types';

/**
 * Asks for a reason (or a note) before a change that goes on the permanent record, then runs
 * `onSubmit`. Closes on success; shows the API's message otherwise.
 */
export function ReasonDialog({
  title,
  help,
  label,
  required,
  confirm,
  extra,
  onSubmit,
  onClose,
}: {
  title: string;
  help?: string;
  label: string;
  required: boolean;
  confirm: string;
  extra?: ReactNode;
  onSubmit: (reason: string) => Promise<ActionResult<unknown>>;
  onClose: (done: boolean) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = !required || reason.trim().length >= 3;
  return (
    <Dialog open onClose={pending ? undefined : () => onClose(false)} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          setError(null);
          start(async () => {
            const res = await onSubmit(reason);
            if (res.ok) onClose(true);
            else setError(res.error);
          });
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {help && (
              <Typography variant="body2" color="text.secondary">
                {help}
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {extra}
            <TextField label={label} value={reason} onChange={(e) => setReason(e.target.value)} required={required} multiline minRows={2} autoFocus slotProps={{ htmlInput: { maxLength: 500 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
