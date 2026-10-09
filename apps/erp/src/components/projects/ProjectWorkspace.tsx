'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import {
  addProjectLink,
  decideRequest,
  joinRequests,
  postComment,
  postReview,
  projectComments,
  projectReviews,
  recordViva,
  removeProjectFile,
  saveHub,
  scheduleViva,
  teamMatches,
  uploadProjectFile,
} from '@/app/(dashboard)/projects/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { Heading, ReadError, readBase64, useRead } from '@/components/pathways/shared';
import { Dialog, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { MAX_UPLOAD_BYTES, type ProjectComment, type ProjectReview, type Workspace, type WorkspaceFile, type WorkspaceViva } from '@/lib/pathways-a';

type Toast = (m: string) => void;

/** One project: the team and milestones, files, discussion, reviews, viva, showcase settings, and who wants to join. */
export function ProjectWorkspace({ ws, initialTab }: { ws: Workspace; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const mentor = ws.myRole !== 'member';
  const [dlg, setDlg] = useState<'link' | 'upload' | 'hub' | 'viva' | { record: WorkspaceViva } | null>(null);
  const projectId = ws.project.id;
  const close = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const size = (n: number | null) => (n === null ? '-' : n < 1024 ? `${n} B` : n < 1_048_576 ? `${fmt.number(Math.round(n / 1024))} KB` : `${fmt.number(Math.round(n / 104_858) / 10)} MB`);

  const fileCols: Col<WorkspaceFile>[] = [
    { label: t('ops.f.title'), cell: (f) => f.title, sort: (f) => f.title },
    { label: t('prj.col.kind'), cell: (f) => (f.url ? t('prj.file.link') : t('prj.file.file')) },
    { label: t('prj.col.size'), cell: (f) => (f.url ? '-' : size(f.sizeBytes)), num: true, sort: (f) => f.sizeBytes },
    { label: t('ops.f.date'), cell: (f) => fmt.dateTime(f.createdAt), sort: (f) => f.createdAt },
    {
      label: '',
      cell: (f) => (
        <Stack direction="row" spacing={0.5}>
          {f.url ? <Button size="small" href={f.url} target="_blank" rel="noopener noreferrer">{t('prj.openLink')}</Button> : <Button size="small" href={`/api/pathways?kind=project-file&id=${f.id}`}>{t('prj.download')}</Button>}
          <ActionButton tone="error" label={t('prj.remove')} run={() => removeProjectFile(projectId, f.id)} onDone={toast} />
        </Stack>
      ),
    },
  ];

  const vivaCols: Col<WorkspaceViva>[] = [
    { label: t('prj.col.when'), cell: (v) => fmt.dateTime(v.scheduledAt), sort: (v) => v.scheduledAt },
    { label: t('prj.col.venue'), cell: (v) => v.venue || '-' },
    { label: t('prj.col.panel'), cell: (v) => v.panel.map((p) => p.name).join(', ') },
    { label: t('prj.col.status'), cell: (v) => <Pill label={v.outcome ? t(`prj.outcome.${v.outcome}` as MessageKey) : t(`prj.vivaStatus.${v.status}` as MessageKey)} warn={v.outcome === 'fail'} /> },
    { label: t('prj.col.score'), cell: (v) => (v.score === null ? '-' : fmt.number(Number(v.score))), num: true, sort: (v) => (v.score === null ? null : Number(v.score)) },
    { label: t('prj.col.remarks'), cell: (v) => v.remarks || '-' },
    { label: '', cell: (v) => (v.status === 'scheduled' ? <Button size="small" onClick={() => setDlg({ record: v })}>{t('prj.recordResult')}</Button> : null) },
  ];

  const hubFields: Field[] = [
    { name: 'showcase', label: t('prj.f.showcase'), kind: 'select', init: ws.hub.showcase ? 'yes' : 'no', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
    { name: 'summary', label: t('prj.col.summary'), kind: 'multiline', init: ws.hub.summary },
    { name: 'recruiting', label: t('prj.f.recruiting'), kind: 'select', init: ws.hub.recruiting ? 'yes' : 'no', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
    { name: 'lookingFor', label: t('prj.f.lookingFor'), init: ws.hub.lookingFor.join(', ') },
    { name: 'openings', label: t('prj.f.openings'), kind: 'number', init: String(ws.hub.openings) },
  ];

  const overview = (
    <>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
        <Pill label={t(`rs.kind.${ws.project.kind}` as MessageKey)} />
        <Pill label={t(`rs.status.${ws.project.status}` as MessageKey)} warn={ws.project.status === 'cancelled'} />
        <Pill label={t('prj.myRole', { role: t(`prj.role.${ws.myRole}` as MessageKey) })} />
        <Pill label={ws.reviews.count === 0 ? t('prj.noReviews') : t('prj.reviewAvg', { avg: fmt.number(ws.reviews.average ?? 0), count: ws.reviews.count })} />
      </Stack>
      {ws.project.outcomeSummary && <Typography sx={{ mb: 2 }}>{ws.project.outcomeSummary}</Typography>}
      <Heading>{t('prj.team')}</Heading>
      <Grid empty={t('prj.empty.team')} rows={ws.members} cols={[{ label: t('ops.f.name'), cell: (m) => m.name || '-' }, { label: t('prj.col.role'), cell: (m) => t(`prj.role.${m.role}` as MessageKey) }]} />
      <Heading>{t('prj.milestones')}</Heading>
      <Grid
        empty={t('prj.empty.milestones')}
        rows={ws.milestones}
        cols={[
          { label: t('ops.f.title'), cell: (m) => m.title },
          { label: t('prj.col.due'), cell: (m) => fmt.date(m.dueOn, 'short'), sort: (m) => m.dueOn },
          { label: t('prj.col.status'), cell: (m) => <Pill label={m.completedOn ? t('prj.doneOn', { date: fmt.date(m.completedOn, 'short') }) : t('prj.pending')} warn={!m.completedOn} /> },
        ]}
      />
    </>
  );

  const tabs = [
    { id: 'overview', label: t('prj.tab.overview'), node: overview },
    {
      id: 'files',
      label: t('prj.tab.files'),
      node: (
        <>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('link')} data-testid="prj-add-link">{t('prj.addLink')}</Button>
            <Button variant="outlined" onClick={() => setDlg('upload')} data-testid="prj-upload">{t('prj.uploadFile')}</Button>
          </Bar>
          <Grid testId="prj-files" empty={t('prj.empty.files')} rows={ws.files} cols={fileCols} />
        </>
      ),
    },
    { id: 'discussion', label: t('prj.tab.discussion'), node: <CommentsTab projectId={projectId} toast={toast} /> },
    { id: 'reviews', label: t('prj.tab.reviews'), node: <ReviewsTab projectId={projectId} toast={toast} mentor={mentor} /> },
    {
      id: 'viva',
      label: t('prj.tab.viva'),
      node: (
        <>
          {mentor && <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setDlg('viva')} data-testid="prj-schedule-viva">{t('prj.scheduleViva')}</Button></Bar>}
          <Grid testId="prj-vivas" empty={t('prj.empty.vivas')} rows={ws.vivas} cols={vivaCols} />
        </>
      ),
    },
    ...(mentor
      ? [
          {
            id: 'showcase',
            label: t('prj.tab.hub'),
            node: (
              <>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
                  <Pill label={ws.hub.showcase ? t('prj.onShowcase') : t('prj.notOnShowcase')} warn={!ws.hub.showcase} />
                  <Pill label={ws.hub.recruiting ? t('prj.recruitingOpen', { n: ws.hub.openings }) : t('prj.notRecruiting')} warn={!ws.hub.recruiting} />
                </Stack>
                {ws.hub.summary && <Typography sx={{ mb: 1 }}>{ws.hub.summary}</Typography>}
                {ws.hub.lookingFor.length > 0 && <Typography variant="body2" sx={{ mb: 2 }}>{t('prj.f.lookingFor')}: {ws.hub.lookingFor.join(', ')}</Typography>}
                <Button variant="contained" onClick={() => setDlg('hub')} data-testid="prj-edit-hub">{t('ops.edit')}</Button>
              </>
            ),
          },
          { id: 'team', label: t('prj.tab.team'), node: <TeamTab projectId={projectId} toast={toast} /> },
        ]
      : []),
  ];

  return (
    <>
      <Tabbed label={t('nav.projects')} initial={initialTab} tabs={tabs} />
      {dlg === 'link' && (
        <FormDialog
          title={t('prj.addLink')}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'url', label: t('prj.f.url'), required: true },
          ]}
          onSubmit={(v) => addProjectLink(projectId, v)}
          onClose={close}
        />
      )}
      {dlg === 'upload' && <UploadDialog projectId={projectId} onClose={close} />}
      {dlg === 'hub' && <FormDialog title={t('prj.tab.hub')} fields={hubFields} onSubmit={(v) => saveHub(projectId, v)} onClose={close} />}
      {dlg === 'viva' && (
        <FormDialog
          title={t('prj.scheduleViva')}
          fields={[
            { name: 'scheduledAt', label: t('prj.col.when'), kind: 'datetime', required: true },
            { name: 'venue', label: t('prj.col.venue') },
            { name: 'panel', label: t('prj.f.panel'), required: true },
          ]}
          intro={<Typography variant="body2">{t('prj.panelHint')}</Typography>}
          onSubmit={(v) => scheduleViva(projectId, v)}
          onClose={close}
        />
      )}
      {dlg && typeof dlg === 'object' && (
        <FormDialog
          title={t('prj.recordResult')}
          fields={[
            { name: 'outcome', label: t('prj.col.status'), kind: 'select', required: true, init: 'pass', options: (['pass', 'revise', 'fail'] as const).map((o) => ({ value: o, label: t(`prj.outcome.${o}` as MessageKey) })) },
            { name: 'score', label: t('prj.col.score'), kind: 'number' },
            { name: 'remarks', label: t('prj.col.remarks'), kind: 'multiline' },
          ]}
          onSubmit={(v) => recordViva(projectId, dlg.record.id, v)}
          onClose={close}
        />
      )}
      {toastNode}
    </>
  );
}

