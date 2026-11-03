'use client';

import { Megaphone, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { previewBroadcast, saveProgrammeSetting, sendBroadcast, type SegmentInput } from '@/app/(dashboard)/admissions/pass-actions';
import { Grid, type Col } from '@/components/ops/kit';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, FormRow, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AisheRow, ApprovalRow, Broadcast, IntakeRow, ProgrammeSetting } from '@/lib/admissions-pass';

// ---- programme settings ---------------------------------------------------------------------------------------

/** Branch code (register numbers), sanctioned intake and the approval it rests on, per programme. */
export function ProgrammeSettingsDesk({ rows, canEdit }: { rows: ProgrammeSetting[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState<ProgrammeSetting | null>(null);
  const cols: Col<ProgrammeSetting>[] = [
    { label: t('ap.prog.programme'), cell: (r) => r.programme },
    { label: t('ap.prog.branch'), cell: (r) => r.branchCode ?? '-' },
    { label: t('ap.prog.intake'), cell: (r) => r.sanctionedIntake ?? '-', num: true },
    { label: t('ap.prog.approval'), cell: (r) => [r.approvalBody, r.approvalRef].filter(Boolean).join(' · ') || '-', wrap: true },
    { label: t('ap.prog.validTo'), cell: (r) => (r.approvalValidTo ? fmt.date(r.approvalValidTo, 'short') : '-'), sort: (r) => r.approvalValidTo ?? '' },
    ...(canEdit ? [{ label: '', cell: (r: ProgrammeSetting) => <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(r)}>{t('ap.edit')}</Button> }] : []),
  ];
  return (
    <>
      <Grid cols={cols} rows={rows} empty={t('ap.prog.none')} exportName="programme-approvals" testId="programmes" />
      {editing && <ProgrammeDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProgrammeDialog({ row, onClose }: { row: ProgrammeSetting; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ branchCode: row.branchCode ?? '', sanctionedIntake: row.sanctionedIntake !== null ? String(row.sanctionedIntake) : '', approvalBody: row.approvalBody ?? '', approvalRef: row.approvalRef ?? '', approvalValidTo: row.approvalValidTo ?? '' });
  const save = () =>
    start(async () => {
      const res = await saveProgrammeSetting(row.programId, { branchCode: v.branchCode || undefined, sanctionedIntake: v.sanctionedIntake ? Number(v.sanctionedIntake) : null, approvalBody: v.approvalBody, approvalRef: v.approvalRef, approvalValidTo: v.approvalValidTo });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ap.prog.saved'));
      router.refresh();
      onClose();
    });
  const field = (k: keyof typeof v, label: MessageKey, type = 'text') => (
    <FormField label={t(label)}>
      <TextInput type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} fullWidth />
    </FormField>
  );
  return (
    <Dialog title={row.programme} onClose={onClose} busy={pending} actions={<><Button variant="outline" onClick={onClose} disabled={pending}>{t('common.cancel')}</Button><Button onClick={save} disabled={pending}>{t('common.save')}</Button></>}>
      <div className="grid gap-3">
        {field('branchCode', 'ap.prog.branch')}
        {field('sanctionedIntake', 'ap.prog.intake', 'number')}
        {field('approvalBody', 'ap.prog.body')}
        {field('approvalRef', 'ap.prog.ref')}
        {field('approvalValidTo', 'ap.prog.validTo', 'date')}
      </div>
    </Dialog>
  );
}

// ---- follow-ups ---------------------------------------------------------------------------------------------------

export interface FollowUp { applicationId: string; applicationNo: string; name: string; phone: string; until: string | null; item: string; dueOn: string | null; overdue: boolean }
export interface Awaiting { studentId: string; name: string; rollNo: string; className: string; enrolledOn: string | null; applicationNo: string }

export function FollowUpsTable({ rows }: { rows: FollowUp[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      cols={[
        { label: t('ap.fu.application'), cell: (r) => <Link className="text-primary underline-offset-2 hover:underline" href={`/admissions/applications/${r.applicationId}`}>{r.applicationNo}</Link>, sort: (r) => r.applicationNo },
        { label: t('ap.fu.name'), cell: (r) => r.name },
        { label: t('ap.fu.item'), cell: (r) => r.item, wrap: true },
        { label: t('ap.fu.due'), cell: (r) => (r.dueOn ? <StatusPill tone={r.overdue ? 'danger' : 'warning'}>{fmt.date(r.dueOn, 'short')}</StatusPill> : '-'), sort: (r) => r.dueOn ?? '' },
        { label: t('ap.fu.phone'), cell: (r) => r.phone },
      ]}
      rows={rows}
      empty={t('ap.fu.none')}
      exportName="provisional-follow-ups"
      tint={(r) => r.overdue}
      testId="follow-ups"
    />
  );
}

export function AwaitingTable({ rows }: { rows: Awaiting[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      cols={[
        { label: t('ap.fu.name'), cell: (r) => <Link className="text-primary underline-offset-2 hover:underline" href={`/students/${r.studentId}`}>{r.name}</Link>, sort: (r) => r.name },
        { label: t('ap.aw.class'), cell: (r) => r.className },
        { label: t('ap.aw.roll'), cell: (r) => r.rollNo },
        { label: t('ap.fu.application'), cell: (r) => r.applicationNo },
        { label: t('ap.aw.enrolled'), cell: (r) => (r.enrolledOn ? fmt.date(r.enrolledOn, 'short') : '-'), sort: (r) => r.enrolledOn ?? '' },
      ]}
      rows={rows}
      empty={t('ap.aw.none')}
      exportName="awaiting-register-number"
      testId="awaiting"
    />
  );
}

// ---- broadcasts ----------------------------------------------------------------------------------------------------

const STAGES = ['new', 'contacted', 'counselling', 'applied', 'deferred', 'lost'];

/** Compose a campaign message to a lead segment (registered templates only), preview the reach, send once. */
export function BroadcastDesk({ templates, programmes, campaigns, rows }: { templates: { id: string; key: string; channel: string; usable: boolean; problem: string | null }[]; programmes: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; rows: Broadcast[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [templateId, setTemplateId] = useState(templates.find((x) => x.usable)?.id ?? '');
  const [seg, setSeg] = useState<SegmentInput>({ stages: ['new', 'contacted', 'counselling'] });
  const [reach, setReach] = useState<{ recipients: number; unreachable: number; optedOut: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const tpl = templates.find((x) => x.id === templateId);
  const preview = () =>
    start(async () => {
      if (!tpl) return;
      const res = await previewBroadcast(tpl.channel as 'sms', seg);
      if (!res.ok) return toast.error(res.error);
      setReach(res.data);
    });
  const send = () =>
    start(async () => {
      const res = await sendBroadcast(templateId, seg, `bc-${templateId.slice(0, 8)}-${Date.now()}`);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ap.bc.queued', { n: res.data.total }));
      setConfirm(false);
      router.refresh();
    });
  const cols: Col<Broadcast>[] = [
    { label: t('ap.bc.when'), cell: (r) => fmt.date(r.createdAt.slice(0, 10), 'short'), sort: (r) => r.createdAt },
    { label: t('ap.bc.template'), cell: (r) => r.template },
    { label: t('ap.bc.channel'), cell: (r) => r.channel.toUpperCase() },
    { label: t('ap.bc.status'), cell: (r) => <StatusPill tone={r.status === 'done' ? 'success' : 'info'}>{t(`ap.bc.st.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
    { label: t('ap.bc.sent'), cell: (r) => `${r.sent} / ${r.total - r.skipped}`, num: true, sort: (r) => r.sent },
    { label: t('ap.bc.skipped'), cell: (r) => r.skipped, num: true },
    { label: t('ap.bc.failed'), cell: (r) => r.failed, num: true },
  ];
  return (
    <div className="grid gap-6">
      <Card title={t('ap.bc.compose')} subtitle={t('ap.bc.help')}>
        <div className="grid gap-4">
          <FormRow>
            <FormField label={t('ap.bc.template')}>
              <SelectInput value={templateId} onChange={(e) => { setTemplateId(e.target.value); setReach(null); }} options={templates.map((x) => ({ value: x.id, label: `${x.key} (${x.channel.toUpperCase()})${x.usable ? '' : ` · ${x.problem ?? ''}`}`, disabled: !x.usable }))} empty={t('ap.bc.pick')} className="min-w-[280px]" />
            </FormField>
            <FormField label={t('ap.bc.programme')}>
              <SelectInput value={seg.programId ?? ''} onChange={(e) => { setSeg({ ...seg, programId: e.target.value || undefined }); setReach(null); }} options={programmes.map((p) => ({ value: p.id, label: p.name }))} empty={t('ap.bc.any')} className="min-w-[180px]" />
            </FormField>
            <FormField label={t('ap.bc.campaign')}>
              <SelectInput value={seg.campaignId ?? ''} onChange={(e) => { setSeg({ ...seg, campaignId: e.target.value || undefined }); setReach(null); }} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} empty={t('ap.bc.any')} className="min-w-[200px]" />
            </FormField>
            <FormField label={t('ap.bc.followUpBy')}>
              <TextInput type="date" value={seg.followUpBy ?? ''} onChange={(e) => { setSeg({ ...seg, followUpBy: e.target.value || undefined }); setReach(null); }} />
            </FormField>
          </FormRow>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STAGES.map((s) => (
              <CheckboxField key={s} label={t(`ap.stage.${s}` as MessageKey)} checked={seg.stages.includes(s)} onChange={() => { setSeg({ ...seg, stages: seg.stages.includes(s) ? seg.stages.filter((x) => x !== s) : [...seg.stages, s] }); setReach(null); }} />
            ))}
          </div>
          {reach && <Alert severity="info">{t('ap.bc.reach', { n: reach.recipients, unreachable: reach.unreachable, out: reach.optedOut })}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" disabled={pending || !tpl} onClick={preview}>
              {t('ap.bc.preview')}
            </Button>
            <Button className="h-9" disabled={pending || !reach || reach.recipients === 0} onClick={() => setConfirm(true)} data-testid="send-broadcast">
              <Send />
              {t('ap.bc.send')}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={t('ap.bc.history')}>
        <Grid cols={cols} rows={rows} empty={t('ap.bc.none')} emptyIcon={<Megaphone />} exportName="broadcasts" testId="broadcasts" />
      </Card>
      {confirm && reach && (
        <Dialog title={t('ap.bc.send')} onClose={() => setConfirm(false)} busy={pending} actions={<><Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>{t('common.cancel')}</Button><Button onClick={send} disabled={pending}>{t('ap.bc.sendNow', { n: reach.recipients })}</Button></>}>
          <p className="text-[13.5px]">{t('ap.bc.confirm', { n: reach.recipients, template: tpl?.key ?? '' })}</p>
        </Dialog>
      )}
    </div>
  );
}

// ---- returns -------------------------------------------------------------------------------------------------------

export function ApprovalTable({ rows }: { rows: ApprovalRow[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      cols={[
        { label: t('ap.ret.sl'), cell: (r) => r.slNo, num: true },
        { label: t('ap.ret.registerNo'), cell: (r) => r.registerNo ?? <StatusPill tone="warning">{t('ap.ret.awaiting')}</StatusPill>, sort: (r) => r.registerNo ?? '' },
        { label: t('ap.fu.name'), cell: (r) => r.name },
        { label: t('ap.ret.programme'), cell: (r) => r.programme },
        { label: t('ap.ret.category'), cell: (r) => r.category || '-' },
        { label: t('ap.ret.seatType'), cell: (r) => r.seatType },
        { label: t('ap.ret.type'), cell: (r) => t(`ap.type.${r.admissionType}` as MessageKey), sort: (r) => r.admissionType },
        { label: t('ap.ret.qualifying'), cell: (r) => [r.qualifying, r.qualifyingPercent !== null ? `${r.qualifyingPercent}%` : ''].filter(Boolean).join(' · ') || '-', wrap: true },
        { label: t('ap.ret.entrance'), cell: (r) => r.entrance ?? '-' },
        { label: t('ap.ret.admittedOn'), cell: (r) => (r.admittedOn ? fmt.date(r.admittedOn, 'short') : '-'), sort: (r) => r.admittedOn ?? '' },
        { label: t('ap.ret.eligibility'), cell: (r) => r.eligibilityCertificate, wrap: true },
        { label: t('ap.ret.provisional'), cell: (r) => (r.provisional ? <StatusPill tone="info">{t('ap.ret.provisionalYes')}</StatusPill> : '-'), sort: (r) => (r.provisional ? 1 : 0) },
      ]}
      rows={rows}
      empty={t('ap.ret.none')}
      exportName="admission-approval-list"
      testId="approval-list"
    />
  );
}

export function IntakeTable({ rows }: { rows: IntakeRow[] }) {
  const { t } = useI18n();
  return (
    <Grid
      cols={[
        { label: t('ap.ret.programme'), cell: (r) => r.programme },
        { label: t('ap.prog.intake'), cell: (r) => r.sanctionedIntake ?? '-', num: true },
        { label: t('ap.ret.admitted'), cell: (r) => r.admitted, num: true },
        { label: t('ap.ret.bySeatType'), cell: (r) => Object.entries(r.bySeatType).map(([k, n]) => `${k} ${n}`).join(', ') || '-', wrap: true },
        { label: t('ap.type.lateral'), cell: (r) => r.lateral, num: true },
        { label: t('ap.seat.super'), cell: (r) => r.supernumerary, num: true },
        { label: t('ap.seat.vacant'), cell: (r) => r.vacant ?? '-', num: true },
        { label: t('ap.ret.fill'), cell: (r) => (r.fillPercent !== null ? `${r.fillPercent}%` : '-'), num: true, sort: (r) => r.fillPercent ?? 0 },
        { label: t('ap.prog.approval'), cell: (r) => r.approvalRef ?? '-' },
      ]}
      rows={rows}
      empty={t('ap.ret.none')}
      exportName="intake-return"
      testId="intake"
    />
  );
}

const mf = (g: { male: number; female: number; transgender?: number }) => `${g.male} / ${g.female}${g.transgender ? ` / ${g.transgender}` : ''}`;
export function AisheTable({ rows }: { rows: AisheRow[] }) {
  const { t } = useI18n();
  return (
    <Grid
      cols={[
        { label: t('ap.ret.programme'), cell: (r) => r.programme },
        { label: 'General', cell: (r) => mf(r.general) },
        { label: 'EWS', cell: (r) => mf(r.ews) },
        { label: 'SC', cell: (r) => mf(r.sc) },
        { label: 'ST', cell: (r) => mf(r.st) },
        { label: 'OBC', cell: (r) => mf(r.obc) },
        { label: t('ap.ret.total'), cell: (r) => mf(r.total) },
        { label: t('ap.hz.pwd'), cell: (r) => mf(r.pwd) },
        { label: t('ap.ret.muslim'), cell: (r) => mf(r.muslimMinority) },
        { label: t('ap.ret.otherMinority'), cell: (r) => mf(r.otherMinority) },
        { label: t('ap.ret.foreign'), cell: (r) => mf(r.foreign) },
      ]}
      rows={rows}
      empty={t('ap.ret.none')}
      exportName="aishe-enrolment"
      testId="aishe"
    />
  );
}
