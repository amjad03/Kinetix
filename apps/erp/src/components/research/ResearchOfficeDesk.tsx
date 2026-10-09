'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState, useTransition } from 'react';
import { addDataset, allocateScholar, importDoi, moveStage, recordThesisViva, runSimilarity, scheduleThesisViva, setCapacity, setExaminers, thesisDetail, uploadDatasetFile } from '@/app/(dashboard)/research/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Col } from '@/components/ops/kit';
import { Heading, ReadError, readBase64, useRead } from '@/components/pathways/shared';
import { StatGrid, StatTile } from '@/components/StatTile';
import { Dialog, FormField } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { examinersText, MAX_UPLOAD_BYTES, nextThesisStages, type DatasetRow, type OfficeSummary, type ScholarRow, type SupervisorRow, type ThesisRow } from '@/lib/pathways-a';

export interface ResearchDeskData { summary: OfficeSummary; supervisors: SupervisorRow[]; scholars: ScholarRow[]; theses: ThesisRow[]; datasets: DatasetRow[] }

const ACCESS = ['open', 'restricted', 'embargoed'] as const;

/** The research office view, supervisors and their load, theses from synopsis to award, and datasets. */
export function ResearchOfficeDesk({ data, canEdit }: { data: ResearchDeskData; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [cap, setCap] = useState<SupervisorRow | null>(null);
  const [allocate, setAllocate] = useState(false);
  const [thesis, setThesis] = useState<ThesisRow | null>(null);
  const [dataset, setDataset] = useState(false);
  const [doi, setDoi] = useState(false);
  const [fileFor, setFileFor] = useState<DatasetRow | null>(null);
  const imported = useRef<string | null>(null);
  const close = (m?: string) => {
    setFileFor(null);
    setCap(null);
    setAllocate(false);
    setDataset(false);
    setDoi(false);
    if (m) toast(imported.current ? t('rsd.imported', { title: imported.current }) : m);
    imported.current = null;
  };
  const s = data.summary;
  const stageLabel = (x: string) => t(`rsd.stage.${x}` as MessageKey);

  const supervisorCols: Col<SupervisorRow>[] = [
    { label: t('ops.f.name'), cell: (x) => x.fullName, sort: (x) => x.fullName },
    { label: t('rsd.col.areas'), cell: (x) => x.areas.join(', ') || '-' },
    { label: t('rsd.col.load'), cell: (x) => t('rsd.loadOf', { n: x.load, max: x.maxScholars }), num: true, sort: (x) => x.load },
    { label: t('rsd.col.available'), cell: (x) => <Pill label={fmt.number(x.available)} warn={x.available === 0} />, num: true, sort: (x) => x.available },
    ...(canEdit ? [{ label: '', cell: (x: SupervisorRow) => <Button size="small" onClick={() => setCap(x)}>{t('rsd.setCap')}</Button> }] : []),
  ];

  const thesisCols: Col<ThesisRow>[] = [
    { label: t('ops.f.title'), cell: (x) => x.title, sort: (x) => x.title },
    { label: t('rsd.col.scholar'), cell: (x) => x.scholar, sort: (x) => x.scholar },
    { label: t('rsd.col.programme'), cell: (x) => x.programme, sort: (x) => x.programme },
    { label: t('rsd.col.supervisor'), cell: (x) => x.supervisor, sort: (x) => x.supervisor },
    { label: t('rsd.col.stage'), cell: (x) => <Pill label={stageLabel(x.stage)} warn={false} />, sort: (x) => x.stage },
    { label: t('rsd.col.submitted'), cell: (x) => (x.submittedOn ? fmt.date(x.submittedOn, 'short') : '-'), sort: (x) => x.submittedOn },
    { label: '', cell: (x) => <Button size="small" onClick={() => setThesis(x)} data-testid={`rsd-thesis-${x.id}`}>{t('ops.details')}</Button> },
  ];

  const datasetCols: Col<DatasetRow>[] = [
    { label: t('ops.f.title'), cell: (d) => d.title, sort: (d) => d.title },
    { label: t('rsd.col.owner'), cell: (d) => d.owner, sort: (d) => d.owner },
    { label: t('rsd.col.access'), cell: (d) => <Pill label={t(`rsd.access.${d.access}` as MessageKey)} warn={d.access !== 'open'} />, sort: (d) => d.access },
    { label: t('rsd.col.license'), cell: (d) => d.license },
    { label: t('rsd.col.embargo'), cell: (d) => (d.embargoUntil ? fmt.date(d.embargoUntil, 'short') : '-'), sort: (d) => d.embargoUntil },
    { label: t('rsd.doi'), cell: (d) => d.doi ?? '-' },
    { label: t('rsd.col.keywords'), cell: (d) => d.keywords.join(', ') || '-' },
    {
      label: t('rsd.col.files'),
      cell: (d) =>
        d.files.length === 0 ? (
          '-'
        ) : d.canOpen ? (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {d.files.map((f) => (
              <Button key={f.index} size="small" href={`/api/pathways?kind=dataset-file&id=${d.id}&index=${f.index}`}>{f.name}</Button>
            ))}
          </Stack>
        ) : (
          t('rsd.locked', { n: d.files.length })
        ),
    },
    { label: '', cell: (d) => <Button size="small" onClick={() => setFileFor(d)} data-testid={`rsd-add-file-${d.id}`}>{t('rsd.addFile')}</Button> },
  ];

  const tabs = [
    {
      id: 'office',
      label: t('rsd.tab.office'),
      node: (
        <>
          <StatGrid min={150}>
            <StatTile label={t('rsd.kpi.projects')} value={fmt.number(s.totals.projects)} caption={t('rsd.kpi.active', { n: s.totals.active })} testId="rsd-projects" />
            <StatTile label={t('rsd.kpi.sanctioned')} value={fmt.rupeesShort(s.totals.sanctionedPaise)} caption={t('rsd.kpi.spent', { amount: fmt.rupeesShort(s.totals.spentPaise), percent: s.totals.utilisationPercent })} />
            <StatTile label={t('rsd.kpi.publications')} value={fmt.number(s.totals.publications)} />
            <StatTile label={t('rsd.kpi.patents')} value={fmt.number(s.totals.patents)} />
            <StatTile label={t('rsd.kpi.datasets')} value={fmt.number(s.totals.datasets)} />
            <StatTile label={t('rsd.kpi.ethics')} value={fmt.number(s.totals.ethics_pending)} />
            <StatTile label={t('rsd.kpi.scholars')} value={fmt.number(s.totals.scholars)} testId="rsd-scholars" />
          </StatGrid>
          <Heading>{t('rsd.byDepartment')}</Heading>
          <Grid
            testId="rsd-departments"
            empty={t('rsd.empty.departments')}
            rows={s.byDepartment}
            cols={[
              { label: t('rsd.col.department'), cell: (d) => d.department, sort: (d) => d.department },
              { label: t('rsd.kpi.projects'), cell: (d) => fmt.number(d.projects), num: true, sort: (d) => d.projects },
              { label: t('rsd.kpi.publications'), cell: (d) => fmt.number(d.publications), num: true, sort: (d) => d.publications },
              { label: t('rsd.kpi.sanctioned'), cell: (d) => fmt.rupeesShort(d.sanctioned), num: true, sort: (d) => d.sanctioned },
            ]}
          />
          <Heading>{t('rsd.publicationsByYear')}</Heading>
          <Grid empty={t('rsd.empty.publications')} rows={s.publicationsByYear} cols={[{ label: t('rsd.col.year'), cell: (r) => String(r.year), sort: (r) => r.year }, { label: t('rsd.col.count'), cell: (r) => fmt.number(r.n), num: true, sort: (r) => r.n }]} />
          <Heading>{t('rsd.scholarsByStatus')}</Heading>
          <Grid empty={t('rsd.empty.scholars')} rows={s.scholarsByStatus} cols={[{ label: t('rsd.col.status'), cell: (r) => t(`rsd.scholarStatus.${r.status}` as MessageKey) }, { label: t('rsd.col.count'), cell: (r) => fmt.number(r.n), num: true, sort: (r) => r.n }]} />
          <Heading>{t('rsd.thesesByStage')}</Heading>
          <Grid empty={t('rsd.empty.theses')} rows={s.thesesByStage} cols={[{ label: t('rsd.col.stage'), cell: (r) => stageLabel(r.stage) }, { label: t('rsd.col.count'), cell: (r) => fmt.number(r.n), num: true, sort: (r) => r.n }]} />
          <Heading>{t('rsd.supervisorLoad')}</Heading>
          <Grid empty={t('rsd.empty.supervisors')} rows={s.supervisorLoad} cols={[{ label: t('ops.f.name'), cell: (r) => r.fullName }, { label: t('rsd.col.load'), cell: (r) => t('rsd.loadOf', { n: r.load, max: r.maxScholars }), num: true, sort: (r) => r.load }]} />
        </>
      ),
    },
    {
      id: 'supervisors',
      label: t('rsd.tab.supervisors'),
      node: (
        <>
          {canEdit && <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setAllocate(true)} data-testid="rsd-allocate">{t('rsd.allocate')}</Button></Bar>}
          <Grid testId="rsd-supervisors" empty={t('rsd.empty.supervisors')} rows={data.supervisors} cols={supervisorCols} />
        </>
      ),
    },
    { id: 'theses', label: t('rsd.tab.theses'), node: <Grid testId="rsd-theses" empty={t('rsd.empty.theses')} rows={data.theses} cols={thesisCols} /> },
    {
      id: 'datasets',
      label: t('rsd.tab.datasets'),
      node: (
        <>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDataset(true)} data-testid="rsd-add-dataset">{t('rsd.addDataset')}</Button>
            <Button variant="outlined" onClick={() => setDoi(true)} data-testid="rsd-import-doi">{t('rsd.importDoi')}</Button>
          </Bar>
          <Grid testId="rsd-datasets" empty={t('rsd.empty.datasets')} rows={data.datasets} cols={datasetCols} />
        </>
      ),
    },
  ];

  const scholarOptions = data.scholars.filter((x) => x.status === 'enrolled' || x.status === 'thesis_submitted').map((x) => ({ value: x.id, label: `${x.fullName} (${x.programme})` }));
  const supervisorOptions = data.supervisors.map((x) => ({ value: x.userId, label: `${x.fullName} (${t('rsd.loadOf', { n: x.load, max: x.maxScholars })})` }));

  return (
    <>
      <Typography variant="h5" component="h2" sx={{ mt: 4, fontSize: '1.25rem', fontWeight: 600 }}>{t('rsd.title')}</Typography>
      <Tabbed label={t('rsd.title')} initial="office" tabs={tabs} />
      {cap && (
        <FormDialog
          title={`${t('rsd.setCap')}: ${cap.fullName}`}
          fields={[
            { name: 'maxScholars', label: t('rsd.f.maxScholars'), kind: 'number', required: true, init: String(cap.maxScholars) },
            { name: 'areas', label: t('rsd.f.areas'), init: cap.areas.join(', ') },
          ]}
          onSubmit={(v) => setCapacity(cap.userId, v)}
          onClose={close}
        />
      )}
      {allocate && (
        <FormDialog
          title={t('rsd.allocate')}
          fields={[
            { name: 'scholarId', label: t('rsd.col.scholar'), kind: 'select', required: true, options: scholarOptions },
            { name: 'supervisorUserId', label: t('rsd.col.supervisor'), kind: 'select', required: true, options: supervisorOptions },
            { name: 'role', label: t('rsd.col.role'), kind: 'select', init: 'supervisor', options: [{ value: 'supervisor', label: t('rsd.role.supervisor') }, { value: 'co_supervisor', label: t('rsd.role.co_supervisor') }] },
            { name: 'reason', label: t('rsd.f.reason') },
          ]}
          onSubmit={allocateScholar}
          onClose={close}
        />
      )}
      {dataset && (
        <FormDialog
          title={t('rsd.addDataset')}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'description', label: t('rsd.f.description'), kind: 'multiline' },
            { name: 'access', label: t('rsd.col.access'), kind: 'select', init: 'restricted', options: ACCESS.map((a) => ({ value: a, label: t(`rsd.access.${a}` as MessageKey) })) },
            { name: 'embargoUntil', label: t('rsd.col.embargo'), kind: 'date' },
            { name: 'license', label: t('rsd.col.license'), init: 'CC-BY-4.0' },
            { name: 'doi', label: t('rsd.doi') },
            { name: 'keywords', label: t('rsd.f.keywords') },
          ]}
          onSubmit={addDataset}
          onClose={close}
        />
      )}
      {doi && (
        <FormDialog
          title={t('rsd.importDoi')}
          intro={<Typography variant="body2">{t('rsd.doiHint')}</Typography>}
          fields={[{ name: 'doi', label: t('rsd.doi'), required: true }]}
          submitLabel={t('rsd.import')}
          onSubmit={async (v) => {
            const r = await importDoi(v);
            if (r.ok) imported.current = r.data.title;
            return r;
          }}
          onClose={close}
        />
      )}
      {fileFor && <DatasetFileDialog dataset={fileFor} onClose={close} />}
      {thesis && <ThesisDialog row={thesis} canEdit={canEdit} onClose={() => setThesis(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

/** A file chosen on this computer, added to a dataset as a small upload. */
function DatasetFileDialog({ dataset, onClose }: { dataset: DatasetRow; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!file) return setError(t('rsd.err.chooseFile'));
    if (file.size > MAX_UPLOAD_BYTES) return setError(t('pw.err.fileSize'));
    setError(null);
    start(async () => {
      const base64 = await readBase64(file);
      const res = await uploadDatasetFile(dataset.id, { name: file.name, type: file.type, size: file.size, base64 });
      if (res.ok) onClose(t('ops.saved'));
      else setError(res.error);
    });
  };
  return (
    <Dialog
      title={`${t('rsd.addFile')}: ${dataset.title}`}
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>{t('ops.cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={pending} startIcon={pending ? <CircularProgress size={16} /> : undefined} data-testid="ops-submit">{t('ops.save')}</Button>
        </>
      }
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2">{t('rsd.fileHint')}</Typography>
        <FormField label={t('rsd.f.file')} required>
          <input type="file" aria-label={t('rsd.f.file')} data-testid="rsd-file-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FormField>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function ThesisDialog({ row, canEdit, onClose, toast }: { row: ThesisRow; canEdit: boolean; onClose: () => void; toast: (m: string) => void }) {
  const { t, fmt } = useI18n();
  const d = useRead(() => thesisDetail(row.id));
  const [dlg, setDlg] = useState<'stage' | 'examiners' | 'viva' | { record: string } | null>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) {
      toast(m);
      d.reload();
    }
  };
  const x = d.data;
  const stageOptions = (x ? nextThesisStages(x.stage) : []).map((s) => ({ value: s, label: t(`rsd.stage.${s}` as MessageKey) }));
  const score = x?.similarity ? Number(x.similarity.scorePercent) : null;
  return (
    <InfoDialog title={row.title} onClose={onClose}>
      <ReadError message={d.error} />
      {x && (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <Pill label={t(`rsd.stage.${x.stage}` as MessageKey)} warn={false} />
            <Pill label={`${x.scholar.fullName} (${x.scholar.programme})`} warn={false} />
            <Pill label={score === null ? t('rsd.noSimilarity') : t('rsd.similarity', { n: fmt.number(score), limit: x.similarityLimitPercent })} warn={score !== null && score > x.similarityLimitPercent} />
          </Stack>
          {x.abstract && <Typography variant="body2" sx={{ mb: 2 }}>{x.abstract}</Typography>}
          {canEdit && (
            <Bar>
              <ActionButton label={t('rsd.runSimilarity')} run={() => runSimilarity(x.id)} onDone={(m) => { toast(m); d.reload(); }} />
              {stageOptions.length > 0 && <Button size="small" onClick={() => setDlg('stage')}>{t('rsd.moveStage')}</Button>}
              <Button size="small" onClick={() => setDlg('examiners')}>{t('rsd.setExaminers')}</Button>
              <Button size="small" onClick={() => setDlg('viva')}>{t('rsd.scheduleViva')}</Button>
            </Bar>
          )}
          {!x.hasText && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('rsd.noText')}</Typography>}
          {x.similarity && x.similarity.matches.length > 0 && (
            <>
              <Heading>{t('rsd.closestMatches')}</Heading>
              <Grid empty={t('ops.none')} rows={x.similarity.matches} cols={[{ label: t('ops.f.title'), cell: (m) => m.title }, { label: t('rsd.col.percent'), cell: (m) => `${fmt.number(m.percent)}%`, num: true, sort: (m) => m.percent }]} />
            </>
          )}
          <Heading>{t('rsd.examiners')}</Heading>
          <Grid empty={t('rsd.empty.examiners')} rows={x.examiners} cols={[{ label: t('ops.f.name'), cell: (e) => e.name }, { label: t('rsd.col.affiliation'), cell: (e) => e.affiliation || '-' }, { label: t('rsd.col.verdict'), cell: (e) => (e.verdict ? t(`rsd.verdict.${e.verdict}` as MessageKey) : '-') }]} />
          <Heading>{t('rsd.vivas')}</Heading>
          <Grid
            testId="rsd-vivas"
            empty={t('rsd.empty.vivas')}
            rows={x.vivas}
            cols={[
              { label: t('rsd.col.when'), cell: (v) => fmt.dateTime(v.scheduledAt), sort: (v) => v.scheduledAt },
              { label: t('rsd.col.kind'), cell: (v) => t(`rsd.vivaKind.${v.kind}` as MessageKey) },
              { label: t('rsd.col.venue'), cell: (v) => v.venue || '-' },
              { label: t('rsd.col.panel'), cell: (v) => v.panel.map((p) => p.name).join(', ') },
              { label: t('rsd.col.status'), cell: (v) => <Pill label={v.outcome ? t(`rsd.outcome.${v.outcome}` as MessageKey) : t(`rsd.vivaStatus.${v.status}` as MessageKey)} warn={v.outcome === 'failed'} /> },
              { label: '', cell: (v) => (canEdit && v.status === 'scheduled' ? <Button size="small" onClick={() => setDlg({ record: v.id })}>{t('rsd.recordResult')}</Button> : null) },
            ]}
          />
          <Heading>{t('rsd.history')}</Heading>
          <Grid empty={t('ops.none')} rows={x.events} cols={[{ label: t('ops.f.date'), cell: (e) => fmt.dateTime(e.createdAt), sort: (e) => e.createdAt }, { label: t('rsd.col.stage'), cell: (e) => t(`rsd.stage.${e.stage}` as MessageKey) }, { label: t('ops.f.note'), cell: (e) => e.note || '-' }]} />
          {dlg === 'stage' && (
            <FormDialog
              title={t('rsd.moveStage')}
              intro={<Typography variant="body2">{t('rsd.overrideHint', { limit: x.similarityLimitPercent })}</Typography>}
              fields={[
                { name: 'to', label: t('rsd.col.stage'), kind: 'select', required: true, options: stageOptions },
                { name: 'note', label: t('ops.f.note') },
                { name: 'override', label: t('rsd.override'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }] },
              ]}
              onSubmit={(v) => moveStage(x.id, v)}
              onClose={done}
            />
          )}
          {dlg === 'examiners' && (
            <FormDialog
              title={t('rsd.setExaminers')}
              intro={<Typography variant="body2">{t('rsd.examinersHint')}</Typography>}
              fields={[{ name: 'examiners', label: t('rsd.examiners'), kind: 'multiline', init: examinersText(x.examiners) }]}
              onSubmit={(v) => setExaminers(x.id, v)}
              onClose={done}
            />
          )}
          {dlg === 'viva' && (
            <FormDialog
              title={t('rsd.scheduleViva')}
              intro={<Typography variant="body2">{t('rsd.panelHint')}</Typography>}
              fields={[
                { name: 'kind', label: t('rsd.col.kind'), kind: 'select', init: 'open_defence', options: [{ value: 'pre_submission', label: t('rsd.vivaKind.pre_submission') }, { value: 'open_defence', label: t('rsd.vivaKind.open_defence') }] },
                { name: 'scheduledAt', label: t('rsd.col.when'), kind: 'datetime', required: true },
                { name: 'venue', label: t('rsd.col.venue') },
                { name: 'panel', label: t('rsd.f.panel'), required: true },
              ]}
              onSubmit={(v) => scheduleThesisViva(x.id, v)}
              onClose={done}
            />
          )}
          {dlg && typeof dlg === 'object' && (
            <FormDialog
              title={t('rsd.recordResult')}
              fields={[
                { name: 'outcome', label: t('rsd.col.status'), kind: 'select', required: true, init: 'passed', options: (['passed', 'revise', 'failed'] as const).map((o) => ({ value: o, label: t(`rsd.outcome.${o}` as MessageKey) })) },
                { name: 'remarks', label: t('rsd.col.remarks'), kind: 'multiline' },
              ]}
              onSubmit={(v) => recordThesisViva(dlg.record, v)}
              onClose={done}
            />
          )}
        </>
      )}
    </InfoDialog>
  );
}
