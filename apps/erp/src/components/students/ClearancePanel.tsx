'use client';

import { CircleCheck, CircleDashed, CircleX, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideClearanceLine, recheckClearance } from '@/app/(dashboard)/students/info-actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { Button } from '@/components/shadcn/button';
import { StatusPill, useToast, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Clearance, ClearanceItem } from '@/lib/student-info';

export const CLEARANCE_TONE: Record<string, Tone> = { open: 'warning', cleared: 'success', cancelled: 'neutral', pending: 'neutral', blocked: 'danger' };
const ICON = { cleared: CircleCheck, blocked: CircleX, pending: CircleDashed } as const;

/**
 * One no-dues clearance: each department's line with what the system found, who signed off and when. Departments
 * clear their line or hold it with a note; "Check again" re-reads fees, library, hostel and transport.
 */
export function ClearancePanel({ clearance, onChange }: { clearance: Clearance; onChange?: (c: Clearance) => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [c, setC] = useState(clearance);
  const [hold, setHold] = useState<ClearanceItem | null>(null);
  const [pending, start] = useTransition();
  const open = c.status === 'open';
  /** What the system found on an automatically checked line, in the reader's language. */
  const finding = (it: ClearanceItem): string | null => {
    if (!it.finding) return null;
    if (it.status === 'cleared' && !it.deciderName) return t('si.clr.find.nothing');
    if (it.department === 'fees') return t('si.clr.find.fees', { amount: fmt.rupees(it.duesPaise) });
    if (it.department === 'library') return it.duesPaise ? t('si.clr.find.libraryFines', { amount: fmt.rupees(it.duesPaise) }) : t('si.clr.find.library');
    if (it.department === 'hostel' || it.department === 'transport') return t(`si.clr.find.${it.department}` as MessageKey);
    return it.finding;
  };
  const done = (next: Clearance) => {
    setC(next);
    onChange?.(next);
    router.refresh();
  };
  const clear = (it: ClearanceItem) =>
    start(async () => {
      const res = await decideClearanceLine(it.id, 'cleared');
      if (!res.ok) return toast.error(res.error);
      done(res.data);
      toast.success(t('si.clr.lineCleared', { dept: t(`si.clr.dept.${it.department}` as MessageKey) }));
    });
  const recheck = () =>
    start(async () => {
      const res = await recheckClearance(c.id);
      if (!res.ok) return toast.error(res.error);
      done(res.data);
      toast.success(t('si.clr.rechecked'));
    });
  return (
    <div className="grid gap-3" data-testid="clearance-panel">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={CLEARANCE_TONE[c.status]}>{t(`si.clr.status.${c.status}` as MessageKey)}</StatusPill>
        <span className="text-[13px] text-muted-foreground">
          {t(`si.clr.purpose.${c.purpose}` as MessageKey)} · {fmt.date(c.createdAt.slice(0, 10), 'short')}
        </span>
        {open && (
          <Button size="sm" variant="outline" className="ml-auto h-9" onClick={recheck} disabled={pending}>
            <RefreshCw />
            {t('si.clr.recheck')}
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-[12px] border bg-card">
        {c.items.map((it) => {
          const Icon = ICON[it.status];
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <Icon className={`size-4 shrink-0 ${it.status === 'cleared' ? 'text-green-ink' : it.status === 'blocked' ? 'text-red-ink' : 'text-muted-foreground'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px] font-[550]">{t(`si.clr.dept.${it.department}` as MessageKey)}</b>
                <small className="block text-xs text-muted-foreground">
                  {[finding(it), it.note, it.deciderName && it.decidedAt ? t('si.clr.by', { name: it.deciderName, date: fmt.date(it.decidedAt.slice(0, 10), 'short') }) : null].filter(Boolean).join(' · ') || t(`si.clr.line.${it.status}` as MessageKey)}
                </small>
              </span>
              {open && it.status !== 'cleared' && (
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => setHold(it)}>
                    {t('si.clr.hold')}
                  </Button>
                  <Button size="sm" className="h-9" disabled={pending} onClick={() => clear(it)}>
                    {t('si.clr.clear')}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {hold && (
        <ReasonDialog
          title={t('si.clr.holdTitle', { dept: t(`si.clr.dept.${hold.department}` as MessageKey) })}
          label={t('si.clr.holdWhat')}
          required
          confirm={t('si.clr.hold')}
          onSubmit={async (note) => {
            const res = await decideClearanceLine(hold.id, 'blocked', note);
            if (res.ok) done(res.data);
            return res;
          }}
          onClose={() => setHold(null)}
        />
      )}
    </div>
  );
}
