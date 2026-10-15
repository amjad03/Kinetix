'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { grantFeeHoldOverride, withdrawFeeHoldOverride } from '@/app/(dashboard)/fees/holds/actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, Dialog, EmptyState, StatusPill, TextInput, useToastOptional, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { HOLD_TONE, holdState, type FeeHoldOverrideRow, type FeeHoldPurpose, type FeeHoldStatus } from '@/lib/fee-holds';
import { formatRupees } from '@/lib/money';
import { StudentPicker } from './StudentPicker';

type Ask = { kind: 'grant'; purpose: FeeHoldPurpose } | { kind: 'withdraw'; id: string; purpose: FeeHoldPurpose; studentId?: string };

/** Asks for the reason and grants or withdraws an override. */
function ReasonDialog({ ask, studentId, onClose }: { ask: Ask; studentId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const what = t(`fh.p.${ask.purpose}` as MessageKey);
  const submit = () =>
    start(async () => {
      if (reason.trim().length < 3) return setError(t('fh.reasonShort'));
      const res = ask.kind === 'grant' ? await grantFeeHoldOverride(studentId!, ask.purpose, reason.trim()) : await withdrawFeeHoldOverride(ask.id, reason.trim(), ask.studentId ?? studentId);
      if (!res.ok) return setError(res.error);
      toast?.success(t(ask.kind === 'grant' ? 'fh.granted' : 'fh.withdrawn'));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={ask.kind === 'grant' ? t('fh.grantTitle', { what }) : t('fh.withdrawTitle', { what })}
      size="sm"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('fh.cancel')}
          </Button>
          <Button variant={ask.kind === 'withdraw' ? 'destructive' : 'default'} onClick={submit} disabled={pending} data-testid="fh-confirm">
            {ask.kind === 'grant' ? t('fh.grant') : t('fh.withdraw')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">{ask.kind === 'grant' ? t('fh.grantIntro') : t('fh.withdrawIntro')}</p>
      <TextInput label={t('fh.reason')} name="reason" multiline minRows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus data-testid="fh-reason" />
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/**
 * A student's fee holds: for each of hall ticket, result and TC whether dues hold it back, the principal's override
 * (granted or withdrawn here with a reason), and what is overdue. Shown on the student profile, the counter and the
 * holds page.
 */
export function FeeHoldPanel({ studentId, status, canOverride, canSettings }: { studentId: string; status: FeeHoldStatus; canOverride: boolean; canSettings?: boolean }) {
  const { t, fmt } = useI18n();
  const [ask, setAsk] = useState<Ask | null>(null);
  const anyOn = status.holds.some((h) => h.enabled);
  return (
    <section className="rounded-[12px] border bg-card p-5" data-testid="fee-holds">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-[15px] font-semibold">{t('fh.title')}</h3>
        <span className="text-sm text-muted-foreground">{t('fh.overdue', { amount: formatRupees(status.overduePaise) })}</span>
      </div>
      {!anyOn && (
        <p className="mb-3 text-sm text-muted-foreground">
          {t('fh.offNote')}{' '}
          {canSettings && (
            <Link className="underline underline-offset-2" href="/accounts/settings#set-dues">
              {t('fh.openSettings')}
            </Link>
          )}
        </p>
      )}
      <ul className="m-0 grid list-none gap-2 p-0">
        {status.holds.map((h) => {
          const st = holdState(h);
          const open = status.overrides.find((o) => o.purpose === h.purpose);
          return (
            <li key={h.purpose} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5" data-testid={`fee-hold-${h.purpose}`}>
              <span className="min-w-[9rem] flex-1 text-sm font-medium">{t(`fh.p.${h.purpose}` as MessageKey)}</span>
              <StatusPill tone={HOLD_TONE[st]}>{t(`fh.s.${st}` as MessageKey)}</StatusPill>
              {canOverride && h.enabled && !open && (
                <Button variant="outline" className="h-9" onClick={() => setAsk({ kind: 'grant', purpose: h.purpose })}>
                  {t('fh.allow')}
                </Button>
              )}
              {canOverride && open && (
                <Button variant="outline" className="h-9" onClick={() => setAsk({ kind: 'withdraw', id: open.id, purpose: h.purpose })}>
                  {t('fh.withdraw')}
                </Button>
              )}
              {st === 'held' && <p className="m-0 w-full text-[13px] text-red-ink">{t('fh.heldNote', { amount: formatRupees(status.overduePaise) })}</p>}
              {open && <p className="m-0 w-full text-[13px] text-muted-foreground">{t('fh.allowedBy', { who: open.grantedBy ?? t('fh.someone'), date: fmt.date(open.createdAt), reason: open.reason })}</p>}
            </li>
          );
        })}
      </ul>
      {ask && <ReasonDialog ask={ask} studentId={studentId} onClose={() => setAsk(null)} />}
    </section>
  );
}

/** The principal's overrides across students: who, what, why and by whom, with Withdraw for the principal. */
export function FeeHoldOverrides({ rows, canOverride, showWithdrawn }: { rows: FeeHoldOverrideRow[]; canOverride: boolean; showWithdrawn: boolean }) {
  const { t, fmt } = useI18n();
  const [ask, setAsk] = useState<Ask | null>(null);
  const columns: Column<FeeHoldOverrideRow>[] = [
    { id: 'student', header: t('fh.col.student'), rowHeader: true, cell: (r) => <Link className="font-medium hover:underline" href={`/students/${r.studentId}?tab=fees`}>{r.studentName}</Link>, sort: (r) => r.studentName },
    { id: 'class', header: t('fh.col.class'), cell: (r) => `${r.section ?? ''} · ${r.rollNo}`, sort: (r) => `${r.section ?? ''} ${r.rollNo}`, hideBelow: 'sm' },
    { id: 'what', header: t('fh.col.what'), cell: (r) => t(`fh.p.${r.purpose}` as MessageKey), sort: (r) => t(`fh.p.${r.purpose}` as MessageKey) },
    { id: 'reason', header: t('fh.reason'), cell: (r) => <span className="block max-w-[28rem] whitespace-normal">{r.reason}</span>, csv: (r) => r.reason },
    { id: 'by', header: t('fh.col.by'), cell: (r) => `${r.grantedBy ?? ''} · ${fmt.date(r.createdAt)}`, sort: (r) => r.createdAt, csv: (r) => `${r.grantedBy ?? ''} ${r.createdAt}`, hideBelow: 'md' },
    ...(showWithdrawn
      ? [{ id: 'state', header: t('fh.col.state'), cell: (r: FeeHoldOverrideRow) => (r.revokedAt ? <StatusPill tone="neutral">{t('fh.s.withdrawnOn', { date: fmt.date(r.revokedAt), who: r.revokedBy ?? '' })}</StatusPill> : <StatusPill tone="warning">{t('fh.s.allowed')}</StatusPill>), csv: (r: FeeHoldOverrideRow) => r.revokedAt ?? '' }]
      : []),
    ...(canOverride
      ? [{ id: 'act', header: t('fh.col.actions'), align: 'right' as const, csv: false as const, cell: (r: FeeHoldOverrideRow) => (r.revokedAt ? null : <Button variant="outline" className="h-9" onClick={() => setAsk({ kind: 'withdraw', id: r.id, purpose: r.purpose, studentId: r.studentId })}>{t('fh.withdraw')}</Button>) }]
      : []),
  ];
  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        label={t('fh.listTitle')}
        exportName="fee-hold-overrides"
        empty={<EmptyState icon={<ShieldCheck />} title={t('fh.none')} description={t('fh.noneSub')} />}
      />
      {ask && <ReasonDialog ask={ask} onClose={() => setAsk(null)} />}
    </>
  );
}

/** Finds a student to see or change their holds (opens `?student=<id>` on the holds page). */
export function HoldStudentPicker() {
  const { t } = useI18n();
  const router = useRouter();
  return <StudentPicker label={t('fh.findStudent')} onPick={(s) => router.push(`/fees/holds?student=${s.id}`)} />;
}
