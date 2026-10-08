'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { deleteConnector, loadDeliveries, retryDelivery, saveConnector, setConnectorEnabled, testConnector } from '@/app/(dashboard)/connectors/actions';
import { FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ConnectorRow, ConnectorTypeMeta, DeliveryRow } from '@/lib/govern';

/** Settings form of one connector type; secrets are never filled in (leaving one empty keeps the stored value). */
function configFields(t: (k: MessageKey) => string, type: ConnectorTypeMeta, existing?: ConnectorRow): Field[] {
  return [
    { name: 'name', label: t('conn.f.name'), required: true, init: existing?.name },
    ...type.fields.map<Field>((f) => {
      const current = existing?.config[f.key];
      return {
        name: `c_${f.key}`,
        label: f.kind === 'secret' && existing?.secretsSet.includes(f.key) ? `${f.label} (${t('conn.f.keepSecret')})` : f.label,
        required: f.required && !(existing && f.kind === 'secret'),
        kind: f.kind === 'select' ? 'select' : f.kind === 'events' ? 'multiline' : 'text',
        options: f.kind === 'select' ? (f.options ?? []).map((o) => ({ value: o, label: o })) : undefined,
        init: Array.isArray(current) ? current.join('\n') : typeof current === 'string' ? current : '',
      };
    }),
    ...(existing ? [] : [{ name: 'enabled', label: t('conn.f.enabled'), kind: 'select' as const, init: 'no', options: [{ value: 'yes', label: t('conn.yes') }, { value: 'no', label: t('conn.no') }] }]),
  ];
}

/** Connector types to add, this institution's connectors (enable, test, edit, delivery log) as tabs. */
export function ConnectorDesk({ types, connectors, canEdit }: { types: ConnectorTypeMeta[]; connectors: ConnectorRow[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<ConnectorTypeMeta | null>(null);
  const [editing, setEditing] = useState<ConnectorRow | null>(null);
  const [log, setLog] = useState<{ connector: ConnectorRow; rows: DeliveryRow[] } | null>(null);

  const typeOf = (c: ConnectorRow) => types.find((x) => x.type === c.type)!;
  const run = (fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      toast(res.ok ? done : res.error);
    });
  const test = (c: ConnectorRow) =>
    start(async () => {
      const res = await testConnector(c.id);
      toast(res.ok ? (res.data.status === 'not_available' ? t('conn.test.notAvailable') : res.data.status === 'ok' ? t('conn.test.ok') : t('conn.test.failed', { message: res.data.message })) : res.error);
    });
  const openLog = (c: ConnectorRow) =>
    start(async () => {
      const res = await loadDeliveries(c.id);
      if (res.ok) setLog({ connector: c, rows: res.data });
      else toast(res.error);
    });
  const close = (m?: string) => {
    setAdding(null);
    setEditing(null);
    if (m) toast(m);
  };

  const testPill = (c: ConnectorRow) => (c.lastTestStatus ? <Pill label={t(`conn.test.status.${c.lastTestStatus}` as MessageKey)} warn={c.lastTestStatus === 'failed'} /> : <span>-</span>);

  const connectorCols: Col<ConnectorRow>[] = [
    { label: t('conn.col.name'), cell: (c) => c.name, sort: (c) => c.name },
    { label: t('conn.col.type'), cell: (c) => c.typeLabel },
    { label: t('conn.col.status'), cell: (c) => <Pill label={c.enabled ? t('conn.on') : t('conn.off')} warn={!c.enabled} />, sort: (c) => String(c.enabled) },
    { label: t('conn.col.test'), cell: testPill },
    { label: t('conn.col.tested'), cell: (c) => (c.lastTestAt ? fmt.dateTime(c.lastTestAt) : '-'), sort: (c) => c.lastTestAt },
    {
      label: '',
      cell: (c) =>
        canEdit ? (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button size="small" disabled={pending} onClick={() => run(() => setConnectorEnabled(c.id, !c.enabled), t('ops.saved'))}>{c.enabled ? t('conn.disable') : t('conn.enable')}</Button>
            <Button size="small" disabled={pending} onClick={() => test(c)} data-testid={`conn-test-${c.id}`}>{t('conn.test')}</Button>
            <Button size="small" onClick={() => setEditing(c)}>{t('conn.edit')}</Button>
            {c.type === 'webhook_out' && <Button size="small" onClick={() => openLog(c)}>{t('conn.log')}</Button>}
            <Button size="small" color="error" disabled={pending} onClick={() => run(() => deleteConnector(c.id), t('ops.saved'))}>{t('conn.delete')}</Button>
          </Stack>
        ) : null,
    },
  ];

  const typeCols: Col<ConnectorTypeMeta>[] = [
    { label: t('conn.col.type'), cell: (x) => x.label, sort: (x) => x.label },
    { label: t('conn.col.about'), cell: (x) => x.description },
    { label: t('conn.col.build'), cell: (x) => <Pill label={x.available ? t('conn.available') : t('conn.notAvailable')} warn={!x.available} /> },
    { label: '', cell: (x) => (canEdit ? <Button size="small" startIcon={<Add />} onClick={() => setAdding(x)} data-testid={`conn-add-${x.type}`}>{t('conn.add')}</Button> : null) },
  ];

  const logCols: Col<DeliveryRow>[] = [
    { label: t('conn.log.event'), cell: (d) => d.eventType },
    { label: t('conn.log.status'), cell: (d) => <Pill label={t(`conn.log.status.${d.status}` as MessageKey)} warn={d.status === 'dead' || d.status === 'retrying'} /> },
    { label: t('conn.log.attempts'), cell: (d) => d.attempts, num: true },
    { label: t('conn.log.reply'), cell: (d) => d.responseStatus ?? '-' },
    { label: t('conn.log.error'), cell: (d) => d.lastError ?? '-' },
    { label: t('conn.log.when'), cell: (d) => fmt.dateTime(d.createdAt), sort: (d) => d.createdAt },
    { label: '', cell: (d) => (canEdit && d.status !== 'delivered' ? <Button size="small" onClick={() => run(() => retryDelivery(d.id), t('conn.log.retried'))}>{t('conn.log.retry')}</Button> : null) },
  ];

  return (
    <>
      <Tabbed
        label={t('nav.connectors')}
        initial="mine"
        tabs={[
          { id: 'mine', label: t('conn.tab.mine'), node: <Grid testId="conn-list" empty={t('conn.empty')} rows={connectors} cols={connectorCols} /> },
          { id: 'types', label: t('conn.tab.types'), node: <Grid testId="conn-types" empty={t('conn.empty')} rows={types} cols={typeCols} /> },
        ]}
      />
      {adding && (
        <FormDialog
          title={adding.label}
          intro={<Typography variant="body2">{adding.available ? adding.description : `${adding.description} ${t('conn.notAvailableHint')}`}</Typography>}
          fields={configFields(t, adding)}
          onSubmit={(v) => saveConnector(adding.type, adding.fields, v)}
          onClose={close}
        />
      )}
      {editing && <FormDialog title={editing.name} fields={configFields(t, typeOf(editing), editing)} onSubmit={(v) => saveConnector(editing.type, typeOf(editing).fields, v, editing.id)} onClose={close} />}
      {log && (
        <InfoDialog title={`${log.connector.name}: ${t('conn.log')}`} onClose={() => setLog(null)}>
          <Grid testId="conn-deliveries" empty={t('conn.log.empty')} rows={log.rows} cols={logCols} />
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
