'use client';

import { Coins, ScrollText, ShieldCheck } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { searchPeople } from '@/app/(dashboard)/messages/actions';
import { Alert } from '@/components/kx';
import { Dialog, FormField, TextInput } from '@/components/ui';
import type { PeopleResult } from '@/lib/communication';
import { recordPreference } from '@/app/(dashboard)/communication/pass-actions';
import { Button } from '@/components/kx';
import { useToast } from '@/components/ops/kit';
import { emptyFor, useKitColumns } from '@/components/life/kit';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState } from '@/components/ui';

/** Finds the person by name or phone, then records the channel, the choice and what they signed or said. */
function RecordChoiceDialog({ onClose }: { onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PeopleResult['users']>([]);
  const [person, setPerson] = useState<{ id: string; fullName: string } | null>(null);
  const [channel, setChannel] = useState('sms');
  const [granted, setGranted] = useState('no');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const r = await searchPeople(q.trim());
      if (live) setFound(r.ok ? r.data.users : []);
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q]);
  const save = () =>
    start(async () => {
      if (!person) return setError(t('cp.consent.pick'));
      if (note.trim().length < 3) return setError(t('cp.consent.noteNeeded'));
      const r = await recordPreference({ userId: person.id, channel, granted, note: note.trim() });
      if (r.ok) onClose(t('ops.saved'));
      else setError(r.error);
    });
  const select = 'h-10 w-full rounded-md border bg-background px-2 text-sm';
  return (
    <Dialog
      title={t('cp.consent.record')}
      size="md"
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>{t('ops.cancel')}</Button>
          <Button variant="contained" onClick={save} disabled={pending} data-testid="cp-record-save">{t('ops.save')}</Button>
        </>
      }
    >
      <div className="grid gap-4 pt-2">
        <p className="text-[13px] leading-[19px] text-muted-foreground">{t('cp.consent.recordHelp')}</p>
        {person ? (
          <p className="text-sm">
            <b>{person.fullName}</b>{' '}
            <Button size="small" onClick={() => setPerson(null)}>{t('cp.consent.change')}</Button>
          </p>
        ) : (
          <>
            <FormField label={t('cp.consent.find')}>
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} data-testid="cp-record-search" />
            </FormField>
            {q.trim().length >= 2 && (
              <ul className="max-h-48 overflow-auto rounded-md border">
                {found.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('comm.people.none')}</li>}
                {found.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setPerson(u)}>
                      {u.fullName}
                      {u.phone ? <span className="ml-2 text-xs text-muted-foreground">{u.phone}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[13px] font-semibold">
            {t('cp.col.channel')}
            <select className={select} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {(['sms', 'whatsapp', 'email', 'push'] as const).map((c) => (
                <option key={c} value={c}>{t(`cp.ch.${c}`)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold">
            {t('cp.col.choice')}
            <select className={select} value={granted} onChange={(e) => setGranted(e.target.value)}>
              <option value="yes">{t('cp.optedIn')}</option>
              <option value="no">{t('cp.optedOut')}</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1.5 text-[13px] font-semibold">
          {t('cp.consent.note')}
          <textarea className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm font-normal" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        {error && <Alert severity="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

type KitProps = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState };

/** Every send and hold-back with its channel, fallback step, cost and the provider's report: the audit trail of messages. */
export function SendLogList({ meta, page, state }: KitProps) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'attemptedAt', header: 'cp.col.when', kind: 'datetime', sortKey: 'attempted', rowHeader: true },
    { key: 'title', header: 'cp.col.message', kind: 'wrap' },
    { key: 'recipient', header: 'cp.col.to', sortKey: 'recipient' },
    { key: 'address', header: 'cp.col.address', hideBelow: 'md' },
    { key: 'channel', header: 'cp.col.channel', kind: 'choice' },
    { key: 'status', header: 'cp.col.status', kind: 'choice', sortKey: 'status', tones: { accepted: 'info', delivered: 'success', read: 'success', failed: 'danger', bounced: 'danger', suppressed: 'neutral', deferred: 'warning' } },
    { key: 'units', header: 'cp.col.units', kind: 'number', hideBelow: 'lg' },
    { key: 'cost', header: 'cp.col.cost', kind: 'rupees', sortKey: 'cost' },
    { key: 'department', header: 'cp.col.department', hideBelow: 'lg' },
    { key: 'error', header: 'cp.col.reason', kind: 'wrap', hideBelow: 'md' },
    { key: 'provider', header: 'cp.col.provider', defaultHidden: true },
  ]);
  return <RecordsTable meta={meta} page={page} state={state} label={t('cp.log.title')} columns={columns} testId="cp-send-log" empty={emptyFor(meta, <EmptyState icon={<ScrollText />} title={t('cp.log.emptyTitle')}>{t('cp.log.empty')}</EmptyState>)} />;
}

/** Top-ups, spends and corrections of message credits. */
export function CreditLedgerList({ meta, page, state }: KitProps) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'createdAt', header: 'cp.col.when', kind: 'datetime', sortKey: 'created', rowHeader: true },
    { key: 'channel', header: 'cp.col.channel', kind: 'choice' },
    { key: 'kind', header: 'cp.col.entry', kind: 'choice', tones: { topup: 'success', spend: 'neutral', refund: 'info', adjust: 'warning' } },
    { key: 'units', header: 'cp.col.units', kind: 'number', sortKey: 'units' },
    { key: 'amount', header: 'cp.col.amount', kind: 'rupees', sortKey: 'amount' },
    { key: 'reference', header: 'cp.col.reference', hideBelow: 'md' },
    { key: 'note', header: 'cp.col.note', kind: 'wrap', hideBelow: 'md' },
    { key: 'by', header: 'cp.col.by', hideBelow: 'lg' },
  ]);
  return <RecordsTable meta={meta} page={page} state={state} label={t('cp.ledger')} columns={columns} testId="cp-ledger" empty={emptyFor(meta, <EmptyState icon={<Coins />} title={t('cp.ledgerEmptyTitle')}>{t('cp.ledgerEmpty')}</EmptyState>)} />;
}

