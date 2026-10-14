'use client';

import { Award, CalendarDays, HandCoins, Landmark, Leaf, Shield, Users, Vote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { checkIn } from '@/app/(dashboard)/campus-life/actions';
import {
  activityHours, addElection, addEventWithBudget, addExternal, addPost, addUnitActivity, addUnitMembers, cancelExternal, checkClashes, checkInExternal, clubBudgets, decideEvent, dropPost, dropUnitActivity, dutyLeaves, electionDetail, electionStep, eventClashes,
  eventRefunds, externalRegistrations, grantDutyLeave, markRefunded, nominate, proposeEvent, saveActivityHours, saveEventReport, setClubBudget, setUnitMember, studentsOf, unitDetail, withdrawCandidate,
} from '@/app/(dashboard)/campus-life/depth-actions';
import { ClubDialog, CommitteeDialog, EventDialog, useRead } from '@/components/campus-life/CampusLifeDesk';
import { RecordsTable } from '@/components/records/RecordsTable';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Field } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, EmptyState, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { CampusEvent, Club, Committee } from '@/lib/clife';
import type { BudgetSummary, Clashes, DutyLeaveRow, ElectionDetail, ExternalRegistration, RefundRow, UnitDetail } from '@/lib/life';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { NoteActionDialog, useKitColumns, useRowAction, emptyFor } from './kit';

export type ListProps = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; tab: string; sections: { id: string; name: string }[] };
type Toast = (m: string) => void;
const s = (v: unknown) => String(v ?? '');
const n = (v: unknown) => Number(v ?? 0);

/** The clash warning shown before an event is proposed or added. */
function ClashNote({ clashes }: { clashes: Clashes | null }) {
  const { t, fmt } = useI18n();
  if (!clashes || (!clashes.exams.length && !clashes.venue.length)) return null;
  return (
    <div role="alert" className="mb-3 rounded-md border border-amber-soft bg-amber-soft/40 px-3 py-2 text-[13px]" data-testid="lf-clashes">
      {clashes.exams.map((e) => (
        <p key={`${e.title}${e.from}`} className="m-0">{t('lf.ev.examClash', { title: e.title, from: fmt.date(e.from, 'short'), to: fmt.date(e.to, 'short') })}</p>
      ))}
      {clashes.venue.map((e) => (
        <p key={e.id} className="m-0">{t('lf.ev.venueClash', { title: e.title, at: fmt.dateTime(e.startsAt) })}</p>
      ))}
    </div>
  );
}

// ---- clubs and committees --------------------------------------------------------------------------

