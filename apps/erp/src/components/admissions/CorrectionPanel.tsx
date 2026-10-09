'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { resubmitApplication } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';

export interface Correction {
  open: boolean;
  dueOn: string | null;
  rounds: number;
  latest: { at: string; notes: string; items: string[] } | null;
}

/** An application the office sent back: what to fix, and a form to send it again. */
export function CorrectionPanel({ slug, id, token, fix, name, dob }: { slug: string; id: string; token: string; fix: Correction; name: string; dob: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [v, setV] = useState({ applicantName: name, dateOfBirth: dob, note: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (!fix.open && !done) return null;
  if (done) return <Alert severity="success">{t('g1.fix.sent')}</Alert>;
  return (
    <Stack spacing={2} sx={{ mb: 3 }} data-testid="correction-panel">
      <Alert severity="warning">
        <Typography variant="subtitle2">{t('g1.fix.title')}</Typography>
        {fix.latest && <Typography variant="body2">{fix.latest.notes}</Typography>}
        {fix.latest && fix.latest.items.length > 0 && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {t('g1.fix.items', { items: fix.latest.items.join(', ') })}
          </Typography>
        )}
        {fix.dueOn && <Typography variant="body2">{t('g1.fix.due', { date: fmt.date(fix.dueOn, 'long') })}</Typography>}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label={t('g1.fix.name')} value={v.applicantName} onChange={(e) => setV({ ...v, applicantName: e.target.value })} size="small" />
      <TextField label={t('g1.fix.dob')} type="date" value={v.dateOfBirth} onChange={(e) => setV({ ...v, dateOfBirth: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label={t('g1.fix.note')} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} size="small" multiline minRows={2} />
      <Typography variant="body2" color="text.secondary">
        {t('g1.fix.docs')}
      </Typography>
      <Button
        variant="contained"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await resubmitApplication(slug, id, token, v);
            if (res.ok) {
              setDone(true);
              router.refresh();
            } else setError(res.error);
          })
        }
      >
        {t('g1.fix.send')}
      </Button>
    </Stack>
  );
}
