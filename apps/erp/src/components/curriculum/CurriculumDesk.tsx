'use client';
import { useState, useTransition } from 'react';
import { compareVersions, draftFromImport, uploadSyllabus } from '@/app/(dashboard)/curriculum/actions';
import { FormDialog, Grid, InfoDialog, useToast, type Field } from '@/components/ops/kit';
import { KitList, type ColSpec, type ParamAction } from '@/components/registers/KitList';
import { SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { diffCount, type CurriculumDiff, type ImportRow, type VersionRow } from '@/lib/curriculum';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@/components/kx';
import { Library } from 'lucide-react';

const STATUS_TONE = (v: string) => (v === 'active' ? 'success' : v === 'approved' ? 'info' : v === 'draft' ? 'warning' : 'neutral');
const COLUMNS: ColSpec[] = [
  { key: 'programId', from: 'programName', header: 'rk.f.curriculum-versions.programId' },
  { key: 'regulationYear', header: 'rk.f.curriculum-versions.regulationYear', kind: 'number' },
  { key: 'versionNo', header: 'rk.f.curriculum-versions.versionNo', kind: 'number' },
  { key: 'label', header: 'rk.f.curriculum-versions.label', kind: 'strong' },
  { key: 'status', header: 'rk.f.curriculum-versions.status', kind: 'choice', tone: STATUS_TONE },
  { key: 'subjectCount', header: 'rk.f.curriculum-versions.subjectCount', kind: 'number', sortKey: false, hideBelow: 'sm' },
  { key: 'pinnedStudents', header: 'rk.f.curriculum-versions.pinnedStudents', kind: 'number', sortKey: false, hideBelow: 'md' },
  { key: 'effectiveFrom', header: 'rk.f.curriculum-versions.effectiveFrom', kind: 'date', hideBelow: 'md' },
  { key: 'bosRef', header: 'rk.f.curriculum-versions.bosRef', sortKey: false, defaultHidden: true },
];
const ACTIONS: ParamAction[] = [
  { key: 'approve', when: (r) => r.status === 'draft', fields: [{ name: 'bosRef', label: 'rk.in.curriculum-versions.bosRef', required: true }, { name: 'universityRef', label: 'rk.in.curriculum-versions.universityRef' }] },
  { key: 'activate', when: (r) => r.status === 'approved', fields: [{ name: 'effectiveFrom', label: 'rk.in.curriculum-versions.effectiveFrom', type: 'date' }] },
  { key: 'revise', when: (r) => r.status !== 'draft', fields: [{ name: 'label', label: 'rk.in.curriculum-versions.label', required: true }] },
];

type Dlg = { title: string; fields: Field[]; run: (v: Record<string, string>) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }> };

/**
 * Curriculum versions per programme and regulation year as a record kit list (add a draft, name and date it, Board of
 * Studies approval, activation and revisions as actions, history, delete a draft), with diffs against the previous
 * version and the AI syllabus importer.
 */
