'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { cancelRequest, decideRequest, loadRequest, resubmitRequest, saveDefinition, startRequest } from '@/app/(dashboard)/workflows/actions';
import { FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatFields, formatSteps, type DefField, type DefinitionRow, type RequestDetail, type RequestRow } from '@/lib/workflows';

/** The form fields of a request: title, amount and the fields its definition declares. */
function requestFields(t: (k: MessageKey) => string, fields: DefField[], init?: { title: string; amount: number | null; payload: Record<string, unknown> }): Field[] {
  return [
    { name: 'title', label: t('wf.f.title'), required: true, init: init?.title },
    { name: 'amount', label: t('wf.f.amount'), init: init?.amount != null ? String(init.amount) : '' },
    ...fields.map<Field>((f) => ({
      name: `f_${f.key}`,
      label: f.label,
      required: f.required,
      kind: f.type === 'date' ? 'date' : f.type === 'select' ? 'select' : 'text',
      options: f.type === 'select' ? (f.options ?? []).map((o) => ({ value: o, label: o })) : undefined,
      init: init?.payload[f.key] != null ? String(init.payload[f.key]) : '',
    })),
  ];
}

/** My inbox, my requests, all requests and the definitions editor, with a request detail and timeline. */
export function WorkflowDesk({ inbox, mine, all, definitions, isAdmin }: { inbox: RequestRow[]; mine: RequestRow[]; all: RequestRow[] | null; definitions: DefinitionRow[]; isAdmin: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [starting, setStarting] = useState<DefinitionRow | null>(null);
  const [editing, setEditing] = useState<DefinitionRow | 'new' | null>(null);
  const [resubmitting, setResubmitting] = useState<RequestDetail | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (id: string) =>
    start(async () => {
      const res = await loadRequest(id);
      if (res.ok) {
        setComment('');
        setError(null);
        setDetail(res.data);
      } else toast(res.error);
    });

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setDetail(null);
        toast(t('ops.saved'));
      } else setError(res.error);
    });

  const statusPill = (r: { status: RequestRow['status'] }) => <Pill label={t(`wf.status.${r.status}` as MessageKey)} warn={r.status === 'rejected'} />;
  const requestCols = (withRequester: boolean): Col<RequestRow>[] => [
    { label: t('wf.col.title'), cell: (r) => r.title },
    { label: t('wf.col.type'), cell: (r) => r.requestType },
    ...(withRequester ? [{ label: t('wf.col.requester'), cell: (r: RequestRow) => r.requesterName }] : []),
    { label: t('wf.col.amount'), cell: (r) => (r.amount === null ? '-' : fmt.number(r.amount)), num: true, sort: (r) => r.amount },
    { label: t('wf.col.status'), cell: statusPill, sort: (r) => r.status },
    { label: t('wf.col.step'), cell: (r) => (r.stepName ? `${r.stepName} (${t('wf.step.of', { n: r.stepNumber, total: r.stepCount })})` : '-') },
    { label: t('wf.col.due'), cell: (r) => (r.dueAt ? fmt.dateTime(r.dueAt) : '-'), sort: (r) => r.dueAt },
    { label: t('wf.col.created'), cell: (r) => fmt.date(r.createdAt), sort: (r) => r.createdAt },
    { label: '', cell: (r) => <Button size="small" onClick={() => open(r.id)}>{t('wf.open')}</Button> },
  ];

  const defCols: Col<DefinitionRow>[] = [
    { label: t('wf.col.name'), cell: (d) => d.name, sort: (d) => d.name },
    { label: t('wf.col.type'), cell: (d) => d.requestType },
    { label: t('wf.col.steps'), cell: (d) => d.steps.map((s) => s.name).join(' > ') },
    { label: t('wf.col.fields'), cell: (d) => d.fields.length, num: true },
    { label: t('wf.col.status'), cell: (d) => <Pill label={d.active ? t('wf.active') : t('wf.inactive')} warn={!d.active} /> },
    { label: '', cell: (d) => <Button size="small" onClick={() => setEditing(d)}>{t('wf.def.edit')}</Button> },
  ];

  const timelineLine = (e: RequestDetail['timeline'][number]) =>
    [t(`wf.action.${e.action}` as MessageKey), e.stepName, e.actorName ? t('wf.d.by', { name: e.actorName }) : null, fmt.dateTime(e.createdAt)].filter(Boolean).join(' · ');

  const activeDefs = definitions.filter((d) => d.active);

  const tabs = [
    { id: 'inbox', label: t('wf.tab.inbox'), node: <Grid testId="wf-inbox" empty={t('wf.empty.inbox')} rows={inbox} cols={requestCols(true)} /> },
    {
      id: 'mine',
      label: t('wf.tab.mine'),
      node: (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            {activeDefs.map((d) => (
              <Button key={d.id} variant="outlined" startIcon={<Add />} onClick={() => setStarting(d)} data-testid={`wf-start-${d.requestType}`}>
                {d.name}
              </Button>
            ))}
          </Stack>
          <Grid testId="wf-mine" empty={t('wf.empty.mine')} rows={mine} cols={requestCols(false)} />
        </>
      ),
    },
    ...(all ? [{ id: 'all', label: t('wf.tab.all'), node: <Grid testId="wf-all" empty={t('wf.empty.all')} rows={all} cols={requestCols(true)} exportName="workflow-requests" /> }] : []),
    ...(isAdmin
      ? [
          {
            id: 'defs',
            label: t('wf.tab.defs'),
            node: (
              <>
                <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} onClick={() => setEditing('new')} data-testid="wf-new-def">
                  {t('wf.def.new')}
                </Button>
                <Grid testId="wf-defs" empty={t('wf.empty.defs')} rows={definitions} cols={defCols} />
              </>
            ),
          },
        ]
      : []),
  ];

  const close = (m?: string) => {
    setStarting(null);
    setEditing(null);
    setResubmitting(null);
    if (m) toast(m);
  };

  return (
    <>
      <Tabbed label={t('nav.workflows')} initial="inbox" tabs={tabs} />

      {detail && (
        <InfoDialog title={detail.title} onClose={() => setDetail(null)}>
          <Stack spacing={2} data-testid="wf-detail">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {statusPill(detail)}
              <Typography variant="body2">{t('wf.d.requester')}: {detail.requesterName}</Typography>
              {detail.amount !== null && <Typography variant="body2">{t('wf.d.amount')}: {fmt.number(detail.amount)}</Typography>}
              {detail.stepName && <Typography variant="body2">{detail.stepName} ({t('wf.step.of', { n: detail.stepNumber, total: detail.stepCount })})</Typography>}
            </Stack>
            {detail.definition.fields.length > 0 && (
              <div>
                <Typography variant="subtitle2">{t('wf.d.details')}</Typography>
                {detail.definition.fields.map((f) => (
                  <Typography key={f.key} variant="body2">{f.label}: {detail.payload[f.key] != null ? String(detail.payload[f.key]) : '-'}</Typography>
                ))}
              </div>
            )}
            <div>
              <Typography variant="subtitle2">{t('wf.d.timeline')}</Typography>
              <Stack component="ol" spacing={0.5} sx={{ m: 0, pl: 2.5 }} data-testid="wf-timeline">
                {detail.timeline.map((e) => (
                  <li key={e.id}>
                    <Typography variant="body2">{timelineLine(e)}</Typography>
                    {e.comment && <Typography variant="caption" color="text.secondary">{e.comment}</Typography>}
                  </li>
                ))}
              </Stack>
            </div>
            {error && <Alert severity="error">{error}</Alert>}
            {(detail.canDecide || detail.canCancel) && (
              <FormField label={t('wf.d.comment')}>
                <TextInput value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} fullWidth data-testid="wf-comment" />
              </FormField>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {detail.canDecide && (
                <>
                  <Button variant="contained" disabled={pending} onClick={() => run(() => decideRequest(detail.id, 'approve', comment, detail.version))} data-testid="wf-approve">{t('wf.d.approve')}</Button>
                  <Button variant="outlined" disabled={pending} onClick={() => run(() => decideRequest(detail.id, 'return', comment, detail.version))}>{t('wf.d.return')}</Button>
                  <Button variant="outlined" color="error" disabled={pending} onClick={() => run(() => decideRequest(detail.id, 'reject', comment, detail.version))}>{t('wf.d.reject')}</Button>
                </>
              )}
              {detail.canResubmit && (
                <Button variant="contained" disabled={pending} onClick={() => { setResubmitting(detail); setDetail(null); }}>{t('wf.d.resubmit')}</Button>
              )}
              {detail.canCancel && (
                <Button color="error" disabled={pending} onClick={() => run(() => cancelRequest(detail.id, comment))}>{t('wf.d.cancel')}</Button>
              )}
            </Stack>
          </Stack>
        </InfoDialog>
      )}

      {starting && <FormDialog title={starting.name} intro={starting.description ? <Typography variant="body2">{starting.description}</Typography> : undefined} onSubmit={(v) => startRequest(starting.requestType, starting.fields, v)} onClose={close} fields={requestFields(t, starting.fields)} />}

      {resubmitting && (
        <FormDialog
          title={t('wf.d.resubmit')}
          onSubmit={(v) => resubmitRequest(resubmitting.id, resubmitting.definition.fields, v)}
          onClose={close}
          fields={requestFields(t, resubmitting.definition.fields, { title: resubmitting.title, amount: resubmitting.amount, payload: resubmitting.payload })}
        />
      )}

      {editing && (
        <FormDialog
          title={editing === 'new' ? t('wf.def.new') : t('wf.def.edit')}
          intro={
            <>
              <Typography variant="body2">{t('wf.def.help')}</Typography>
              <Typography variant="caption" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                {'days | Days | number | required\nkind | Kind | select | required | casual, sick\n\nHead | head | | | 24\nAccounts | role:accountant | 5000\nDesk | user:<id>'}
              </Typography>
            </>
          }
          onSubmit={(v) => saveDefinition(v, editing === 'new' ? undefined : { id: editing.id, version: editing.version })}
          onClose={close}
          fields={[
            ...(editing === 'new' ? [{ name: 'requestType', label: t('wf.def.requestType'), required: true } satisfies Field] : []),
            { name: 'name', label: t('wf.def.name'), required: true, init: editing === 'new' ? '' : editing.name },
            { name: 'description', label: t('wf.def.description'), init: editing === 'new' ? '' : editing.description },
            { name: 'fields', label: t('wf.def.fields'), kind: 'multiline', init: editing === 'new' ? '' : formatFields(editing.fields) },
            { name: 'steps', label: t('wf.def.steps'), kind: 'multiline', required: true, init: editing === 'new' ? '' : formatSteps(editing.steps) },
            { name: 'active', label: t('wf.def.active'), kind: 'select', init: editing === 'new' || editing.active ? 'yes' : 'no', options: [{ value: 'yes', label: t('wf.yes') }, { value: 'no', label: t('wf.no') }] },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
