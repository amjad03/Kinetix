'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recordAction } from '@/app/(dashboard)/exams/office/actions';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, RecordPage, WorkflowStepper, type ActivityItem } from '@/components/templates';
import { Card, CheckboxField, DataTable, Dialog, SelectInput, StatusPill, TextInput, useToastOptional, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { label, recordHref, show, toneOf, type ColumnSpec, type Fact, type RecordAction, type RecordView, type Row } from '@/lib/exam-office';

/** One exam office record (session, paper, hall ticket, question paper…) on the shared record template. */
export function ExamRecord({ record: r }: { record: RecordView }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [open, setOpen] = useState<RecordAction | null>(null);
  const [pending, start] = useTransition();

  const run = (a: RecordAction, input: { comment?: string; value?: unknown } = {}) =>
    new Promise<string | void>((resolve) =>
      start(async () => {
        const res = await recordAction(r.kind, r.id, a.key, input);
        if (!res.ok) return resolve(res.error);
        toast?.success(t('xo.a.ok'));
        setOpen(null);
        router.refresh();
        resolve();
      }),
    );

  const button = (a: RecordAction) => (
    <Button key={a.key} className="h-10" variant={a.tone === 'primary' ? 'default' : a.tone === 'danger' ? 'destructive' : 'outline'} disabled={!!a.blocked || pending} title={a.blocked} onClick={() => (a.input ? setOpen(a) : void run(a))}>
      {label(t, 'xo.a.', a.key)}
    </Button>
  );
  const [first, ...rest] = [...r.actions.filter((a) => a.tone === 'primary' && !a.blocked), ...r.actions.filter((a) => !(a.tone === 'primary' && !a.blocked))];

  const activity: ActivityItem[] = r.activity.map((a) => ({ id: a.id, at: a.at, actor: a.actor, action: label(t, 'xo.ev.', a.action), detail: a.note ?? undefined }));
  const facts = (list: Fact[]) => list.map((f) => ({ label: label(t, 'xo.c.', f.key), value: show(t, fmt, f.value, f.format) }));
  const blocked = r.actions.find((a) => a.blocked)?.blocked;

  const approvalAction = (d: 'approve' | 'reject') => (r.approval?.key === 'result_approval' ? `result_approval_${d}` : d);
  const steps = r.steps?.map((s) => ({ id: s.key, label: label(t, 'xo.s.', s.key), state: s.state, by: s.by ?? undefined, at: s.at ?? undefined, note: s.note === 'pending' ? t('xo.s.pending') : (s.note ?? undefined) }));
  // A long workflow (the session's twelve steps) gets the full width of the overview; a short one sits beside the tabs.
  const wide = !!steps && steps.length > 5;
  const aside =
    r.approval || (steps && !wide) ? (
      r.approval ? (
        <ApprovalPanel
          title={label(t, 'xo.ap.', r.approval.key)}
          steps={wide ? undefined : steps}
          canDecide={r.approval.canDecide}
          onDecide={(d, comment) => run({ key: approvalAction(d) }, { comment })}
          history={activity.slice(0, 4)}
          extra={!r.approval.canDecide ? <p className="text-sm text-muted-foreground">{t('xo.ap.waiting')}</p> : undefined}
        />
      ) : (
        <Card title={t('xo.c.stage')}>
          <WorkflowStepper steps={steps!} />
        </Card>
      )
    ) : undefined;

  const content = r.overview.find((f) => f.key === 'content');
  return (
    <>
      <RecordPage
        title={r.title}
        subtitle={r.subtitle ?? undefined}
        status={{ label: label(t, 'xo.s.', r.status.key), tone: r.status.tone }}
        facts={facts(r.facts)}
        primary={first ? button(first) : undefined}
        secondary={rest.length ? <>{rest.map(button)}</> : undefined}
        overview={
          <div className="grid gap-6">
            {wide && (
              <Card title={t('xo.c.stage')}>
                <WorkflowStepper steps={steps!} />
              </Card>
            )}
            <Card>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {r.overview
                  .filter((f) => f.key !== 'content')
                  .map((f) => (
                    <div key={f.key} className="min-w-0">
                      <dt className="text-xs font-medium text-muted-foreground">{label(t, 'xo.c.', f.key)}</dt>
                      <dd className="mt-1 break-words text-sm">{f.format === 'status' ? <StatusPill tone={toneOf(String(f.value))}>{show(t, fmt, f.value, f.format)}</StatusPill> : show(t, fmt, f.value, f.format)}</dd>
                    </div>
                  ))}
              </dl>
              {blocked && <p className="mt-5 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">{blocked}</p>}
            </Card>
            {content && (
              <Card title={t('xo.c.content')}>
                {content.value === 'sealed' ? <StatusPill tone="info">{t('xo.s.sealed')}</StatusPill> : <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{String(content.value)}</pre>}
              </Card>
            )}
          </div>
        }
        related={r.related.map((rel) => ({ value: rel.key, label: label(t, 'xo.rel.', rel.key), count: rel.rows.length, content: <RelatedTable columns={rel.columns} rows={rel.rows} name={label(t, 'xo.rel.', rel.key)} /> }))}
        documents={r.documents.map((d) => ({ id: d.key, name: label(t, 'xo.doc.', d.key), href: d.href }))}
        activity={activity}
        aside={aside}
      />
      {open && <ActionDialog action={open} record={r} busy={pending} onClose={() => setOpen(null)} onRun={(input) => run(open, input)} />}
    </>
  );
}

/** A related list of a record: columns from the API, rows open their own record when they have one. */
export function RelatedTable({ columns, rows, name }: { columns: ColumnSpec[]; rows: Row[]; name: string }) {
  const { t, fmt } = useI18n();
  const cols: Column<Row>[] = columns.map((c, i) => ({
    id: c.key,
    header: c.key.startsWith('s_') ? c.key.slice(2) : label(t, 'xo.c.', c.key),
    rowHeader: i === 0,
    cell: (row) => (c.format === 'status' && row[c.key] ? <StatusPill tone={toneOf(String(row[c.key]))}>{show(t, fmt, row[c.key], c.format)}</StatusPill> : show(t, fmt, row[c.key], c.format)),
    sort: (row) => (typeof row[c.key] === 'number' || (typeof row[c.key] === 'string' && /^-?\d+(\.\d+)?$/.test(String(row[c.key]))) ? Number(row[c.key]) : String(row[c.key] ?? '')),
    csv: (row) => show(t, fmt, row[c.key], c.format),
  }));
  return <DataTable columns={cols} rows={rows} rowId={(row) => String(row._id ?? JSON.stringify(row))} label={name} exportName={name} empty={t('xo.empty')} rowHref={(row) => (row._kind && row._id ? recordHref(row._kind, row._id) : undefined)} />;
}

/** The fields an action asks for before it runs. */
function ActionDialog({ action, record, busy, onClose, onRun }: { action: RecordAction; record: RecordView; busy: boolean; onClose: () => void; onRun: (input: { comment?: string; value?: unknown }) => Promise<string | void> }) {
  const { t } = useI18n();
  const [comment, setComment] = useState('');
  const [text, setText] = useState('');
  const [absent, setAbsent] = useState<Set<string>>(() => new Set((record.candidates ?? []).filter((c) => c.status === 'absent').map((c) => c.id)));
  const [debarred, setDebarred] = useState<Set<string>>(() => new Set((record.candidates ?? []).filter((c) => c.status === 'debarred').map((c) => c.id)));
  const [modKind, setModKind] = useState('add');
  const [error, setError] = useState<string | null>(null);
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  };
  const submit = async () => {
    const value =
      action.input === 'receipt'
        ? { receiptNo: text }
        : action.input === 'marks'
          ? { marks: Number(text) }
          : action.input === 'datetime'
            ? { releaseAt: text ? new Date(text).toISOString() : '' }
            : action.input === 'absentees'
              ? { absent: [...absent], debarred: [...debarred] }
              : action.input === 'moderation'
                ? { kind: modKind, value: Number(text) }
                : undefined;
    const err = await onRun({ comment, value });
    if (err) setError(err);
  };
  return (
    <Dialog
      open
      title={label(t, 'xo.a.', action.key)}
      onClose={onClose}
      busy={busy}
      size={action.input === 'absentees' ? 'md' : 'sm'}
      actions={
        <>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button className="h-10" disabled={busy} onClick={() => void submit()}>
            {t('xo.a.run')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pt-1">
        {action.input === 'receipt' && <TextInput label={t('xo.a.receipt')} value={text} onChange={(e) => setText(e.target.value)} required />}
        {action.input === 'marks' && <TextInput type="number" label={t('xo.a.marks')} value={text} onChange={(e) => setText(e.target.value)} required />}
        {action.input === 'datetime' && <TextInput type="datetime-local" label={t('xo.a.releaseAt')} value={text} onChange={(e) => setText(e.target.value)} InputLabelProps={{ shrink: true }} required />}
        {action.input === 'moderation' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectInput label={t('xo.a.modKind')} value={modKind} onChange={(e) => setModKind(e.target.value)} options={['add', 'scale'].map((k) => ({ value: k, label: t(`xo.s.${k}` as 'xo.s.add') }))} />
            <TextInput type="number" label={t('xo.a.modValue')} value={text} onChange={(e) => setText(e.target.value)} required />
          </div>
        )}
        {action.input === 'absentees' && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t('xo.a.absentees')}</p>
            <ul className="grid max-h-[50vh] gap-1 overflow-y-auto rounded-md border p-2">
              {(record.candidates ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 rounded px-2 hover:bg-muted/50">
                  <CheckboxField label={`${c.rollNo} · ${c.name}`} checked={absent.has(c.id)} onChange={(v) => setAbsent(toggle(absent, c.id, v))} />
                  <CheckboxField label={t('xo.a.debar')} checked={debarred.has(c.id)} onChange={(v) => setDebarred(toggle(debarred, c.id, v))} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <TextInput label={t('xo.a.comment')} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} required={action.input === 'comment' || action.input === 'moderation'} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Dialog>
  );
}