export function CurriculumDesk({ versions, list, imports, programs, canEdit }: { versions: VersionRow[]; list: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }; imports: ImportRow[]; programs: { id: string; name: string }[]; canEdit: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [diff, setDiff] = useState<CurriculumDiff | null>(null);
  const [upload, setUpload] = useState(false);
  const [flags, setFlags] = useState<{ where: string; code: string; message: string }[] | null>(null);
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(t('ops.saved'));
  };
  const count = (s: VersionRow['status']) => versions.filter((v) => v.status === s).length;

  const compare = async (v: Row) => {
    const prev = versions.filter((x) => x.programId === v.programId && x.regulationYear === v.regulationYear && x.versionNo < Number(v.versionNo)).sort((a, b) => b.versionNo - a.versionNo)[0];
    if (!prev) return toast(t('cu.diff.noPrev'));
    const res = await compareVersions(prev.id, String(v.id));
    if (res.ok) setDiff(res.data);
    else toast(res.error);
  };

  return (
    <>
      <StatGrid min={130}>
        <StatTile label={t('cu.st.active')} value={count('active')} testId="cu-active" />
        <StatTile label={t('cu.st.draft')} value={count('draft')} tone={count('draft') ? 'warning' : 'default'} testId="cu-draft" />
        <StatTile label={t('cu.st.approved')} value={count('approved')} testId="cu-approved" />
      </StatGrid>
      <div className="mt-6">
        <KitList
          {...list}
          label="nav.curriculum"
          columns={COLUMNS}
          paramActions={ACTIONS}
          rowActions={(v) => (Number(v.versionNo) > 1 ? [{ id: 'compare', label: t('cu.compare'), onSelect: () => void compare(v) }] : [])}
          toolbar={
            canEdit ? (
              <Button variant="outlined" onClick={() => setUpload(true)}>
                {t('cu.upload')}
              </Button>
            ) : undefined
          }
          empty={{ icon: <Library />, title: 'cu.empty', body: 'kr.empty.curriculum-versions' }}
          testId="cu-versions"
        />
      </div>
      {canEdit && (
        <>
          <SectionTitle>{t('cu.imports')}</SectionTitle>
          <Grid
            testId="cu-imports"
            empty={t('cu.imports.empty')}
            rows={imports}
            cols={[
              { label: t('cu.imp.file'), cell: (i) => i.fileName, sort: (i) => i.fileName },
              { label: t('cu.col.year'), cell: (i) => i.regulationYear, num: true },
              { label: t('cu.col.subjects'), cell: (i) => i.proposal.subjects.length, num: true },
              { label: t('cu.col.status'), cell: (i) => (i.preview ? t('cu.imp.preview') : t('cu.imp.ai')) },
              {
                label: t('g1.imp.flags'),
                cell: (i) => ((i.flags ?? []).length === 0 ? '-' : <Button size="small" color="warning" onClick={() => setFlags(i.flags ?? [])}>{t('g1.imp.flagCount', { n: (i.flags ?? []).length })}</Button>),
                sort: (i) => (i.flags ?? []).length,
              },
              {
                label: '',
                cell: (i) =>
                  i.versionId ? (
                    t('cu.imp.drafted')
                  ) : (
                    <Button size="small" onClick={() => setDlg({ title: t('cu.imp.draft'), fields: [], run: () => draftFromImport(i.id) })}>
                      {t('cu.imp.draft')}
                    </Button>
                  ),
              },
            ]}
          />
        </>
      )}
      {dlg && <FormDialog title={dlg.title} fields={dlg.fields} onSubmit={dlg.run} onClose={done} />}
      {flags && (
        <InfoDialog title={t('g1.imp.flags')} onClose={() => setFlags(null)}>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-2">
            {t('g1.imp.flagHint')}
          </p>
          {flags.map((f, n) => (
            <p className="text-[13px] leading-[19px] mb-1" key={n}>
              {f.where}: {f.message}
            </p>
          ))}
        </InfoDialog>
      )}
      {upload && <UploadDialog programs={programs} onClose={(m) => { setUpload(false); if (m) toast(m); }} />}
      {diff && (
        <InfoDialog title={t('cu.diff.title')} onClose={() => setDiff(null)}>
          <p className="text-[13px] leading-[19px] mb-2" data-testid="cu-diff-summary">
            {diff.from.label} to {diff.to.label}: {diffCount(diff) === 0 ? t('cu.diff.none') : t('cu.diff.count', { n: diffCount(diff) })}
          </p>
          {diff.added.map((s) => <p className="text-[13px] leading-[19px]" key={`a${s.code}`}>+ {s.code} {s.name}</p>)}
          {diff.removed.map((s) => <p className="text-[13px] leading-[19px]" key={`r${s.code}`}>- {s.code} {s.name}</p>)}
          {diff.changed.map((s) => (
            <div className="text-[13px] leading-[19px]" key={`c${s.code}`}>
              ~ {s.code} {s.name}
              <ul style={{ margin: 0 }}>{s.changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          ))}
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}

/** The syllabus file picker: programme, regulation year and a PDF or Word file. */
function UploadDialog({ programs, onClose }: { programs: { id: string; name: string }[]; onClose: (msg?: string) => void }) {
  const { t } = useI18n();
  const [programId, setProgramId] = useState(programs[0]?.id ?? '');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!file) return setError(t('cu.err.input'));
    const form = new FormData();
    form.set('programId', programId);
    form.set('regulationYear', year);
    form.set('file', file);
    start(async () => {
      const res = await uploadSyllabus(form);
      if (res.ok) onClose(t('cu.imp.read'));
      else setError(res.error);
    });
  };
  return (
    <Dialog open onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{t('cu.upload')}</DialogTitle>
      <DialogContent>
        <div className="flex flex-col gap-4 mt-2">
          <p className="text-[13px] leading-[19px]">{t('cu.upload.hint')}</p>
          <TextField select label={t('cu.f.programme')} value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField label={t('cu.f.year')} value={year} onChange={(e) => setYear(e.target.value)} />
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={t('cu.imp.file')} data-testid="cu-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {error && <Alert severity="error">{error}</Alert>}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>{t('ops.cancel')}</Button>
        <Button variant="contained" disabled={pending} onClick={submit}>{t('cu.upload.go')}</Button>
      </DialogActions>
    </Dialog>
  );
}
