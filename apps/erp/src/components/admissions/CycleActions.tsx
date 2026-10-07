'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cycleAction, publishMeritList } from '@/app/(dashboard)/admissions/actions';
import { useI18n } from '@/i18n/client';

/** Open or close the cycle, check eligibility, rank, publish the offers, lapse late offers. */
export function CycleActions({ id, status, latestUnpublished }: { id: string; status: 'draft' | 'open' | 'closed'; latestUnpublished: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; info?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (what: Parameters<typeof cycleAction>[1]) =>
    start(async () => {
      setMsg(null);
      const res = await cycleAction(id, what);
      if (!res.ok) return setMsg({ error: res.error });
      const d = res.data as Record<string, number> | null;
      if (what === 'evaluate' && d) setMsg({ info: t('adm.cycle.evaluated', { eligible: d.eligible, ineligible: d.ineligible, waiting: d.waiting }) });
      if (what === 'expire' && d) setMsg({ info: t('adm.cycle.expired', { n: d.expired }) });
      router.refresh();
    });
  return (
    <Stack spacing={1.5}>
      {msg?.error && <Alert severity="error">{msg.error}</Alert>}
      {msg?.info && <Alert severity="success">{msg.info}</Alert>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {status !== 'open' && (
          <Button variant="contained" disabled={pending} onClick={() => run('open')}>
            {t('adm.cycle.open')}
          </Button>
        )}
        {status === 'open' && (
          <Button variant="outlined" disabled={pending} onClick={() => run('close')}>
            {t('adm.cycle.close')}
          </Button>
        )}
        <Button variant="outlined" disabled={pending} onClick={() => run('evaluate')}>
          {t('adm.cycle.evaluate')}
        </Button>
        <Button variant="outlined" disabled={pending} onClick={() => run('generate')}>
          {t('adm.cycle.generate')}
        </Button>
        {latestUnpublished && (
          <Button
            variant="contained"
            color="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const res = await publishMeritList(latestUnpublished);
                if (!res.ok) return setMsg({ error: res.error });
                const d = res.data as { offered: number; waitlisted: number };
                setMsg({ info: t('adm.cycle.published', { offered: d.offered, waitlisted: d.waitlisted }) });
                router.refresh();
              })
            }
          >
            {t('adm.cycle.publish')}
          </Button>
        )}
        <Button disabled={pending} onClick={() => run('expire')}>
          {t('adm.cycle.expire')}
        </Button>
      </Stack>
    </Stack>
  );
}
