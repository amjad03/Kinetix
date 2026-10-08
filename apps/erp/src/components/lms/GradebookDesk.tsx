'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { overrideGrade, saveCategories } from '@/app/(dashboard)/courses/actions';
import { Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { LMS_SOURCES, type Gradebook, type GradeRow } from '@/lib/lms';

export function GradebookDesk({ courseId, book }: { courseId: string; book: Gradebook }) {
  const { t } = useI18n();
  const [dlg, setDlg] = useState<'cats' | GradeRow | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const pct = (n: number | null) => (n === null ? '-' : `${n}%`);
  const sources = LMS_SOURCES.map((s) => ({ value: s, label: t(`lms.src.${s}`) }));
  const catFields = [1, 2, 3, 4, 5, 6].flatMap((i) => {
    const c = book.categories[i - 1];
    return [
      { name: `n${i}`, label: `${t('lms.fCatName')} ${i}`, init: c?.name ?? '' },
      { name: `s${i}`, label: t('lms.fSource'), kind: 'select' as const, options: sources, init: c?.source ?? 'homework' },
      { name: `w${i}`, label: t('lms.fWeight'), init: c ? String(c.weight) : '' },
    ];
  });
  return (
    <>
      <Bar>
        <Button variant="outlined" onClick={() => setDlg('cats')} data-testid="set-categories">{t('lms.categories')}</Button>
      </Bar>
      <Grid
        testId="gradebook"
        empty={t('lms.noCategories')}
        rows={book.categories.length ? book.rows : []}
        cols={[
          { label: t('lms.col.roll'), cell: (r) => r.rollNo },
          { label: t('lms.col.name'), cell: (r) => r.fullName },
          ...book.categories.map((c, i) => ({
            label: `${c.name} (${c.weight}%)`,
            num: true,
            cell: (r: GradeRow) => `${pct(r.cells[i].percent)}${r.cells[i].overridden ? ' *' : ''}`,
            sort: (r: GradeRow) => r.cells[i].percent,
          })),
          { label: t('lms.col.overall'), num: true, cell: (r) => pct(r.overall), sort: (r) => r.overall },
          { label: t('lms.col.grade'), cell: (r) => (r.letter ? <Pill label={r.letter} /> : '-'), sort: (r) => r.letter },
          { label: '', cell: (r) => <Button size="small" onClick={() => setDlg(r)}>{t('lms.override')}</Button> },
        ]}
      />
      {dlg === 'cats' && <FormDialog title={t('lms.categories')} intro={t('lms.categoriesHint')} onSubmit={(v) => saveCategories(courseId, v)} onClose={done} fields={catFields} />}
      {dlg && typeof dlg === 'object' && (
        <FormDialog
          title={t('lms.overrideFor', { name: dlg.fullName })}
          intro={t('lms.overrideHint')}
          onSubmit={(v) => overrideGrade(courseId, dlg.studentId, v)}
          onClose={done}
          fields={[
            { name: 'categoryId', label: t('lms.fCategory'), kind: 'select', required: true, options: book.categories.map((c) => ({ value: c.id, label: c.name })) },
            { name: 'percent', label: t('lms.fPercent') },
            { name: 'reason', label: t('lms.fReason'), required: true },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
