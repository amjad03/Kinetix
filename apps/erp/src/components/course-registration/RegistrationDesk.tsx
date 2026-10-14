'use client';
import { useState, useTransition } from 'react';
import { allocate, decide, loadRoster, saveWindow } from '@/app/(dashboard)/course-registration/actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ApprovalRow, RosterRow, WindowRow } from '@/lib/course-registration';

import { Button } from '@/components/kx';
import { BookOpen } from 'lucide-react';
type Option = { value: string; label: string };

const OFFERING_COLUMNS: ColSpec[] = [
  { key: 'subjectId', from: 'subjectName', header: 'rk.f.course-offerings.subjectId', kind: 'strong', sortKey: 'subject' },
  { key: 'subjectCode', header: 'rk.f.course-offerings.subjectCode', sortKey: false, hideBelow: 'sm' },
  { key: 'category', header: 'rk.f.course-offerings.category', kind: 'choice' },
  { key: 'credits', header: 'rk.f.course-offerings.credits', kind: 'number' },
  { key: 'seatCap', header: 'rk.f.course-offerings.seatCap', kind: 'number' },
  { key: 'registered', header: 'rk.f.course-offerings.registered', kind: 'number' },
  { key: 'waitlisted', header: 'rk.f.course-offerings.waitlisted', kind: 'number', sortKey: false, hideBelow: 'md' },
  { key: 'facultyId', from: 'facultyIdName', header: 'rk.f.course-offerings.facultyId', hideBelow: 'md' },
  { key: 'feePaise', header: 'rk.f.course-offerings.feePaise', kind: 'money', hideBelow: 'lg' },
  { key: 'status', header: 'rk.f.course-offerings.status', kind: 'choice', tone: (v) => (v === 'open' ? 'success' : 'neutral') },
];

