'use client';

import { BellRing, GraduationCap, HandHeart, ShieldCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { askCondonation, sendShortageAlerts } from '@/app/(dashboard)/attendance/desk-actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, Dialog, EmptyState, SelectInput, StatusPill, TextInput, useToast, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { eligibilityTone, type AlertRow, type DetentionRow, type Eligibility } from '@/lib/attendance-desk';
import { pctText } from './kit';

type Student = Eligibility['students'][number];

/** How the rules in force read, in one line: threshold, where it comes from, per subject or overall, condonation floor. */
export function PolicyNote({ e }: { e: Pick<Eligibility, 'thresholdPct' | 'source' | 'basis' | 'condonableToPct' | 'maxCondonationPoints' | 'profile'> }) {
  const { t, fmt } = useI18n();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm" data-testid="policy-note">
      <ShieldCheck className="size-4 text-teal-ink" />
      <span className="font-semibold">{t('atd.policy.threshold', { n: fmt.number(e.thresholdPct) })}</span>
      <span className="text-muted-foreground">· {t(`atd.policy.basis.${e.basis}`)}</span>
      <span className="text-muted-foreground">· {e.condonableToPct !== null ? t('atd.policy.floor', { n: fmt.number(e.condonableToPct) }) : t('atd.policy.noFloor', { n: fmt.number(e.maxCondonationPoints) })}</span>
      <StatusPill tone="info">{e.profile ? t('atd.policy.profile', { name: e.profile.name }) : t(`atd.policy.source.${e.source}` as MessageKey)}</StatusPill>
    </div>
  );
}

/** A class's eligibility: overall and subject-wise attendance after condonation, and who is short or detained. */
export function ClassEligibility({ data, sectionId, canAlert }: { data: Eligibility; sectionId: string; canAlert: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [ask, setAsk] = useState<Student | null>(null);
  const [pending, start] = useTransition();
  const shortList = (s: Student) => (s.shortIn.includes('overall') ? t('atd.overall') : s.subjects.filter((x) => s.shortIn.includes(x.subjectId)).map((x) => `${x.code} ${pctText(x.effective, fmt)}`).join(', '));
  const columns: Column<Student>[] = [
    { id: 'roll', header: t('atd.col.roll'), cell: (s) => s.rollNo, sort: (s) => s.rollNo },
    { id: 'name', header: t('atd.col.student'), cell: (s) => s.fullName, sort: (s) => s.fullName, rowHeader: true },
    { id: 'held', header: t('atd.col.attendedHeld'), cell: (s) => `${fmt.number(s.attended)}/${fmt.number(s.held)}`, sort: (s) => s.held, align: 'right', hideBelow: 'md' },
    { id: 'pct', header: t('atd.col.pct'), cell: (s) => pctText(s.pct, fmt), sort: (s) => s.pct ?? -1, align: 'right' },
    { id: 'effective', header: t('atd.col.effective'), cell: (s) => (s.condonedPoints ? `${pctText(s.effectivePct, fmt)} (+${fmt.number(s.condonedPoints)})` : pctText(s.effectivePct, fmt)), sort: (s) => s.effectivePct ?? -1, align: 'right', hideBelow: 'sm' },
    { id: 'short', header: t('atd.col.shortIn'), cell: (s) => shortList(s) || '—', csv: (s) => shortList(s), hideBelow: 'lg' },
    { id: 'status', header: t('atd.col.status'), cell: (s) => <StatusPill tone={s.warning ? 'warning' : eligibilityTone(s.status)}>{t(s.warning ? 'atd.elig.warning' : `atd.elig.${s.status}`)}</StatusPill>, sort: (s) => s.status, csv: (s) => s.status },
  ];
  const actions = (s: Student): RowAction<Student>[] => (s.status === 'condonable' ? [{ id: 'condone', label: t('atd.askCondonation'), icon: <HandHeart />, onSelect: (r) => setAsk(r) }] : []);
  const alert = () =>
    start(async () => {
      const r = await sendShortageAlerts([sectionId]);
      if (!r.ok) return toast.error(r.error);
      toast.success(t('atd.alertsSent', { n: fmt.number(r.data.students), m: fmt.number(r.data.recipients) }));
    });
  const counts = (['eligible', 'condonable', 'detained'] as const).map((k) => [k, data.students.filter((s) => s.status === k).length] as const);
  return (
    <>
      <PolicyNote e={data} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {counts.map(([k, n]) => (
            <StatusPill key={k} tone={eligibilityTone(k)}>
              {t(`atd.elig.${k}`)} {fmt.number(n)}
            </StatusPill>
          ))}
          {data.window.label && <span className="text-sm text-muted-foreground">{t('atd.window', { label: data.window.label })}</span>}
        </div>
        {canAlert && (
          <Button variant="outline" className="h-9" onClick={alert} disabled={pending} data-testid="send-alerts">
            <BellRing />
            {t('atd.sendAlerts')}
          </Button>
        )}
      </div>
      <DataTable<Student>
        testId="eligibility-table"
        label={t('atd.elig.title')}
        columns={columns}
        rows={data.students}
        rowId={(s) => s.studentId}
        rowActions={actions}
        exportName="eligibility"
        initialSort={{ id: 'pct', dir: 'asc' }}
        empty={
          <EmptyState icon={<GraduationCap />} title={t('atd.elig.empty')}>
            {t('atd.elig.emptyBody')}
          </EmptyState>
        }
      />
      {ask && <CondonationAsk student={ask} onClose={() => setAsk(null)} />}
    </>
  );
}

function CondonationAsk({ student, onClose }: { student: Student; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const short = student.subjects.filter((x) => student.shortIn.includes(x.subjectId));
  const [subjectId, setSubjectId] = useState(short[0]?.subjectId ?? '');
  const [kind, setKind] = useState<'medical' | 'other'>('other');
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await askCondonation(student.studentId, subjectId || null, kind, reason.trim());
      if (!r.ok) return toast.error(r.error);
      toast.success(t('atd.condonationAsked'));
      onClose();
    });
  return (
    <Dialog
      title={t('atd.condonationFor', { name: student.fullName })}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={go} disabled={pending || reason.trim().length < 5}>
            {t('atd.askCondonation')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {short.length > 0 && <SelectInput label={t('atd.subject')} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={short.map((x) => ({ value: x.subjectId, label: `${x.code} ${x.subject} (${pctText(x.pct, fmt)})` }))} />}
        <SelectInput label={t('atd.condonationKind')} value={kind} onChange={(e) => setKind(e.target.value as 'medical' | 'other')} options={[{ value: 'medical', label: t('atd.kind.medical') }, { value: 'other', label: t('atd.kind.other') }]} />
        <TextInput label={t('atd.reason')} value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} required helper={t('atd.reasonHelp')} />
      </div>
    </Dialog>
  );
}

