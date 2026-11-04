'use client';

import { useState, useTransition } from 'react';
import { blockFamily, escalateThread, moderateReport, reportMessage, saveAvailability } from '@/app/(dashboard)/conversations/actions';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Availability, ModerationReport } from '@/lib/communication';

const REASONS = ['abusive', 'harassment', 'spam', 'inappropriate', 'privacy', 'other'] as const;
const area = 'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm';
const select = 'h-10 w-full rounded-md border bg-background px-2 text-sm';

/** The shell of every safety dialog: a body, an error line and Cancel / the action. */
function Shell({ title, busy, error, onClose, onSubmit, submit, tone, children, testId }: { title: string; busy: boolean; error: string; onClose: () => void; onSubmit: () => void; submit: string; tone?: 'danger'; children: React.ReactNode; testId: string }) {
  const { t } = useI18n();
  return (
    <Dialog
      title={title}
      size="md"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={onSubmit} disabled={busy} data-testid={`${testId}-submit`}>{submit}</Button>
        </>
      }
    >
      <div className="grid gap-3 pt-1" data-testid={testId}>
        {children}
        {error && <Alert severity="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

/** Reports a message from the other side to the institution's moderators. */
export function ReportDialog({ threadId, messageId, onClose }: { threadId: string; messageId: string; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('abusive');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  return (
    <Shell
      title={t('fs.report.title')}
      busy={busy}
      error={error}
      onClose={() => onClose()}
      submit={t('fs.report.send')}
      testId="fs-report"
      onSubmit={() =>
        start(async () => {
          const r = await reportMessage(threadId, messageId, reason, note.trim());
          if (r.ok) onClose(t('fs.report.done'));
          else setError(r.error);
        })
      }
    >
      <p className="text-[13px] text-muted-foreground">{t('fs.report.help')}</p>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.reason')}
        <select className={select} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          {REASONS.map((r) => (
            <option key={r} value={r}>{t(`fs.reason.${r}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.note')}
        <textarea className={area} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
    </Shell>
  );
}

/** Takes the thread to the teacher's head of department, who can then read and answer it. */
export function EscalateDialog({ threadId, onClose }: { threadId: string; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  return (
    <Shell
      title={t('fs.esc.title')}
      busy={busy}
      error={error}
      onClose={() => onClose()}
      submit={t('fs.esc.send')}
      testId="fs-escalate"
      onSubmit={() =>
        start(async () => {
          if (reason.trim().length < 5) return setError(t('fs.esc.why'));
          const r = await escalateThread(threadId, reason.trim());
          if (r.ok) onClose(t('fs.esc.done', { name: r.data.escalatedTo?.fullName ?? '' }));
          else setError(r.error);
        })
      }
    >
      <p className="text-[13px] text-muted-foreground">{t('fs.esc.help')}</p>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.reason')}
        <textarea className={area} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </label>
    </Shell>
  );
}

/** Pauses the family's messages in this thread (a member of staff), or everywhere (a leader), for some days or until lifted. */
export function BlockDialog({ threadId, onClose }: { threadId: string; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  return (
    <Shell
      title={t('fs.block.title')}
      busy={busy}
      error={error}
      tone="danger"
      onClose={() => onClose()}
      submit={t('fs.block.send')}
      testId="fs-block"
      onSubmit={() =>
        start(async () => {
          if (reason.trim().length < 5) return setError(t('fs.block.why'));
          const r = await blockFamily(threadId, reason.trim(), days ? Number(days) : null);
          if (r.ok) onClose(t('fs.block.done'));
          else setError(r.error);
        })
      }
    >
      <p className="text-[13px] text-muted-foreground">{t('fs.block.help')}</p>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.reason')}
        <textarea className={area} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.block.for')}
        <select className={select} value={days} onChange={(e) => setDays(e.target.value)}>
          {['1', '7', '30'].map((d) => (
            <option key={d} value={d}>{t('fs.block.days', { n: d })}</option>
          ))}
          <option value="">{t('fs.block.untilLifted')}</option>
        </select>
      </label>
    </Shell>
  );
}

/** A leader's decision on a report. */
export function ModerateDialog({ report, action, onClose }: { report: ModerationReport; action: 'dismiss' | 'hide' | 'warn' | 'block'; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [days, setDays] = useState('7');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  return (
    <Shell
      title={t(`fs.mod.${action}` as MessageKey)}
      busy={busy}
      error={error}
      tone={action === 'block' || action === 'hide' ? 'danger' : undefined}
      onClose={() => onClose()}
      submit={t(`fs.mod.${action}` as MessageKey)}
      testId="fs-moderate"
      onSubmit={() =>
        start(async () => {
          if (action !== 'dismiss' && note.trim().length < 3) return setError(t('fs.mod.why'));
          const r = await moderateReport(report.id, action, note.trim(), action === 'block' && days ? Number(days) : null);
          if (r.ok) onClose(t('fs.mod.done'));
          else setError(r.error);
        })
      }
    >
      <blockquote className="rounded-md border-l-4 bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{report.message.body}</blockquote>
      <p className="text-xs text-muted-foreground">{t(`fs.mod.${action}.help` as MessageKey, { name: report.sender })}</p>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {t('fs.note')}
        <textarea className={area} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      {action === 'block' && (
        <label className="grid gap-1.5 text-[13px] font-semibold">
          {t('fs.block.for')}
          <select className={select} value={days} onChange={(e) => setDays(e.target.value)}>
            {['7', '30', '90'].map((d) => (
              <option key={d} value={d}>{t('fs.block.days', { n: d })}</option>
            ))}
            <option value="">{t('fs.block.untilLifted')}</option>
          </select>
        </label>
      )}
    </Shell>
  );
}

/** A datetime-local value for an ISO time (the browser's own zone). */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** Do-not-disturb and personal chat hours: families are told when to expect a reply, and no phone alert rings. */
export function AvailabilityDialog({ current, onClose }: { current: Availability | null; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [until, setUntil] = useState(current?.active ? toLocal(current.dndUntil) : '');
  const [note, setNote] = useState(current?.awayNote ?? '');
  const [own, setOwn] = useState(!!current?.hours);
  const [start1, setStart1] = useState(current?.hours?.start ?? '09:00');
  const [end1, setEnd1] = useState(current?.hours?.end ?? '17:00');
  const [days, setDays] = useState<number[]>(current?.hours?.days ?? [1, 2, 3, 4, 5]);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  return (
    <Shell
      title={t('fs.dnd.title')}
      busy={busy}
      error={error}
      onClose={() => onClose()}
      submit={t('ops.save')}
      testId="fs-dnd"
      onSubmit={() =>
        start(async () => {
          const r = await saveAvailability({ dndUntil: until ? new Date(until).toISOString() : null, hours: own ? { start: start1, end: end1, days } : null, awayNote: note.trim() });
          if (r.ok) onClose(r.data.active ? t('fs.dnd.on') : t('ops.saved'));
          else setError(r.error);
        })
      }
    >
      <p className="text-[13px] text-muted-foreground">{t('fs.dnd.help')}</p>
      <FormField label={t('fs.dnd.until')} helper={t('fs.dnd.untilHelp')}>
        <TextInput type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} data-testid="fs-dnd-until" />
      </FormField>
      <FormField label={t('fs.dnd.note')}>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
        {t('fs.dnd.ownHours')}
      </label>
      {own && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <FormField label={t('fs.dnd.from')}>
              <TextInput type="time" value={start1} onChange={(e) => setStart1(e.target.value)} />
            </FormField>
            <FormField label={t('fs.dnd.to')}>
              <TextInput type="time" value={end1} onChange={(e) => setEnd1(e.target.value)} />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('fs.dnd.days')}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = days.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setDays((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d].sort()))} className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-secondary' : 'bg-background'}`}>
                  {t(`fs.day.${d}` as MessageKey)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}
