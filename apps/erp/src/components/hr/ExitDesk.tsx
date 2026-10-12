'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { acceptResignation, recordResignation, relieveEmployee, saveSettlement, setClearance, withdrawResignation } from '@/app/(dashboard)/hr/talent-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { SeparationDetail } from '@/lib/hr-lifecycle';

import { Alert, Button, Link, MenuItem } from '@/components/kx';
const TONE: Record<SeparationDetail['status'], Tone> = { submitted: 'warning', clearance: 'info', settled: 'info', relieved: 'success', withdrawn: 'neutral' };
const BLANK = { userId: '', reason: '', noticeDays: '30', lastWorkingDay: '' };

function Case({ s, run, pending }: { s: SeparationDetail; run: (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void; pending: boolean }) {
  const { t, locale } = useI18n();
  const money = (paise: number) => new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
  const [lwd, setLwd] = useState(s.lastWorkingDay);
  const [dues, setDues] = useState<Record<string, string>>(Object.fromEntries(s.clearances.map((c) => [c.department, String(c.duesPaise / 100)])));
  const [settle, setSettle] = useState({ amount: s.settlementPaise == null ? '' : String(s.settlementPaise / 100), note: s.settlementNote ?? '' });
  const allCleared = s.clearances.length > 0 && s.clearances.every((c) => c.status === 'cleared');
  return (
    <div className="rounded-[12px] border bg-card p-5" data-testid="exit-case">
      <div className="flex flex-row justify-between items-start gap-4 flex-wrap">
        <div>
          <p className="text-sm leading-[21px] font-semibold">{s.fullName}</p>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('hl.exit.col.resigned')}: {formatDate(s.resignedOn, 'dayMonth', locale)} · {t('hl.exit.col.lastDay')}: {formatDate(s.lastWorkingDay, 'dayMonth', locale)}
          </p>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {s.reason}
          </p>
          {s.noticeShortfallDays > 0 && (
            <p className="text-[13px] leading-[19px] text-amber-ink">
              {t('hl.exit.shortfall', { n: s.noticeShortfallDays })}
            </p>
          )}
        </div>
        <StatusPill tone={TONE[s.status]}>{t(`hl.exit.status.${s.status}` as MessageKey)}</StatusPill>
      </div>

      {s.status === 'submitted' && (
        <div className="flex flex-row gap-3 mt-4 items-end flex-wrap">
          <FormField label={t('hl.exit.lastDay')}>
            <TextInput type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} />
          </FormField>
          <Button variant="contained" disabled={pending} onClick={() => run(() => acceptResignation(s.id, lwd))}>
            {t('hl.exit.accept')}
          </Button>
        </div>
      )}

      {(s.status === 'clearance' || s.status === 'settled' || s.status === 'relieved') && (
        <div className="mt-4">
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
            {t('hl.exit.clearance')} · {t('hl.exit.duesTotal', { amount: money(s.duesPaise) })}
          </h6>
          <div className="flex flex-col gap-2">
            {s.clearances.map((c) => (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center" key={c.id}>
                <p className="text-sm leading-[21px] min-w-[130px]">{t(`hl.exit.dept.${c.department}` as MessageKey)}</p>
                <StatusPill tone={c.status === 'cleared' ? 'success' : 'warning'}>{c.status === 'cleared' ? t('hl.exit.cleared') : t('hl.exit.pending')}</StatusPill>
                {s.status === 'clearance' && (
                  <>
                    <TextInput className="max-w-[160px]" type="number" label={t('hl.exit.dues')} value={dues[c.department] ?? '0'} onChange={(e) => setDues({ ...dues, [c.department]: e.target.value })} />
                    <Button size="small" disabled={pending} onClick={() => run(() => setClearance(s.id, c.department, c.status === 'cleared' ? 'pending' : 'cleared', Number(dues[c.department] ?? 0), c.remarks ?? ''))}>
                      {c.status === 'cleared' ? t('hl.exit.reopen') : t('hl.exit.clear')}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(s.status === 'clearance' || s.status === 'settled') && allCleared && (
        <div className="mt-4">
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
            {t('hl.exit.settlement')}
          </h6>
          <div className="flex flex-col gap-3 max-w-[560px]">
            <FormField label={t('hl.exit.settlementAmount')}>
              <TextInput type="number" value={settle.amount} onChange={(e) => setSettle({ ...settle, amount: e.target.value })} />
            </FormField>
            <FormField label={t('hl.exit.settlementNote')}>
              <TextInput multiline minRows={3} value={settle.note} onChange={(e) => setSettle({ ...settle, note: e.target.value })} />
            </FormField>
            <div>
              <Button variant="contained" disabled={pending || settle.amount === '' || settle.note.trim().length < 5} onClick={() => run(() => saveSettlement(s.id, Number(settle.amount), settle.note))}>
                {t('hl.exit.settle')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-row gap-2 mt-4">
        {s.status === 'settled' && (
          <Button variant="contained" disabled={pending} onClick={() => run(() => relieveEmployee(s.id))}>
            {t('hl.exit.relieve')}
          </Button>
        )}
        {s.status === 'relieved' && (
          <Link className="self-center" href={`/api/download?kind=relieving-letter&id=${s.id}`} underline="hover">
            {t('hl.exit.letter')}
          </Link>
        )}
        {(s.status === 'submitted' || s.status === 'clearance') && (
          <Button color="inherit" disabled={pending} onClick={() => run(() => withdrawResignation(s.id))}>
            {t('hl.exit.withdraw')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Staff exit: record a resignation, then notice, clearance by department, the settlement note and the relieving letter. */
export function ExitDesk({ cases, staff }: { cases: SeparationDetail[]; staff: { userId: string; fullName: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState(BLANK);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('hl.exit.record')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(2,1fr)] gap-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => recordResignation({ userId: f.userId, reason: f.reason, noticeDays: Number(f.noticeDays), lastWorkingDay: f.lastWorkingDay }), () => setF(BLANK));
          }}
        >
          <FormField label={t('hl.staff')} required>
            <TextInput select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required>
              <MenuItem value="">{t('hl.chooseStaff')}</MenuItem>
              {staff.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.fullName}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('hl.exit.reason')} required>
            <TextInput value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.exit.noticeDays')}>
            <TextInput type="number" value={f.noticeDays} onChange={(e) => setF({ ...f, noticeDays: e.target.value })} />
          </FormField>
          <FormField label={t('hl.exit.lastDay')}>
            <TextInput type="date" value={f.lastWorkingDay} onChange={(e) => setF({ ...f, lastWorkingDay: e.target.value })} />
          </FormField>
          <div>
            <Button type="submit" variant="contained" disabled={pending || !f.userId || f.reason.trim().length < 3}>
              {t('hl.exit.create')}
            </Button>
          </div>
        </form>
      </div>
      {cases.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('hl.exit.none')}</p>}
      {cases.map((s) => (
        <Case key={`${s.id}-${s.status}`} s={s} run={run} pending={pending} />
      ))}
    </div>
  );
}