/** Students short of attendance across a programme's classes, for the examination's eligibility (detention) list. */
export function DetentionTable({ rows }: { rows: DetentionRow[] }) {
  const { t, fmt } = useI18n();
  const shortList = (r: DetentionRow) => (r.shortIn.length ? r.shortIn.map((x) => `${x.code} ${pctText(x.effective, fmt)}`).join(', ') : t('atd.overall'));
  const columns: Column<DetentionRow>[] = [
    { id: 'section', header: t('atd.col.class'), cell: (r) => r.section, sort: (r) => r.section },
    { id: 'roll', header: t('atd.col.roll'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
    { id: 'name', header: t('atd.col.student'), cell: (r) => r.fullName, sort: (r) => r.fullName, rowHeader: true },
    { id: 'pct', header: t('atd.col.pct'), cell: (r) => pctText(r.pct, fmt), sort: (r) => r.pct ?? -1, align: 'right' },
    { id: 'effective', header: t('atd.col.effective'), cell: (r) => pctText(r.effectivePct, fmt), sort: (r) => r.effectivePct ?? -1, align: 'right', hideBelow: 'sm' },
    { id: 'short', header: t('atd.col.shortIn'), cell: shortList, csv: shortList, hideBelow: 'md' },
    { id: 'status', header: t('atd.col.status'), cell: (r) => <StatusPill tone={eligibilityTone(r.status)}>{t(`atd.elig.${r.status}`)}</StatusPill>, sort: (r) => r.status, csv: (r) => r.status },
  ];
  return (
    <DataTable<DetentionRow>
      testId="detention-table"
      label={t('atd.detention.title')}
      columns={columns}
      rows={rows}
      rowId={(r) => r.studentId}
      exportName="detention-list"
      empty={
        <EmptyState icon={<GraduationCap />} title={t('atd.detention.none')}>
          {t('atd.detention.noneBody')}
        </EmptyState>
      }
    />
  );
}

/** Shortage alerts sent to students and families; the principal can send them now. */
export function AlertsLog({ rows, canSend }: { rows: AlertRow[]; canSend: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const columns: Column<AlertRow>[] = [
    { id: 'sent', header: t('atd.col.sent'), cell: (r) => fmt.dateTime(r.sentAt), sort: (r) => r.sentAt },
    { id: 'name', header: t('atd.col.student'), cell: (r) => `${r.rollNo} ${r.fullName}`, sort: (r) => r.fullName, rowHeader: true },
    { id: 'section', header: t('atd.col.class'), cell: (r) => r.section, sort: (r) => r.section, hideBelow: 'md' },
    { id: 'scope', header: t('atd.col.subject'), cell: (r) => r.subject ?? t('atd.overall'), hideBelow: 'sm' },
    { id: 'kind', header: t('atd.col.kind'), cell: (r) => <StatusPill tone={r.kind === 'shortage' ? 'danger' : 'warning'}>{t(`atd.alert.${r.kind}`)}</StatusPill>, sort: (r) => r.kind, csv: (r) => r.kind },
    { id: 'pct', header: t('atd.col.pct'), cell: (r) => pctText(r.percent, fmt), sort: (r) => r.percent, align: 'right' },
    { id: 'to', header: t('atd.col.recipients'), cell: (r) => fmt.number(r.recipients), align: 'right', hideBelow: 'lg' },
  ];
  const send = () =>
    start(async () => {
      const r = await sendShortageAlerts();
      if (!r.ok) return toast.error(r.error);
      toast.success(t('atd.alertsSent', { n: fmt.number(r.data.students), m: fmt.number(r.data.recipients) }));
    });
  return (
    <>
      {canSend && (
        <div className="mb-4 flex justify-end">
          <Button className="h-9" onClick={send} disabled={pending} data-testid="send-all-alerts">
            <BellRing />
            {t('atd.sendAlertsAll')}
          </Button>
        </div>
      )}
      <DataTable<AlertRow>
        testId="alerts-table"
        label={t('atd.alerts.title')}
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        exportName="attendance-alerts"
        empty={
          <EmptyState icon={<BellRing />} title={t('atd.alerts.none')}>
            {t('atd.alerts.noneBody')}
          </EmptyState>
        }
      />
    </>
  );
}
