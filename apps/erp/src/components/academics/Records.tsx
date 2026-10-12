'use client';

import { useRouter } from 'next/navigation';
import type { MessageKey } from '@/i18n/messages';
import { useState } from 'react';
import { LinkButton } from '@/components/LinkButton';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, RecordPage, type WorkflowStep } from '@/components/templates';
import { Card, DataTable, SelectInput, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { percent, statusTone, type AssessmentRow, type GuardianRecord, type RequestDetail, type SectionRecord, type SubjectRecord, type TeacherRecord } from '@/lib/academics';
import { cancelRequest, decideRequest, lockMarks } from '@/app/(dashboard)/academics/actions';
import { Pill, RequestList, SlotTable, toActivity } from './shared';

function useAssessmentCols(withSection: boolean): Column<AssessmentRow>[] {
  const { t, fmt } = useI18n();
  return [
    { id: 'heldOn', header: t('acad.col.date'), cell: (r) => fmt.date(r.heldOn), sort: (r) => r.heldOn },
    { id: 'title', header: t('acad.col.title'), cell: (r) => r.title, sort: (r) => r.title, rowHeader: true },
    { id: 'where', header: withSection ? t('acad.col.section') : t('acad.col.subject'), cell: (r) => (withSection ? r.section : r.subject) ?? '—', hideBelow: 'sm' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.publishedAt ? 'published' : r.lockedAt ? 'locked' : r.markStatus} />, sort: (r) => r.markStatus },
  ];
}

const pctText = (n: number | null) => (n === null ? '—' : `${n}%`);

