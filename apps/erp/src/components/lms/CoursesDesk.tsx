'use client';

import Button from '@mui/material/Button';
import Link from 'next/link';
import { useState } from 'react';
import { createCourse } from '@/app/(dashboard)/courses/actions';
import { Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { LmsCourseRow } from '@/lib/lms';

export function CoursesDesk({ courses, offerings }: { courses: LmsCourseRow[]; offerings: { value: string; label: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();
  return (
    <>
      <Bar>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="new-course">{t('lms.new')}</Button>
      </Bar>
      <Grid
        testId="courses-table"
        empty={t('lms.empty')}
        rows={courses}
        cols={[
          { label: t('lms.col.title'), cell: (c) => <Link href={`/courses/${c.id}`}>{c.title}</Link>, sort: (c) => c.title },
          { label: t('lms.col.class'), cell: (c) => c.section },
          { label: t('lms.col.subject'), cell: (c) => c.subject },
          { label: t('lms.col.status'), cell: (c) => <Pill label={t(`lms.status.${c.status}`)} warn={c.status === 'draft'} />, sort: (c) => c.status },
          { label: '', cell: (c) => <Link href={`/courses/${c.id}/gradebook`}>{t('lms.gradebook')}</Link> },
        ]}
      />
      {open && (
        <FormDialog
          title={t('lms.new')}
          onSubmit={createCourse}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(m);
          }}
          fields={[{ name: 'offering', label: t('lms.pick'), kind: 'select', required: true, options: offerings }, { name: 'title', label: t('lms.fTitle') }, { name: 'description', label: t('lms.fDesc'), kind: 'multiline' }]}
        />
      )}
      {toastNode}
    </>
  );
}
