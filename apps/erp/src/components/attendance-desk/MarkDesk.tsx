'use client';

import { CalendarClock, CheckCheck, ClipboardCopy, Fingerprint, Lock, UserX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { copyMarks, requestCorrection, saveDay, savePeriod, saveSpecial } from '@/app/(dashboard)/attendance/desk-actions';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, EmptyState, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { MARKS, type AttendancePolicy, type ClassDay, type MarkStatus, type Sheet, type SheetRow } from '@/lib/attendance-desk';
import { cn } from '@/lib/utils';

const SHORT: Record<MarkStatus, MessageKey> = { present: 'atd.mark.p', absent: 'atd.mark.a', late: 'atd.mark.l', excused: 'atd.mark.e' };
const TONE: Record<MarkStatus, string> = {
  present: 'data-[on=true]:bg-green-ink data-[on=true]:text-white',
  absent: 'data-[on=true]:bg-red-ink data-[on=true]:text-white',
  late: 'data-[on=true]:bg-amber-ink data-[on=true]:text-white',
  excused: 'data-[on=true]:bg-slate-ink data-[on=true]:text-white',
};

/** What can be marked on the class's day: its periods, special classes, and the day or its sessions. */
export function DayPanel({ day, policy, current, base }: { day: ClassDay; policy: AttendancePolicy; current: string; base: string }) {
  const { t, fmt } = useI18n();
  const items: { key: string; href: string; title: string; sub: string; done: boolean }[] = [];
  for (const p of day.periods)
    items.push({
      key: `slot:${p.slotId}`,
      href: `${base}&slot=${p.slotId}`,
      title: `${p.startsAt}–${p.endsAt} · ${p.subject}`,
      sub: [p.teacher, p.substitute ? t('atd.substitute') : '', p.batch ? t('atd.batch', { b: p.batch }) : '', p.combined ? t('atd.combined') : ''].filter(Boolean).join(' · '),
      done: p.marked > 0,
    });
  for (const s of day.special) items.push({ key: `special:${s.id}`, href: `${base}&special=${s.id}`, title: `${s.startsAt.slice(0, 5)}–${s.endsAt.slice(0, 5)} · ${s.subject}`, sub: `${t(`atd.special.${s.kind}` as MessageKey)} · ${s.teacher}`, done: s.marked > 0 });
  if (policy.mode === 'day' || day.periods.length === 0) items.push({ key: 'session:day', href: `${base}&session=day`, title: t('atd.wholeDay'), sub: t('atd.markedOf', { n: fmt.number(day.dayMarked), d: fmt.number(day.strength) }), done: day.dayMarked > 0 });
  if (policy.mode === 'session')
    for (const s of ['fn', 'an'] as const) items.push({ key: `session:${s}`, href: `${base}&session=${s}`, title: t(`atd.session.${s}`), sub: t('atd.markedOf', { n: fmt.number(day.sessionsMarked[s] ?? 0), d: fmt.number(day.strength) }), done: (day.sessionsMarked[s] ?? 0) > 0 });
  return (
    <nav aria-label={t('atd.dayList')} className="grid gap-2" data-testid="day-panel">
      {day.holiday && <p className="rounded-md border-l-4 border-amber-ink bg-muted px-3 py-2 text-sm">{t('atd.holiday', { title: day.holiday })}</p>}
      {day.followsWeekday && <p className="rounded-md border-l-4 border-blue-ink bg-muted px-3 py-2 text-sm">{t('atd.follows', { day: fmt.date(day.date, 'weekday') })}</p>}
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t('atd.noPeriods')}</p>}
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          scroll={false}
          aria-current={current === it.key ? 'page' : undefined}
          className={cn('flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted', current === it.key && 'border-primary bg-primary/5')}
        >
          <span className="min-w-0">
            <span className="block font-medium">{it.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>
          </span>
          <StatusPill tone={it.done ? 'success' : 'neutral'}>{it.done ? t('atd.done') : t('atd.notYet')}</StatusPill>
        </Link>
      ))}
    </nav>
  );
}

/**
 * A mark sheet: one row per student with Present / Absent / Late / Excused, all present at once, the day's
 * biometric punches as a suggestion to confirm, leave and on duty that stand, copying to the class's other periods,
 * and a correction request once the day is locked.
 */
