'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Card, SelectInput, SwitchField, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { rupeesInput } from '@/lib/fee-depth';

export interface Rule {
  name: string;
  mode: 'daily' | 'slab';
  graceDays: number;
  flatPaise: number;
  perDayPaise: number;
  capPaise: number | null;
  slabs: { fromDay: number; toDay: number | null; paise: number; perDay: boolean }[];
}
type Slab = { from: string; to: string; amount: string; perDay: boolean };

/**
 * The late-fee rule: after the grace days either a flat fine plus so much a day, or slabs (so much a day, or once,
 * for each band of days late), always up to the cap. Fines go on the invoice under the fine head every night; a
 * principal can waive one, or a waiver request goes up the waiver chain.
 */
export function LateFeeRule({ rule }: { rule: Rule | null }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const r = (p: number | null | undefined) => (p == null ? '' : String(p / 100));
  const [mode, setMode] = useState<'daily' | 'slab'>(rule?.mode ?? 'daily');
  const [grace, setGrace] = useState(String(rule?.graceDays ?? 5));
  const [flat, setFlat] = useState(r(rule?.flatPaise ?? 5000));
  const [perDay, setPerDay] = useState(r(rule?.perDayPaise ?? 1000));
  const [cap, setCap] = useState(r(rule?.capPaise ?? 50000));
  const [slabs, setSlabs] = useState<Slab[]>(() => (rule?.slabs.length ? rule.slabs.map((s) => ({ from: String(s.fromDay), to: s.toDay == null ? '' : String(s.toDay), amount: String(s.paise / 100), perDay: s.perDay })) : [{ from: '1', to: '15', amount: '10', perDay: true }, { from: '16', to: '', amount: '500', perDay: false }]));
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState<{ assessed: number; totalPaise: number } | null>(null);
  const [pending, start] = useTransition();

  const setSlab = (i: number, p: Partial<Slab>) => setSlabs(slabs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const save = () =>
    start(async () => {
      const body = {
        name: t('fx.lateFee'),
        mode,
        graceDays: Number(grace) || 0,
        capPaise: cap.trim() ? rupeesInput(cap) : null,
        ...(mode === 'daily' ? { flatPaise: rupeesInput(flat || '0') ?? 0, perDayPaise: rupeesInput(perDay || '0') ?? 0 } : { slabs: slabs.map((s) => ({ fromDay: Number(s.from), toDay: s.to.trim() ? Number(s.to) : null, paise: rupeesInput(s.amount) ?? 0, perDay: s.perDay })) }),
      };
      const res = await deskSend('/v1/fees/late-fee-rule', body, 'PUT');
      if (!res.ok) return setError(res.error);
      setError(null);
      toast?.success(t('fd.saved'));
      router.refresh();
    });
  const run = () =>
    start(async () => {
      const res = await deskSend<{ assessed: number; totalPaise: number }>('/v1/fees/late-fees/run', {});
      if (!res.ok) return setError(res.error);
      setRan(res.data);
      router.refresh();
    });

  return (
    <Card title={t('fx.lateFee')} subtitle={t('fx.lateFeeHint')}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <SelectInput label={t('fx.f.fineMode')} value={mode} onChange={(e) => setMode(e.target.value as 'daily' | 'slab')} options={[{ value: 'daily', label: t('fx.mode.daily') }, { value: 'slab', label: t('fx.mode.slab') }]} />
          <TextInput label={t('fx.f.graceDays')} type="number" value={grace} onChange={(e) => setGrace(e.target.value)} />
          <TextInput label={t('fx.f.cap')} value={cap} onChange={(e) => setCap(e.target.value)} inputProps={{ inputMode: 'decimal' }} helperText={t('fx.f.capHelp')} />
        </div>
        {mode === 'daily' ? (
          <div className="flex flex-wrap items-end gap-3">
            <TextInput label={t('fx.f.flat')} value={flat} onChange={(e) => setFlat(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
            <TextInput label={t('fx.f.perDay')} value={perDay} onChange={(e) => setPerDay(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
          </div>
        ) : (
          <div className="grid gap-3">
            {slabs.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <TextInput label={t('fx.f.fromDay')} type="number" value={s.from} onChange={(e) => setSlab(i, { from: e.target.value })} />
                <TextInput label={t('fx.f.toDay')} type="number" value={s.to} onChange={(e) => setSlab(i, { to: e.target.value })} helperText={i === slabs.length - 1 ? t('fx.f.toDayHelp') : undefined} />
                <TextInput label={t('fx.f.slabAmount')} value={s.amount} onChange={(e) => setSlab(i, { amount: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
                <div className="flex min-h-9 items-center">
                  <SwitchField label={t('fx.f.perDayToggle')} checked={s.perDay} onChange={(v) => setSlab(i, { perDay: v })} />
                </div>
                {slabs.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t('fd.remove')} onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <div>
              <Button type="button" variant="outline" className="h-9" onClick={() => setSlabs([...slabs, { from: String(Number(slabs.at(-1)?.to || slabs.at(-1)?.from || 0) + 1), to: '', amount: '', perDay: false }])}>
                <Plus className="size-4" /> {t('fx.addSlab')}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        {ran && <p className="m-0 text-sm">{t('fx.finesRun', { n: ran.assessed, amount: fmt.rupees(ran.totalPaise) })}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-9" disabled={pending || !rule} onClick={run}>
            {t('fx.runFinesNow')}
          </Button>
          <Button className="h-9" disabled={pending} onClick={save}>
            {t('fx.saveRule')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
