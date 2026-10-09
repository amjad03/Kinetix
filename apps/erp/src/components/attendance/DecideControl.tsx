'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState, useTransition } from 'react';
import { decideCondonation, decideCorrection } from '@/app/(dashboard)/attendance/governance/actions';
import { TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** Note box with Approve and Reject; condonations also take the percentage points to add. */
export function DecideControl({ kind, id }: { kind: 'correction' | 'condonation'; id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [points, setPoints] = useState('5');
  const decide = (decision: 'approved' | 'rejected') =>
    start(async () => {
      const res = kind === 'correction' ? await decideCorrection(id, decision, note) : await decideCondonation(id, decision, decision === 'approved' ? Number(points) : 0, note);
      if (res.ok) toast.success(t('agv.decided'));
      else toast.error(res.error);
    });
  const ready = note.trim().length >= 3 && (kind === 'correction' || Number(points) >= 1);
  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }} aria-busy={pending}>
      <TextInput label={t('agv.note')} value={note} onChange={(e) => setNote(e.target.value)} sx={{ minWidth: 180 }} />
      {kind === 'condonation' && <TextInput label={t('agv.points')} value={points} inputMode="numeric" onChange={(e) => setPoints(e.target.value.replace(/\D/g, '').slice(0, 2))} sx={{ width: 110 }} />}
      <Button size="small" variant="contained" disabled={pending || !ready} onClick={() => decide('approved')}>
        {t('agv.approve')}
      </Button>
      <Button size="small" variant="outlined" color="error" disabled={pending || note.trim().length < 3} onClick={() => decide('rejected')}>
        {t('agv.reject')}
      </Button>
    </Stack>
  );
}
