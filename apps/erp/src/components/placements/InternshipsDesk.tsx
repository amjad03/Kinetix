'use client';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState, useTransition } from 'react';
import { addInternshipLink, internshipAttendance, internshipCertificate, internshipLinks, issueCertificate, markAttendance, moveInternship, removeInternshipLink } from '@/app/(dashboard)/placements/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast, type Col } from '@/components/ops/kit';
import { Heading, ReadError, useRead } from '@/components/pathways/shared';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { INTERNSHIP_MOVES, type InternshipRow } from '@/lib/pathways-a';

type Toast = (m: string) => void;
export interface SkillOption { id: string; name: string }
type Dlg = { kind: 'attendance' | 'links' | 'certificate' | 'move'; row: InternshipRow };

/** The internship register with, per internship: status moves, attendance, what it counts towards, and the completion certificate. */
export function InternshipsDesk({ rows, skills, canEdit }: { rows: InternshipRow[]; skills: SkillOption[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const noCertificate = useRef<string | null>(null);
  const close = (m?: string) => {
    setDlg(null);
    if (m) toast(noCertificate.current ?? m);
    noCertificate.current = null;
  };

  const cols: Col<InternshipRow>[] = [
    { label: t('ixn.col.student'), cell: (r) => `${r.fullName} (${r.rollNo})`, sort: (r) => r.fullName },
    { label: t('ops.f.title'), cell: (r) => r.title, sort: (r) => r.title },
    { label: t('ixn.col.organisation'), cell: (r) => r.orgName, sort: (r) => r.orgName },
    { label: t('ixn.col.period'), cell: (r) => `${fmt.date(r.startsOn, 'short')} - ${fmt.date(r.endsOn, 'short')}`, sort: (r) => r.startsOn },
    { label: t('ixn.col.status'), cell: (r) => <Pill label={t(`ixn.status.${r.status}` as MessageKey)} warn={r.status === 'cancelled'} />, sort: (r) => r.status },
    { label: t('ixn.col.evaluation'), cell: (r) => (r.evaluationScore === null ? '-' : fmt.number(Number(r.evaluationScore))), num: true, sort: (r) => (r.evaluationScore === null ? null : Number(r.evaluationScore)) },
    {
      label: '',
      cell: (r) => (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {canEdit && (INTERNSHIP_MOVES[r.status]?.length ?? 0) > 0 && <Button size="small" onClick={() => setDlg({ kind: 'move', row: r })}>{t('ixn.move')}</Button>}
          <Button size="small" onClick={() => setDlg({ kind: 'attendance', row: r })} data-testid={`ixn-attendance-${r.id}`}>{t('ixn.attendance')}</Button>
          <Button size="small" onClick={() => setDlg({ kind: 'links', row: r })} data-testid={`ixn-links-${r.id}`}>{t('ixn.links')}</Button>
          <Button size="small" onClick={() => setDlg({ kind: 'certificate', row: r })} data-testid={`ixn-certificate-${r.id}`}>{t('ixn.certificate')}</Button>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 1.5, fontSize: '1.0625rem', fontWeight: 600 }}>{t('ixn.title')}</Typography>
      <Grid testId="ixn-table" empty={t('ixn.empty')} rows={rows} cols={cols} exportName="internships" />
      {dlg?.kind === 'move' && (
        <FormDialog
          title={`${t('ixn.move')}: ${dlg.row.title}`}
          fields={[{ name: 'status', label: t('ixn.col.status'), kind: 'select', required: true, options: (INTERNSHIP_MOVES[dlg.row.status] ?? []).map((s) => ({ value: s, label: t(`ixn.status.${s}` as MessageKey) })) }]}
          onSubmit={async (v) => {
            const r = await moveInternship(dlg.row.id, v.status);
            // Finishing an internship tries to issue its certificate; say why when it did not.
            const c = r.ok ? r.data?.certificate : undefined;
            if (c && c.certificateId === null && c.reason) noCertificate.current = t('ixn.noCertificate', { reason: c.reason });
            return r;
          }}
          onClose={close}
        />
      )}
      {dlg?.kind === 'attendance' && <AttendanceDialog row={dlg.row} onClose={() => setDlg(null)} toast={toast} />}
      {dlg?.kind === 'links' && <LinksDialog row={dlg.row} skills={skills} onClose={() => setDlg(null)} toast={toast} />}
      {dlg?.kind === 'certificate' && <CertificateDialog row={dlg.row} canEdit={canEdit} onClose={() => setDlg(null)} toast={toast} />}
      {toastNode}
    </>
  );
}

function AttendanceDialog({ row, onClose, toast }: { row: InternshipRow; onClose: () => void; toast: Toast }) {
  const { t, fmt } = useI18n();
  const a = useRead(() => internshipAttendance(row.id));
  const [mark, setMark] = useState(false);
  const s = a.data?.summary;
  return (
    <InfoDialog title={`${t('ixn.attendance')}: ${row.fullName}`} onClose={onClose}>
      <ReadError message={a.error} />
      {a.data && s && (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            <Pill label={t('ixn.workingDays', { n: s.workingDays })} />
            <Pill label={t('ixn.presentDays', { n: s.presentDays })} />
            <Pill label={t('ixn.hours', { n: fmt.number(s.hours) })} />
            <Pill label={t('ixn.percent', { n: fmt.number(s.percent) })} warn={!s.eligible} />
            <Pill label={s.eligible ? t('ixn.eligible') : t('ixn.notEligible')} warn={!s.eligible} />
          </Stack>
          <Bar><Button variant="contained" onClick={() => setMark(true)} data-testid="ixn-mark">{t('ixn.markDay')}</Button></Bar>
          <Grid
            testId="ixn-attendance-rows"
            empty={t('ixn.empty.attendance')}
            rows={a.data.rows}
            cols={[
              { label: t('ops.f.date'), cell: (x) => fmt.date(x.onDate, 'short'), sort: (x) => x.onDate },
              { label: t('ixn.col.present'), cell: (x) => <Pill label={x.present ? t('ops.yes') : t('ops.no')} warn={!x.present} /> },
              { label: t('ixn.col.hoursShort'), cell: (x) => fmt.number(Number(x.hours)), num: true, sort: (x) => Number(x.hours) },
              { label: t('ops.f.note'), cell: (x) => x.note || '-' },
            ]}
          />
        </>
      )}
      {mark && (
        <FormDialog
          title={t('ixn.markDay')}
          fields={[
            { name: 'onDate', label: t('ops.f.date'), kind: 'date', required: true, init: new Date().toISOString().slice(0, 10) },
            { name: 'present', label: t('ixn.col.present'), kind: 'select', init: 'yes', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
            { name: 'hours', label: t('ixn.col.hoursShort'), init: '8' },
            { name: 'note', label: t('ops.f.note') },
          ]}
          onSubmit={(v) => markAttendance(row.id, v)}
          onClose={(m) => {
            setMark(false);
            if (m) {
              toast(m);
              a.reload();
            }
          }}
        />
      )}
    </InfoDialog>
  );
}

function LinksDialog({ row, skills, onClose, toast }: { row: InternshipRow; skills: SkillOption[]; onClose: () => void; toast: Toast }) {
  const { t } = useI18n();
  const l = useRead(() => internshipLinks(row.id));
  const [add, setAdd] = useState<'skill' | 'course' | 'course_outcome' | null>(null);
  const changed = (m: string) => {
    toast(m);
    l.reload();
  };
  return (
    <InfoDialog title={`${t('ixn.links')}: ${row.title}`} onClose={onClose}>
      <Typography variant="body2" sx={{ mb: 2 }}>{t('ixn.linksHint')}</Typography>
      <ReadError message={l.error} />
      <Bar>
        {(['skill', 'course', 'course_outcome'] as const).map((k) => (
          <Button key={k} variant="outlined" size="small" onClick={() => setAdd(k)} data-testid={`ixn-link-${k}`}>{t(`ixn.linkAdd.${k}` as MessageKey)}</Button>
        ))}
      </Bar>
      {l.data && (
        <Grid
          testId="ixn-link-rows"
          empty={t('ixn.empty.links')}
          rows={l.data}
          cols={[
            { label: t('ixn.col.kind'), cell: (x) => t(`ixn.linkKind.${x.kind}` as MessageKey), sort: (x) => x.kind },
            { label: t('ops.f.name'), cell: (x) => x.label || '-', sort: (x) => x.label },
            { label: t('ops.f.note'), cell: (x) => x.note || '-' },
            { label: '', cell: (x) => <ActionButton tone="error" label={t('ixn.unlink')} run={() => removeInternshipLink(row.id, x.id)} onDone={changed} /> },
          ]}
        />
      )}
      {add && (
        <FormDialog
          title={t(`ixn.linkAdd.${add}` as MessageKey)}
          intro={add === 'skill' && skills.length > 0 ? undefined : <Typography variant="body2">{t('ixn.idHint')}</Typography>}
          fields={[
            add === 'skill' && skills.length > 0
              ? { name: 'refId', label: t('ixn.linkKind.skill'), kind: 'select', required: true, options: skills.map((s) => ({ value: s.id, label: s.name })) }
              : { name: 'refId', label: t(`ixn.linkKind.${add}` as MessageKey), kind: 'uuid', required: true },
            { name: 'note', label: t('ops.f.note') },
          ]}
          onSubmit={(v) => addInternshipLink(row.id, { ...v, kind: add })}
          onClose={(m) => {
            setAdd(null);
            if (m) changed(m);
          }}
        />
      )}
    </InfoDialog>
  );
}

function CertificateDialog({ row, canEdit, onClose, toast }: { row: InternshipRow; canEdit: boolean; onClose: () => void; toast: Toast }) {
  const { t } = useI18n();
  const c = useRead(() => internshipCertificate(row.id));
  const [pending, start] = useTransition();
  const issue = (waive: boolean) =>
    start(async () => {
      const r = await issueCertificate(row.id, waive);
      if (!r.ok) toast(r.error);
      else if (r.data.certificateId === null) toast(t('ixn.noCertificate', { reason: r.data.reason ?? '' }));
      else toast(t('ixn.issued'));
      c.reload();
    });
  const issued = !!c.data?.certificateId;
  return (
    <InfoDialog title={`${t('ixn.certificate')}: ${row.fullName}`} onClose={onClose}>
      <ReadError message={c.error} />
      {c.data && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Pill label={issued ? t('ixn.certIssued', { serial: c.data.serialNo ?? '-' }) : t('ixn.certNone')} warn={!issued} />
            {c.data.status && <Pill label={c.data.status} />}
          </Stack>
          {!issued && row.status !== 'completed' && <Typography variant="body2" sx={{ mb: 2 }}>{t('ixn.certNeedsCompleted')}</Typography>}
          {!issued && canEdit && row.status === 'completed' && (
            <>
              <Heading>{t('ixn.issueTitle')}</Heading>
              <Typography variant="body2" sx={{ mb: 1 }}>{t('ixn.waiveHint')}</Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" disabled={pending} onClick={() => issue(false)} startIcon={pending ? <CircularProgress size={16} /> : undefined} data-testid="ixn-issue">{t('ixn.issue')}</Button>
                <Button variant="outlined" disabled={pending} onClick={() => issue(true)} data-testid="ixn-issue-waive">{t('ixn.issueWaive')}</Button>
              </Stack>
            </>
          )}
        </>
      )}
    </InfoDialog>
  );
}