/** Every consent choice per channel (DPDP): in the app, by a STOP reply, or recorded by the office from a signed form. */
export function ChannelPrefsList({ meta, page, state }: KitProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const columns = useKitColumns(meta, [
    { key: 'createdAt', header: 'cp.col.when', kind: 'datetime', sortKey: 'created', rowHeader: true },
    { key: 'person', header: 'cp.col.person', sortKey: 'person' },
    { key: 'channel', header: 'cp.col.channel', kind: 'choice' },
    { key: 'granted', header: 'cp.col.choice', kind: 'choice', choiceOf: 'granted' },
    { key: 'source', header: 'cp.col.how', kind: 'choice' },
    { key: 'noticeVersion', header: 'cp.col.notice', hideBelow: 'lg' },
    { key: 'note', header: 'cp.col.note', kind: 'wrap', hideBelow: 'md' },
  ]);
  const rows = page.rows.map((r) => ({ ...r, granted: r.granted ? 'yes' : 'no' }));
  return (
    <>
      <RecordsTable
        meta={meta}
        page={{ ...page, rows }}
        state={state}
        label={t('cp.consent.title')}
        columns={columns}
        testId="cp-consent"
        toolbar={
          <Button variant="contained" onClick={() => setOpen(true)} data-testid="cp-record-choice">
            {t('cp.consent.record')}
          </Button>
        }
        empty={emptyFor(meta, <EmptyState icon={<ShieldCheck />} title={t('cp.consent.emptyTitle')}>{t('cp.consent.empty')}</EmptyState>)}
      />
      {open && (
        <RecordChoiceDialog
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
        />
      )}
      {toastNode}
    </>
  );
}
