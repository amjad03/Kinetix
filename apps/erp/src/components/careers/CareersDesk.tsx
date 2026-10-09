'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { createTest, savePath, searchResumes, setTestActive, testResults } from '@/app/(dashboard)/careers/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { ReadError, useRead } from '@/components/pathways/shared';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { stepsText, TEST_CATEGORIES, type AptitudeTest, type CareerPath, type ResumeRow } from '@/lib/pathways-a';

/** Resumes students shared, aptitude tests, and career paths. */
export function CareersDesk({ resumes, tests, paths, canEdit, initialTab }: { resumes: ResumeRow[]; tests: AptitudeTest[]; paths: CareerPath[]; canEdit: boolean; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [found, setFound] = useState<ResumeRow[]>(resumes);
  const [q, setQ] = useState('');
  const [searching, search] = useTransition();
  const [newTest, setNewTest] = useState(false);
  const [results, setResults] = useState<AptitudeTest | null>(null);
  const [path, setPath] = useState<CareerPath | 'new' | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const close = (m?: string) => {
    setNewTest(false);
    setPath(null);
    if (m) toast(m);
  };
  const runSearch = () =>
    search(async () => {
      const r = await searchResumes(q);
      if (r.ok) {
        setFound(r.data);
        setSearchError(null);
      } else setSearchError(r.error);
    });

  const resumeCols: Col<ResumeRow>[] = [
    { label: t('ops.f.name'), cell: (r) => r.fullName, sort: (r) => r.fullName },
    { label: t('crr.col.roll'), cell: (r) => r.rollNo, sort: (r) => r.rollNo },
    { label: t('crr.col.class'), cell: (r) => r.className, sort: (r) => r.className },
    { label: t('crr.col.headline'), cell: (r) => r.headline || '-' },
    { label: t('crr.col.skills'), cell: (r) => r.skills.join(', ') || '-' },
    { label: t('crr.col.updated'), cell: (r) => fmt.dateTime(r.updatedAt), sort: (r) => r.updatedAt },
    { label: '', cell: (r) => <Button size="small" href={`/api/pathways?kind=career-resume&id=${r.studentId}`}>{t('crr.pdf')}</Button> },
  ];

  const testCols: Col<AptitudeTest>[] = [
    { label: t('ops.f.title'), cell: (x) => x.title, sort: (x) => x.title },
    { label: t('crr.col.category'), cell: (x) => t(`crr.cat.${x.category}` as MessageKey), sort: (x) => x.category },
    { label: t('crr.col.duration'), cell: (x) => t('crr.minutes', { n: x.durationMin }), num: true, sort: (x) => x.durationMin },
    { label: t('crr.col.pass'), cell: (x) => `${x.passPercent}%`, num: true, sort: (x) => x.passPercent },
    { label: t('crr.col.questions'), cell: (x) => fmt.number(x.questionCount), num: true, sort: (x) => x.questionCount },
    { label: t('crr.col.status'), cell: (x) => <Pill label={x.active ? t('crr.active') : t('crr.inactive')} warn={!x.active} /> },
    {
      label: '',
      cell: (x) => (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setResults(x)}>{t('crr.results')}</Button>
          {canEdit && <ActionButton label={x.active ? t('crr.deactivate') : t('crr.activate')} run={() => setTestActive(x.id, !x.active)} onDone={toast} />}
        </Stack>
      ),
    },
  ];

  const pathCols: Col<CareerPath>[] = [
    { label: t('ops.f.title'), cell: (p) => p.title, sort: (p) => p.title },
    { label: t('crr.col.family'), cell: (p) => p.family || '-', sort: (p) => p.family },
    { label: t('crr.col.requiredSkills'), cell: (p) => p.requiredSkills.join(', ') || '-' },
    { label: t('crr.col.roles'), cell: (p) => p.roles.join(', ') || '-' },
    { label: t('crr.col.status'), cell: (p) => <Pill label={p.active ? t('crr.active') : t('crr.inactive')} warn={!p.active} /> },
    ...(canEdit ? [{ label: '', cell: (p: CareerPath) => <Button size="small" onClick={() => setPath(p)}>{t('ops.edit')}</Button> }] : []),
  ];

  const tabs = [
    {
      id: 'resumes',
      label: t('crr.tab.resumes'),
      node: (
        <>
          <Bar>
            <form
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('crr.searchHint')} slotProps={{ htmlInput: { 'aria-label': t('crr.searchHint') } }} data-testid="crr-search" />
              <Button type="submit" variant="contained" disabled={searching}>{t('crr.search')}</Button>
            </form>
          </Bar>
          {searchError && <Typography color="error" role="alert" sx={{ mb: 1 }}>{searchError}</Typography>}
          <Grid testId="crr-resumes" empty={t('crr.empty.resumes')} rows={found} cols={resumeCols} />
        </>
      ),
    },
    {
      id: 'tests',
      label: t('crr.tab.tests'),
      node: (
        <>
          {canEdit && <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setNewTest(true)} data-testid="crr-new-test">{t('crr.newTest')}</Button></Bar>}
          <Grid testId="crr-tests" empty={t('crr.empty.tests')} rows={tests} cols={testCols} />
        </>
      ),
    },
    {
      id: 'paths',
      label: t('crr.tab.paths'),
      node: (
        <>
          {canEdit && <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setPath('new')} data-testid="crr-new-path">{t('crr.newPath')}</Button></Bar>}
          <Grid testId="crr-paths" empty={t('crr.empty.paths')} rows={paths} cols={pathCols} />
        </>
      ),
    },
  ];

  return (
    <>
      <Tabbed label={t('nav.careers')} initial={initialTab} tabs={tabs} />
      {newTest && (
        <FormDialog
          title={t('crr.newTest')}
          intro={<Typography variant="body2">{t('crr.questionsHint')}</Typography>}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'category', label: t('crr.col.category'), kind: 'select', init: 'mixed', options: TEST_CATEGORIES.map((c) => ({ value: c, label: t(`crr.cat.${c}` as MessageKey) })) },
            { name: 'durationMin', label: t('crr.f.durationMin'), kind: 'number', init: '30', required: true },
            { name: 'passPercent', label: t('crr.f.passPercent'), kind: 'number', init: '40', required: true },
            { name: 'questions', label: t('crr.col.questions'), kind: 'multiline', required: true },
          ]}
          onSubmit={createTest}
          onClose={close}
        />
      )}
      {path && (
        <FormDialog
          title={path === 'new' ? t('crr.newPath') : t('ops.edit')}
          intro={<Typography variant="body2">{t('crr.stepsHint')}</Typography>}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true, init: path === 'new' ? '' : path.title },
            { name: 'family', label: t('crr.col.family'), init: path === 'new' ? '' : path.family },
            { name: 'description', label: t('crr.f.description'), kind: 'multiline', init: path === 'new' ? '' : path.description },
            { name: 'requiredSkills', label: t('crr.f.requiredSkills'), init: path === 'new' ? '' : path.requiredSkills.join(', ') },
            { name: 'roles', label: t('crr.f.roles'), init: path === 'new' ? '' : path.roles.join(', ') },
            { name: 'steps', label: t('crr.f.steps'), kind: 'multiline', init: path === 'new' ? '' : stepsText(path.steps) },
            { name: 'active', label: t('crr.col.status'), kind: 'select', init: path === 'new' || path.active ? 'yes' : 'no', options: [{ value: 'yes', label: t('crr.active') }, { value: 'no', label: t('crr.inactive') }] },
          ]}
          onSubmit={(v) => savePath(v, path === 'new' ? undefined : path.id)}
          onClose={close}
        />
      )}
      {results && <ResultsDialog test={results} onClose={() => setResults(null)} />}
      {toastNode}
    </>
  );
}