/** A file chosen on this computer, sent to the project as a small upload. */
function UploadDialog({ projectId, onClose }: { projectId: string; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!file) return setError(t('prj.err.chooseFile'));
    if (file.size > MAX_UPLOAD_BYTES) return setError(t('pw.err.fileSize'));
    setError(null);
    start(async () => {
      const base64 = await readBase64(file);
      const res = await uploadProjectFile(projectId, { name: file.name, type: file.type, size: file.size, base64 }, title);
      if (res.ok) onClose(t('ops.saved'));
      else setError(res.error);
    });
  };
  return (
    <Dialog
      title={t('prj.uploadFile')}
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
        <Typography variant="body2">{t('prj.uploadHint')}</Typography>
        <FormField label={t('prj.f.file')} required>
          <input type="file" aria-label={t('prj.f.file')} data-testid="prj-file-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FormField>
        <FormField label={t('ops.f.title')}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
        </FormField>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Dialog>
  );
}

function CommentsTab({ projectId, toast }: { projectId: string; toast: Toast }) {
  const { t, fmt } = useI18n();
  const list = useRead<ProjectComment[]>(() => projectComments(projectId));
  const [dlg, setDlg] = useState<ProjectComment | 'new' | null>(null);
  const rows = list.data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  return (
    <>
      <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setDlg('new')} data-testid="prj-new-comment">{t('prj.postComment')}</Button></Bar>
      <ReadError message={list.error} />
      {list.data && (
        <Grid
          testId="prj-comments"
          empty={t('prj.empty.comments')}
          rows={rows}
          cols={[
            { label: t('prj.col.author'), cell: (c) => c.author, sort: (c) => c.author },
            { label: t('ops.f.date'), cell: (c) => fmt.dateTime(c.createdAt), sort: (c) => c.createdAt },
            { label: t('prj.col.comment'), cell: (c) => (c.parentId ? `${t('prj.replyTo', { name: byId.get(c.parentId)?.author ?? '-' })}: ${c.body}` : c.body) },
            { label: '', cell: (c) => <Button size="small" onClick={() => setDlg(c)}>{t('prj.reply')}</Button> },
          ]}
        />
      )}
      {dlg && (
        <FormDialog
          title={dlg === 'new' ? t('prj.postComment') : t('prj.replyTo', { name: dlg.author })}
          fields={[{ name: 'body', label: t('prj.col.comment'), kind: 'multiline', required: true }]}
          onSubmit={(v) => postComment(projectId, v, dlg === 'new' ? undefined : dlg.id)}
          onClose={(m) => {
            setDlg(null);
            if (m) {
              toast(m);
              list.reload();
            }
          }}
        />
      )}
    </>
  );
}

