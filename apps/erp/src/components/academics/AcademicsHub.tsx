'use client';

import { BarChart3, Plus, Settings2 } from 'lucide-react';
import type { MessageKey } from '@/i18n/messages';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LinkButton } from '@/components/LinkButton';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel } from '@/components/templates';
import { Card, DataTable, Dialog, PageHeader, SelectInput, StatGrid, StatTile, TabPanel, Tabs, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { REPORT_KINDS, REQUEST_KINDS, type AcademicRequest, type Directory, type LessonPlanRow, type RequestKind, type Slot } from '@/lib/academics';
import { classStudents, decideLessonPlan, raiseRequest } from '@/app/(dashboard)/academics/actions';
import { Pill } from './shared';

type Tab = 'requests' | 'classes' | 'teachers' | 'subjects' | 'plans' | 'handover' | 'reports';
type Handover = { id: string; fullName: string; rollNo: string; section: string; sectionId: string; enrolledOn: string | null };

/** The academics desk: approval requests, classes, teachers, subjects, lesson plans to review, admissions to hand over, reports. */
export function AcademicsHub({ requests, directory, plans, handover, canAdmin, canReviewPlans, initial }: { requests: AcademicRequest[]; directory: Directory; plans: LessonPlanRow[]; handover: Handover[]; canAdmin: boolean; canReviewPlans: boolean; initial: { tab?: string; kind?: string; studentId?: string; sectionId?: string } }) {
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState<Tab>((['requests', 'classes', 'teachers', 'subjects', 'plans', 'handover', 'reports'].includes(initial.tab ?? '') ? initial.tab : 'requests') as Tab);
  const [form, setForm] = useState<{ kind: RequestKind; studentId?: string; sectionId?: string } | null>(REQUEST_KINDS.includes(initial.kind as RequestKind) ? { kind: initial.kind as RequestKind, studentId: initial.studentId, sectionId: initial.sectionId } : null);
  const [review, setReview] = useState<LessonPlanRow | null>(null);
  const router = useRouter();
  const toast = useToast();
  const pending = requests.filter((r) => r.status === 'pending');

  const reqCols: Column<AcademicRequest>[] = [
    { id: 'number', header: t('acad.col.number'), cell: (r) => r.number, sort: (r) => r.number, rowHeader: true },
    { id: 'kind', header: t('acad.col.kind'), cell: (r) => t(`acad.kind.${r.kind}` as MessageKey), sort: (r) => r.kind },
    { id: 'title', header: t('acad.col.title'), cell: (r) => r.title, sort: (r) => r.title, hideBelow: 'md' },
    { id: 'requester', header: t('acad.col.requester'), cell: (r) => r.requester, sort: (r) => r.requester, hideBelow: 'lg' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => (r.canDecide ? <Pill status="yourTurn" /> : <Pill status={r.status} />), sort: (r) => (r.canDecide ? '0' : r.status) },
    { id: 'createdAt', header: t('acad.col.raised'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt, hideBelow: 'sm' },
  ];
  const secCols: Column<Directory['sections'][number]>[] = [
    { id: 'name', header: t('acad.col.section'), cell: (r) => r.name, sort: (r) => r.name, rowHeader: true },
    { id: 'program', header: t('acad.col.program'), cell: (r) => r.program, sort: (r) => r.program, hideBelow: 'sm' },
    { id: 'year', header: t('acad.col.year'), cell: (r) => r.year, sort: (r) => r.year, hideBelow: 'md' },
    { id: 'strength', header: t('acad.col.strength'), cell: (r) => fmt.number(r.strength), sort: (r) => r.strength, align: 'right' },
    { id: 'periods', header: t('acad.col.periods'), cell: (r) => fmt.number(r.periods), sort: (r) => r.periods, align: 'right', hideBelow: 'sm' },
  ];
  const teaCols: Column<Directory['teachers'][number]>[] = [
    { id: 'name', header: t('acad.col.teacher'), cell: (r) => r.name, sort: (r) => r.name, rowHeader: true },
    { id: 'departments', header: t('acad.col.department'), cell: (r) => r.departments ?? '—', sort: (r) => r.departments ?? '', hideBelow: 'md' },
    { id: 'sections', header: t('acad.col.sections'), cell: (r) => fmt.number(r.sections), sort: (r) => r.sections, align: 'right', hideBelow: 'sm' },
    { id: 'periods', header: t('acad.col.periods'), cell: (r) => fmt.number(r.periods), sort: (r) => r.periods, align: 'right' },
  ];
  const subCols: Column<Directory['subjects'][number]>[] = [
    { id: 'code', header: t('acad.col.code'), cell: (r) => r.code, sort: (r) => r.code },
    { id: 'name', header: t('acad.col.subject'), cell: (r) => r.name, sort: (r) => r.name, rowHeader: true },
    { id: 'program', header: t('acad.col.program'), cell: (r) => `${r.program} · ${r.term}`, sort: (r) => r.program, hideBelow: 'md' },
    { id: 'department', header: t('acad.col.department'), cell: (r) => r.department ?? '—', sort: (r) => r.department ?? '', hideBelow: 'lg' },
    { id: 'sections', header: t('acad.col.sections'), cell: (r) => fmt.number(r.sections), sort: (r) => r.sections, align: 'right' },
  ];
  const planCols: Column<LessonPlanRow>[] = [
    { id: 'date', header: t('acad.col.date'), cell: (r) => fmt.date(r.date), sort: (r) => r.date },
    { id: 'teacher', header: t('acad.col.teacher'), cell: (r) => r.teacher, sort: (r) => r.teacher, rowHeader: true },
    { id: 'class', header: t('acad.col.section'), cell: (r) => `${r.section} · ${r.subject}`, sort: (r) => r.section, hideBelow: 'sm' },
    { id: 'objective', header: t('acad.col.objective'), cell: (r) => r.objective ?? '—', hideBelow: 'md' },
    { id: 'status', header: t('acad.col.status'), cell: (r) => <Pill status={r.status} />, sort: (r) => r.status },
  ];
  const handCols: Column<Handover>[] = [
    { id: 'name', header: t('acad.col.student'), cell: (r) => r.fullName, sort: (r) => r.fullName, rowHeader: true },
    { id: 'section', header: t('acad.col.section'), cell: (r) => r.section, sort: (r) => r.section },
    { id: 'go', header: '', cell: (r) => (canAdmin ? <Button size="sm" variant="outline" onClick={() => setForm({ kind: 'admission_handover', studentId: r.id, sectionId: r.sectionId })}>{t('acad.handOver')}</Button> : null), align: 'right', csv: false },
  ];

  const tabs = [
    { value: 'requests' as const, label: t('acad.tab.requests'), count: pending.length },
    { value: 'classes' as const, label: t('acad.tab.classes'), count: directory.sections.length },
    { value: 'teachers' as const, label: t('acad.tab.teachers'), count: directory.teachers.length },
    { value: 'subjects' as const, label: t('acad.tab.subjects'), count: directory.subjects.length },
    { value: 'plans' as const, label: t('acad.tab.plans'), count: plans.filter((p) => p.status === 'submitted').length },
    { value: 'handover' as const, label: t('acad.tab.handover'), count: handover.length },
    { value: 'reports' as const, label: t('acad.tab.reports') },
  ];

  return (
    <>
      <PageHeader
        title={t('acad.title')}
        subtitle={t('acad.subtitle')}
        actions={
          <>
            <Button onClick={() => setForm({ kind: 'section_change' })}>
              <Plus className="size-4" /> {t('acad.newRequest')}
            </Button>
            {canAdmin && (
              <LinkButton href="/academics/settings" variant="outlined" startIcon={<Settings2 className="size-4" />}>
                {t('acad.settings')}
              </LinkButton>
            )}
          </>
        }
      />
      <StatGrid>
        <StatTile label={t('acad.stat.pending')} value={fmt.number(pending.length)} tone={pending.some((r) => r.canDecide) ? 'warning' : 'default'} />
        <StatTile label={t('acad.stat.yourTurn')} value={fmt.number(pending.filter((r) => r.canDecide).length)} />
        <StatTile label={t('acad.stat.students')} value={fmt.number(directory.sections.reduce((s, x) => s + x.strength, 0))} />
        <StatTile label={t('acad.stat.periods')} value={fmt.number(directory.teachers.reduce((s, x) => s + x.periods, 0))} />
      </StatGrid>
      <div className="mt-6">
        <Tabs value={tab} onChange={setTab} items={tabs} label={t('acad.title')} />
      </div>
      <div className="mt-6">
        <TabPanel value="requests" active={tab}>
          <DataTable columns={reqCols} rows={requests} rowId={(r) => r.id} label={t('acad.tab.requests')} rowHref={(r) => `/academics/requests/${r.id}`} exportName="academic-requests" empty={t('acad.noRequests')} filters={[{ id: 'status', label: t('acad.col.status'), options: ['pending', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: t(`acad.status.${s}` as MessageKey) })), match: (r, v) => r.status === v }, { id: 'kind', label: t('acad.col.kind'), options: REQUEST_KINDS.map((k) => ({ value: k, label: t(`acad.kind.${k}` as MessageKey) })), match: (r, v) => r.kind === v }]} />
        </TabPanel>
        <TabPanel value="classes" active={tab}>
          <DataTable columns={secCols} rows={directory.sections} rowId={(r) => r.id} label={t('acad.tab.classes')} rowHref={(r) => `/academics/sections/${r.id}`} exportName="classes" />
        </TabPanel>
        <TabPanel value="teachers" active={tab}>
          <DataTable columns={teaCols} rows={directory.teachers} rowId={(r) => r.id} label={t('acad.tab.teachers')} rowHref={(r) => `/academics/teachers/${r.id}`} exportName="teachers" />
        </TabPanel>
        <TabPanel value="subjects" active={tab}>
          <DataTable columns={subCols} rows={directory.subjects} rowId={(r) => r.id} label={t('acad.tab.subjects')} rowHref={(r) => `/academics/subjects/${r.id}`} exportName="subjects" />
        </TabPanel>
        <TabPanel value="plans" active={tab}>
          <DataTable columns={planCols} rows={plans} rowId={(r) => r.id} label={t('acad.tab.plans')} onRowClick={canReviewPlans ? (r) => r.status === 'submitted' && setReview(r) : undefined} empty={t('acad.noPlans')} filters={[{ id: 'status', label: t('acad.col.status'), options: ['submitted', 'approved', 'returned', 'draft'].map((s) => ({ value: s, label: t(`acad.status.${s}` as MessageKey) })), match: (r, v) => r.status === v }]} />
        </TabPanel>
        <TabPanel value="handover" active={tab}>
          <Card title={t('acad.tab.handover')} subtitle={t('acad.handoverHelp')}>
            <DataTable columns={handCols} rows={handover} rowId={(r) => r.id} label={t('acad.tab.handover')} empty={t('acad.noHandover')} bare />
          </Card>
        </TabPanel>
        <TabPanel value="reports" active={tab}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_KINDS.map((k) => (
              <Card key={k} title={t(`acad.report.${k}` as MessageKey)} subtitle={t(`acad.report.${k}.help` as MessageKey)} action={<LinkButton href={`/academics/reports/${k}`} size="small" startIcon={<BarChart3 className="size-4" />}>{t('acad.open')}</LinkButton>}>
                {null}
              </Card>
            ))}
          </div>
        </TabPanel>
      </div>
      {form && (
        <NewRequest
          initial={form}
          sections={directory.sections}
          teachers={directory.teachers}
          onClose={() => setForm(null)}
          onDone={(id) => {
            setForm(null);
            toast.success(t('acad.raised'));
            router.push(`/academics/requests/${id}`);
          }}
        />
      )}
      {review && (
        <Dialog title={`${review.section} · ${review.subject} · ${fmt.date(review.date)}`} onClose={() => setReview(null)} size="md">
          <p className="mb-4 text-sm">{review.objective ?? '—'}</p>
          <ApprovalPanel
            title={t('acad.planReview')}
            canDecide
            onDecide={(d, c) => decideLessonPlan(review.id, d, c)}
            onDecided={() => {
              setReview(null);
              toast.success(t('acad.decided'));
              router.refresh();
            }}
          />
        </Dialog>
      )}
    </>
  );
}