export function ClubsList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<Club | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'name', header: 'lf.col.club', sortKey: 'name', rowHeader: true },
    { key: 'category', header: 'lf.col.category', kind: 'choice' },
    { key: 'coordinatorName', header: 'lf.col.coordinator', sortKey: 'coordinator', hideBelow: 'sm' },
    { key: 'members', header: 'lf.col.members', kind: 'number', sortKey: 'members' },
    { key: 'pending', header: 'lf.col.requests', kind: 'number', sortKey: 'pending' },
    { key: 'active', header: 'lf.col.active', kind: 'bool', hideBelow: 'sm' },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.clubs')}
        columns={columns}
        extraParams={{ tab }}
        testId="cl-clubs"
        onView={(r) => setOpen(r as unknown as Club)}
        extraRowActions={(r) => [{ id: 'manage', label: t('cl.manage'), onSelect: () => setOpen(r as unknown as Club) }]}
        empty={emptyFor(meta, <EmptyState icon={<Users />} title={t('cl.noClubs')}>{t('lf.empty.clubs')}</EmptyState>)}
      />
      {open && <ClubDialog club={open} onClose={() => setOpen(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

export function CommitteesList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<Committee | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'name', header: 'lf.col.committee', sortKey: 'name', rowHeader: true },
    { key: 'statutory', header: 'lf.col.statutory', kind: 'bool' },
    { key: 'members', header: 'lf.col.members', kind: 'number', sortKey: 'members' },
    { key: 'openActions', header: 'lf.col.openActions', kind: 'number', sortKey: 'open' },
    { key: 'active', header: 'lf.col.active', kind: 'bool', hideBelow: 'sm' },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.committees')}
        columns={columns}
        extraParams={{ tab }}
        testId="cl-committees"
        onView={(r) => setOpen(r as unknown as Committee)}
        extraRowActions={(r) => [{ id: 'manage', label: t('cl.manage'), onSelect: () => setOpen(r as unknown as Committee) }]}
        empty={emptyFor(meta, <EmptyState icon={<Landmark />} title={t('cl.noCommittees')}>{t('lf.empty.committees')}</EmptyState>)}
      />
      {open && <CommitteeDialog committee={open} onClose={() => setOpen(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

// ---- events ------------------------------------------------------------------------------------------

type EventDlg =
  | { kind: 'add' }
  | { kind: 'regs' | 'checkIn' | 'report' | 'external' | 'refunds' | 'duty' | 'cancel' | 'reject'; row: Row };

export function EventsList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<EventDlg | null>(null);
  const [clashes, setClashes] = useState<Clashes | null>(null);
  const [, start] = useTransition();
  const action = useRowAction('campus-events');
  const done = (m?: string) => {
    setDlg(null);
    setClashes(null);
    if (m) toast(m);
    router.refresh();
  };
  const step = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? t('ops.saved') : (r as { error: string }).error);
      router.refresh();
    });
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'lf.col.event', sortKey: 'title', rowHeader: true },
    { key: 'eventType', header: 'lf.col.type', kind: 'choice', hideBelow: 'md' },
    { key: 'startsAt', header: 'lf.col.starts', kind: 'datetime', sortKey: 'starts' },
    { key: 'venue', header: 'lf.col.venue', hideBelow: 'md' },
    { key: 'status', header: 'lf.col.status', kind: 'choice', tones: { draft: 'neutral', published: 'success', cancelled: 'danger' } },
    { key: 'approvalStatus', header: 'lf.col.approval', kind: 'choice', choiceOf: 'approval', tones: { pending: 'warning', approved: 'success', rejected: 'danger' }, hideBelow: 'sm' },
    { key: 'registered', header: 'lf.col.registered', kind: 'number', sortKey: 'registered' },
    { key: 'attended', header: 'lf.col.attended', kind: 'number', sortKey: 'attended', hideBelow: 'sm' },
    { key: 'budgetRupees', header: 'lf.col.budget', kind: 'rupees', sortKey: 'budget', defaultHidden: true },
    { key: 'external', header: 'lf.col.external', kind: 'number', defaultHidden: true },
  ]);
  const asEvent = (r: Row) => ({ ...r, feePaise: Math.round(n(r.feeRupees) * 100), checkedIn: n(r.attended), waitlisted: 0 }) as unknown as CampusEvent;
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.events')}
        columns={columns}
        extraParams={{ tab }}
        testId="cl-events"
        toolbar={<Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setDlg({ kind: 'add' })}>{t('cl.addEvent')}</Button>}
        onView={(r) => setDlg({ kind: 'regs', row: r })}
        extraRowActions={(r) => {
          const st = s(r.status);
          const ap = s(r.approvalStatus);
          const ended = Date.parse(s(r.startsAt)) < Date.now();
          return [
            { id: 'regs', label: t('cl.registrations'), onSelect: () => setDlg({ kind: 'regs', row: r }) },
            ...(st === 'draft' && ap !== 'pending' ? [{ id: 'propose', label: t('lf.ev.propose'), onSelect: () => step(async () => { const res = await proposeEvent(s(r.id)); if (res.ok) { const c = await eventClashes(s(r.id)); if (c.ok) setClashes(c.data); } return res; }) }] : []),
            ...(ap === 'pending' ? [{ id: 'approve', label: t('lf.ev.approve'), onSelect: () => step(() => decideEvent(s(r.id), 'approve', '')) }, { id: 'reject', label: t('lf.ev.reject'), tone: 'danger' as const, onSelect: () => setDlg({ kind: 'reject', row: r }) }] : []),
            ...(st === 'draft' && ap !== 'pending' && ap !== 'rejected' ? [{ id: 'publish', label: t('cl.publish'), onSelect: () => start(async () => { const e = await action.run('publish', s(r.id)); toast(e ?? t('ops.saved')); }) }] : []),
            ...(st === 'published' ? [{ id: 'checkin', label: t('cl.checkIn'), onSelect: () => setDlg({ kind: 'checkIn', row: r }) }] : []),
            ...(r.externalRegistration ? [{ id: 'external', label: t('lf.ev.external'), onSelect: () => setDlg({ kind: 'external', row: r }) }] : []),
            ...(st === 'published' && ended ? [{ id: 'report', label: t('lf.ev.report'), onSelect: () => setDlg({ kind: 'report', row: r }) }] : []),
            ...(st !== 'draft' ? [{ id: 'duty', label: t('lf.ev.duty'), onSelect: () => setDlg({ kind: 'duty', row: r }) }] : []),
            { id: 'refunds', label: t('lf.ev.refunds'), onSelect: () => setDlg({ kind: 'refunds', row: r }) },
            ...(st !== 'cancelled' ? [{ id: 'cancel', label: t('cl.cancelEvent'), tone: 'danger' as const, separator: true, onSelect: () => setDlg({ kind: 'cancel', row: r }) }] : []),
          ];
        }}
        empty={emptyFor(meta, <EmptyState icon={<CalendarDays />} title={t('cl.noEvents')}>{t('lf.empty.events')}</EmptyState>, <Button onClick={() => setDlg({ kind: 'add' })}>{t('cl.addEvent')}</Button>)}
      />
      {clashes && !dlg && (
        <InfoDialog title={t('lf.ev.clashTitle')} onClose={() => setClashes(null)}>
          <ClashNote clashes={clashes} />
        </InfoDialog>
      )}
      {dlg?.kind === 'add' && <AddEventDialog onClose={done} />}
      {dlg?.kind === 'regs' && <EventDialog event={asEvent(dlg.row)} onClose={() => setDlg(null)} toast={toast} />}
      {dlg?.kind === 'checkIn' && <CheckInDialog row={dlg.row} onClose={done} />}
      {dlg?.kind === 'report' && (
        <FormDialog
          title={`${t('lf.ev.report')} · ${s(dlg.row.title)}`}
          intro={t('lf.ev.reportHelp')}
          onSubmit={(v) => saveEventReport(s(dlg.row.id), v)}
          onClose={done}
          fields={[{ name: 'report', label: t('lf.ev.reportText'), kind: 'multiline', required: true }, { name: 'spent', label: t('lf.ev.spent'), kind: 'rupees' }]}
        />
      )}
      {dlg?.kind === 'external' && <ExternalDialog row={dlg.row} onClose={() => done()} toast={toast} />}
      {dlg?.kind === 'refunds' && <RefundsDialog row={dlg.row} onClose={() => done()} toast={toast} />}
      {dlg?.kind === 'duty' && <DutyDialog row={dlg.row} onClose={() => done()} toast={toast} />}
      {dlg?.kind === 'cancel' && (
        <NoteActionDialog
          title={`${t('cl.cancelEvent')} · ${s(dlg.row.title)}`}
          label={t('lf.ev.cancelReason')}
          param="reason"
          tone="danger"
          confirm={t('cl.cancelEvent')}
          onRun={(p) => action.run('cancel', s(dlg.row.id), p)}
          onClose={(ok) => done(ok ? t('ops.saved') : undefined)}
        />
      )}
      {dlg?.kind === 'reject' && (
        <NoteActionDialog
          title={`${t('lf.ev.reject')} · ${s(dlg.row.title)}`}
          label={t('lf.ev.rejectReason')}
          param="note"
          required
          tone="danger"
          confirm={t('lf.ev.reject')}
          onRun={async (p) => {
            const r = await decideEvent(s(dlg.row.id), 'reject', p.note);
            return r.ok ? null : r.error;
          }}
          onClose={(ok) => done(ok ? t('ops.saved') : undefined)}
        />
      )}
      {toastNode}
    </>
  );
}

