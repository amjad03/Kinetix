'use client';

import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { reviewVideo } from '@/app/(dashboard)/topic-videos/actions';
import { useI18n } from '@/i18n/client';
import { thumbnail } from '@/lib/concept-videos';
import type { ManagedVideo } from '@/lib/types';

/** Teachers' videos waiting for the principal: approve to show them to the whole institution, or reject with a reason. */
export function ApprovalQueue({ items }: { items: ManagedVideo[] }) {
  const { t } = useI18n();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ManagedVideo | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const waiting = items.filter((v) => !done.has(v.id));

  const decide = (v: ManagedVideo, decision: 'approve' | 'reject', why?: string) =>
    start(async () => {
      const res = await reviewVideo(v.id, decision, why);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRejecting(null);
      setReason('');
      setDone((s) => new Set(s).add(v.id));
      setToast(t(decision === 'approve' ? 'tv.approved' : 'tv.rejected', { title: v.title }));
    });

  return (
    <>
      {waiting.length === 0 ? (
        <Typography color="text.secondary" data-testid="queue-empty">
          {t('tv.queueEmpty')}
        </Typography>
      ) : (
        <Stack spacing={1.5} data-testid="approval-queue">
          {waiting.map((v) => (
            <Card key={v.id} sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }} data-testid="approval-item">
              <Box component="img" src={thumbnail(v.youtubeVideoId)} alt={t('tv.thumbAlt', { title: v.title })} loading="lazy" referrerPolicy="no-referrer" sx={{ width: 120, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '8px', bgcolor: 'm3.surfaceContainerHighest' }} />
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500 }}>{v.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {v.topicTitle} · {t('tv.addedBy', { name: v.createdByName ?? '' })}
                  {v.sections.length ? ` · ${t('tv.forClasses', { classes: v.sections.map((s) => s.displayName).join(', ') })}` : ''}
                </Typography>
              </Box>
              <Button startIcon={<Close />} disabled={pending} onClick={() => setRejecting(v)}>
                {t('tv.reject')}
              </Button>
              <Button variant="contained" startIcon={<Check />} disabled={pending} onClick={() => decide(v, 'approve')}>
                {t('tv.approve')}
              </Button>
            </Card>
          ))}
        </Stack>
      )}
      {error && !rejecting && (
        <Typography color="error" role="alert" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('tv.reasonTitle', { title: rejecting?.title ?? '' })}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={2} margin="dense" label={t('tv.reason')} value={reason} onChange={(e) => setReason(e.target.value)} error={!!error} helperText={error ?? undefined} slotProps={{ htmlInput: { maxLength: 500 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{t('tv.cancel')}</Button>
          <Button variant="contained" disabled={pending || !reason.trim()} onClick={() => rejecting && decide(rejecting, 'reject', reason)}>
            {t('tv.reject')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
