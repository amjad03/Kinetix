'use client';

import Add from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { closeSurvey, createSurvey, publishSurvey, runSchedule, seriesTrend, surveyResults } from '@/app/(dashboard)/surveys/actions';
import { ActionButton, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { trendCell, type SeriesRow, type SeriesTrend } from '@/lib/pathways-b';
import { percent, type SurveyResults, type SurveyRow } from '@/lib/work';

type Dialog = 'new' | { results: SurveyResults } | { trend: SeriesTrend } | null;

/** The survey list with a builder, open/close buttons, per-question results, CSV export, and recurring series with their trends. */
export function SurveyDesk({ surveys, sections, outcomes, series, canRun }: { surveys: SurveyRow[]; sections: { value: string; label: string }[]; outcomes: { value: string; label: string }[]; series: SeriesRow[]; canRun: boolean }) {
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
  const showTrend = async (key: string) => {
    setBusy(true);
    const res = await seriesTrend(key);
    setBusy(false);
    if (res.ok) setDlg({ trend: res.data });
    else toast(res.error);
  };
  const runNow = async () => {
    setBusy(true);
    const res = await runSchedule();
    setBusy(false);
    toast(res.ok ? t('pwb.sv.ran', { opened: res.data.opened.length, closed: res.data.closed.length }) : res.error);
  };

  const trendCols = (trend: SeriesTrend): Col<SeriesTrend['questions'][number]>[] => [
    { label: t('pwb.sv.question'), cell: (q) => q.prompt, sort: (q) => q.prompt },
    ...trend.cycles.map<Col<SeriesTrend['questions'][number]>>((c) => ({ label: t('pwb.sv.cycle', { n: c.cycle }), cell: (q) => trendCell(q.points.find((p) => p.cycle === c.cycle)), num: true })),
    { label: t('pwb.sv.change'), cell: (q) => (q.change === null ? '-' : `${q.change > 0 ? '+' : ''}${fmt.number(q.change, { maximumFractionDigits: 2 })}`), num: true, sort: (q) => q.change },
  ];

  const list = (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('new')}>
          {t('wk.sv.new')}
        </Button>
      </Box>
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
    </>
  );

  const seriesTab = (
    <>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>{t('pwb.sv.seriesHelp')}</Typography>
        {canRun && (
          <Button variant="outlined" disabled={busy} onClick={() => void runNow()} data-testid="pwb-run-schedule">
            {t('pwb.sv.runSchedule')}
          </Button>
        )}
      </Stack>
      <Grid
        testId="pwb-series"
        empty={t('pwb.sv.noSeries')}
        rows={series}
        cols={[
          { label: t('wk.sv.col.title'), cell: (s) => s.title, sort: (s) => s.title },
          { label: t('pwb.sv.key'), cell: (s) => s.key },
          { label: t('pwb.sv.cycles'), cell: (s) => `${fmt.number(s.closed)} / ${fmt.number(s.cycles)}`, num: true, sort: (s) => s.cycles },
          { label: t('pwb.sv.every'), cell: (s) => (s.repeatEveryDays ? t('pwb.sv.everyDays', { n: s.repeatEveryDays }) : '-') },
          { label: '', cell: (s) => <Button size="small" disabled={busy} onClick={() => void showTrend(s.key)}>{t('pwb.sv.trend')}</Button> },
        ]}
      />
    </>
  );

  return (
    <>
      <Tabbed
        label={t('nav.surveys')}
        initial="surveys"
        tabs={[
          { id: 'surveys', label: t('pwb.sv.tabSurveys'), node: list },
          { id: 'series', label: t('pwb.sv.tabSeries', { n: series.length }), node: seriesTab },
        ]}
      />
      {dlg === 'new' && (
        <FormDialog
          title={t('wk.sv.new')}
          onSubmit={createSurvey}
          onClose={done}
          intro={
            <>
              <Typography variant="body2" color="text.secondary">{t('wk.sv.questionsHelp')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('pwb.sv.showIfHelp', { example: 'text: Why? @if 1 eq Slow', ops: 'eq, neq, includes, gte, lte' })}</Typography>
            </>
          }
          fields={[
            { name: 'title', label: t('wk.sv.col.title'), required: true },
            { name: 'description', label: t('wk.sv.description'), kind: 'multiline' },
            { name: 'audience', label: t('wk.sv.col.audience'), kind: 'select', required: true, init: 'students', options: (['students', 'section', 'staff', 'guardians'] as const).map((a) => ({ value: a, label: t(`wk.sv.aud.${a}` as MessageKey) })) },
            { name: 'sectionId', label: t('wk.sv.section'), kind: 'select', options: sections },
            { name: 'anonymous', label: t('wk.sv.col.mode'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('wk.sv.named') }, { value: 'yes', label: t('wk.sv.anonymous') }] },
            { name: 'opensAt', label: t('wk.sv.opensAt'), kind: 'datetime' },
            { name: 'closesAt', label: t('wk.sv.closesAt'), kind: 'datetime' },
            { name: 'autoPublish', label: t('pwb.sv.auto'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }] },
            { name: 'repeatEveryDays', label: t('pwb.sv.repeat'), kind: 'number' },
            { name: 'seriesKey', label: t('pwb.sv.seriesKey') },
            ...(outcomes.length ? [{ name: 'coId', label: t('wk.sv.outcome'), kind: 'select' as const, options: [{ value: '', label: t('wk.sv.outcomeNone') }, ...outcomes] }] : []),
            { name: 'questions', label: t('wk.sv.questions'), kind: 'multiline', required: true },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'results' in dlg && (
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
      {dlg && typeof dlg === 'object' && 'trend' in dlg && (
        <InfoDialog title={t('pwb.sv.trendTitle', { name: dlg.trend.series })} onClose={() => setDlg(null)}>
          <Stack spacing={2} data-testid="pwb-trend">
            <Typography variant="body2" color="text.secondary">
              {dlg.trend.cycles.map((c) => t('pwb.sv.cycleLine', { n: c.cycle, responses: c.responses, status: t(`wk.sv.status.${c.status}` as MessageKey) })).join(' · ')}
            </Typography>
            <Grid testId="pwb-trend-table" empty={t('pwb.sv.noTrend')} rows={dlg.trend.questions} cols={trendCols(dlg.trend)} />
          </Stack>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
