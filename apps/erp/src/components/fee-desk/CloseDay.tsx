'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { deskRead, deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Card, FormRow, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';

const NOTES = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/** Day-end cash closing (count by denomination against what the system recorded) and month close. */
export function CloseDay({ periods }: { periods: { period: string; closedAt: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expected, setExpected] = useState<{ systemPaise: number; receiptCount: number } | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 7);
  });
  const [pending, start] = useTransition();
  const counted = NOTES.reduce((a, n) => a + n * 100 * (Number(counts[n]) || 0), 0);

  useEffect(() => {
    let live = true;
    deskRead<{ systemPaise: number; receiptCount: number }>(`/v1/fee-accounts/closings/expected?date=${date}`).then((r) => live && setExpected(r.ok ? r.data : null));
    return () => {
      live = false;
    };
  }, [date]);

  const submit = () =>
    start(async () => {
      const denominations = Object.fromEntries(Object.entries(counts).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
      const res = await deskSend<{ id: string }>('/v1/fee-accounts/closings', { date, denominations, note });
      if (!res.ok) return setError(res.error);
      setError(null);
      toast?.success(t('fd.done.closed'));
      router.push(`/accounts/closings/${res.data.id}`);
    });

  const closeMonth = () =>
    start(async () => {
      const res = await deskSend(`/v1/fee-accounts/periods/${month}/close`, { note: '' });
      if (!res.ok) return setError(res.error);
      setError(null);
      toast?.success(t('fd.done.monthClosed'));
      router.refresh();
    });

  const diff = expected ? counted - expected.systemPaise : 0;
  return (
    <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t('fd.closeDay')} subtitle={expected ? t('fd.closeDay.expected', { amount: fmt.rupees(expected.systemPaise), n: expected.receiptCount }) : undefined}>
        <div className="grid gap-6">
          <FormRow>
            <TextInput label={t('fd.col.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextInput label={t('fd.col.note')} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormRow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {NOTES.map((n) => (
              <TextInput key={n} label={`₹${n}`} type="number" value={counts[n] ?? ''} inputProps={{ min: 0 }} onChange={(e) => setCounts({ ...counts, [n]: e.target.value })} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm">
              {t('fd.col.counted')}: <strong>{fmt.rupees(counted)}</strong>
              {expected && diff !== 0 && <span className="ml-3 text-destructive">{t('fd.col.variance')}: {fmt.rupees(diff)}</span>}
            </span>
            <Button onClick={submit} disabled={pending}>
              {t('fd.a.submitClosing')}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={t('fd.monthClose')} subtitle={t('fd.monthClose.sub')}>
        <div className="grid gap-4">
          <FormRow>
            <TextInput label={t('fd.col.month')} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Button variant="outline" onClick={closeMonth} disabled={pending}>
              {t('fd.a.closeMonth')}
            </Button>
          </FormRow>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {periods.slice(0, 6).map((p) => (
              <li key={p.period}>
                {t('fd.monthClosedOn', { month: p.period, date: fmt.date(p.closedAt.slice(0, 10), 'short') })}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      {error && (
        <p role="alert" className="text-sm text-destructive xl:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}
