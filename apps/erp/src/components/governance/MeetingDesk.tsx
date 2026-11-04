'use client';

import { useRouter } from 'next/navigation';
import { Check, Download, FileSignature, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { addAction, meetingStep, reportAction, saveAgenda, saveAttendance, saveMeeting, signMinutes } from '@/app/(dashboard)/governance/pass-actions';
import { Alert, Button } from '@/components/kx';
import { FormDialog, Grid, useToast, type Field } from '@/components/ops/kit';
import { Card, FormField, SelectInput, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { minutesTone, OUTCOMES, type AgendaItem, type MeetingDetail } from '@/lib/governance-pass';
import type { ActionResult } from '@/lib/types';

type Draft = Pick<AgendaItem, 'title' | 'presenter' | 'discussion' | 'resolution' | 'outcome'>;

/**
 * The secretary's desk for one meeting: notice to the members, attendance with quorum, the minutes and each agenda
 * item's resolution while the minutes are a draft; then circulation, each present member's approval or objection
 * (signed against the text's fingerprint), and the action items with the action taken.
 */
export function MeetingDesk({ m, people }: { m: MeetingDetail; people: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const draft = m.minutesStatus === 'draft' && m.status !== 'cancelled';
  const edit = m.canManage && draft;
  const [minutes, setMinutes] = useState(m.minutes);
  const [items, setItems] = useState<Draft[]>(m.agenda.map(({ title, presenter, discussion, resolution, outcome }) => ({ title, presenter, discussion, resolution, outcome })));
  const [att, setAtt] = useState<Record<string, string>>(Object.fromEntries(m.attendance.map((a) => [a.memberId, a.status ?? ''])));
  const [dialog, setDialog] = useState<'action' | 'object' | { report: string } | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>, ok?: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (ok ?? t('ops.saved')) : r.error);
      if (r.ok) router.refresh();
    });
  const saveAll = () =>
    run(async () => {
      const a = await saveMeeting(m.id, { minutes });
      if (!a.ok) return a;
      const b = await saveAgenda(m.id, items.filter((i) => i.title.trim().length >= 2));
      if (!b.ok) return b;
      const entries = Object.entries(att).filter(([, s]) => s).map(([memberId, status]) => ({ memberId, status }));
      return entries.length ? saveAttendance(m.id, entries) : b;
    });
  const present = Object.values(att).filter((s) => s === 'present').length;
  const set = (i: number, k: keyof Draft, v: string) => setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const actionFields: Field[] = [
    { name: 'title', label: t('gp.m.actionTitle'), required: true },
    { name: 'ownerUserId', label: t('gp.m.owner'), kind: 'select', options: people.map((p) => ({ value: p.id, label: p.name })), required: true },
    { name: 'dueOn', label: t('gp.m.dueOn'), kind: 'date', required: true },
    { name: 'agendaItemId', label: t('gp.m.fromItem'), kind: 'select', options: [{ value: '', label: '-' }, ...m.agenda.map((a) => ({ value: a.id, label: `${a.seq}. ${a.title}` }))] },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="gov-meeting-bar">
        <StatusPill tone={minutesTone(m.minutesStatus)}>{t(`gp.mn.${m.minutesStatus}` as MessageKey)}</StatusPill>
        <StatusPill tone={m.quorum.met ? 'success' : m.quorum.met === false ? 'danger' : 'neutral'}>{t('gp.m.quorum', { present: m.quorum.present, needed: m.quorum.needed, members: m.quorum.members })}</StatusPill>
        {m.noticeSentAt && <StatusPill tone="neutral">{t('gp.m.noticeSent', { at: fmt.dateTime(m.noticeSentAt) })}</StatusPill>}
        <span className="flex-1" />
        <a href={`/api/download?kind=committee-minutes&id=${m.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid="gov-minutes-pdf">
          <Download className="size-4 text-muted-foreground" aria-hidden />
          {t('gp.m.pdf')}
        </a>
        {m.canManage && m.status === 'scheduled' && (
          <Button startIcon={<Send className="size-4" />} disabled={pending} onClick={() => run(() => meetingStep(m.id, 'notice'), t('gp.m.noticeDone'))} data-testid="gov-notice">
            {t('gp.m.notice')}
          </Button>
        )}
        {edit && (
          <Button variant="contained" disabled={pending} onClick={saveAll} data-testid="gov-save-minutes">
            {t('ops.save')}
          </Button>
        )}
        {edit && (
          <Button startIcon={<FileSignature className="size-4" />} disabled={pending} onClick={() => run(() => meetingStep(m.id, 'circulate'), t('gp.m.circulated'))} data-testid="gov-circulate">
            {t('gp.m.circulate')}
          </Button>
        )}
        {m.canManage && m.minutesStatus === 'circulated' && (
          <Button startIcon={<Undo2 className="size-4" />} disabled={pending} onClick={() => run(() => meetingStep(m.id, 'revise'))} data-testid="gov-revise">
            {t('gp.m.revise')}
          </Button>
        )}
        {m.canSign && (
          <>
            <Button variant="contained" startIcon={<Check className="size-4" />} disabled={pending} onClick={() => run(() => signMinutes(m.id, 'approve', ''), t('gp.m.signed'))} data-testid="gov-approve">
              {t('gp.m.approve')}
            </Button>
            <Button color="error" startIcon={<X className="size-4" />} disabled={pending} onClick={() => setDialog('object')} data-testid="gov-object">
              {t('gp.m.object')}
            </Button>
          </>
        )}
      </div>
      {m.minutesStatus !== 'draft' && <Alert severity={m.minutesStatus === 'approved' ? 'success' : 'info'} className="mb-4">{m.minutesStatus === 'approved' ? t('gp.m.approvedNote') : t('gp.m.circulatedNote', { approvals: m.approval.approvals, needed: m.approval.needed })}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card>
            <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.m.proceedings')}</h2>
            {edit ? (
              <TextInput multiline minRows={3} fullWidth value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={t('gp.m.minutesHint')} slotProps={{ htmlInput: { 'aria-label': t('gp.m.proceedings') } }} data-testid="gov-minutes" />
            ) : (
              <p className="m-0 whitespace-pre-wrap text-[13px]">{m.minutes || '-'}</p>
            )}
          </Card>
          <h2 className="mt-6 mb-3 text-[17px] font-semibold">{t('gp.m.agenda')}</h2>
          <div className="flex flex-col gap-3" data-testid="gov-agenda">
            {items.map((it, i) => (
              <Card key={i}>
                {edit ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label={t('gp.m.item', { n: i + 1 })}>
                      <TextInput fullWidth value={it.title} onChange={(e) => set(i, 'title', e.target.value)} />
                    </FormField>
                    <FormField label={t('gp.m.outcome')}>
                      <SelectInput fullWidth value={it.outcome} onChange={(e) => set(i, 'outcome', e.target.value)} options={OUTCOMES.map((o) => ({ value: o, label: t(`gp.out.${o}` as MessageKey) }))} />
                    </FormField>
                    <FormField label={t('gp.m.discussion')}>
                      <TextInput fullWidth multiline minRows={2} value={it.discussion} onChange={(e) => set(i, 'discussion', e.target.value)} />
                    </FormField>
                    <FormField label={t('gp.m.resolution')}>
                      <TextInput fullWidth multiline minRows={2} value={it.resolution} onChange={(e) => set(i, 'resolution', e.target.value)} />
                    </FormField>
                    <div className="sm:col-span-2">
                      <Button size="small" color="error" startIcon={<Trash2 className="size-3.5" />} onClick={() => setItems(items.filter((_, n) => n !== i))}>
                        {t('gp.m.removeItem')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="font-[550]">{`${i + 1}. ${it.title}`}</b>
                      <StatusPill tone={it.outcome === 'resolved' ? 'success' : it.outcome === 'rejected' ? 'danger' : 'neutral'}>{t(`gp.out.${it.outcome}` as MessageKey)}</StatusPill>
                    </div>
                    {it.discussion && <p className="mt-2 mb-0 text-[13px] text-muted-foreground">{it.discussion}</p>}
                    {it.resolution && (
                      <p className="mt-2 mb-0 text-[13px]">
                        <b className="font-[550]">{t('gp.m.resolved')}</b> {it.resolution}
                      </p>
                    )}
                  </>
                )}
              </Card>
            ))}
            {items.length === 0 && <p className="m-0 text-[13px] text-muted-foreground">{t('gp.m.noAgenda')}</p>}
            {edit && (
              <div>
                <Button size="small" startIcon={<Plus className="size-3.5" />} onClick={() => setItems([...items, { title: '', presenter: '', discussion: '', resolution: '', outcome: 'pending' }])} data-testid="gov-add-item">
                  {t('gp.m.addItem')}
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <Card>
            <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.m.attendance', { present })}</h2>
            <ul className="m-0 list-none p-0" data-testid="gov-attendance">
              {m.attendance.map((a) => (
                <li key={a.memberId} className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0">
                    {a.name} <span className="text-muted-foreground">({t(`gp.role.${a.role}` as MessageKey)})</span>
                  </span>
                  {edit ? (
                    <SelectInput size="small" value={att[a.memberId] ?? ''} onChange={(e) => setAtt({ ...att, [a.memberId]: e.target.value })} empty={t('gp.m.notMarked')} options={(['present', 'absent', 'leave'] as const).map((s) => ({ value: s, label: t(`gp.att.${s}` as MessageKey) }))} slotProps={{ htmlInput: { 'aria-label': a.name } }} />
                  ) : (
                    <StatusPill tone={a.status === 'present' ? 'success' : 'neutral'}>{a.status ? t(`gp.att.${a.status}` as MessageKey) : t('gp.m.notMarked')}</StatusPill>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="mt-4">
            <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('gp.m.signatures')}</h2>
            {m.minutesHash && <p className="m-0 mb-2 break-all font-mono text-[11px] text-muted-foreground">{t('gp.m.fingerprint', { hash: m.minutesHash.slice(0, 16) })}</p>}
            <ul className="m-0 list-none p-0 text-[13px]" data-testid="gov-signoffs">
              {m.signoffs.filter((s) => s.current).map((s) => (
                <li key={s.id} className="mb-1.5">
                  <StatusPill tone={!s.valid ? 'danger' : s.decision === 'approve' ? 'success' : 'warning'}>{!s.valid ? t('gp.m.invalid') : t(`gp.m.dec.${s.decision}` as MessageKey)}</StatusPill> {s.name} <span className="text-muted-foreground">· {fmt.dateTime(s.signedAt)}</span>
                  {s.comment && <span className="block text-muted-foreground">{s.comment}</span>}
                </li>
              ))}
            </ul>
            {m.signoffs.filter((s) => s.current).length === 0 && <p className="m-0 text-[13px] text-muted-foreground">{t('gp.m.noSignatures')}</p>}
            {m.signoffs.some((s) => !s.current) && <p className="mt-2 mb-0 text-[12px] text-muted-foreground">{t('gp.m.olderSignatures', { n: m.signoffs.filter((s) => !s.current).length })}</p>}
          </Card>
        </div>
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-semibold">{t('gp.m.actions')}</h2>
        {m.canManage && (
          <Button startIcon={<Plus className="size-4" />} onClick={() => setDialog('action')} data-testid="gov-add-action">
            {t('gp.m.addAction')}
          </Button>
        )}
      </div>
      <Grid<MeetingDetail['actions'][number]>
        testId="gov-actions"
        empty={t('gp.m.noActions')}
        rows={m.actions}
        tint={(a) => a.overdue}
        cols={[
          { label: t('gp.m.actionTitle'), wrap: true, cell: (a) => a.title, sort: (a) => a.title },
          { label: t('gp.m.owner'), cell: (a) => a.ownerName, sort: (a) => a.ownerName },
          { label: t('gp.m.dueOn'), cell: (a) => fmt.date(a.dueOn, 'short'), sort: (a) => a.dueOn },
          { label: t('gp.col.status'), cell: (a) => <StatusPill tone={a.status === 'done' ? 'success' : a.overdue ? 'danger' : 'warning'}>{t(`gp.as.${a.status}` as MessageKey)}</StatusPill>, sort: (a) => a.status },
          { label: t('gp.m.taken'), wrap: true, cell: (a) => a.actionTaken || '-' },
          { label: '', cell: (a) => (m.canManage && a.status !== 'done' && a.status !== 'dropped' ? <Button size="small" onClick={() => setDialog({ report: a.id })}>{t('gp.m.report')}</Button> : null) },
        ]}
      />
      {dialog === 'action' && <FormDialog title={t('gp.m.addAction')} fields={actionFields} onSubmit={(v) => addAction(m.id, v)} onClose={(msg) => { setDialog(null); if (msg) router.refresh(); }} />}
      {dialog === 'object' && <FormDialog title={t('gp.m.object')} fields={[{ name: 'comment', label: t('gp.m.objection'), kind: 'multiline', required: true }]} onSubmit={(v) => signMinutes(m.id, 'object', v.comment)} onClose={(msg) => { setDialog(null); if (msg) router.refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <FormDialog
          title={t('gp.m.report')}
          fields={[
            { name: 'actionTaken', label: t('gp.m.taken'), kind: 'multiline', required: true },
            { name: 'status', label: t('gp.col.status'), kind: 'select', options: [{ value: 'done', label: t('gp.as.done') }, { value: 'in_progress', label: t('gp.as.in_progress') }], init: 'done', required: true },
            { name: 'evidenceUrl', label: t('gp.m.evidence') },
          ]}
          onSubmit={(v) => reportAction(dialog.report, v, `/governance/meetings/${m.id}`)}
          onClose={(msg) => { setDialog(null); if (msg) router.refresh(); }}
        />
      )}
      {toastNode}
    </>
  );
}