/** Offerings (a record kit list), approvals and the registration window of one term. */
export function RegistrationDesk({ termId, offerings, windows, approvals, programs }: { termId: string; offerings: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }; windows: WindowRow[]; approvals: ApprovalRow[]; programs: Option[] }) {
  const { t, fmt } = useI18n();
  const [dialog, setDialog] = useState<'window' | null>(null);
  const [roster, setRoster] = useState<{ title: string; rows: RosterRow[] } | null>(null);
  const [toast, toastNode] = useToast();
  const [, start] = useTransition();

  const openRoster = (o: Row) =>
    start(async () => {
      const res = await loadRoster(String(o.id));
      if (res.ok) setRoster({ title: `${String(o.subjectCode)} ${String(o.subjectName)}`, rows: res.data.students });
      else toast(res.error);
    });

  const approvalCols: Col<ApprovalRow>[] = [
    { label: t('cr.col.student'), cell: (a) => a.studentName },
    { label: t('cr.col.roll'), cell: (a) => a.rollNo },
    { label: t('cr.col.subject'), cell: (a) => `${a.subjectCode} ${a.subjectName}`, sort: (a) => a.subjectCode },
    { label: t('cr.col.category'), cell: (a) => t(`cr.cat.${a.category}` as MessageKey) },
    { label: t('cr.col.credits'), cell: (a) => a.credits, num: true },
    {
      label: '',
      cell: (a) => (
        <>
          <ActionButton label={t('cr.approve')} run={() => decide([a.id], 'approved')} onDone={toast} />
          <ActionButton label={t('cr.reject')} run={() => decide([a.id], 'rejected')} onDone={toast} tone="error" />
        </>
      ),
    },
  ];

  const programName = (id: string | null) => (id ? (programs.find((p) => p.value === id)?.label ?? id) : t('cr.win.all'));
  const windowCols: Col<WindowRow>[] = [
    { label: t('cr.win.program'), cell: (w) => programName(w.programId) },
    { label: t('cr.win.opensAt'), cell: (w) => fmt.dateTime(w.opensAt), sort: (w) => w.opensAt },
    { label: t('cr.win.closesAt'), cell: (w) => fmt.dateTime(w.closesAt), sort: (w) => w.closesAt },
    { label: t('cr.win.addDrop'), cell: (w) => fmt.dateTime(w.addDropUntil), sort: (w) => w.addDropUntil },
    { label: t('cr.win.min'), cell: (w) => w.minCredits, num: true },
    { label: t('cr.win.max'), cell: (w) => w.maxCredits, num: true },
    { label: t('cr.win.rule'), cell: (w) => (w.allocationRule === 'custom' ? t('g1.cr.ruleCustom') : t(`cr.win.rule.${w.allocationRule}` as MessageKey)) },
  ];

  const rosterCols: Col<RosterRow>[] = [
    { label: t('cr.col.roll'), cell: (r) => r.rollNo },
    { label: t('cr.col.student'), cell: (r) => r.fullName },
    { label: t('cr.col.status'), cell: (r) => t(`cr.status.${r.status}` as MessageKey) },
    { label: t('cr.col.waitlist'), cell: (r) => r.waitlistPos ?? '-', num: true },
    { label: '', cell: (r) => (r.autoCore ? t('cr.autoCore') : '') },
  ];

  const [pending, startAlloc] = useTransition();
  const runAllocate = () =>
    startAlloc(async () => {
      const res = await allocate(termId);
      toast(res.ok ? t('cr.allocated', { a: res.data.allocated, w: res.data.waitlisted, n: res.data.notAllotted }) : res.error);
    });

  return (
    <>
      <div className="flex flex-row gap-2 mb-6 justify-end flex-wrap gap-y-2">
        <Button variant="outlined" disabled={pending} onClick={runAllocate}>
          {t('cr.allocate')}
        </Button>
      </div>
      <Tabbed
        label={t('nav.courseRegistration')}
        initial="offerings"
        tabs={[
          {
            id: 'offerings',
            label: t('cr.tab.offerings'),
            node: (
              <KitList
                {...offerings}
                label="cr.tab.offerings"
                columns={OFFERING_COLUMNS}
                extraParams={{ term: termId }}
                rowActions={(o) => [{ id: 'roster', label: t('cr.roster'), onSelect: () => openRoster(o) }]}
                empty={{ icon: <BookOpen />, title: 'cr.empty.offerings', body: 'kr.empty.course-offerings' }}
                testId="cr-list"
              />
            ),
          },
          { id: 'approvals', label: t('cr.tab.approvals'), node: <Grid testId="cr-approvals" empty={t('cr.empty.approvals')} rows={approvals} cols={approvalCols} /> },
          {
            id: 'window',
            label: t('cr.tab.window'),
            node: (
              <>
                <Button className="mb-4" variant="outlined" onClick={() => setDialog('window')}>
                  {t('cr.win.save')}
                </Button>
                <Grid testId="cr-windows" empty={t('cr.win.none')} rows={windows} cols={windowCols} />
              </>
            ),
          },
        ]}
      />
      {dialog === 'window' && (
        <FormDialog
          title={t('cr.win.save')}
          onSubmit={(v) => saveWindow(termId, v)}
          onClose={(m) => {
            setDialog(null);
            if (m) toast(m);
          }}
          fields={[
            { name: 'programId', label: t('cr.win.program'), kind: 'select', init: '', options: [{ value: '', label: t('cr.win.all') }, ...programs] },
            { name: 'opensAt', label: t('cr.win.opensAt'), kind: 'datetime', required: true },
            { name: 'closesAt', label: t('cr.win.closesAt'), kind: 'datetime', required: true },
            { name: 'addDropUntil', label: t('cr.win.addDrop'), kind: 'datetime', required: true },
            { name: 'minCredits', label: t('cr.win.min'), kind: 'number', init: '0' },
            { name: 'maxCredits', label: t('cr.win.max'), kind: 'number', required: true },
            { name: 'allocationRule', label: t('cr.win.rule'), kind: 'select', init: 'cgpa', options: (['cgpa', 'time', 'custom'] as const).map((r) => ({ value: r, label: t(r === 'custom' ? 'g1.cr.ruleCustom' : (`cr.win.rule.${r}` as MessageKey)) })) },
            { name: 'wCgpa', label: t('g1.cr.wCgpa'), kind: 'number' },
            { name: 'wAttendance', label: t('g1.cr.wAttendance'), kind: 'number' },
            { name: 'wPriority', label: t('g1.cr.wPriority'), kind: 'number' },
          ]}
        />
      )}
      {roster && (
        <InfoDialog title={roster.title} onClose={() => setRoster(null)}>
          <Grid testId="cr-roster" empty={t('cr.empty.roster')} rows={roster.rows} cols={rosterCols} />
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
