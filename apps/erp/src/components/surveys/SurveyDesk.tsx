'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { closeSurvey, createSurvey, publishSurvey, surveyResults } from '@/app/(dashboard)/surveys/actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { percent, type SurveyResults, type SurveyRow } from '@/lib/work';

type Dialog = 'new' | { results: SurveyResults } | null;

/** The survey list with a builder, open/close buttons, per-question results and CSV export. */
export function SurveyDesk({ surveys, sections }: { surveys: SurveyRow[]; sections: { value: string; label: string }[] }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog>(null);
  const [toast, toastNode] = useToast();
  const [busy, setBusy] = useState(false);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const showResults = async (id: string) => {
    setBusy(true);
    const res = await surveyResults(id);
    setBusy(false);
    if (res.ok) setDlg({ results: res.data });
    else toast(res.error);
  };

  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('new')} sx={{ my: 3 }}>
        {t('wk.sv.new')}
      </Button>
      <Grid
        testId="surveys-table"
        empty={t('wk.sv.empty')}
        rows={surveys}
        cols={[
          { label: t('wk.sv.col.title'), cell: (s) => s.title },
          { label: t('wk.sv.col.audience'), cell: (s) => t(`wk.sv.aud.${s.audience}` as MessageKey) },
          { label: t('wk.sv.col.mode'), cell: (s) => (s.anonymous ? t('wk.sv.anonymous') : t('wk.sv.named')) },
          { label: t('wk.sv.col.window'), cell: (s) => (s.opensAt || s.closesAt ? `${s.opensAt ? fmt.dateTime(s.opensAt) : '-'} - ${s.closesAt ? fmt.dateTime(s.closesAt) : '-'}` : t('wk.sv.noWindow')) },
          { label: t('wk.sv.col.status'), cell: (s) => <Pill label={t(`wk.sv.status.${s.status}` as MessageKey)} /> },
          { label: t('wk.sv.col.responses'), cell: (s) => s.responses, num: true },
          {
            label: '',
            cell: (s) => (
              <>
                {s.status === 'draft' && <ActionButton label={t('wk.sv.open')} run={() => publishSurvey(s.id)} onDone={toast} />}
                {s.status === 'open' && <ActionButton label={t('wk.sv.close')} run={() => closeSurvey(s.id)} onDone={toast} />}
                <Button size="small" disabled={busy} onClick={() => void showResults(s.id)}>
                  {t('wk.sv.results')}
                </Button>
                <Button size="small" component="a" href={`/api/download?kind=survey-csv&id=${s.id}`}>
                  {t('wk.sv.export')}
                </Button>
              </>
            ),
          },
        ]}
      />
      {dlg === 'new' && (
        <FormDialog
          title={t('wk.sv.new')}
          onSubmit={createSurvey}
          onClose={done}
          intro={<Typography variant="body2" color="text.secondary">{t('wk.sv.questionsHelp')}</Typography>}
          fields={[
            { name: 'title', label: t('wk.sv.col.title'), required: true },
            { name: 'description', label: t('wk.sv.description'), kind: 'multiline' },
            { name: 'audience', label: t('wk.sv.col.audience'), kind: 'select', required: true, init: 'students', options: (['students', 'section', 'staff', 'guardians'] as const).map((a) => ({ value: a, label: t(`wk.sv.aud.${a}` as MessageKey) })) },
            { name: 'sectionId', label: t('wk.sv.section'), kind: 'select', options: sections },
            { name: 'anonymous', label: t('wk.sv.col.mode'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('wk.sv.named') }, { value: 'yes', label: t('wk.sv.anonymous') }] },
            { name: 'opensAt', label: t('wk.sv.opensAt'), kind: 'datetime' },
            { name: 'closesAt', label: t('wk.sv.closesAt'), kind: 'datetime' },
            { name: 'questions', label: t('wk.sv.questions'), kind: 'multiline', required: true },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && (
        <InfoDialog title={dlg.results.survey.title} onClose={() => setDlg(null)}>
          <Stack spacing={2} data-testid="survey-results">
            <Typography variant="body2">{t('wk.sv.responseCount', { n: dlg.results.responses })}</Typography>
            {dlg.results.questions.map((q) => (
              <Stack key={q.questionId} spacing={0.5}>
                <Typography variant="subtitle2">{q.prompt}</Typography>
                {q.counts?.map((c) => (
                  <Typography key={c.option} variant="body2">
                    {c.option}: {fmt.number(c.count)} ({fmt.number(percent(c.count, q.answered))}%)
                  </Typography>
                ))}
                {q.distribution && (
                  <Typography variant="body2">
                    {t('wk.sv.average')}: {q.average === null || q.average === undefined ? '-' : fmt.number(q.average, { maximumFractionDigits: 2 })} ({q.distribution.map((n, i) => `${i + 1}: ${fmt.number(n)}`).join(', ')})
                  </Typography>
                )}
                {q.texts?.map((x, i) => (
                  <Typography key={i} variant="body2" color="text.secondary">
                    {x}
                  </Typography>
                ))}
                {q.answered === 0 && <Typography variant="body2" color="text.secondary">{t('wk.sv.noAnswers')}</Typography>}
              </Stack>
            ))}
          </Stack>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