/** Adds an event as a draft, warning first about exams and the venue on those dates. */
function AddEventDialog({ onClose }: { onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const [clashes, setClashes] = useState<Clashes | null>(null);
  const types = ['seminar', 'workshop', 'parent_meeting', 'fest', 'sports', 'competition', 'conference', 'alumni', 'other'].map((v) => ({ value: v, label: t(`cl.evType.${v}` as MessageKey) }));
  const audiences = ['all', 'students', 'parents', 'staff'].map((v) => ({ value: v, label: t(`cl.aud.${v}` as MessageKey) }));
  return (
    <FormDialog
      title={t('cl.addEvent')}
      intro={<><p className="mt-0 text-sm text-muted-foreground">{t('lf.ev.addHelp')}</p><ClashNote clashes={clashes} /></>}
      onSubmit={async (v) => {
        if (!clashes) {
          const c = await checkClashes(v.startsAt, v.endsAt, v.venue ?? '');
          if (c.ok && (c.data.exams.length || c.data.venue.length)) {
            setClashes(c.data);
            return { ok: false, error: t('lf.ev.clashConfirm') };
          }
        }
        return addEventWithBudget(v);
      }}
      onClose={(m) => onClose(m)}
      fields={[
        { name: 'title', label: t('ops.f.title'), required: true },
        { name: 'eventType', label: t('cl.evType'), kind: 'select', init: 'other', options: types },
        { name: 'venue', label: t('cl.col.venue') },
        { name: 'capacity', label: t('cl.capacity'), kind: 'number', required: true },
        { name: 'startsAt', label: t('cl.startsAt'), kind: 'datetime', required: true },
        { name: 'endsAt', label: t('cl.endsAt'), kind: 'datetime', required: true },
        { name: 'audience', label: t('cl.audience'), kind: 'select', init: 'all', options: audiences },
        { name: 'fee', label: t('cl.fee'), kind: 'rupees' },
        { name: 'description', label: t('cl.description'), kind: 'multiline' },
      ]}
    />
  );
}

function CheckInDialog({ row, onClose }: { row: Row; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={`${t('cl.checkIn')} · ${s(row.title)}`}
      intro={t('lf.ev.checkInHelp')}
      onSubmit={async (v) => {
        const r = await checkIn(s(row.id), v);
        return r.ok || !row.externalRegistration ? r : checkInExternal(s(row.id), v);
      }}
      onClose={onClose}
      fields={[{ name: 'token', label: t('cl.token'), required: true }]}
    />
  );
}

/** People from other institutions registered at the desk, with the fee they paid. */
function ExternalDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const list = useRead<ExternalRegistration[]>(() => externalRegistrations(s(row.id)));
  const [adding, setAdding] = useState(false);
  const refresh = (m: string) => {
    toast(m);
    list.reload();
  };
  return (
    <InfoDialog title={`${t('lf.ev.external')} · ${s(row.title)}`} onClose={onClose}>
      <Bar>
        <Button variant="outline" onClick={() => setAdding(true)} disabled={s(row.status) !== 'published'}>{t('lf.ev.addExternal')}</Button>
      </Bar>
      <Grid
        testId="lf-external"
        empty={t('lf.ev.noExternal')}
        rows={list.data ?? []}
        cols={[
          { label: t('ops.f.name'), cell: (r) => r.fullName },
          { label: t('lf.col.institution'), cell: (r) => r.institution || '-' },
          { label: t('lf.col.paid'), cell: (r) => fmt.rupees(r.paidPaise), num: true, sort: (r) => r.paidPaise },
          { label: t('lf.col.code'), cell: (r) => <span className="font-mono text-xs">{r.qrToken.slice(0, 10)}</span> },
          { label: t('ops.f.status'), cell: (r) => <Pill warn={r.status === 'cancelled'} label={r.checkedInAt ? t('lf.ev.checkedIn') : t(`lf.reg.${r.status}` as MessageKey)} /> },
          { label: '', cell: (r) => (r.status === 'registered' ? <ActionButton tone="error" label={t('lf.ev.cancelReg')} run={() => cancelExternal(r.id)} onDone={refresh} /> : null) },
        ]}
      />
      {adding && (
        <FormDialog
          title={t('lf.ev.addExternal')}
          intro={n(row.feeRupees) > 0 ? t('lf.ev.feeDue', { amount: fmt.rupees(Math.round(n(row.feeRupees) * 100)) }) : undefined}
          onSubmit={(v) => addExternal(s(row.id), v)}
          onClose={(m) => {
            setAdding(false);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'fullName', label: t('ops.f.name'), required: true },
            { name: 'institution', label: t('lf.col.institution') },
            { name: 'phone', label: t('ops.f.phone') },
            { name: 'email', label: t('lf.f.email') },
            { name: 'paid', label: t('lf.col.paid'), kind: 'rupees' },
            { name: 'ref', label: t('lf.f.paymentRef') },
          ]}
        />
      )}
    </InfoDialog>
  );
}

