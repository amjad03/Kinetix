'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { resubmitApplication } from '@/app/apply/actions';
import { useI18n } from '@/i18n/client';

import { Alert, Button, TextField } from '@/components/kx';
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
    <div className="flex flex-col gap-4 mb-6" data-testid="correction-panel">
      <Alert severity="warning">
        <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('g1.fix.title')}</h6>
        {fix.latest && <p className="text-[13px] leading-[19px]">{fix.latest.notes}</p>}
        {fix.latest && fix.latest.items.length > 0 && (
          <p className="text-[13px] leading-[19px] mt-1">
            {t('g1.fix.items', { items: fix.latest.items.join(', ') })}
          </p>
        )}
        {fix.dueOn && <p className="text-[13px] leading-[19px]">{t('g1.fix.due', { date: fmt.date(fix.dueOn, 'long') })}</p>}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label={t('g1.fix.name')} value={v.applicantName} onChange={(e) => setV({ ...v, applicantName: e.target.value })} size="small" />
      <TextField label={t('g1.fix.dob')} type="date" value={v.dateOfBirth} onChange={(e) => setV({ ...v, dateOfBirth: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label={t('g1.fix.note')} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} size="small" multiline minRows={2} />
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        {t('g1.fix.docs')}
      </p>
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
    </div>
  );
}
