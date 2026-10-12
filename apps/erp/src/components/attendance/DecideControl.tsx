'use client';
import { useState, useTransition } from 'react';
import { decideCondonation, decideCorrection } from '@/app/(dashboard)/attendance/governance/actions';
import { TextInput, useToast, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';

import { Button } from '@/components/kx';
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
    <FormRow className="gap-2" aria-busy={pending}>
      <TextInput className="min-w-[180px]" label={t('agv.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      {kind === 'condonation' && <TextInput className="w-[110px]" label={t('agv.points')} value={points} inputMode="numeric" onChange={(e) => setPoints(e.target.value.replace(/\D/g, '').slice(0, 2))} />}
      <Button size="small" variant="contained" disabled={pending || !ready} onClick={() => decide('approved')}>
        {t('agv.approve')}
      </Button>
      <Button size="small" variant="outlined" color="error" disabled={pending || note.trim().length < 3} onClick={() => decide('rejected')}>
        {t('agv.reject')}
      </Button>
    </FormRow>
  );
}