/** Refunds owed after a cancellation (or a cancelled registration), and marking them paid back. */
function RefundsDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const list = useRead<RefundRow[]>(() => eventRefunds(s(row.id)));
  const [paying, setPaying] = useState<RefundRow | null>(null);
  return (
    <InfoDialog title={`${t('lf.ev.refunds')} · ${s(row.title)}`} onClose={onClose}>
      <Grid
        testId="lf-refunds"
        empty={t('lf.ev.noRefunds')}
        rows={list.data ?? []}
        cols={[
          { label: t('ops.f.name'), cell: (r) => (r.rollNo ? `${r.name} (${r.rollNo})` : r.name) },
          { label: t('lf.col.paid'), cell: (r) => fmt.rupees(r.paidPaise), num: true, sort: (r) => r.paidPaise },
          { label: t('lf.f.paymentRef'), cell: (r) => r.paymentRef || '-' },
          { label: t('ops.f.status'), cell: (r) => <Pill warn={r.refundStatus === 'due'} label={t(`lf.refund.${r.refundStatus}` as MessageKey)} /> },
          { label: '', cell: (r) => (r.refundStatus === 'due' ? <Button size="sm" onClick={() => setPaying(r)}>{t('lf.ev.markRefunded')}</Button> : r.refundRef || null) },
        ]}
      />
      {paying && (
        <FormDialog
          title={t('lf.ev.markRefunded')}
          onSubmit={(v) => markRefunded(paying.kind, paying.id, v)}
          onClose={(m) => {
            setPaying(null);
            if (m) {
              toast(m);
              list.reload();
            }
          }}
          fields={[{ name: 'ref', label: t('lf.f.refundRef') }]}
        />
      )}
    </InfoDialog>
  );
}

/** Duty leave for the students who attended (from the check-ins), with absences already marked turned to excused. */
function DutyDialog({ row, onClose, toast }: { row: Row; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const list = useRead<DutyLeaveRow[]>(() => dutyLeaves(s(row.id)));
  const [role, setRole] = useState('participant');
  const [busy, start] = useTransition();
  return (
    <InfoDialog title={`${t('lf.ev.duty')} · ${s(row.title)}`} onClose={onClose}>
      <p className="mt-0 text-sm text-muted-foreground">{t('lf.ev.dutyHelp')}</p>
      <Bar>
        <SelectInput label={t('lf.col.role')} value={role} onChange={(e) => setRole(String(e.target.value))} options={['participant', 'volunteer', 'organiser'].map((v) => ({ value: v, label: t(`lf.duty.${v}` as MessageKey) }))} />
        <Button
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await grantDutyLeave(s(row.id), role);
              toast(r.ok ? t('lf.ev.dutyGranted', { n: r.data.granted.length, excused: r.data.granted.reduce((a, g) => a + g.excused, 0) }) : r.error);
              list.reload();
            })
          }
          data-testid="lf-grant-duty"
        >
          {t('lf.ev.grantDuty')}
        </Button>
      </Bar>
      <Grid
        testId="lf-duty"
        empty={t('lf.ev.noDuty')}
        rows={list.data ?? []}
        cols={[
          { label: t('ops.f.student'), cell: (r) => `${r.fullName} (${r.rollNo})` },
          { label: t('lf.col.class'), cell: (r) => r.className },
          { label: t('lf.col.role'), cell: (r) => t(`lf.duty.${r.role}` as MessageKey) },
          { label: t('lf.col.dates'), cell: (r) => (r.fromDate === r.toDate ? fmt.date(r.fromDate, 'short') : `${fmt.date(r.fromDate, 'short')} – ${fmt.date(r.toDate, 'short')}`) },
          { label: t('lf.col.excused'), cell: (r) => r.excusedCount, num: true },
        ]}
      />
    </InfoDialog>
  );
}

// ---- NSS, NCC and sports units -----------------------------------------------------------------------