function ReviewsTab({ projectId, toast, mentor }: { projectId: string; toast: Toast; mentor: boolean }) {
  const { t, fmt } = useI18n();
  const list = useRead<ProjectReview[]>(() => projectReviews(projectId));
  const [open, setOpen] = useState(false);
  return (
    <>
      {mentor && <Bar><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} data-testid="prj-new-review">{t('prj.writeReview')}</Button></Bar>}
      <ReadError message={list.error} />
      {list.data && (
        <Grid
          testId="prj-reviews"
          empty={t('prj.empty.reviews')}
          rows={list.data}
          cols={[
            { label: t('prj.col.reviewer'), cell: (r) => r.reviewer, sort: (r) => r.reviewer },
            { label: t('prj.col.kind'), cell: (r) => t(`prj.reviewKind.${r.kind}` as MessageKey) },
            { label: t('prj.col.score'), cell: (r) => `${fmt.number(r.percent)}%`, num: true, sort: (r) => r.percent },
            { label: t('prj.col.rubric'), cell: (r) => Object.entries(r.rubric).map(([k, v]) => `${k}: ${v}/${r.maxPerCriterion}`).join(', ') },
            { label: t('prj.col.comment'), cell: (r) => r.comment || '-' },
            { label: t('ops.f.date'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
          ]}
        />
      )}
      {open && (
        <FormDialog
          title={t('prj.writeReview')}
          intro={<Typography variant="body2">{t('prj.rubricHint')}</Typography>}
          fields={[
            { name: 'kind', label: t('prj.col.kind'), kind: 'select', init: 'mentor', options: (['mentor', 'external'] as const).map((k) => ({ value: k, label: t(`prj.reviewKind.${k}` as MessageKey) })) },
            { name: 'rubric', label: t('prj.col.rubric'), kind: 'multiline', required: true },
            { name: 'maxPerCriterion', label: t('prj.f.maxPerCriterion'), kind: 'number', init: '5', required: true },
            { name: 'comment', label: t('prj.col.comment'), kind: 'multiline' },
          ]}
          onSubmit={(v) => postReview(projectId, v)}
          onClose={(m) => {
            setOpen(false);
            if (m) {
              toast(m);
              list.reload();
            }
          }}
        />
      )}
    </>
  );
}

/** Students who asked to join, and students whose skills match what the project looks for. */
function TeamTab({ projectId, toast }: { projectId: string; toast: Toast }) {
  const { t, fmt } = useI18n();
  const requests = useRead(() => joinRequests(projectId));
  const matches = useRead(() => teamMatches(projectId));
  const decided = (m: string) => {
    toast(m);
    requests.reload();
  };
  return (
    <>
      <Heading>{t('prj.requests')}</Heading>
      <ReadError message={requests.error} />
      {requests.data && (
        <Grid
          testId="prj-requests"
          empty={t('prj.empty.requests')}
          rows={requests.data}
          cols={[
            { label: t('ops.f.name'), cell: (r) => r.fullName, sort: (r) => r.fullName },
            { label: t('prj.col.message'), cell: (r) => r.message || '-' },
            { label: t('ops.f.date'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
            { label: t('prj.col.status'), cell: (r) => <Pill label={t(`prj.reqStatus.${r.status}` as MessageKey)} warn={r.status === 'declined'} /> },
            {
              label: '',
              cell: (r) =>
                r.status === 'pending' ? (
                  <Stack direction="row" spacing={0.5}>
                    <ActionButton label={t('prj.accept')} run={() => decideRequest(projectId, r.id, true)} onDone={decided} />
                    <ActionButton tone="error" label={t('prj.decline')} run={() => decideRequest(projectId, r.id, false)} onDone={decided} />
                  </Stack>
                ) : null,
            },
          ]}
        />
      )}
      <Heading>{t('prj.matches')}</Heading>
      <ReadError message={matches.error} />
      {matches.data && (
        <Grid
          testId="prj-matches"
          empty={t('prj.empty.matches')}
          rows={matches.data}
          cols={[
            { label: t('ops.f.name'), cell: (m) => m.fullName, sort: (m) => m.fullName },
            { label: t('prj.col.roll'), cell: (m) => m.rollNo, sort: (m) => m.rollNo },
            { label: t('prj.col.fit'), cell: (m) => `${fmt.number(m.fit)}%`, num: true, sort: (m) => m.fit },
            { label: t('prj.col.matched'), cell: (m) => m.matched.join(', ') || '-' },
          ]}
        />
      )}
    </>
  );
}
