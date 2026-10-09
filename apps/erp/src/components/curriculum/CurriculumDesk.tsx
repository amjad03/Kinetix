'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { activateVersion, approveVersion, compareVersions, createVersion, draftFromImport, uploadSyllabus } from '@/app/(dashboard)/curriculum/actions';
import { Bar, FormDialog, Grid, InfoDialog, useToast, type Field } from '@/components/ops/kit';
import { SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { diffCount, nextStep, type CurriculumDiff, type ImportRow, type VersionRow } from '@/lib/curriculum';

const TONE = { draft: 'warning', approved: 'info', active: 'success', archived: 'neutral' } as const;

type Dlg = { title: string; fields: Field[]; run: (v: Record<string, string>) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }> };

/** Curriculum versions per programme and regulation year: draft, Board of Studies approval, activation, revisions, diffs and the AI syllabus importer. */
export function CurriculumDesk({ versions, imports, programs, canEdit, canApprove }: { versions: VersionRow[]; imports: ImportRow[]; programs: { id: string; name: string }[]; canEdit: boolean; canApprove: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [diff, setDiff] = useState<CurriculumDiff | null>(null);
  const [upload, setUpload] = useState(false);
  const progOptions = programs.map((p) => ({ value: p.id, label: p.name }));
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(t('ops.saved'));
  };
  const count = (s: VersionRow['status']) => versions.filter((v) => v.status === s).length;

  const compare = async (v: VersionRow) => {
    const prev = versions.filter((x) => x.programId === v.programId && x.regulationYear === v.regulationYear && x.versionNo < v.versionNo).sort((a, b) => b.versionNo - a.versionNo)[0];
    if (!prev) return toast(t('cu.diff.noPrev'));
    const res = await compareVersions(prev.id, v.id);
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
      {canEdit && (
        <Bar>
          <Button
            variant="contained"
            onClick={() =>
              setDlg({
                title: t('cu.new'),
                fields: [
                  { name: 'programId', label: t('cu.f.programme'), kind: 'select', options: progOptions, required: true },
                  { name: 'regulationYear', label: t('cu.f.year'), kind: 'number', required: true, init: String(new Date().getFullYear()) },
                  { name: 'label', label: t('cu.f.label'), required: true },
                ],
                run: (v) => createVersion({ programId: v.programId, regulationYear: v.regulationYear, label: v.label }),
              })
            }
          >
            {t('cu.new')}
          </Button>
          <Button variant="outlined" onClick={() => setUpload(true)}>
            {t('cu.upload')}
          </Button>
        </Bar>
      )}
      <Grid
        testId="cu-versions"
        empty={t('cu.empty')}
        rows={versions}
        cols={[
          { label: t('cu.col.programme'), cell: (v) => v.programName, sort: (v) => v.programName },
          { label: t('cu.col.year'), cell: (v) => v.regulationYear, num: true, sort: (v) => v.regulationYear },
          { label: t('cu.col.version'), cell: (v) => `v${v.versionNo}`, num: true, sort: (v) => v.versionNo },
          { label: t('cu.col.label'), cell: (v) => v.label, sort: (v) => v.label },
          { label: t('cu.col.status'), cell: (v) => <StatusPill tone={TONE[v.status]}>{t(`cu.st.${v.status}` as MessageKey)}</StatusPill>, sort: (v) => v.status },
          { label: t('cu.col.subjects'), cell: (v) => v.subjectCount, num: true },
          { label: t('cu.col.pinned'), cell: (v) => v.pinnedStudents, num: true },
          {
            label: '',
            cell: (v) => {
              const step = canEdit ? nextStep(v.status, canApprove) : null;
              return (
                <Stack direction="row" spacing={1}>
                  {step === 'approve' && (
                    <Button size="small" onClick={() => setDlg({ title: t('cu.approve'), fields: [{ name: 'bosRef', label: t('cu.f.bos'), required: true }], run: (f) => approveVersion(v.id, f.bosRef) })}>
                      {t('cu.approve')}
                    </Button>
                  )}
                  {step === 'activate' && (
                    <Button size="small" onClick={() => setDlg({ title: t('cu.activate'), fields: [], run: () => activateVersion(v.id) })}>
                      {t('cu.activate')}
                    </Button>
                  )}
                  {step === 'revise' && (
                    <Button size="small" onClick={() => setDlg({ title: t('cu.revise'), fields: [{ name: 'label', label: t('cu.f.label'), required: true, init: `${v.label} (revision)` }], run: (f) => createVersion({ programId: v.programId, regulationYear: String(v.regulationYear), label: f.label, cloneFromId: v.id }) })}>
                      {t('cu.revise')}
                    </Button>
                  )}
                  {v.versionNo > 1 && (
                    <Button size="small" onClick={() => compare(v)}>
                      {t('cu.compare')}
                    </Button>
                  )}
                </Stack>
              );
            },
          },
        ]}
      />
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
      {upload && <UploadDialog programs={programs} onClose={(m) => { setUpload(false); if (m) toast(m); }} />}
      {diff && (
        <InfoDialog title={t('cu.diff.title')} onClose={() => setDiff(null)}>
          <Typography variant="body2" sx={{ mb: 1 }} data-testid="cu-diff-summary">
            {diff.from.label} to {diff.to.label}: {diffCount(diff) === 0 ? t('cu.diff.none') : t('cu.diff.count', { n: diffCount(diff) })}
          </Typography>
          {diff.added.map((s) => <Typography key={`a${s.code}`} variant="body2">+ {s.code} {s.name}</Typography>)}
          {diff.removed.map((s) => <Typography key={`r${s.code}`} variant="body2">- {s.code} {s.name}</Typography>)}
          {diff.changed.map((s) => (
            <Typography key={`c${s.code}`} variant="body2" component="div">
              ~ {s.code} {s.name}
              <ul style={{ margin: 0 }}>{s.changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </Typography>
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
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2">{t('cu.upload.hint')}</Typography>
          <TextField select label={t('cu.f.programme')} value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField label={t('cu.f.year')} value={year} onChange={(e) => setYear(e.target.value)} />
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={t('cu.imp.file')} data-testid="cu-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>{t('ops.cancel')}</Button>
        <Button variant="contained" disabled={pending} onClick={submit}>{t('cu.upload.go')}</Button>
      </DialogActions>
    </Dialog>
  );
}