export function UnitsList({ meta, page, state, tab, sections }: ListProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<Row | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'name', header: 'lf.col.unit', sortKey: 'name', rowHeader: true },
    { key: 'kind', header: 'lf.col.kind', kind: 'choice', sortKey: 'kind' },
    { key: 'sport', header: 'lf.col.sport', hideBelow: 'md' },
    { key: 'coordinatorName', header: 'lf.col.coordinator', hideBelow: 'sm' },
    { key: 'members', header: 'lf.col.members', kind: 'number', sortKey: 'members' },
    { key: 'activities', header: 'lf.col.activities', kind: 'number', hideBelow: 'sm' },
    { key: 'hours', header: 'lf.col.hours', kind: 'number', sortKey: 'hours' },
    { key: 'targetHours', header: 'lf.col.target', kind: 'number', defaultHidden: true },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.units')}
        columns={columns}
        extraParams={{ tab }}
        testId="lf-units"
        onView={setOpen}
        extraRowActions={(r) => [{ id: 'manage', label: t('cl.manage'), onSelect: () => setOpen(r) }]}
        empty={emptyFor(meta, <EmptyState icon={<Shield />} title={t('lf.empty.unitsTitle')}>{t('lf.empty.units')}</EmptyState>)}
      />
      {open && <UnitDialog row={open} sections={sections} onClose={() => setOpen(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

function UnitDialog({ row, sections, onClose, toast }: { row: Row; sections: { id: string; name: string }[]; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const d = useRead<UnitDetail>(() => unitDetail(s(row.id)));
  const [sub, setSub] = useState<'members' | 'activity' | { hours: UnitDetail['activities'][number] } | null>(null);
  const refresh = (m: string) => {
    toast(m);
    d.reload();
  };
  const active = (d.data?.members ?? []).filter((m) => m.status === 'active');
  const kinds = ['regular', 'camp', 'parade', 'match', 'tournament', 'special'].map((v) => ({ value: v, label: t(`lf.act.${v}` as MessageKey) }));
  return (
    <InfoDialog title={s(row.name)} onClose={onClose}>
      {d.error && <p className="text-sm text-red-ink">{d.error}</p>}
      <div className="mb-2 flex flex-row items-center justify-between">
        <h6 className="text-[1.0625rem] font-medium">{t('lf.unit.members', { n: active.length })}</h6>
        <Button variant="outline" size="sm" onClick={() => setSub('members')}>{t('lf.unit.addMembers')}</Button>
      </div>
      <Grid
        testId="lf-unit-members"
        empty={t('lf.unit.noMembers')}
        rows={d.data?.members ?? []}
        cols={[
          { label: t('ops.f.student'), cell: (m) => `${m.fullName} (${m.rollNo})` },
          { label: t('lf.col.class'), cell: (m) => m.className },
          { label: t('lf.col.role'), cell: (m) => t(`lf.role.${m.role}` as MessageKey) },
          { label: t('lf.col.hours'), cell: (m) => fmt.number(m.hours), num: true, sort: (m) => m.hours },
          { label: t('lf.col.target'), cell: (m) => (m.targetMet === null ? '-' : <Pill warn={!m.targetMet} label={m.targetMet ? t('lf.unit.met') : t('lf.unit.short')} />) },
          { label: '', cell: (m) => (m.status === 'active' ? <ActionButton tone="error" label={t('lf.unit.leave')} run={() => setUnitMember(m.id, { status: 'left' })} onDone={refresh} /> : <ActionButton label={t('lf.unit.rejoin')} run={() => setUnitMember(m.id, { status: 'active' })} onDone={refresh} />) },
        ]}
      />
      <div className="mb-2 mt-6 flex flex-row items-center justify-between">
        <h6 className="text-[1.0625rem] font-medium">{t('cl.activities')}</h6>
        <Button variant="outline" size="sm" onClick={() => setSub('activity')}>{t('cl.addActivity')}</Button>
      </div>
      <Grid
        testId="lf-unit-activities"
        empty={t('cl.noActivities')}
        rows={d.data?.activities ?? []}
        cols={[
          { label: t('ops.f.title'), cell: (a) => a.title },
          { label: t('lf.col.kind'), cell: (a) => t(`lf.act.${a.kind}` as MessageKey) },
          { label: t('lf.col.dates'), cell: (a) => (a.startsOn === a.endsOn ? fmt.date(a.startsOn, 'short') : `${fmt.date(a.startsOn, 'short')} – ${fmt.date(a.endsOn, 'short')}`), sort: (a) => a.startsOn },
          { label: t('lf.col.hours'), cell: (a) => fmt.number(Number(a.hours)), num: true },
          { label: t('cl.attended'), cell: (a) => a.attendees, num: true },
          {
            label: '',
            cell: (a) => (
              <>
                <Button size="sm" onClick={() => setSub({ hours: a })} disabled={!active.length}>{t('lf.unit.logHours')}</Button>
                <ActionButton tone="error" label={t('lf.unit.remove')} run={() => dropUnitActivity(a.id)} onDone={refresh} />
              </>
            ),
          },
        ]}
      />
      {sub === 'members' && <PickStudentsDialog title={t('lf.unit.addMembers')} sections={sections} withRole onClose={() => setSub(null)} onPick={async (ids, role) => { const r = await addUnitMembers(s(row.id), ids, role, new Date().toISOString().slice(0, 10)); if (r.ok) refresh(t('ops.saved')); return r.ok ? null : r.error; }} />}
      {sub === 'activity' && (
        <FormDialog
          title={t('cl.addActivity')}
          onSubmit={(v) => addUnitActivity(s(row.id), v)}
          onClose={(m) => {
            setSub(null);
            if (m) refresh(m);
          }}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'kind', label: t('lf.col.kind'), kind: 'select', init: 'regular', options: kinds },
            { name: 'startsOn', label: t('lf.f.from'), kind: 'date', required: true },
            { name: 'endsOn', label: t('lf.f.to'), kind: 'date' },
            { name: 'place', label: t('lf.f.place') },
            { name: 'hours', label: t('lf.f.hoursEach'), kind: 'number', init: '0' },
            { name: 'result', label: t('lf.f.result') },
          ] satisfies Field[]}
        />
      )}
      {sub && typeof sub === 'object' && <HoursDialog activity={sub.hours} members={active} onClose={(m) => { setSub(null); if (m) refresh(m); }} />}
    </InfoDialog>
  );
}

/** Ticks who attended and the hours each earned (the activity's hours by default). */
function HoursDialog({ activity, members, onClose }: { activity: UnitDetail['activities'][number]; members: UnitDetail['members']; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const prior = useRead(() => activityHours(activity.id));
  const [hours, setHours] = useState<Record<string, string> | null>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = hours ?? (prior.data ? Object.fromEntries(prior.data.map((h) => [h.studentId, String(h.hours)])) : null);
  return (
    <InfoDialog title={`${t('lf.unit.logHours')} · ${activity.title}`} onClose={() => onClose()}>
      {!current ? null : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.studentId} className="flex items-end gap-3">
              <CheckboxField label={`${m.fullName} (${m.rollNo})`} checked={current[m.studentId] !== undefined} onChange={(on) => setHours({ ...Object.fromEntries(Object.entries(current).filter(([k]) => k !== m.studentId)), ...(on ? { [m.studentId]: String(activity.hours) } : {}) })} />
              {current[m.studentId] !== undefined && <TextInput label={t('lf.col.hours')} type="number" value={current[m.studentId]} onChange={(e) => setHours({ ...current, [m.studentId]: e.target.value })} />}
            </div>
          ))}
          {error && <p className="text-sm text-red-ink">{error}</p>}
          <div className="mt-2 flex justify-end">
            <Button
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const entries = Object.entries(current).map(([studentId, h]) => ({ studentId, hours: Number(h) }));
                  if (entries.some((e) => !Number.isFinite(e.hours) || e.hours < 0)) return setError(t('ops.err.field', { field: t('lf.col.hours') }));
                  const r = await saveActivityHours(activity.id, entries);
                  if (!r.ok) return setError(r.error);
                  onClose(t('ops.saved'));
                })
              }
            >
              {t('rk.save')}
            </Button>
          </div>
        </div>
      )}
    </InfoDialog>
  );
}