export function SheetEditor({ sheet }: { sheet: Sheet }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = useMemo(() => Object.fromEntries(sheet.roster.map((r) => [r.id, r.leave?.countsAs ?? r.status ?? null])) as Record<string, MarkStatus | null>, [sheet]);
  const [marks, setMarks] = useState(initial);
  const [copyOpen, setCopyOpen] = useState(false);
  const [fix, setFix] = useState<SheetRow | null>(null);
  useEffect(() => setMarks(initial), [initial]);
  const dirty = sheet.roster.some((r) => marks[r.id] !== (r.leave?.countsAs ?? r.status ?? null));
  const unmarked = sheet.roster.filter((r) => !marks[r.id]).length;
  const counts = MARKS.map((m) => [m, sheet.roster.filter((r) => marks[r.id] === m).length] as const);
  const readOnly = sheet.locked || sheet.future || sheet.status === 'cancelled';
  const punches = sheet.roster.some((r) => r.punch);
  const combined = new Set(sheet.roster.map((r) => r.section)).size > 1;

  const setAll = (m: MarkStatus) => setMarks((x) => Object.fromEntries(sheet.roster.map((r) => [r.id, r.leave ? r.leave.countsAs : m])));
  const fromPunches = () => setMarks((x) => Object.fromEntries(sheet.roster.map((r) => [r.id, r.leave ? r.leave.countsAs : r.punch ? (r.punch === 'late' ? 'late' : 'present') : 'absent'])));

  const save = () =>
    start(async () => {
      const records = sheet.roster.filter((r) => marks[r.id]).map((r) => ({ studentId: r.id, status: marks[r.id]! }));
      if (!records.length) return toast.error(t('atd.nothingToSave'));
      const res =
        sheet.kind === 'period' ? await savePeriod(sheet.slotId!, sheet.date, records) : sheet.kind === 'special' ? await saveSpecial(sheet.id!, records) : await saveDay(sheet.section.id, sheet.date, sheet.kind === 'session' ? (sheet.session ?? null) : null, records);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('atd.saved', { n: fmt.number(records.length) }));
      router.refresh();
    });

  const title =
    sheet.kind === 'period' || sheet.kind === 'special'
      ? `${sheet.subject?.code ?? ''} ${sheet.subject?.name ?? ''} · ${sheet.startsAt}–${sheet.endsAt}${sheet.batch ? ` · ${t('atd.batch', { b: sheet.batch })}` : ''}`
      : sheet.kind === 'session'
        ? t(`atd.session.${sheet.session ?? 'fn'}`)
        : t('atd.wholeDay');

  return (
    <section aria-label={title} className="grid gap-4" data-testid="mark-sheet">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-semibold">{title}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {sheet.section.name} · {fmt.date(sheet.date, 'long')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map(([m, n]) => (
            <StatusPill key={m} tone={m === 'present' ? 'success' : m === 'absent' ? 'danger' : m === 'late' ? 'warning' : 'neutral'}>
              {t(SHORT[m])} {fmt.number(n)}
            </StatusPill>
          ))}
          {unmarked > 0 && <StatusPill tone="info">{t('atd.unmarkedN', { n: fmt.number(unmarked) })}</StatusPill>}
        </div>
      </div>
      {sheet.locked && (
        <p className="flex items-center gap-2 rounded-md border-l-4 border-amber-ink bg-muted px-3 py-2 text-sm">
          <Lock className="size-4" />
          {sheet.kind === 'period' ? t('atd.lockedPeriod') : t('atd.locked')}
        </p>
      )}
      {sheet.future && <p className="rounded-md bg-muted px-3 py-2 text-sm">{t('atd.future')}</p>}
      {sheet.kind === 'period' && sheet.meets === false && <p className="rounded-md border-l-4 border-amber-ink bg-muted px-3 py-2 text-sm">{t('atd.notThatDay')}</p>}
      {sheet.status === 'cancelled' && <p className="rounded-md bg-muted px-3 py-2 text-sm">{t('atd.cancelled')}</p>}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9" onClick={() => setAll('present')} data-testid="all-present">
            <CheckCheck />
            {t('atd.allPresent')}
          </Button>
          <Button variant="outline" className="h-9" onClick={() => setAll('absent')}>
            <UserX />
            {t('atd.allAbsent')}
          </Button>
          {punches && (
            <Button variant="outline" className="h-9" onClick={fromPunches} data-testid="from-punches">
              <Fingerprint />
              {t('atd.fromPunches')}
            </Button>
          )}
          {sheet.kind === 'period' && (sheet.others?.length ?? 0) > 0 && (
            <Button variant="outline" className="h-9" onClick={() => setCopyOpen(true)} disabled={dirty || sheet.roster.every((r) => !r.status)} title={dirty ? t('atd.saveFirst') : undefined}>
              <ClipboardCopy />
              {t('atd.copy')}
            </Button>
          )}
        </div>
      )}

      {sheet.roster.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title={t('atd.noStudents')}>
          {t('atd.noStudentsBody')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('atd.col.roll')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('atd.col.student')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('atd.col.mark')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.roster.map((r) => (
                <tr key={r.id} className="border-t" data-testid="sheet-row">
                  <td className="px-3 py-2 tabular-nums">{r.rollNo}</td>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-medium">{r.fullName}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      {combined && <span className="text-xs text-muted-foreground">{r.section}</span>}
                      {r.leave && <StatusPill tone="info">{t(`atd.leave.${r.leave.kind}` as MessageKey)}</StatusPill>}
                      {r.punch && <StatusPill tone="neutral">{t('atd.punched')}</StatusPill>}
                    </span>
                  </th>
                  <td className="px-3 py-2">
                    <div role="radiogroup" aria-label={t('atd.markFor', { name: r.fullName })} className="flex flex-wrap gap-1">
                      {MARKS.map((m) => {
                        const on = marks[r.id] === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            data-on={on}
                            title={t(`atd.status.${m}` as MessageKey)}
                            disabled={readOnly || !!r.leave}
                            onClick={() => setMarks((x) => ({ ...x, [r.id]: m }))}
                            className={cn('h-8 min-w-9 rounded-md border px-2 text-xs font-semibold disabled:opacity-60', TONE[m])}
                            data-testid={`mark-${m}`}
                          >
                            {t(SHORT[m])}
                          </button>
                        );
                      })}
                      {sheet.locked && sheet.kind === 'period' && !r.leave && (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setFix(r)}>
                          {t('atd.askChange')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && sheet.roster.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-background/95 py-3 backdrop-blur">
          {dirty && <span className="text-sm text-muted-foreground">{t('atd.unsaved')}</span>}
          <Button className="h-9" onClick={save} disabled={pending || !dirty} data-testid="save-marks">
            {t('atd.save')}
          </Button>
        </div>
      )}
      {copyOpen && <CopyDialog sheet={sheet} onClose={() => setCopyOpen(false)} />}
      {fix && <CorrectionDialog sheet={sheet} row={fix} onClose={() => setFix(null)} />}
    </section>
  );
}

function CopyDialog({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await copyMarks(sheet.slotId!, sheet.date, chosen);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('atd.copied', { n: fmt.number(res.data.results.reduce((n, r) => n + r.copied, 0)) }));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('atd.copyTitle')}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={go} disabled={pending || chosen.length === 0}>
            {t('atd.copy')}
          </Button>
        </>
      }
    >
      <p className="mt-0 text-sm text-muted-foreground">{t('atd.copyHelp')}</p>
      <div className="grid gap-1">
        {sheet.others!.map((o) => (
          <CheckboxField key={o.slotId} label={`${o.startsAt}–${o.endsAt} · ${o.subject}${o.marked ? ` (${t('atd.done')})` : ''}`} checked={chosen.includes(o.slotId)} onChange={(c) => setChosen((x) => (c ? [...x, o.slotId] : x.filter((y) => y !== o.slotId)))} />
        ))}
      </div>
    </Dialog>
  );
}

function CorrectionDialog({ sheet, row, onClose }: { sheet: Sheet; row: SheetRow; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [to, setTo] = useState<MarkStatus>(row.status === 'absent' ? 'present' : 'absent');
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await requestCorrection(sheet.slotId!, sheet.date, row.id, to, reason.trim());
      if (!res.ok) return toast.error(res.error);
      toast.success(t('atd.correctionSent'));
      onClose();
    });
  return (
    <Dialog
      title={t('atd.correctionTitle', { name: row.fullName })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={go} disabled={pending || reason.trim().length < 5}>
            {t('atd.correctionSend')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectInput label={t('atd.correctionTo')} value={to} onChange={(e) => setTo(e.target.value as MarkStatus)} options={MARKS.filter((m) => m !== row.status).map((m) => ({ value: m, label: t(`atd.status.${m}` as MessageKey) }))} />
        <TextInput label={t('atd.reason')} value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} required helper={t('atd.reasonHelp')} />
      </div>
    </Dialog>
  );
}
