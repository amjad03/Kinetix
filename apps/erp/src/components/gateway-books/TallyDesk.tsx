'use client';

import Button from '@mui/material/Button';
import { useState, useTransition } from 'react';
import { markImported, retryRow, saveMapping, saveSettings, syncNow } from '@/app/(dashboard)/tally/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface TallyConfig { host: string; port: number; company: string; enabled: boolean }
export interface MapRow { accountId: string; code: string; accountName: string; tallyLedger: string; tallyParent: string; mapped: boolean }
interface LogRow { id: string; kind: string; label: string; status: string; attempts: number; lastError: string | null }
export interface LogData { counts: { pending: number; sent: number; failed: number }; rows: LogRow[] }

/** Tally connection, ledger mapping and the sync log with retry; the XML file is the offline fallback. */
export function TallyDesk({ cfg, map, log, initialTab }: { cfg: TallyConfig | null; map: MapRow[]; log: LogData; initialTab: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<'settings' | MapRow | null>(null);
  const done = (m?: string) => {
    setEditing(null);
    if (m) toast(m);
  };
  const yesNo = [{ value: 'yes', label: t('gb.tally.on') }, { value: 'no', label: t('gb.tally.off') }];
  const settingsFields: Field[] = [
    { name: 'host', label: t('gb.tally.host'), required: true, init: cfg?.host ?? 'localhost' },
    { name: 'port', label: t('gb.tally.port'), kind: 'number', required: true, init: String(cfg?.port ?? 9000) },
    { name: 'company', label: t('gb.tally.company'), required: true, init: cfg?.company },
    { name: 'enabled', label: t('gb.tally.enabled'), kind: 'select', init: cfg?.enabled === false ? 'no' : 'yes', options: yesNo },
  ];
  const sync = () =>
    start(async () => {
      const r = await syncNow();
      toast(r.ok ? t('gb.tally.result', { sent: r.data.sent, failed: r.data.failed }) : r.error);
    });

  const tabs = [
    {
      id: 'settings',
      label: t('gb.tally.settings'),
      node: (
        <>
          <Bar>
            <Button variant="contained" onClick={() => setEditing('settings')}>{t('gb.tally.save')}</Button>
            <Button variant="outlined" disabled={pending || !cfg} onClick={sync}>{t('gb.tally.syncNow')}</Button>
            <Button variant="outlined" href="/api/download?kind=tally-file">{t('gb.tally.file')}</Button>
            <ActionButton label={t('gb.tally.markImported')} run={markImported} onDone={toast} />
          </Bar>
          {cfg && <p data-testid="tally-cfg">{cfg.host}:{cfg.port} · {cfg.company} · {cfg.enabled ? t('gb.tally.on') : t('gb.tally.off')}</p>}
        </>
      ),
    },
    {
      id: 'mapping',
      label: t('gb.tally.mapping'),
      node: (
        <Grid
          testId="tally-map"
          empty={t('gb.empty')}
          rows={map}
          cols={[
            { label: t('gb.col.account'), cell: (m) => `${m.code} ${m.accountName}`, sort: (m) => m.code },
            { label: t('gb.col.ledger'), cell: (m) => m.tallyLedger },
            { label: t('gb.col.parent'), cell: (m) => m.tallyParent },
            { label: '', cell: (m) => <Button size="small" onClick={() => setEditing(m)}>{t('gb.tally.map')}</Button> },
          ]}
        />
      ),
    },
    {
      id: 'log',
      label: `${t('gb.tally.log')} (${log.counts.pending + log.counts.failed})`,
      node: (
        <Grid
          testId="tally-log"
          empty={t('gb.empty')}
          rows={log.rows}
          cols={[
            { label: t('gb.col.reference'), cell: (r) => r.label },
            { label: t('gb.col.status'), cell: (r) => <Pill label={t(`gb.tally.${r.status}` as MessageKey)} warn={r.status === 'failed'} />, sort: (r) => r.status },
            { label: t('gb.col.attempts'), num: true, cell: (r) => r.attempts },
            { label: t('gb.col.error'), cell: (r) => r.lastError ?? '' },
            { label: '', cell: (r) => (r.status === 'sent' ? null : <ActionButton label={t('gb.tally.retry')} run={() => retryRow(r.id)} onDone={toast} />) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Tabbed tabs={tabs} initial={initialTab} label={t('nav.tally')} />
      {editing === 'settings' && <FormDialog title={t('gb.tally.settings')} fields={settingsFields} onSubmit={saveSettings} onClose={done} />}
      {editing && editing !== 'settings' && (
        <FormDialog
          title={`${editing.code} ${editing.accountName}`}
          fields={[{ name: 'tallyLedger', label: t('gb.col.ledger'), required: true, init: editing.tallyLedger }, { name: 'tallyParent', label: t('gb.col.parent'), required: true, init: editing.tallyParent }]}
          onSubmit={(v) => saveMapping(editing.accountId, v)}
          onClose={done}
        />
      )}
      {toastNode}
    </>
  );
}