function ResultsDialog({ test, onClose }: { test: AptitudeTest; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const r = useRead(() => testResults(test.id));
  return (
    <InfoDialog title={`${t('crr.results')}: ${test.title}`} onClose={onClose}>
      <ReadError message={r.error} />
      {r.data && (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            <Pill label={t('crr.attempts', { n: r.data.attempts })} />
            <Pill label={t('crr.passedCount', { n: r.data.passed })} />
            <Pill label={t('crr.average', { n: fmt.number(r.data.averagePercent) })} />
          </Stack>
          <Grid
            testId="crr-results"
            empty={t('crr.empty.results')}
            rows={r.data.rows}
            cols={[
              { label: t('crr.col.roll'), cell: (x) => x.rollNo, sort: (x) => x.rollNo },
              { label: t('ops.f.name'), cell: (x) => x.fullName, sort: (x) => x.fullName },
              { label: t('crr.col.score'), cell: (x) => `${fmt.number(x.percent)}%`, num: true, sort: (x) => x.percent },
              { label: t('crr.col.result'), cell: (x) => <Pill label={x.passed ? t('crr.passed') : t('crr.notPassed')} warn={!x.passed} /> },
              { label: t('ops.f.date'), cell: (x) => (x.submittedAt ? fmt.dateTime(x.submittedAt) : '-'), sort: (x) => x.submittedAt },
            ]}
          />
        </>
      )}
    </InfoDialog>
  );
}
