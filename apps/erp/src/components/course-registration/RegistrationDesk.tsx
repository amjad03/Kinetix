'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { allocate, createOffering, decide, loadRoster, saveWindow, setOfferingStatus } from '@/app/(dashboard)/course-registration/actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { CATEGORIES, type ApprovalRow, type OfferingRow, type RosterRow, type WindowRow } from '@/lib/course-registration';

type Option = { value: string; label: string };

/** Offerings, approvals and the registration window of one term. */
export function RegistrationDesk({ termId, offerings, windows, approvals, programs, subjects }: { termId: string; offerings: OfferingRow[]; windows: WindowRow[]; approvals: ApprovalRow[]; programs: Option[]; subjects: Option[] }) {
  const { t, fmt } = useI18n();
  const [dialog, setDialog] = useState<'offer' | 'window' | null>(null);
  const [roster, setRoster] = useState<{ title: string; rows: RosterRow[] } | null>(null);
  const [toast, toastNode] = useToast();
  const [, start] = useTransition();

  const openRoster = (o: OfferingRow) =>
    start(async () => {
      const res = await loadRoster(o.id);
      if (res.ok) setRoster({ title: `${o.subjectCode} ${o.subjectName}`, rows: res.data.students });
      else toast(res.error);
    });

  const offeringCols: Col<OfferingRow>[] = [
    { label: t('cr.col.subject'), cell: (o) => `${o.subjectCode} ${o.subjectName}`, sort: (o) => o.subjectCode },
    { label: t('cr.col.category'), cell: (o) => t(`cr.cat.${o.category}` as MessageKey) },
    { label: t('cr.col.credits'), cell: (o) => o.credits, num: true },
    { label: t('cr.col.seats'), cell: (o) => t('cr.seats', { filled: o.registered, cap: o.seatCap }), sort: (o) => o.registered },
    { label: t('cr.col.faculty'), cell: (o) => o.facultyName ?? '-' },
    { label: t('cr.col.status'), cell: (o) => <Pill label={t(`cr.status.${o.status}` as MessageKey)} warn={o.status === 'closed'} /> },
    {
      label: '',
      cell: (o) => (
        <>
          {o.waitlisted > 0 && <Typography component="span" variant="caption">{t('cr.waiting', { n: o.waitlisted })} </Typography>}
          {o.preferences > 0 && <Typography component="span" variant="caption">{t('cr.ranked', { n: o.preferences })} </Typography>}
          <Button size="small" onClick={() => openRoster(o)}>{t('cr.roster')}</Button>
          <ActionButton label={o.status === 'open' ? t('cr.close') : t('cr.reopen')} run={() => setOfferingStatus(o.id, o.status === 'open' ? 'closed' : 'open', o.version)} onDone={toast} />
        </>
      ),
    },
  ];

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
    { label: t('cr.win.rule'), cell: (w) => t(`cr.win.rule.${w.allocationRule}` as MessageKey) },
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
      <Stack direction="row" spacing={1} sx={{ my: 3 }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialog('offer')}>
          {t('cr.new')}
        </Button>
        <Button variant="outlined" disabled={pending} onClick={runAllocate}>
          {t('cr.allocate')}
        </Button>
      </Stack>
      <Tabbed
        label={t('nav.courseRegistration')}
        initial="offerings"
        tabs={[
          { id: 'offerings', label: t('cr.tab.offerings'), node: <Grid testId="cr-list" empty={t('cr.empty.offerings')} rows={offerings} cols={offeringCols} /> },
          { id: 'approvals', label: t('cr.tab.approvals'), node: <Grid testId="cr-approvals" empty={t('cr.empty.approvals')} rows={approvals} cols={approvalCols} /> },
          {
            id: 'window',
            label: t('cr.tab.window'),
            node: (
              <>
                <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setDialog('window')}>
                  {t('cr.win.save')}
                </Button>
                <Grid testId="cr-windows" empty={t('cr.win.none')} rows={windows} cols={windowCols} />
              </>
            ),
          },
        ]}
      />
      {dialog === 'offer' && (
        <FormDialog
          title={t('cr.new')}
          onSubmit={(v) => createOffering(termId, v)}
          onClose={(m) => {
            setDialog(null);
            if (m) toast(m);
          }}
          fields={[
            { name: 'subjectId', label: t('cr.f.subject'), kind: 'select', required: true, options: subjects },
            { name: 'category', label: t('cr.f.category'), kind: 'select', init: 'elective', options: CATEGORIES.map((c) => ({ value: c, label: t(`cr.cat.${c}` as MessageKey) })) },
            { name: 'credits', label: t('cr.f.credits'), required: true, init: '3' },
            { name: 'seatCap', label: t('cr.f.seatCap'), kind: 'number', required: true },
            { name: 'facultyId', label: t('cr.f.faculty'), kind: 'uuid' },
            { name: 'slotIds', label: t('cr.f.slots') },
            { name: 'semesters', label: t('cr.f.semesters') },
            { name: 'prerequisiteSubjectId', label: t('cr.f.prerequisite'), kind: 'select', options: [{ value: '', label: t('cr.f.none') }, ...subjects] },
          ]}
        />
      )}
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
            { name: 'allocationRule', label: t('cr.win.rule'), kind: 'select', init: 'cgpa', options: (['cgpa', 'time'] as const).map((r) => ({ value: r, label: t(`cr.win.rule.${r}` as MessageKey) })) },
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
