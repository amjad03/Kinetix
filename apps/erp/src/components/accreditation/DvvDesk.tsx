'use client';

import { Download, Paperclip } from 'lucide-react';
import { useState, useTransition } from 'react';
import { addDvvDocument, raiseDvv, updateDvv } from '@/app/(dashboard)/accreditation/actions';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@/components/kx';
import { FileFormDialog } from '@/components/pathways-b/common';
import { Card, DataTable, FormRow, FormRowActions, SelectInput, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { accDownload, fig, type DvvRow } from '@/lib/accreditation-ui';

const DEVIATIONS = ['data_mismatch', 'documents_missing', 'formula', 'out_of_period', 'other'] as const;
const TONE = { open: 'warning', answered: 'info', accepted: 'success', rejected: 'danger', closed: 'neutral' } as const;
const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;

/**
 * The data validation and verification (DVV) tracker: each clarification with its deviation, the value the institution
 * filed and the one DVV recommends, the response and its documents, and the decision.
 */
export function DvvDesk({ fw, cycle, rows, codes, canManage }: { fw: string; cycle: string; rows: DvvRow[]; codes: { value: string; label: string }[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const blank = { metricCode: '', deviation: 'other', query: '', heiValue: '', dvvValue: '', dueOn: '' };
  const [v, setV] = useState(blank);
  const [respond, setRespond] = useState<DvvRow | null>(null);
  const [answer, setAnswer] = useState('');
  const [decide, setDecide] = useState<DvvRow | null>(null);
  const [dvvValue, setDvvValue] = useState('');
  const [attach, setAttach] = useState<DvvRow | null>(null);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(done);
        after?.();
      } else toast.error(res.error ?? '');
    });
  const columns: Column<DvvRow>[] = [
    { id: 'metric', header: t('acx.d.metric'), rowHeader: true, sort: (r) => r.metricCode, cell: (r) => <b>{r.metricCode}</b> },
    { id: 'deviation', header: t('acx.d.deviation'), sort: (r) => r.deviation, cell: (r) => t(`acx.dev.${r.deviation}` as MessageKey) },
    { id: 'query', header: t('acx.d.query'), sort: (r) => r.query, cell: (r) => <span className="block max-w-[420px] whitespace-pre-wrap text-[13px]">{r.query}</span> },
    { id: 'values', header: t('acx.d.values'), hideBelow: 'md', csv: (r) => `${r.heiValue ?? ''} / ${r.dvvValue ?? ''}`, cell: (r) => <span className="tabular-nums">{fig(r.heiValue)} → {fig(r.dvvValue)}</span> },
    { id: 'response', header: t('acx.d.response'), sort: (r) => r.response, cell: (r) => (r.response ? <span className="block max-w-[360px] whitespace-pre-wrap text-[13px]">{r.response}</span> : <span className="text-muted-foreground">-</span>) },
    { id: 'docs', header: t('acx.d.documents'), align: 'right', sort: (r) => r.documents ?? 0, cell: (r) => <span className="inline-flex items-center gap-1 tabular-nums"><Paperclip className="size-3" aria-hidden />{r.documents ?? 0}</span> },
    { id: 'due', header: t('acx.d.due'), hideBelow: 'lg', sort: (r) => r.dueOn ?? '', cell: (r) => (r.dueOn ? fmt.date(r.dueOn) : '-') },
    { id: 'status', header: t('acx.d.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={TONE[r.status]}>{t(`acx.ds.${r.status}` as MessageKey)}</StatusPill> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('acx.t.actions'),
            csv: false as const,
            cell: (r: DvvRow) =>
              r.status === 'closed' || r.status === 'accepted' ? null : (
                <span className="flex flex-wrap gap-1.5">
                  <Button size="small" variant="outlined" onClick={() => { setRespond(r); setAnswer(r.response); }}>
                    {t('acx.d.respond')}
                  </Button>
                  <Button size="small" variant="text" startIcon={<Paperclip />} onClick={() => setAttach(r)}>
                    {t('acx.d.attach')}
                  </Button>
                  {r.status === 'answered' && (
                    <>
                      <Button size="small" variant="text" disabled={pending} onClick={() => run(() => updateDvv(fw, r.id, { status: 'accepted' }), t('acx.d.saved'))}>
                        {t('acx.d.accept')}
                      </Button>
                      <Button size="small" variant="text" color="error" onClick={() => { setDecide(r); setDvvValue(r.dvvValue === null ? '' : String(r.dvvValue)); }}>
                        {t('acx.d.reject')}
                      </Button>
                    </>
                  )}
                  <Button size="small" variant="text" disabled={pending} onClick={() => run(() => updateDvv(fw, r.id, { status: 'closed' }), t('acx.d.saved'))}>
                    {t('acx.d.close')}
                  </Button>
                </span>
              ),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="acx-dvv">
      {canManage && (
        <Card title={t('acx.d.raise')} subtitle={t('acx.d.raiseSub')}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => raiseDvv(fw, cycle, v), t('acx.d.raised'), () => setV(blank));
            }}
          >
            <FormRow>
              <SelectInput className="w-[200px]" label={t('acx.d.metric')} required value={v.metricCode} onChange={set('metricCode')} options={codes} empty="" />
              <SelectInput className="w-[220px]" label={t('acx.d.deviation')} value={v.deviation} onChange={set('deviation')} options={DEVIATIONS.map((d) => ({ value: d, label: t(`acx.dev.${d}` as MessageKey) }))} />
              <TextInput className="w-[150px]" label={t('acx.d.heiValue')} inputMode="decimal" value={v.heiValue} onChange={set('heiValue')} />
              <TextInput className="w-[150px]" label={t('acx.d.dvvValue')} inputMode="decimal" value={v.dvvValue} onChange={set('dvvValue')} />
              <TextInput className="w-[170px]" type="date" label={t('acx.d.due')} value={v.dueOn} onChange={set('dueOn')} />
            </FormRow>
            <FormRow>
              <TextInput className="min-w-[280px] flex-1" label={t('acx.d.query')} required multiline minRows={2} value={v.query} onChange={set('query')} />
              <FormRowActions>
                <Button type="submit" variant="contained" disabled={pending || !v.metricCode || v.query.trim().length < 3} data-testid="acx-dvv-raise">
                  {t('acx.d.raiseBtn')}
                </Button>
              </FormRowActions>
            </FormRow>
          </form>
        </Card>
      )}
      <DataTable<DvvRow>
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        label={t('acx.d.title')}
        exportName={`dvv-${fw}-${cycle}`}
        empty={t('acx.d.empty')}
        rowTone={(r) => (r.status === 'open' || r.status === 'rejected' ? 'warning' : undefined)}
        toolbar={
          <a href={accDownload(fw, 'dvv', cycle)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium no-underline hover:bg-accent">
            <Download className="size-4" aria-hidden />
            {t('acx.d.download')}
          </a>
        }
      />
      {respond && (
        <Dialog open onClose={() => setRespond(null)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('acx.d.respondTitle', { code: respond.metricCode })}</DialogTitle>
          <DialogContent>
            <p className="mt-0 text-[13px] text-muted-foreground">{respond.query}</p>
            <TextInput fullWidth label={t('acx.d.response')} multiline minRows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRespond(null)}>{t('acx.cancel')}</Button>
            <Button variant="contained" disabled={pending || !answer.trim()} onClick={() => run(() => updateDvv(fw, respond.id, { response: answer.trim() }), t('acx.d.saved'), () => setRespond(null))}>
              {t('acx.d.send')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {decide && (
        <Dialog open onClose={() => setDecide(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('acx.d.rejectTitle', { code: decide.metricCode })}</DialogTitle>
          <DialogContent>
            <TextInput fullWidth label={t('acx.d.dvvValue')} inputMode="decimal" value={dvvValue} onChange={(e) => setDvvValue(e.target.value)} helper={t('acx.d.dvvValueHint')} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDecide(null)}>{t('acx.cancel')}</Button>
            <Button variant="contained" color="error" disabled={pending} onClick={() => run(() => updateDvv(fw, decide.id, { status: 'rejected', dvvValue: dvvValue.trim() === '' ? null : Number(dvvValue) }), t('acx.d.saved'), () => setDecide(null))}>
              {t('acx.d.reject')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {attach && (
        <FileFormDialog
          title={t('acx.d.attachTitle', { code: attach.metricCode })}
          allowed={DOC_TYPES}
          submitLabel={t('acx.d.attach')}
          fields={[
            { name: 'title', label: t('acx.m.docTitle'), required: true },
            { name: 'url', label: t('acx.m.link') },
          ]}
          onSubmit={(fv, file) => addDvvDocument(fw, attach.id, fv, file)}
          onClose={() => setAttach(null)}
        />
      )}
    </div>
  );
}
