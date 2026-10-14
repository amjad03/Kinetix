'use client';

import { FileText, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskRead, deskSend } from '@/app/(dashboard)/accounts/actions';
import { useWord } from '@/components/fee-desk/SpecTable';
import { RecordForm } from '@/components/records/RecordForm';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, SelectInput, StatGrid, StatTile, StatusPill, SwitchField, TextInput, useToastOptional, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toneOf } from '@/lib/fee-desk';
import { rupeesInput, type FeeHead, type PreviewRow, type StructureDetail as Detail } from '@/lib/fee-depth';
import type { RecordMeta, Row } from '@/lib/records';
import type { RoleName } from '@/lib/types';

type Item = { code: string; amount: string };
type Reassign = { students: number; changed: number; rows: { studentId: string; fullName: string; beforePaise: number; afterPaise: number; deltaPaise: number; note?: string }[] };

/**
 * A fee structure: its heads and amounts (changed while a draft, or after publishing, when it goes back for approval),
 * who it applies to and what each pays (optional heads only for those who take them, pro-rata for late joiners),
 * approval and publishing, bulk assignment, and re-assignment after a change.
 */
export function StructureDetail({ d, heads, meta, row, preview, me }: { d: Detail; heads: FeeHead[]; meta: RecordMeta; row: Row; preview: PreviewRow[]; me: { id: string; roles: RoleName[] } }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const router = useRouter();
  const toast = useToastOptional();
  const s = d.structure;
  const editable = ['draft', 'rejected', 'published'].includes(s.status);
  const [items, setItems] = useState<Item[]>(() => (d.items.length ? d.items.map((i) => ({ code: i.code, amount: String(i.amountPaise / 100) })) : [{ code: heads[0]?.code ?? '', amount: '' }]));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [decide, setDecide] = useState(false);
  const [assign, setAssign] = useState(false);
  const [reassign, setReassign] = useState<Reassign | null>(null);
  const [pending, start] = useTransition();
  const total = items.reduce((a, i) => a + (rupeesInput(i.amount) ?? 0), 0);
  const heads_ = heads.filter((h) => h.active);
  const isHead = me.roles.some((r) => r === 'principal' || r === 'tenant_admin');

  const setItem = (i: number, p: Partial<Item>) => {
    setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setDirty(true);
  };
  const run = (path: string, body: unknown = {}, method: 'POST' | 'PUT' = 'POST', ok = 'fd.saved') =>
    start(async () => {
      const res = await deskSend(path, body, method);
      if (!res.ok) return setError(res.error);
      setError(null);
      setDirty(false);
      toast?.success(t(ok as MessageKey));
      router.refresh();
    });
  const saveItems = () => {
    const bad = items.find((i) => !i.code || rupeesInput(i.amount) === null);
    if (bad) return setError(t('fx.err.items'));
    run(`/v1/fee-setup/structures/${s.id}/items`, { items: items.map((i) => ({ code: i.code, amountPaise: rupeesInput(i.amount)! })) }, 'PUT');
  };
  const doReassign = () =>
    start(async () => {
      const res = await deskSend<Reassign>(`/v1/fee-setup/structures/${s.id}/reassign`, {});
      if (!res.ok) return setError(res.error);
      setReassign(res.data);
      router.refresh();
    });

  const previewCols: Column<PreviewRow>[] = [
    { id: 'student', header: t('fx.col.student'), rowHeader: true, cell: (r) => `${r.fullName} · ${r.rollNo}`, sort: (r) => r.fullName },
    { id: 'section', header: t('fx.col.section'), hideBelow: 'md', cell: (r) => r.section, sort: (r) => r.section },
    { id: 'quota', header: t('fx.col.quota'), hideBelow: 'lg', cell: (r) => (r.quota ? word(r.quota) : '—') },
    { id: 'pct', header: t('fx.col.share'), align: 'right', hideBelow: 'sm', cell: (r) => `${r.prorataPercent}%` },
    { id: 'amount', header: t('fx.col.amount'), align: 'right', cell: (r) => fmt.rupees(r.amountPaise), sort: (r) => r.amountPaise },
    { id: 'state', header: t('fx.col.status'), cell: (r) => (r.assigned ? <StatusPill tone="success">{t('fx.assigned')}</StatusPill> : <StatusPill tone="neutral">{t('fx.notYet')}</StatusPill>) },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusPill tone={toneOf(s.status)}>{word(s.status)}</StatusPill>
          <span>{[s.academicYear, s.term ? t('fx.sem', { n: s.term }) : null, s.batch, s.quota ? word(s.quota) : null, s.category].filter(Boolean).join(' · ') || t('fx.everyone')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" onClick={() => setEdit(true)}>
            <Pencil className="size-4" /> {t('fx.editDetails')}
          </Button>
          <Button asChild variant="outline" className="h-9">
            <Link href={`/fees/structures/${s.id}/print`}>
              <FileText className="size-4" /> {t('fx.printSheet')}
            </Link>
          </Button>
          {(s.status === 'draft' || s.status === 'rejected') && (
            <Button className="h-9" disabled={pending || dirty || !d.items.length} onClick={() => run(`/v1/fee-accounts/structures/${s.id}/submit`, {}, 'POST', 'fd.done.submitted')}>
              {t('fd.a.submit')}
            </Button>
          )}
          {s.status === 'pending' && isHead && s.submittedBy !== me.id && (
            <Button className="h-9" onClick={() => setDecide(true)}>
              {t('fx.decide')}
            </Button>
          )}
          {s.status === 'approved' && (
            <Button className="h-9" disabled={pending} onClick={() => run(`/v1/fee-accounts/structures/${s.id}/publish`, {}, 'POST', 'fd.done.published')}>
              {t('fd.a.publish')}
            </Button>
          )}
          {s.status === 'published' && (
            <>
              <Button variant="outline" className="h-9" disabled={pending} onClick={doReassign}>
                {t('fx.reassign')}
              </Button>
              <Button className="h-9" onClick={() => setAssign(true)}>
                <Users className="size-4" /> {t('fx.assign')}
              </Button>
            </>
          )}
        </div>
      </div>

      <StatGrid min={180}>
        <StatTile label={t('fx.kpi.total')} value={fmt.rupees(d.totalPaise)} />
        <StatTile label={t('fx.kpi.heads')} value={d.items.length} />
        <StatTile label={t('fx.kpi.covers')} value={d.students} caption={t('fx.kpi.coversCaption')} />
        <StatTile label={t('fx.kpi.assigned')} value={d.assigned} />
      </StatGrid>

      <Card title={t('fx.headsAndAmounts')} subtitle={editable ? (s.status === 'published' ? t('fx.publishedEditHint') : t('fx.itemsHint')) : t('fx.lockedHint')}>
        <div className="grid gap-3">
          {items.map((it, i) => {
            const h = heads.find((x) => x.code === it.code);
            return (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <SelectInput label={t('fx.col.head')} value={it.code} disabled={!editable} onChange={(e) => setItem(i, { code: e.target.value })} options={heads_.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} empty={t('fd.pick')} />
                <TextInput label={t('fx.f.amount')} value={it.amount} disabled={!editable} onChange={(e) => setItem(i, { amount: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
                <span className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
                  {h?.optional && <StatusPill tone="info">{t('fx.optionalFor', { who: word(h.linkedModule) })}</StatusPill>}
                  {h && !h.refundable && <StatusPill tone="neutral">{t('fx.nonRefundable')}</StatusPill>}
                  {h && h.gstRate > 0 && <StatusPill tone="warning">{t('fx.gstRate', { rate: h.gstRate })}</StatusPill>}
                </span>
                {editable && items.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} onClick={() => { setItems(items.filter((_, j) => j !== i)); setDirty(true); }}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {editable && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" className="h-9" onClick={() => { setItems([...items, { code: '', amount: '' }]); setDirty(true); }}>
                <Plus className="size-4" /> {t('fx.addHead')}
              </Button>
              <span className="text-sm">
                {t('fx.kpi.total')}: <b className="tabular-nums">{fmt.rupees(total)}</b>
              </span>
              <Button className="h-9" disabled={pending || !dirty} onClick={saveItems}>
                {t('fx.saveHeads')}
              </Button>
            </div>
          )}
          {d.plan && <p className="m-0 text-sm text-muted-foreground">{t('fx.planNote', { name: d.plan.name, parts: d.plan.parts.map((p) => `${p.percent}%`).join(' + ') })}</p>}
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </Card>

      <Card title={t('fx.whoPays')} subtitle={t('fx.whoPaysHint')}>
        {preview.length === 0 ? <EmptyState icon={<Users />} title={t('fx.noStudentsMatch')} dense>{t('fx.noStudentsMatchBody')}</EmptyState> : <DataTable columns={previewCols} rows={preview} rowId={(r) => r.studentId} label={t('fx.whoPays')} exportName="structure-students" />}
      </Card>

      {edit && (
        <RecordForm
          meta={meta}
          row={row}
          title={t('fx.editDetails')}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            router.refresh();
          }}
        />
      )}
      {decide && <DecideStructure id={s.id} onClose={() => setDecide(false)} />}
      {assign && <AssignDialog id={s.id} onClose={() => setAssign(false)} />}
      {reassign && (
        <Dialog title={t('fx.reassignDone', { n: reassign.changed })} size="md" onClose={() => setReassign(null)} actions={<Button className="h-10" onClick={() => setReassign(null)}>{t('common.close')}</Button>}>
          <DataTable
            columns={[
              { id: 's', header: t('fx.col.student'), rowHeader: true, cell: (r) => r.fullName },
              { id: 'b', header: t('fx.col.before'), align: 'right', cell: (r) => fmt.rupees(r.beforePaise) },
              { id: 'a', header: t('fx.col.after'), align: 'right', cell: (r) => fmt.rupees(r.afterPaise) },
              { id: 'd', header: t('fx.col.change'), align: 'right', cell: (r) => (r.deltaPaise > 0 ? '+' : '') + fmt.rupees(r.deltaPaise) },
              { id: 'n', header: t('fx.col.note'), cell: (r) => r.note ?? '' },
            ]}
            rows={reassign.rows}
            rowId={(r) => r.studentId}
            label={t('fx.reassign')}
            bare
          />
        </Dialog>
      )}
    </div>
  );
}

function DecideStructure({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (decision: 'approve' | 'reject') =>
    start(async () => {
      const res = await deskSend(`/v1/fee-accounts/structures/${id}/decide`, { decision, comment });
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('fx.decide')}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" className="h-10" disabled={pending} onClick={() => send('reject')}>
            {t('fx.reject')}
          </Button>
          <Button className="h-10" disabled={pending} onClick={() => send('approve')}>
            {t('fx.approve')}
          </Button>
        </>
      }
    >
      <TextInput label={t('fx.f.comment')} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} helperText={t('fx.f.commentHelp')} />
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** Assigns a published structure to every matching student (or with pro-rata for those who joined late). */
function AssignDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [prorata, setProrata] = useState(false);
  const [dueOn, setDueOn] = useState('');
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [done, setDone] = useState<{ assigned: number; amountPaise: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const check = () =>
    start(async () => {
      const q = new URLSearchParams(prorata ? { prorata: '1', ...(termStart && termEnd ? { termStart, termEnd } : {}) } : {});
      const res = await deskRead<PreviewRow[]>(`/v1/fee-setup/structures/${id}/preview?${q}`);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(res.data.filter((r) => !r.assigned));
    });
  const go = () =>
    start(async () => {
      const res = await deskSend<{ assigned: number; amountPaise: number }>(`/v1/fee-setup/structures/${id}/assign`, { prorata, ...(dueOn ? { dueOn } : {}), ...(prorata && termStart && termEnd ? { termStart, termEnd } : {}) });
      if (!res.ok) return setError(res.error);
      setDone(res.data);
      router.refresh();
    });
  return (
    <Dialog
      title={t('fx.assign')}
      size="md"
      busy={pending}
      onClose={onClose}
      actions={
        done ? (
          <Button className="h-10" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-10" disabled={pending} onClick={check}>
              {t('fx.checkWho')}
            </Button>
            <Button className="h-10" disabled={pending || !rows || rows.length === 0} onClick={go}>
              {t('fx.assignN', { n: rows?.length ?? 0 })}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="m-0 text-sm">{t('fx.assignedDone', { n: done.assigned, amount: fmt.rupees(done.amountPaise) })}</p>
      ) : (
        <div className="grid gap-4">
          <TextInput label={t('fx.f.dueOn')} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} helperText={t('fx.f.dueOnHelp')} />
          <SwitchField label={t('fx.prorata')} checked={prorata} onChange={(v) => { setProrata(v); setRows(null); }} />
          {prorata && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label={t('fx.f.termStart')} type="date" value={termStart} onChange={(e) => { setTermStart(e.target.value); setRows(null); }} helperText={t('fx.f.termHelp')} />
              <TextInput label={t('fx.f.termEnd')} type="date" value={termEnd} onChange={(e) => { setTermEnd(e.target.value); setRows(null); }} />
            </div>
          )}
          {rows && (
            <p className="m-0 text-sm">
              {rows.length === 0 ? t('fx.nobodyToAssign') : t('fx.willAssign', { n: rows.length, amount: fmt.rupees(rows.reduce((a, r) => a + r.amountPaise, 0)) })}
            </p>
          )}
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
