'use client';

import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { buildCourseFile, reviewCourseFile } from '@/app/(dashboard)/course-files/actions';
import { Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { CourseFileOption, CourseFileRow } from '@/lib/quality';

type Dialog = 'build' | { review: CourseFileRow };

export function CourseFilesDesk({ options, files }: { options: CourseFileOption[]; files: CourseFileRow[] }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  return (
    <>
      <Bar>
        <Button variant="contained" onClick={() => setDlg('build')} disabled={options.length === 0} data-testid="cf-build">
          {t('cf.build')}
        </Button>
      </Bar>
      <Grid
        testId="cf-files"
        empty={t('cf.empty')}
        rows={files}
        cols={[
          { label: t('cf.col.class'), cell: (f) => f.section },
          { label: t('cf.col.subject'), cell: (f) => f.subject },
          { label: t('cf.col.version'), cell: (f) => f.version, num: true },
          { label: t('cf.col.built'), cell: (f) => t('cf.builtBy', { date: fmt.dateTime(f.generatedAt), name: f.generatedByName }), sort: (f) => f.generatedAt },
          { label: t('cf.col.topics'), cell: (f) => t('cf.topicsOf', { covered: f.summary.topicsCovered ?? 0, total: f.summary.topics ?? 0 }) },
          { label: t('cf.col.review'), cell: (f) => (f.reviewedAt ? <Pill label={t('cf.reviewed', { name: f.reviewedByName ?? '' })} /> : <Pill warn label={t('cf.notReviewed')} />), sort: (f) => (f.reviewedAt ? 1 : 0) },
          {
            label: '',
            cell: (f) => (
              <>
                <Link href={`/api/download?kind=course-file&id=${f.id}`} underline="hover" sx={{ mr: 1.5 }}>
                  {t('cf.download')}
                </Link>
                {!f.reviewedAt && (
                  <Button size="small" onClick={() => setDlg({ review: f })}>
                    {t('cf.review')}
                  </Button>
                )}
              </>
            ),
          },
        ]}
      />
      {dlg === 'build' && (
        <FormDialog
          title={t('cf.buildTitle')}
          intro={<Typography variant="body2">{t('cf.buildIntro')}</Typography>}
          fields={[{ name: 'pick', label: t('cf.f.pick'), kind: 'select', options: options.map((o) => ({ value: `${o.sectionId}|${o.subjectId}`, label: `${o.section} · ${o.subject}` })), required: true }]}
          onSubmit={buildCourseFile}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && <FormDialog title={`${t('cf.reviewTitle')}: ${dlg.review.subject}, ${dlg.review.section} v${dlg.review.version}`} fields={[{ name: 'remark', label: t('cf.f.remark'), kind: 'multiline' }]} onSubmit={(v) => reviewCourseFile(dlg.review.id, v)} onClose={done} />}
      {toastNode}
    </>
  );
}
