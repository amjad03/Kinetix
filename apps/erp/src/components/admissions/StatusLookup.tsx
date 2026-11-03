'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { lookupStatus } from '@/app/apply/actions';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { PublicStatus } from '@/lib/admissions-pass';

/** Application number and date of birth in; the stages reached and the next step out. */
export function StatusLookup({ slug }: { slug: string }) {
  const { t, fmt } = useI18n();
  const [no, setNo] = useState('');
  const [dob, setDob] = useState('');
  const [trap, setTrap] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [pending, start] = useTransition();
  const check = () =>
    start(async () => {
      setError(null);
      const res = await lookupStatus(slug, { applicationNo: no, dateOfBirth: dob, website: trap });
      if (!res.ok) {
        setStatus(null);
        return setError(res.error);
      }
      setStatus(res.data);
    });
  return (
    <div className="grid gap-4">
      <Card>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <FormField label={t('ap.status.no')}>
            <TextInput value={no} onChange={(e) => setNo(e.target.value)} fullWidth autoComplete="off" slotProps={{ htmlInput: { maxLength: 40 } }} data-testid="status-no" />
          </FormField>
          <FormField label={t('ap.status.dob')}>
            <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} fullWidth data-testid="status-dob" />
          </FormField>
          {/* Visitors never see or fill this; bots do. */}
          <input type="text" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
          <Button type="submit" className="h-10" disabled={pending || no.trim().length < 3 || !dob}>
            {t('ap.status.check')}
          </Button>
        </form>
      </Card>
      {error && <Alert severity="error">{error}</Alert>}
      {status && (
        <Card title={`${status.applicant} · ${status.applicationNo}`} subtitle={`${status.programme} · ${status.cycle}`}>
          <div className="grid gap-3" data-testid="status-result">
            <p className="text-[15px] font-semibold">{status.statusLabel}</p>
            <ol className="grid gap-2">
              {status.steps.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-[13.5px]">
                  {s.done ? <CheckCircle2 className="size-4 text-teal-600" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                  <span className={s.done ? '' : 'text-muted-foreground'}>{s.label}</span>
                  {s.at && <span className="text-xs text-muted-foreground">{fmt.date(s.at, 'short')}</span>}
                </li>
              ))}
            </ol>
            {status.next && <Alert severity="info">{status.next}</Alert>}
            {status.offerExpiresOn && <p className="text-[13px]">{t('ap.status.expires', { date: fmt.date(status.offerExpiresOn, 'short') })}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
