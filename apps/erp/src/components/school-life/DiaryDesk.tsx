'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { createEntry, loadAcks } from '@/app/(dashboard)/diary/actions';
import { Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Col, type Field } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { DiaryAck, DiaryEntry, SectionOption } from '@/lib/school-life';

/** A section's diary: entries by day, who has read each, and a form to write one. */
export function DiaryDesk({ sections, sectionId, entries }: { sections: SectionOption[]; sectionId: string; entries: DiaryEntry[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [writing, setWriting] = useState(false);
  const [acks, setAcks] = useState<{ entry: DiaryEntry; rows: DiaryAck[] } | null>(null);
  const [, start] = useTransition();

  const fields: Field[] = [
    { name: 'entryDate', label: t('dy.f.date'), kind: 'date' },
    { name: 'classwork', label: t('dy.f.classwork'), kind: 'multiline' },
    { name: 'homeworkNote', label: t('dy.f.homework'), kind: 'multiline' },
    { name: 'notice', label: t('dy.f.notice'), kind: 'multiline' },
  ];

  const openAcks = (entry: DiaryEntry) =>
    start(async () => {
      const res = await loadAcks(entry.id);
      if (res.ok) setAcks({ entry, rows: res.data });
      else toast(res.error);
    });

  const cols: Col<DiaryEntry>[] = [
    { label: t('dy.col.date'), cell: (e) => fmt.date(e.entryDate), sort: (e) => e.entryDate },
    { label: t('dy.col.author'), cell: (e) => (e.subject ? `${e.author} (${e.subject})` : e.author) },
    { label: t('dy.col.classwork'), cell: (e) => e.classwork || '-' },
    { label: t('dy.col.homework'), cell: (e) => e.homeworkNote || '-' },
    { label: t('dy.col.notice'), cell: (e) => e.notice || '-' },
    { label: t('dy.col.read'), cell: (e) => <Pill label={t('dy.read', { n: e.acknowledged, total: e.students })} warn={e.students > 0 && e.acknowledged === 0} />, sort: (e) => e.acknowledged },
    { label: '', cell: (e) => <Button size="small" onClick={() => openAcks(e)}>{t('dy.who')}</Button> },
  ];

  return (
    <>
      <Bar>
        <UrlSelect label={t('dy.section')} param="sectionId" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.displayName }))} testId="dy-section" />
        <Button variant="contained" startIcon={<Add />} onClick={() => setWriting(true)} disabled={!sectionId} data-testid="dy-new">
          {t('dy.new')}
        </Button>
      </Bar>
      <Grid testId="dy-entries" empty={t('dy.empty')} rows={entries} cols={cols} />

      {writing && (
        <FormDialog
          title={t('dy.new')}
          fields={fields}
          onSubmit={(v) => createEntry(sectionId, v)}
          onClose={(m) => {
            setWriting(false);
            if (m) toast(m);
          }}
        />
      )}
      {acks && (
        <InfoDialog title={t('dy.whoTitle')} onClose={() => setAcks(null)}>
          <Stack spacing={0.5} data-testid="dy-acks">
            {acks.rows.map((a) => (
              <Typography key={a.studentId} variant="body2">
                {a.rollNo} {a.fullName}: {a.acknowledgedAt ? fmt.dateTime(a.acknowledgedAt) : t('dy.notRead')}
              </Typography>
            ))}
          </Stack>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