/** Picks students of a class (and optionally a role for them). */
export function PickStudentsDialog({ title, sections, withRole, single, onPick, onClose }: { title: string; sections: { id: string; name: string }[]; withRole?: boolean; single?: boolean; onPick: (ids: string[], role: string) => Promise<string | null>; onClose: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState('');
  const [list, setList] = useState<{ id: string; fullName: string; rollNo: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const load = (id: string) =>
    start(async () => {
      setSection(id);
      setPicked(new Set());
      if (!id) return setList(null);
      const r = await studentsOf(id);
      if (r.ok) setList(r.data.rows);
      else setError(r.error);
    });
  const roles = ['member', 'volunteer', 'cadet', 'leader', 'captain', 'vice_captain', 'player'].map((v) => ({ value: v, label: t(`lf.role.${v}` as MessageKey) }));
  return (
    <InfoDialog title={title} onClose={onClose}>
      <Bar>
        <SelectInput label={t('lf.col.class')} value={section} onChange={(e) => load(String(e.target.value))} options={sections.map((x) => ({ value: x.id, label: x.name }))} empty={t('lf.pick.class')} />
        {withRole && <SelectInput label={t('lf.col.role')} value={role} onChange={(e) => setRole(String(e.target.value))} options={roles} />}
      </Bar>
      {list && (
        <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto" data-testid="lf-pick-students">
          {list.map((x) => (
            <CheckboxField
              key={x.id}
              label={`${x.rollNo} ${x.fullName}`}
              checked={picked.has(x.id)}
              onChange={(on) => {
                const next = new Set(single ? [] : picked);
                if (on) next.add(x.id);
                else next.delete(x.id);
                setPicked(next);
              }}
            />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-ink">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          disabled={busy || picked.size === 0}
          onClick={() =>
            start(async () => {
              const e = await onPick([...picked], role);
              if (e) return setError(e);
              onClose();
            })
          }
          data-testid="lf-pick-confirm"
        >
          {t('lf.pick.add', { n: picked.size })}
        </Button>
      </div>
    </InfoDialog>
  );
}

// ---- achievements and outreach -----------------------------------------------------------------------

export function AchievementsList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [reject, setReject] = useState<Row | null>(null);
  const action = useRowAction('student-achievements');
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'lf.col.student', sortKey: 'student', rowHeader: true },
    { key: 'className', header: 'lf.col.class', hideBelow: 'md' },
    { key: 'title', header: 'lf.col.achievement', sortKey: 'title', kind: 'wrap' },
    { key: 'level', header: 'lf.col.level', kind: 'choice', sortKey: 'level' },
    { key: 'position', header: 'lf.col.position', kind: 'choice', hideBelow: 'sm' },
    { key: 'category', header: 'lf.col.category', kind: 'choice', hideBelow: 'md' },
    { key: 'achievedOn', header: 'lf.col.date', kind: 'date', sortKey: 'date' },
    { key: 'status', header: 'lf.col.verification', kind: 'choice', tones: { pending: 'warning', verified: 'success', rejected: 'danger' } },
    { key: 'eventName', header: 'lf.col.event', defaultHidden: true },
    { key: 'awardRupees', header: 'lf.col.prize', kind: 'rupees', defaultHidden: true },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.achievements')}
        columns={columns}
        extraParams={{ tab }}
        testId="lf-achievements"
        extraRowActions={(r) => (s(r.status) === 'pending' ? [{ id: 'reject', label: t('lf.ach.reject'), tone: 'danger' as const, onSelect: () => setReject(r) }] : [])}
        empty={emptyFor(meta, <EmptyState icon={<Award />} title={t('lf.empty.achTitle')}>{t('lf.empty.ach')}</EmptyState>)}
      />
      {reject && (
        <NoteActionDialog
          title={`${t('lf.ach.reject')} · ${s(reject.title)}`}
          label={t('lf.ach.rejectWhy')}
          param="note"
          tone="danger"
          confirm={t('lf.ach.reject')}
          onRun={(p) => action.run('reject', s(reject.id), p)}
          onClose={(ok) => {
            setReject(null);
            if (ok) toast(t('ops.saved'));
          }}
        />
      )}
      {toastNode}
    </>
  );
}

export function OutreachList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'lf.col.activity', sortKey: 'title', rowHeader: true, kind: 'wrap' },
    { key: 'kind', header: 'lf.col.kind', kind: 'choice' },
    { key: 'heldOn', header: 'lf.col.date', kind: 'date', sortKey: 'date' },
    { key: 'organisedBy', header: 'lf.col.organisedBy', hideBelow: 'md' },
    { key: 'studentsCount', header: 'lf.col.studentsTook', kind: 'number', sortKey: 'students' },
    { key: 'beneficiaries', header: 'lf.col.reached', kind: 'number', sortKey: 'beneficiaries', hideBelow: 'sm' },
    { key: 'unitName', header: 'lf.col.unit', hideBelow: 'md' },
    { key: 'agency', header: 'lf.col.agency', defaultHidden: true },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('lf.tab.outreach')}
      columns={columns}
      extraParams={{ tab }}
      testId="lf-outreach"
      empty={emptyFor(meta, <EmptyState icon={<Leaf />} title={t('lf.empty.outreachTitle')}>{t('lf.empty.outreach')}</EmptyState>)}
    />
  );
}

// ---- club budgets and claims ---------------------------------------------------------------------------

