'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addVaccination, loadRecord, logVisit, saveProfile } from '@/app/(dashboard)/health/actions';
import { Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import { BLOOD_GROUPS, formatContacts, type HealthChild, type HealthRecord, type HealthVisit, type SectionOption } from '@/lib/school-life';

type Form = 'profile' | 'visit' | 'vaccine' | null;

/** Student health records: choose a class and a child, then the profile, nurse visits and vaccinations. Every open of a record is audited by the API. */
export function HealthDesk({ sections, sectionId, kids, visits }: { sections: SectionOption[]; sectionId: string; kids: HealthChild[]; visits: HealthVisit[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [rec, setRec] = useState<HealthRecord | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [, start] = useTransition();

  const open = (id: string) =>
    start(async () => {
      const res = await loadRecord(id);
      if (res.ok) setRec(res.data);
      else toast(res.error);
    });

  const p = rec?.profile ?? null;
  const profileFields: Field[] = [
    { name: 'bloodGroup', label: t('hl.f.blood'), kind: 'select', init: p?.bloodGroup ?? '', options: [{ value: '', label: t('hl.f.unknown') }, ...BLOOD_GROUPS.map((b) => ({ value: b, label: b }))] },
    { name: 'allergies', label: t('hl.f.allergies'), init: p?.allergies.join(', ') ?? '' },
    { name: 'conditions', label: t('hl.f.conditions'), init: p?.conditions.join(', ') ?? '' },
    { name: 'medications', label: t('hl.f.medications'), init: p?.medications.join(', ') ?? '' },
    { name: 'emergencyContacts', label: t('hl.f.contacts'), kind: 'multiline', init: p ? formatContacts(p.emergencyContacts) : '' },
    { name: 'notes', label: t('hl.f.notes'), kind: 'multiline', init: p?.notes ?? '' },
  ];
  const visitFields: Field[] = [
    { name: 'visitedAt', label: t('hl.f.when'), kind: 'datetime' },
    { name: 'complaint', label: t('hl.f.complaint'), required: true },
    { name: 'action', label: t('hl.f.action'), kind: 'multiline' },
    { name: 'sentHome', label: t('hl.f.sentHome'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('hl.no') }, { value: 'yes', label: t('hl.yes') }] },
  ];
  const vaccineFields: Field[] = [
    { name: 'vaccine', label: t('hl.f.vaccine'), required: true },
    { name: 'dose', label: t('hl.f.dose') },
    { name: 'givenOn', label: t('hl.f.givenOn'), kind: 'date', required: true },
    { name: 'nextDueOn', label: t('hl.f.nextDue'), kind: 'date' },
    { name: 'notes', label: t('hl.f.notes') },
  ];

  const childCols: Col<HealthChild>[] = [
    { label: t('hl.col.roll'), cell: (c) => c.rollNo, sort: (c) => c.rollNo },
    { label: t('hl.col.child'), cell: (c) => c.fullName, sort: (c) => c.fullName },
    { label: t('hl.col.profile'), cell: (c) => <Pill label={c.hasProfile ? t('hl.has') : t('hl.none')} warn={!c.hasProfile} /> },
    { label: '', cell: (c) => <Button size="small" onClick={() => open(c.id)}>{t('hl.open')}</Button> },
  ];
  const visitCols: Col<HealthVisit>[] = [
    { label: t('hl.col.when'), cell: (v) => fmt.dateTime(v.visitedAt), sort: (v) => v.visitedAt },
    ...(visits.some((v) => v.student) ? [{ label: t('hl.col.child'), cell: (v: HealthVisit) => v.student ?? '' }] : []),
    { label: t('hl.col.complaint'), cell: (v) => v.complaint },
    { label: t('hl.col.action'), cell: (v) => v.action || '-' },
    { label: t('hl.col.sentHome'), cell: (v) => (v.sentHome ? <Pill label={t('hl.yes')} warn /> : t('hl.no')) },
  ];

  const tabs = [
    {
      id: 'students',
      label: t('hl.tab.students'),
      node: (
        <>
          <Bar>
            <UrlSelect label={t('hl.section')} param="sectionId" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.displayName }))} testId="hl-section" />
          </Bar>
          <Grid testId="hl-children" empty={t('hl.empty')} rows={kids} cols={childCols} />
        </>
      ),
    },
    { id: 'visits', label: t('hl.tab.visits'), node: <Grid testId="hl-visits" empty={t('hl.emptyVisits')} rows={visits} cols={visitCols} exportName="nurse-visits" /> },
  ];

  const done = (m?: string) => {
    setForm(null);
    if (m && rec) {
      toast(m);
      open(rec.student.id);
    }
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('hl.notice')}</Typography>
      <Tabbed label={t('nav.health')} initial="students" tabs={tabs} />
      {rec && (
        <InfoDialog title={rec.student.fullName} onClose={() => setRec(null)}>
          <Stack spacing={2} data-testid="hl-detail">
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button size="small" variant="contained" onClick={() => setForm('profile')}>{t('hl.editProfile')}</Button>
              <Button size="small" variant="outlined" onClick={() => setForm('visit')}>{t('hl.logVisit')}</Button>
              <Button size="small" variant="outlined" onClick={() => setForm('vaccine')}>{t('hl.addVaccine')}</Button>
            </Stack>
            {p ? (
              <div>
                <Typography variant="body2">{t('hl.f.blood')}: {p.bloodGroup ?? t('hl.f.unknown')}</Typography>
                <Typography variant="body2">{t('hl.f.allergies')}: {p.allergies.join(', ') || '-'}</Typography>
                <Typography variant="body2">{t('hl.f.conditions')}: {p.conditions.join(', ') || '-'}</Typography>
                <Typography variant="body2">{t('hl.f.medications')}: {p.medications.join(', ') || '-'}</Typography>
                {p.emergencyContacts.map((c) => (
                  <Typography key={c.phone} variant="body2">{t('hl.contact')}: {c.name} ({c.relation}) {c.phone}</Typography>
                ))}
                {p.notes && <Typography variant="body2">{p.notes}</Typography>}
              </div>
            ) : (
              <Typography variant="body2" color="text.secondary">{t('hl.noProfile')}</Typography>
            )}
            <div>
              <Typography variant="subtitle2">{t('hl.tab.visits')}</Typography>
              {rec.visits.length === 0 && <Typography variant="body2" color="text.secondary">{t('hl.emptyVisits')}</Typography>}
              {rec.visits.map((v) => (
                <Typography key={v.id} variant="body2">{fmt.dateTime(v.visitedAt)}: {v.complaint}{v.action ? ` (${v.action})` : ''} {v.sentHome && <Pill label={t('hl.col.sentHome')} warn />}</Typography>
              ))}
            </div>
            <div>
              <Typography variant="subtitle2">{t('hl.vaccinations')}</Typography>
              {rec.vaccinations.length === 0 && <Typography variant="body2" color="text.secondary">{t('hl.emptyVaccines')}</Typography>}
              {rec.vaccinations.map((v) => (
                <Typography key={v.id} variant="body2">{v.vaccine}{v.dose ? ` (${v.dose})` : ''}: {fmt.date(v.givenOn)}{v.nextDueOn ? `, ${t('hl.nextDue', { date: fmt.date(v.nextDueOn) })}` : ''}</Typography>
              ))}
            </div>
          </Stack>
        </InfoDialog>
      )}
      {form === 'profile' && rec && <FormDialog title={t('hl.editProfile')} fields={profileFields} onSubmit={(v) => saveProfile(rec.student.id, v)} onClose={done} />}
      {form === 'visit' && rec && <FormDialog title={t('hl.logVisit')} fields={visitFields} onSubmit={(v) => logVisit(rec.student.id, v)} onClose={done} />}
      {form === 'vaccine' && rec && <FormDialog title={t('hl.addVaccine')} fields={vaccineFields} onSubmit={(v) => addVaccination(rec.student.id, v)} onClose={done} />}
      {toastNode}
    </>
  );
}