/** A request with its approval steps; deciding runs the server action and refreshes the page. */
export function RequestRecordView({ r, sections }: { r: RequestDetail; sections: { value: string; label: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [sectionId, setSectionId] = useState(String(r.payload.sectionId ?? ''));
  const steps: WorkflowStep[] = r.steps.map((s) => ({ id: s.key, label: t(`acad.step.${s.key}` as MessageKey), state: s.state, by: s.byName ?? undefined, at: s.at ? fmt.dateTime(s.at) : undefined, note: s.note ?? undefined }));
  const p = r.payload;
  const details: [string, string][] = [
    ...(p.sectionId ? [[t('acad.toSection'), sections.find((s) => s.value === p.sectionId)?.label ?? '—'] as [string, string]] : []),
    ...(p.outcome ? [[t('acad.outcome'), t(`acad.outcome.${p.outcome}` as MessageKey)] as [string, string]] : []),
    ...(p.lastDay ? [[t('acad.lastDay'), fmt.date(String(p.lastDay))] as [string, string]] : []),
    ...(p.date ? [[t('acad.col.date'), fmt.date(String(p.date))] as [string, string]] : []),
    ...(p.startsAt ? [[t('acad.startsAt'), String(p.startsAt)] as [string, string]] : []),
    ...(p.endsAt ? [[t('acad.endsAt'), String(p.endsAt)] as [string, string]] : []),
    ...(p.dayOfWeek ? [[t('acad.col.day'), t(`acad.day.${p.dayOfWeek}` as MessageKey)] as [string, string]] : []),
    ...Object.entries(r.outcome ?? {})
      .filter(([k, v]) => ['tcNumber', 'admissionNo', 'rollNo'].includes(k) && v)
      .map(([k, v]) => [t(`acad.out.${k}` as MessageKey), String(v)] as [string, string]),
  ];
  return (
    <RecordPage
      title={r.number}
      subtitle={r.title}
      status={{ label: t(`acad.status.${r.status}` as MessageKey), tone: statusTone(r.status) }}
      facts={[
        { label: t('acad.col.kind'), value: t(`acad.kind.${r.kind}` as MessageKey) },
        { label: t('acad.col.student'), value: r.student ? <a className="underline" href={`/students/${r.student.id}`}>{r.student.fullName}</a> : '—' },
        { label: t('acad.col.section'), value: r.student?.section ?? '—' },
        { label: t('acad.col.requester'), value: r.requester },
        { label: t('acad.col.raised'), value: fmt.dateTime(r.createdAt) },
      ]}
      secondary={
        r.canCancel ? (
          <Button
            variant="outline"
            onClick={async () => {
              const x = await cancelRequest(r.id);
              if (x.ok) router.refresh();
              else toast.error(x.error);
            }}
          >
            {t('acad.cancelRequest')}
          </Button>
        ) : undefined
      }
      overview={
        <Card title={t('acad.details')}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t('acad.reason')}</dt>
              <dd className="text-sm">{r.reason || '—'}</dd>
            </div>
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      }
      activity={toActivity(r.activity, t)}
      aside={
        <ApprovalPanel
          steps={steps}
          canDecide={r.canDecide}
          extra={r.kind === 'admission_handover' && r.steps[0]?.state === 'current' ? <SelectInput label={t('acad.toSection')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} options={sections} fullWidth /> : undefined}
          onDecide={(d, c) => decideRequest(r.id, d, c, r.kind === 'admission_handover' && sectionId ? sectionId : undefined)}
          onDecided={() => {
            toast.success(t('acad.decided'));
            router.refresh();
          }}
        />
      }
    />
  );
}

export function SectionRecordView({ s }: { s: SectionRecord }) {
  const { t, fmt } = useI18n();
  const aCols = useAssessmentCols(false);
  type St = SectionRecord['students'][number];
  const stCols: Column<St>[] = [
    { id: 'roll', header: t('acad.col.rollNo'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
    { id: 'name', header: t('acad.col.student'), cell: (r) => r.fullName, sort: (r) => r.fullName, rowHeader: true },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.status} prefix="acad.stu" />, sort: (r) => r.status, hideBelow: 'sm' },
    { id: 'att', header: t('acad.col.att30'), cell: (r) => pctText(percent(r.attended, r.held)), sort: (r) => percent(r.attended, r.held) ?? -1, align: 'right' },
  ];
  const onRoll = s.students.filter((x) => ['active', 'enrolled', 'on_leave'].includes(x.status));
  const held = onRoll.reduce((a, x) => a + x.held, 0);
  const short = onRoll.filter((x) => (percent(x.attended, x.held) ?? 100) < s.minPercent).length;
  const covTotal = s.coverage.reduce((a, x) => a + x.total, 0);
  return (
    <RecordPage
      title={s.name}
      subtitle={`${s.program} · ${s.year}`}
      facts={[
        { label: t('acad.col.strength'), value: fmt.number(onRoll.length) },
        { label: t('acad.col.att30'), value: pctText(percent(onRoll.reduce((a, x) => a + x.attended, 0), held)) },
        { label: t('acad.shortCount', { n: s.minPercent }), value: fmt.number(short) },
        { label: t('acad.col.periods'), value: fmt.number(s.timetable.length) },
        { label: t('acad.col.coverage'), value: pctText(percent(s.coverage.reduce((a, x) => a + x.covered, 0), covTotal)) },
      ]}
      primary={<LinkButton variant="contained" href={`/academics/reports/attendance-monthly?sectionId=${s.id}`}>{t('acad.report.attendance-monthly')}</LinkButton>}
      secondary={<LinkButton variant="outlined" href={`/academics/reports/marks-register?sectionId=${s.id}`}>{t('acad.report.marks-register')}</LinkButton>}
      overview={
        <Card title={t('acad.tab.students')}>
          <DataTable columns={stCols} rows={s.students} rowId={(r) => r.id} label={t('acad.tab.students')} rowHref={(r) => `/students/${r.id}`} rowTone={(r) => ((percent(r.attended, r.held) ?? 100) < s.minPercent ? 'warning' : undefined)} exportName={`class-${s.name}`} bare />
        </Card>
      }
      related={[
        { value: 'timetable', label: t('acad.tab.timetable'), count: s.timetable.length, content: <SlotTable slots={s.timetable} show={['subject', 'teacher', 'room']} label={t('acad.tab.timetable')} /> },
        { value: 'assessments', label: t('acad.tab.assessments'), count: s.assessments.length, content: <DataTable columns={aCols.map((c) => (c.id === 'where' ? { ...c, cell: (r: AssessmentRow) => r.subject ?? '—' } : c))} rows={s.assessments} rowId={(r) => r.id} label={t('acad.tab.assessments')} rowHref={(r) => `/academics/assessments/${r.id}`} bare /> },
        {
          value: 'coverage',
          label: t('acad.col.coverage'),
          count: s.coverage.length,
          content: (
            <ul className="grid gap-3">
              {s.coverage.map((c) => (
                <li key={c.subjectId} className="flex items-center gap-4">
                  <a className="w-48 truncate text-sm underline" href={`/academics/subjects/${c.subjectId}`}>{c.subject}</a>
                  <div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${percent(c.covered, c.total) ?? 0}%` }} /></div>
                  <span className="w-24 text-right text-sm tabular-nums">{c.covered}/{c.total}</span>
                </li>
              ))}
            </ul>
          ),
        },
        { value: 'requests', label: t('acad.tab.requests'), count: s.requests.length, content: <RequestList rows={s.requests} label={t('acad.tab.requests')} /> },
      ]}
      activity={toActivity(s.activity, t)}
    />
  );
}

export function GuardianRecordView({ g }: { g: GuardianRecord }) {
  const { t, fmt } = useI18n();
  type C = GuardianRecord['children'][number];
  const cols: Column<C>[] = [
    { id: 'name', header: t('acad.col.student'), cell: (r) => r.fullName, sort: (r) => r.fullName, rowHeader: true },
    { id: 'section', header: t('acad.col.section'), cell: (r) => `${r.section} · ${r.rollNo}`, sort: (r) => r.section },
    { id: 'relation', header: t('acad.col.relation'), cell: (r) => `${r.relation}${r.isPrimary ? ` · ${t('acad.primary')}` : ''}${r.isEmergencyContact ? ` · ${t('acad.emergency')}` : ''}`, hideBelow: 'sm' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.status} prefix="acad.stu" />, sort: (r) => r.status },
  ];
  type N = GuardianRecord['notices'][number];
  const nCols: Column<N>[] = [
    { id: 'at', header: t('acad.col.date'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
    { id: 'title', header: t('acad.col.title'), cell: (r) => r.title, rowHeader: true },
    { id: 'read', header: t('acad.col.status'), cell: (r) => <StatusPill tone={r.readAt ? 'success' : 'neutral'}>{r.readAt ? t('acad.read') : t('acad.unread')}</StatusPill> },
  ];
  return (
    <RecordPage
      title={g.fullName}
      subtitle={t('acad.guardian')}
      status={{ label: t(`acad.user.${g.status}` as MessageKey), tone: g.status === 'active' ? 'success' : 'neutral' }}
      facts={[
        { label: t('acad.phone'), value: g.phone ?? '—' },
        { label: t('acad.email'), value: g.email ?? '—' },
        { label: t('acad.children'), value: fmt.number(g.children.length) },
        { label: t('acad.feesDue'), value: `₹${fmt.number(Number(g.fees.duePaise) / 100)}` },
        { label: t('acad.openInvoices'), value: fmt.number(g.fees.openInvoices) },
      ]}
      overview={
        <Card title={t('acad.children')}>
          <DataTable columns={cols} rows={g.children} rowId={(r) => r.id} label={t('acad.children')} rowHref={(r) => `/students/${r.id}`} bare />
        </Card>
      }
      related={[
        { value: 'notices', label: t('acad.tab.notices'), count: g.notices.length, content: <DataTable columns={nCols} rows={g.notices} rowId={(r) => r.id} label={t('acad.tab.notices')} bare empty={t('acad.none')} /> },
        { value: 'requests', label: t('acad.tab.requests'), count: g.requests.length, content: <RequestList rows={g.requests} label={t('acad.tab.requests')} /> },
      ]}
      activity={toActivity(g.activity, t)}
    />
  );
}

export function TeacherRecordView({ x }: { x: TeacherRecord }) {
  const { t, fmt } = useI18n();
  const aCols = useAssessmentCols(true);
  const over = x.weekly > x.limits.perWeek || x.byDay.some((d) => d.periods > x.limits.perDay);
  type S = TeacherRecord['substitutions'][number];
  const sCols: Column<S>[] = [
    { id: 'date', header: t('acad.col.date'), cell: (r) => fmt.date(r.date), sort: (r) => r.date },
    { id: 'role', header: t('acad.col.role'), cell: (r) => t(`acad.sub.${r.role}` as MessageKey), sort: (r) => r.role },
    { id: 'class', header: t('acad.col.section'), cell: (r) => `${r.section} · ${r.subject}`, rowHeader: true },
    { id: 'status', header: t('acad.col.status'), cell: (r) => r.status, hideBelow: 'sm' },
  ];
  const maxDay = Math.max(x.limits.perDay, ...x.byDay.map((d) => d.periods), 1);
  return (
    <RecordPage
      title={x.fullName}
      subtitle={x.departments ?? t('acad.teacher')}
      status={over ? { label: t('acad.status.over'), tone: 'danger' } : { label: t('acad.status.ok'), tone: 'success' }}
      facts={[
        { label: t('acad.col.periods'), value: `${fmt.number(x.weekly)} / ${fmt.number(x.limits.perWeek)}` },
        { label: t('acad.col.sections'), value: fmt.number(new Set(x.slots.map((s) => s.sectionId)).size) },
        { label: t('acad.col.substitutions'), value: fmt.number(x.substitutions.filter((s) => s.role === 'covering').length) },
        { label: t('acad.marksOpen'), value: fmt.number(x.marksPending.length) },
        { label: t('acad.plansApproved'), value: `${fmt.number(x.lessonPlans.approved ?? 0)} / ${fmt.number(Object.values(x.lessonPlans).reduce((a, b) => a + b, 0))}` },
      ]}
      primary={<LinkButton variant="contained" href={`/academics/reports/timetable?by=teacher&id=${x.id}`}>{t('acad.report.timetable')}</LinkButton>}
      overview={
        <Card title={t('acad.loadByDay')}>
          <ul className="grid gap-3">
            {x.byDay.map((d) => (
              <li key={d.day} className="flex items-center gap-4">
                <span className="w-24 text-sm">{t(`acad.day.${d.day}` as MessageKey)}</span>
                <div className="h-3 flex-1 rounded bg-muted"><div className={d.periods > x.limits.perDay ? 'h-3 rounded bg-destructive' : 'h-3 rounded bg-primary'} style={{ width: `${(d.periods / maxDay) * 100}%` }} /></div>
                <span className="w-12 text-right text-sm tabular-nums">{d.periods}</span>
              </li>
            ))}
          </ul>
        </Card>
      }
      related={[
        { value: 'timetable', label: t('acad.tab.timetable'), count: x.slots.length, content: <SlotTable slots={x.slots} show={['section', 'subject', 'room']} label={t('acad.tab.timetable')} /> },
        { value: 'subs', label: t('acad.col.substitutions'), count: x.substitutions.length, content: <DataTable columns={sCols} rows={x.substitutions} rowId={(r) => r.id} label={t('acad.col.substitutions')} bare empty={t('acad.none')} /> },
        { value: 'marks', label: t('acad.marksOpen'), count: x.marksPending.length, content: <DataTable columns={aCols} rows={x.marksPending} rowId={(r) => r.id} label={t('acad.marksOpen')} rowHref={(r) => `/academics/assessments/${r.id}`} bare empty={t('acad.none')} /> },
      ]}
      activity={toActivity(x.activity, t)}
    />
  );
}

export function SubjectRecordView({ s }: { s: SubjectRecord }) {
  const { t, fmt } = useI18n();
  const aCols = useAssessmentCols(true);
  type C = SubjectRecord['classes'][number];
  const cCols: Column<C>[] = [
    { id: 'section', header: t('acad.col.section'), cell: (r) => r.section, sort: (r) => r.section, rowHeader: true },
    { id: 'teachers', header: t('acad.col.teacher'), cell: (r) => r.teachers, hideBelow: 'sm' },
    { id: 'periods', header: t('acad.col.periods'), cell: (r) => fmt.number(r.periods), sort: (r) => r.periods, align: 'right' },
    { id: 'cov', header: t('acad.col.coverage'), cell: (r) => `${r.covered}/${r.total} (${pctText(percent(r.covered, r.total))})`, sort: (r) => percent(r.covered, r.total) ?? -1, align: 'right' },
  ];
  type P = SubjectRecord['lessonPlans'][number];
  const pCols: Column<P>[] = [
    { id: 'date', header: t('acad.col.date'), cell: (r) => fmt.date(r.date), sort: (r) => r.date },
    { id: 'section', header: t('acad.col.section'), cell: (r) => r.section, rowHeader: true },
    { id: 'teacher', header: t('acad.col.teacher'), cell: (r) => r.teacher, hideBelow: 'sm' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.status} />, sort: (r) => r.status },
  ];
  type O = SubjectRecord['offerings'][number];
  const oCols: Column<O>[] = [
    { id: 'term', header: t('acad.col.term'), cell: (r) => r.term, rowHeader: true },
    { id: 'credits', header: t('acad.col.credits'), cell: (r) => fmt.number(r.credits), align: 'right' },
    { id: 'reg', header: t('acad.col.registered'), cell: (r) => `${r.registered}/${r.seatCap}`, align: 'right' },
  ];
  return (
    <RecordPage
      title={`${s.code} · ${s.name}`}
      subtitle={`${s.program} · ${s.term}`}
      facts={[
        { label: t('acad.col.department'), value: s.department ?? '—' },
        { label: t('acad.course'), value: s.course ?? '—' },
        { label: t('acad.col.sections'), value: fmt.number(s.classes.length) },
        { label: t('acad.tab.assessments'), value: fmt.number(s.assessments.length) },
        { label: t('acad.plansApproved'), value: `${fmt.number(s.lessonPlans.filter((p) => p.status === 'approved').length)} / ${fmt.number(s.lessonPlans.length)}` },
      ]}
      primary={<LinkButton variant="contained" href="/academics/reports/syllabus-coverage">{t('acad.report.syllabus-coverage')}</LinkButton>}
      overview={
        <Card title={t('acad.tab.classes')}>
          <DataTable columns={cCols} rows={s.classes} rowId={(r) => r.id} label={t('acad.tab.classes')} rowHref={(r) => `/academics/sections/${r.id}`} bare empty={t('acad.none')} />
        </Card>
      }
      related={[
        { value: 'assessments', label: t('acad.tab.assessments'), count: s.assessments.length, content: <DataTable columns={aCols} rows={s.assessments} rowId={(r) => r.id} label={t('acad.tab.assessments')} rowHref={(r) => `/academics/assessments/${r.id}`} bare empty={t('acad.none')} /> },
        { value: 'plans', label: t('acad.tab.plans'), count: s.lessonPlans.length, content: <DataTable columns={pCols} rows={s.lessonPlans} rowId={(r) => r.id} label={t('acad.tab.plans')} bare empty={t('acad.none')} /> },
        { value: 'offerings', label: t('acad.offerings'), count: s.offerings.length, content: <DataTable columns={oCols} rows={s.offerings} rowId={(r) => r.id} label={t('acad.offerings')} bare empty={t('acad.none')} /> },
      ]}
      activity={toActivity(s.activity, t)}
    />
  );
}

export interface AssessmentDetail {
  id: string;
  title: string;
  kind: string;
  maxMarks: number;
  heldOn: string;
  markStatus: string;
  lockedAt?: string | null;
  publishedAt: string | null;
  sectionId: string;
  subject: { id: string; name: string };
  average: number | null;
  students: { id: string; rollNo: string; fullName: string; marks: number | null; moderatedMarks?: number | null; absent: boolean }[];
}

/** Internal marks: entry → submitted → verified (head) → locked → published. */
export function AssessmentRecordView({ a, activity, canLock }: { a: AssessmentDetail; activity: RequestDetail['activity']; canLock: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const order = ['draft', 'submitted', 'verified', 'locked', 'published'];
  const at = a.publishedAt ? 4 : a.lockedAt ? 3 : a.markStatus === 'verified' || a.markStatus === 'moderated' ? 2 : a.markStatus === 'submitted' ? 1 : 0;
  const steps: WorkflowStep[] = order.map((k, i) => ({ id: k, label: t(`acad.mstep.${k}` as MessageKey), state: i < at ? 'done' : i === at ? (i === 4 ? 'done' : 'current') : 'upcoming' }));
  type M = AssessmentDetail['students'][number];
  const cols: Column<M>[] = [
    { id: 'roll', header: t('acad.col.rollNo'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
    { id: 'name', header: t('acad.col.student'), cell: (r) => r.fullName, sort: (r) => r.fullName, rowHeader: true },
    { id: 'marks', header: t('acad.col.marks'), cell: (r) => (r.absent ? t('acad.absent') : String(r.moderatedMarks ?? r.marks ?? '—')), sort: (r) => r.moderatedMarks ?? r.marks ?? -1, align: 'right' },
  ];
  const entered = a.students.filter((s) => s.marks !== null || s.absent).length;
  async function toggle(unlock: boolean) {
    const r = await lockMarks(a.id, unlock);
    if (r.ok) {
      toast.success(unlock ? t('acad.unlocked') : t('acad.locked'));
      router.refresh();
    } else toast.error(r.error);
  }
  const status = a.publishedAt ? 'published' : a.lockedAt ? 'locked' : a.markStatus;
  return (
    <RecordPage
      title={a.title}
      subtitle={a.subject.name}
      status={{ label: t(`acad.status.${status}` as MessageKey), tone: statusTone(status) }}
      facts={[
        { label: t('acad.col.date'), value: fmt.date(a.heldOn) },
        { label: t('acad.maxMarks'), value: fmt.number(a.maxMarks) },
        { label: t('acad.entered'), value: `${entered} / ${a.students.length}` },
        { label: t('acad.average'), value: a.average === null ? '—' : fmt.number(a.average) },
      ]}
      primary={canLock && !a.publishedAt ? a.lockedAt ? <Button variant="outline" onClick={() => toggle(true)}>{t('acad.unlock')}</Button> : <Button disabled={at !== 2} onClick={() => toggle(false)}>{t('acad.lock')}</Button> : undefined}
      secondary={<LinkButton variant="outlined" href={`/academics/reports/marks-register?sectionId=${a.sectionId}`}>{t('acad.report.marks-register')}</LinkButton>}
      overview={
        <Card title={t('acad.col.marks')}>
          <DataTable columns={cols} rows={a.students} rowId={(r) => r.id} label={t('acad.col.marks')} exportName={`marks-${a.title}`} bare />
        </Card>
      }
      activity={toActivity(activity, t)}
      aside={<ApprovalPanel title={t('acad.marksFlow')} steps={steps} canDecide={false} onDecide={async () => undefined} />}
    />
  );
}
