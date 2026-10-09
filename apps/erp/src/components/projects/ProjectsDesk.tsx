'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState } from 'react';
import { frameworkDashboard, recordImpact, saveFramework } from '@/app/(dashboard)/projects/actions';
import { FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { ReadError, useRead } from '@/components/pathways/shared';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { IMPACT_SOURCES, indicatorsText, type ImpactFramework, type ProjectRow, type ShowcaseRow } from '@/lib/pathways-a';

/** Projects the caller can see, the showcase, and the institution's impact frameworks. */
export function ProjectsDesk({ projects, showcase, frameworks, initialTab }: { projects: ProjectRow[]; showcase: ShowcaseRow[]; frameworks: ImpactFramework[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [framework, setFramework] = useState<ImpactFramework | 'new' | null>(null);
  const [recording, setRecording] = useState<ImpactFramework | null>(null);
  const [dashboard, setDashboard] = useState<ImpactFramework | null>(null);
  const close = (m?: string) => {
    setFramework(null);
    setRecording(null);
    setDashboard(null);
    if (m) toast(m);
  };
  const today = new Date().toISOString().slice(0, 10);
  const yesNo = (v: boolean) => <Pill label={v ? t('ops.yes') : t('ops.no')} warn={false} />;

  const projectCols: Col<ProjectRow>[] = [
    { label: t('prj.col.code'), cell: (p) => p.code, sort: (p) => p.code },
    { label: t('prj.col.title'), cell: (p) => p.title, sort: (p) => p.title },
    { label: t('prj.col.kind'), cell: (p) => t(`rs.kind.${p.kind}` as MessageKey), sort: (p) => p.kind },
    { label: t('prj.col.status'), cell: (p) => <Pill label={t(`rs.status.${p.status}` as MessageKey)} warn={p.status === 'cancelled'} />, sort: (p) => p.status },
    { label: t('prj.col.showcase'), cell: (p) => yesNo(p.showcase), sort: (p) => Number(p.showcase) },
    { label: t('prj.col.recruiting'), cell: (p) => yesNo(p.recruiting), sort: (p) => Number(p.recruiting) },
    { label: '', cell: (p) => <Button size="small" component={Link} href={`/projects/${p.id}`} data-testid={`prj-open-${p.code}`}>{t('prj.open')}</Button> },
  ];

  const showcaseCols: Col<ShowcaseRow>[] = [
    { label: t('prj.col.title'), cell: (p) => p.title, sort: (p) => p.title },
    { label: t('prj.col.kind'), cell: (p) => t(`rs.kind.${p.kind}` as MessageKey), sort: (p) => p.kind },
    { label: t('prj.col.pi'), cell: (p) => p.pi, sort: (p) => p.pi },
    { label: t('prj.col.summary'), cell: (p) => p.summary || p.outcomeSummary || '-' },
    { label: t('prj.col.review'), cell: (p) => (p.reviewAverage === null ? '-' : `${fmt.number(p.reviewAverage)}%`), num: true, sort: (p) => p.reviewAverage },
    { label: '', cell: (p) => <Button size="small" component={Link} href={`/projects/${p.id}`}>{t('prj.open')}</Button> },
  ];

  const frameworkCols: Col<ImpactFramework>[] = [
    { label: t('prj.col.code'), cell: (f) => f.code, sort: (f) => f.code },
    { label: t('ops.f.name'), cell: (f) => f.name, sort: (f) => f.name },
    { label: t('prj.col.indicators'), cell: (f) => fmt.number(f.indicators.length), num: true, sort: (f) => f.indicators.length },
    { label: t('prj.col.status'), cell: (f) => <Pill label={f.active ? t('prj.active') : t('prj.inactive')} warn={!f.active} /> },
    {
      label: '',
      cell: (f) => (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setDashboard(f)}>{t('prj.totals')}</Button>
          {f.active && <Button size="small" onClick={() => setRecording(f)}>{t('prj.record')}</Button>}
          <Button size="small" onClick={() => setFramework(f)}>{t('ops.edit')}</Button>
        </Stack>
      ),
    },
  ];

  const frameworkFields = (f?: ImpactFramework): Field[] => [
    ...(f ? [] : [{ name: 'code', label: t('prj.col.code'), required: true } satisfies Field]),
    { name: 'name', label: t('ops.f.name'), required: true, init: f?.name },
    { name: 'description', label: t('prj.f.description'), kind: 'multiline', init: f?.description },
    { name: 'indicators', label: t('prj.f.indicators'), kind: 'multiline', required: true, init: f ? indicatorsText(f.indicators) : '' },
    ...(f ? [{ name: 'active', label: t('prj.col.status'), kind: 'select', init: f.active ? 'yes' : 'no', options: [{ value: 'yes', label: t('prj.active') }, { value: 'no', label: t('prj.inactive') }] } satisfies Field] : []),
  ];

  const tabs = [
    { id: 'projects', label: t('prj.tab.projects'), node: <Grid testId="prj-projects" empty={t('prj.empty.projects')} rows={projects} cols={projectCols} exportName="projects" /> },
    { id: 'showcase', label: t('prj.tab.showcase'), node: <Grid testId="prj-showcase" empty={t('prj.empty.showcase')} rows={showcase} cols={showcaseCols} /> },
    {
      id: 'impact',
      label: t('prj.tab.impact'),
      node: (
        <>
          <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} onClick={() => setFramework('new')} data-testid="prj-new-framework">{t('prj.newFramework')}</Button>
          <Grid testId="prj-frameworks" empty={t('prj.empty.frameworks')} rows={frameworks} cols={frameworkCols} />
        </>
      ),
    },
  ];

  return (
    <>
      <Tabbed label={t('nav.projects')} initial={initialTab} tabs={tabs} />
      {framework && (
        <FormDialog
          title={framework === 'new' ? t('prj.newFramework') : t('ops.edit')}
          fields={frameworkFields(framework === 'new' ? undefined : framework)}
          intro={<Typography variant="body2">{t('prj.indicatorsHint')}</Typography>}
          onSubmit={(v) => saveFramework(v, framework === 'new' ? undefined : framework.id)}
          onClose={close}
        />
      )}
      {recording && (
        <FormDialog
          title={`${t('prj.record')}: ${recording.name}`}
          fields={[
            { name: 'indicatorCode', label: t('prj.f.indicator'), kind: 'select', required: true, options: recording.indicators.map((i) => ({ value: i.code, label: `${i.code} - ${i.name}` })) },
            { name: 'subjectKind', label: t('prj.f.source'), kind: 'select', required: true, init: 'project', options: IMPACT_SOURCES.map((s) => ({ value: s, label: t(`prj.source.${s}` as MessageKey) })) },
            { name: 'subjectRef', label: t('prj.f.reference') },
            { name: 'quantity', label: t('prj.f.quantity'), required: true },
            { name: 'recordedOn', label: t('ops.f.date'), kind: 'date', required: true, init: today },
            { name: 'note', label: t('ops.f.note') },
          ]}
          onSubmit={(v) => recordImpact(recording.id, v)}
          onClose={close}
        />
      )}
      {dashboard && <TotalsDialog framework={dashboard} onClose={() => setDashboard(null)} />}
      {toastNode}
    </>
  );
}

function TotalsDialog({ framework, onClose }: { framework: ImpactFramework; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const d = useRead(() => frameworkDashboard(framework.id));
  return (
    <InfoDialog title={`${framework.name} (${framework.code})`} onClose={onClose}>
      <ReadError message={d.error} />
      {d.data && (
        <Grid
          testId="prj-totals"
          empty={t('prj.empty.indicators')}
          rows={d.data.indicators}
          cols={[
            { label: t('prj.col.code'), cell: (i) => i.code },
            { label: t('ops.f.name'), cell: (i) => i.name },
            { label: t('prj.col.total'), cell: (i) => `${fmt.number(i.total)}${i.unit ? ` ${i.unit}` : ''}`, num: true, sort: (i) => i.total },
            { label: t('prj.col.records'), cell: (i) => fmt.number(i.records), num: true, sort: (i) => i.records },
            { label: t('prj.col.bySource'), cell: (i) => Object.entries(i.bySource).map(([k, v]) => `${t(`prj.source.${k}` as MessageKey)}: ${fmt.number(v)}`).join(', ') || '-' },
          ]}
        />
      )}
    </InfoDialog>
  );
}