/** The request form: pick the kind, the class and student (or the period), and the details each kind needs. */
function NewRequest({ initial, sections, teachers, onClose, onDone }: { initial: { kind: RequestKind; studentId?: string; sectionId?: string }; sections: Directory['sections']; teachers: Directory['teachers']; onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<RequestKind>(initial.kind);
  const [sectionId, setSectionId] = useState(initial.sectionId ?? '');
  const [studentId, setStudentId] = useState(initial.studentId ?? '');
  const [roster, setRoster] = useState<{ students: { id: string; fullName: string; rollNo: string }[]; timetable: Slot[] } | null>(null);
  const [v, setV] = useState<Record<string, string>>({ outcome: 'transferred' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const forStudent = kind === 'section_change' || kind === 'withdrawal' || kind === 'admission_handover';

  async function pickSection(id: string) {
    setSectionId(id);
    setStudentId('');
    setRoster(null);
    if (!id) return;
    const r = await classStudents(id);
    if (r.ok) setRoster(r.data);
  }
  // A request started from a student's record arrives with its class chosen: load that class once.
  useEffect(() => {
    if (!initial.sectionId) return;
    void classStudents(initial.sectionId).then((r) => {
      if (r.ok) setRoster(r.data);
    });
  }, [initial.sectionId]);

  async function submit() {
    setBusy(true);
    setError('');
    const payload: Record<string, unknown> =
      kind === 'section_change' || kind === 'admission_handover'
        ? { sectionId: v.toSectionId || (kind === 'admission_handover' ? sectionId : undefined) }
        : kind === 'withdrawal'
          ? { outcome: v.outcome, lastDay: v.lastDay }
          : kind === 'timetable_change'
            ? { slotId: v.slotId, ...(v.startsAt ? { startsAt: v.startsAt } : {}), ...(v.endsAt ? { endsAt: v.endsAt } : {}), ...(v.dayOfWeek ? { dayOfWeek: Number(v.dayOfWeek) } : {}), ...(v.teacherId ? { teacherId: v.teacherId } : {}) }
            : { slotId: v.slotId, date: v.date, substituteTeacherId: v.teacherId };
    const r = await raiseRequest(kind, forStudent ? studentId || undefined : undefined, v.reason ?? '', payload);
    setBusy(false);
    if (r.ok) onDone(r.data.id);
    else setError(r.error);
  }

  const sectionOptions = sections.map((s) => ({ value: s.id, label: s.name }));
  return (
    <Dialog
      title={t('acad.newRequest')}
      onClose={onClose}
      busy={busy}
      size="md"
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('acad.cancel')}
          </Button>
          <Button onClick={submit} disabled={busy || (forStudent && !studentId) || (!forStudent && !v.slotId)}>
            {t('acad.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectInput label={t('acad.col.kind')} value={kind} onChange={(e) => setKind(e.target.value as RequestKind)} options={REQUEST_KINDS.map((k) => ({ value: k, label: t(`acad.kind.${k}` as MessageKey) }))} fullWidth />
        <p className="text-sm text-muted-foreground">{t(`acad.kind.${kind}.help` as MessageKey)}</p>
        <SelectInput label={t('acad.col.section')} value={sectionId} onChange={(e) => void pickSection(e.target.value)} options={sectionOptions} fullWidth />
        {forStudent && <SelectInput label={t('acad.col.student')} value={studentId} onChange={(e) => setStudentId(e.target.value)} options={(roster?.students ?? []).map((s) => ({ value: s.id, label: `${s.rollNo} · ${s.fullName}` }))} fullWidth disabled={!roster} />}
        {(kind === 'section_change' || kind === 'admission_handover') && <SelectInput label={t('acad.toSection')} value={v.toSectionId ?? ''} onChange={set('toSectionId')} options={sectionOptions.filter((s) => kind === 'admission_handover' || s.value !== sectionId)} fullWidth />}
        {kind === 'withdrawal' && (
          <>
            <SelectInput label={t('acad.outcome')} value={v.outcome} onChange={set('outcome')} options={[{ value: 'transferred', label: t('acad.outcome.transferred') }, { value: 'dropped', label: t('acad.outcome.dropped') }]} fullWidth />
            <TextInput type="date" label={t('acad.lastDay')} value={v.lastDay ?? ''} onChange={set('lastDay')} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </>
        )}
        {(kind === 'timetable_change' || kind === 'substitution') && (
          <SelectInput label={t('acad.period')} value={v.slotId ?? ''} onChange={set('slotId')} options={(roster?.timetable ?? []).map((s) => ({ value: s.id, label: `${t(`acad.day.${s.day}` as MessageKey)} ${s.startsAt} · ${s.subject} · ${s.teacher ?? ''}` }))} fullWidth disabled={!roster} />
        )}
        {kind === 'timetable_change' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput label={t('acad.col.day')} value={v.dayOfWeek ?? ''} onChange={set('dayOfWeek')} options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: t(`acad.day.${d}` as MessageKey) }))} empty={t('acad.noChange')} />
            <TextInput type="time" label={t('acad.startsAt')} value={v.startsAt ?? ''} onChange={set('startsAt')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextInput type="time" label={t('acad.endsAt')} value={v.endsAt ?? ''} onChange={set('endsAt')} slotProps={{ inputLabel: { shrink: true } }} />
          </div>
        )}
        {kind === 'substitution' && <TextInput type="date" label={t('acad.col.date')} value={v.date ?? ''} onChange={set('date')} slotProps={{ inputLabel: { shrink: true } }} fullWidth />}
        {(kind === 'timetable_change' || kind === 'substitution') && <SelectInput label={kind === 'substitution' ? t('acad.substitute') : t('acad.newTeacher')} value={v.teacherId ?? ''} onChange={set('teacherId')} options={teachers.map((x) => ({ value: x.id, label: x.name }))} empty={kind === 'substitution' ? undefined : t('acad.noChange')} fullWidth />}
        <TextInput label={t('acad.reason')} value={v.reason ?? ''} onChange={set('reason')} multiline minRows={2} fullWidth />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Dialog>
  );
}