export function ClaimsList({ meta, page, state, tab }: ListProps) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<{ kind: 'reject' | 'pay'; row: Row } | 'budgets' | null>(null);
  const action = useRowAction('club-expense-claims');
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'lf.col.expense', rowHeader: true, kind: 'wrap' },
    { key: 'clubName', header: 'lf.col.club', sortKey: 'club' },
    { key: 'amountRupees', header: 'lf.col.amount', kind: 'rupees', sortKey: 'amount' },
    { key: 'spentOn', header: 'lf.col.date', kind: 'date', sortKey: 'date', hideBelow: 'sm' },
    { key: 'status', header: 'lf.col.status', kind: 'choice', sortKey: 'status', tones: { submitted: 'warning', approved: 'info', rejected: 'danger', paid: 'success' } },
    { key: 'yearLabel', header: 'lf.col.year', hideBelow: 'md' },
    { key: 'payee', header: 'lf.col.payee', defaultHidden: true },
    { key: 'paymentRef', header: 'lf.f.paymentRef', defaultHidden: true },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.claims')}
        columns={columns}
        extraParams={{ tab }}
        testId="lf-claims"
        toolbar={<Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setDlg('budgets')}>{t('lf.claims.budgets')}</Button>}
        extraRowActions={(r) => [
          ...(s(r.status) === 'submitted' ? [{ id: 'reject', label: t('lf.claims.reject'), tone: 'danger' as const, onSelect: () => setDlg({ kind: 'reject', row: r }) }] : []),
          ...(s(r.status) === 'approved' ? [{ id: 'pay', label: t('lf.claims.pay'), onSelect: () => setDlg({ kind: 'pay', row: r }) }] : []),
        ]}
        empty={emptyFor(meta, <EmptyState icon={<HandCoins />} title={t('lf.empty.claimsTitle')}>{t('lf.empty.claims')}</EmptyState>)}
      />
      {dlg === 'budgets' && <BudgetsDialog onClose={() => setDlg(null)} toast={toast} />}
      {dlg && typeof dlg === 'object' && (
        <NoteActionDialog
          title={`${dlg.kind === 'pay' ? t('lf.claims.pay') : t('lf.claims.reject')} · ${s(dlg.row.title)}`}
          label={dlg.kind === 'pay' ? t('lf.f.paymentRef') : t('lf.claims.rejectWhy')}
          param={dlg.kind === 'pay' ? 'paymentRef' : 'note'}
          required={dlg.kind === 'reject'}
          tone={dlg.kind === 'reject' ? 'danger' : undefined}
          confirm={dlg.kind === 'pay' ? t('lf.claims.pay') : t('lf.claims.reject')}
          onRun={(p) => action.run(dlg.kind, s(dlg.row.id), p)}
          onClose={(ok) => {
            setDlg(null);
            if (ok) toast(t('ops.saved'));
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function BudgetsDialog({ onClose, toast }: { onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const data = useRead<BudgetSummary>(() => clubBudgets());
  const [edit, setEdit] = useState<BudgetSummary['clubs'][number] | null>(null);
  const money = (p: number | null) => (p === null ? '-' : fmt.rupees(p));
  return (
    <InfoDialog title={t('lf.claims.budgetsFor', { year: data.data?.year ?? '' })} onClose={onClose}>
      <Grid
        testId="lf-budgets"
        empty={t('cl.noClubs')}
        rows={data.data?.clubs ?? []}
        cols={[
          { label: t('lf.col.club'), cell: (r) => r.club },
          { label: t('lf.col.budget'), cell: (r) => money(r.budgetPaise), num: true, sort: (r) => r.budgetPaise ?? -1 },
          { label: t('lf.claims.approved'), cell: (r) => money(r.approvedPaise), num: true, sort: (r) => r.approvedPaise },
          { label: t('lf.claims.paid'), cell: (r) => money(r.paidPaise), num: true, sort: (r) => r.paidPaise },
          { label: t('lf.claims.remaining'), cell: (r) => (r.remainingPaise === null ? '-' : <Pill warn={r.remainingPaise <= 0} label={fmt.rupees(r.remainingPaise)} />), sort: (r) => r.remainingPaise ?? -1 },
          { label: '', cell: (r) => <Button size="sm" onClick={() => setEdit(r)}>{t('lf.claims.setBudget')}</Button> },
        ]}
      />
      {edit && (
        <FormDialog
          title={`${t('lf.claims.setBudget')} · ${edit.club}`}
          onSubmit={(v) => setClubBudget(edit.clubId, { ...v, yearLabel: data.data!.year })}
          onClose={(m) => {
            setEdit(null);
            if (m) {
              toast(m);
              data.reload();
            }
          }}
          fields={[{ name: 'amount', label: t('lf.col.budget'), kind: 'rupees', required: true, init: edit.budgetPaise === null ? '' : String(edit.budgetPaise / 100) }, { name: 'notes', label: t('ops.f.note'), init: edit.notes ?? '' }]}
        />
      )}
    </InfoDialog>
  );
}

// ---- elections -----------------------------------------------------------------------------------------

export function ElectionsList({ meta, page, state, tab, sections }: ListProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<'add' | Row | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'title', header: 'lf.col.election', sortKey: 'title', rowHeader: true },
    { key: 'status', header: 'lf.col.status', kind: 'choice', tones: { draft: 'neutral', open: 'live', closed: 'warning', published: 'success' } },
    { key: 'votingStartsAt', header: 'lf.col.opens', kind: 'datetime', sortKey: 'starts', hideBelow: 'sm' },
    { key: 'votingEndsAt', header: 'lf.col.closes', kind: 'datetime', hideBelow: 'md' },
    { key: 'posts', header: 'lf.col.posts', kind: 'number' },
    { key: 'candidates', header: 'lf.col.candidates', kind: 'number', hideBelow: 'sm' },
    { key: 'voted', header: 'lf.col.voted', kind: 'number', sortKey: 'voted' },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('lf.tab.elections')}
        columns={columns}
        extraParams={{ tab }}
        testId="lf-elections"
        toolbar={<Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setDlg('add')}>{t('lf.el.add')}</Button>}
        onView={(r) => setDlg(r)}
        extraRowActions={(r) => [{ id: 'manage', label: t('cl.manage'), onSelect: () => setDlg(r) }]}
        empty={emptyFor(meta, <EmptyState icon={<Vote />} title={t('lf.empty.electionsTitle')}>{t('lf.empty.elections')}</EmptyState>, <Button onClick={() => setDlg('add')}>{t('lf.el.add')}</Button>)}
      />
      {dlg === 'add' && (
        <FormDialog
          title={t('lf.el.add')}
          intro={t('lf.el.addHelp')}
          onSubmit={addElection}
          onClose={(m) => {
            setDlg(null);
            if (m) toast(m);
            router.refresh();
          }}
          fields={[{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'description', label: t('cl.description'), kind: 'multiline' }, { name: 'votingStartsAt', label: t('lf.col.opens'), kind: 'datetime', required: true }, { name: 'votingEndsAt', label: t('lf.col.closes'), kind: 'datetime', required: true }]}
        />
      )}
      {dlg && dlg !== 'add' && <ElectionDialog row={dlg} sections={sections} onClose={() => { setDlg(null); router.refresh(); }} toast={toast} />}
      {toastNode}
    </>
  );
}

function ElectionDialog({ row, sections, onClose, toast }: { row: Row; sections: { id: string; name: string }[]; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const d = useRead<ElectionDetail>(() => electionDetail(s(row.id)));
  const [sub, setSub] = useState<'post' | { nominate: string } | null>(null);
  const [busy, start] = useTransition();
  const refresh = (m: string) => {
    toast(m);
    d.reload();
  };
  const e = d.data?.election;
  const draft = e?.status === 'draft';
  const counted = e?.status === 'closed' || e?.status === 'published';
  const step = (which: 'open' | 'close' | 'publish') =>
    start(async () => {
      const r = await electionStep(s(row.id), which);
      refresh(!r.ok ? r.error : r.data.ties?.length ? t('lf.el.ties', { posts: r.data.ties.join(', ') }) : t('ops.saved'));
    });
  return (
    <InfoDialog title={s(row.title)} onClose={onClose}>
      {d.error && <p className="text-sm text-red-ink">{d.error}</p>}
      {e && (
        <>
          <p className="mt-0 text-sm text-muted-foreground" data-testid="lf-election-summary">
            {t('lf.el.summary', { status: t(`lf.el.status.${e.status}` as MessageKey), from: fmt.dateTime(e.votingStartsAt), to: fmt.dateTime(e.votingEndsAt), voted: d.data!.voted, electorate: d.data!.electorate })}
          </p>
          <Bar>
            {draft && <Button variant="outline" onClick={() => setSub('post')}>{t('lf.el.addPost')}</Button>}
            {draft && <Button disabled={busy} onClick={() => step('open')}>{t('lf.el.open')}</Button>}
            {e.status === 'open' && <Button disabled={busy} onClick={() => step('close')}>{t('lf.el.close')}</Button>}
            {e.status === 'closed' && <Button disabled={busy} onClick={() => step('publish')}>{t('lf.el.publish')}</Button>}
          </Bar>
          {d.data!.posts.length === 0 && <EmptyState icon={<Vote />} title={t('lf.el.noPosts')} dense />}
          {d.data!.posts.map((p) => (
            <div key={p.id} className="mb-5">
              <div className="mb-2 flex flex-row items-center justify-between gap-2">
                <h6 className="text-[1.0625rem] font-medium">{t('lf.el.post', { title: p.title, seats: p.seats })}</h6>
                {draft && (
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSub({ nominate: p.id })}>{t('lf.el.nominate')}</Button>
                    <ActionButton tone="error" label={t('lf.el.dropPost')} run={() => dropPost(p.id)} onDone={refresh} />
                  </span>
                )}
              </div>
              <Grid
                testId={`lf-candidates-${p.id}`}
                empty={t('lf.el.noCandidates')}
                rows={p.candidates}
                cols={[
                  { label: t('lf.col.candidate'), cell: (c) => `${c.fullName} (${c.rollNo})` },
                  { label: t('lf.col.class'), cell: (c) => c.className },
                  { label: t('lf.col.manifesto'), cell: (c) => c.manifesto || '-', wrap: true },
                  ...(counted ? [{ label: t('lf.col.votes'), cell: (c: (typeof p.candidates)[number]) => c.votes ?? 0, num: true }, { label: '', cell: (c: (typeof p.candidates)[number]) => (c.elected ? <Pill label={t('lf.el.elected')} /> : null) }] : []),
                  ...(draft ? [{ label: '', cell: (c: (typeof p.candidates)[number]) => <ActionButton tone="error" label={t('lf.el.withdraw')} run={() => withdrawCandidate(c.id)} onDone={refresh} /> }] : []),
                ]}
              />
            </div>
          ))}
        </>
      )}
      {sub === 'post' && (
        <FormDialog title={t('lf.el.addPost')} onSubmit={(v) => addPost(s(row.id), v)} onClose={(m) => { setSub(null); if (m) refresh(m); }} fields={[{ name: 'title', label: t('ops.f.title'), required: true }, { name: 'seats', label: t('lf.el.seats'), kind: 'number', init: '1' }]} />
      )}
      {sub && typeof sub === 'object' && (
        <PickStudentsDialog
          title={t('lf.el.nominate')}
          sections={sections}
          single
          onClose={() => setSub(null)}
          onPick={async (ids) => {
            const r = await nominate(sub.nominate, { studentId: ids[0] });
            if (r.ok) refresh(t('ops.saved'));
            return r.ok ? null : r.error;
          }}
        />
      )}
    </InfoDialog>
  );
}

