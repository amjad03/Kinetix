'use client';

import Add from '@mui/icons-material/Add';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { bulkIssue, classStudents, decideCertificate, requestCertificate } from '@/app/(dashboard)/documents/actions';
import { sendCertificate } from '@/app/(dashboard)/workflows/bound-actions';
import { SendForApproval } from '@/components/pathways-b/SendForApproval';
import { BOUND_FLOWS } from '@/lib/pathways-b';
import { DataTable, FormField, TextInput } from '@/components/ui';
import { useNotice } from '@/components/hr/Common';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { CERT_STATUSES, CERT_TONE, certActions, docDownload } from '@/lib/documents';
import type { CertificateKind, CertificateRequest, CertificateStatus, CertificateSubject } from '@/lib/hr-types';

export interface AvailableTemplate {
  id: string;
  kind: CertificateKind;
  name: string;
  subjectType: CertificateSubject;
  fields: { key: string; label: string; required: boolean }[];
}

export function DocumentsDesk({ requests, status, templates, classes, staff, approver, canBulk, flows }: { requests: CertificateRequest[]; status: CertificateStatus | ''; templates: AvailableTemplate[]; classes: { id: string; name: string }[]; staff: { id: string; name: string }[]; approver: boolean; canBulk: boolean; flows: Record<string, boolean> | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [asking, setAsking] = useState<{ r: CertificateRequest; step: 'reject' | 'revoke' } | null>(null);
  const [text, setText] = useState('');
  const step = (r: CertificateRequest, s: 'approve' | 'issue') => start(async () => void (await run(() => decideCertificate(r.id, s, ''), t('hr.saved'))));

  return (
    <>
      {view}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <FormField label={t('hr.f.status')}>
          <TextInput select value={status} onChange={(e) => router.push(e.target.value ? `/documents?status=${e.target.value}` : '/documents')} sx={{ minWidth: 180 }}>
            <MenuItem value="">{t('doc.allStatuses')}</MenuItem>
            {CERT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {t(`doc.status.${s}` as MessageKey)}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <Box sx={{ flex: 1 }} />
        {canBulk && (
          <Button variant="outlined" onClick={() => setBulk(true)}>
            {t('doc.bulk')}
          </Button>
        )}
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>
          {t('doc.newRequest')}
        </Button>
      </Box>
      {requests.length === 0 ? (
        <EmptyState icon={<WorkspacePremiumOutlined />} title={t('doc.none')}>
          {t('doc.noneBody')}
        </EmptyState>
      ) : (
        <DataTable
            testId="certificate-requests"
            label={t('doc.certificate')}
            rows={requests}
            rowId={(r) => r.id}
            exportName="certificate-requests"
            columns={[
              { id: 'certificate', header: t('doc.certificate'), rowHeader: true, sort: (r) => r.template.name, cell: (r) => r.template.name },
              {
                id: 'subject',
                header: t('doc.subject'),
                sort: (r) => r.subject.name,
                csv: (r) => [r.subject.name, r.subject.detail].filter(Boolean).join(' · '),
                cell: (r) => (
                  <>
                    {r.subject.name}
                    {r.subject.detail && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {r.subject.detail}
                      </Typography>
                    )}
                  </>
                ),
              },
              { id: 'purpose', header: t('doc.purpose'), sort: (r) => r.purpose, cell: (r) => <Box sx={{ maxWidth: 220 }}>{r.purpose || '–'}</Box> },
              { id: 'status', header: t('hr.f.status'), sort: (r) => t(`doc.status.${r.status}` as MessageKey), cell: (r) => <Chip size="small" color={CERT_TONE[r.status]} label={t(`doc.status.${r.status}` as MessageKey)} /> },
              { id: 'serial', header: t('doc.serial'), sort: (r) => r.serialNo ?? '', cell: (r) => r.serialNo ?? '–' },
              {
                id: 'actions',
                header: '',
                csv: false,
                align: 'right',
                cell: (r) => {
                  // HR managers decide staff certificates only; revoking is for the principal and administrator (the API checks too).
                  const can = certActions(r.status, { approver: r.subjectType === 'staff' ? approver : canBulk, office: true });
                  if (!canBulk) can.revoke = false;
                  return (
                    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                                            {can.reject && <Button size="small" disabled={pending} onClick={() => { setText(''); setAsking({ r, step: 'reject' }); }}>{t('doc.reject')}</Button>}
                      {can.approve && <Button size="small" variant="contained" disabled={pending} onClick={() => step(r, 'approve')}>{t('doc.approve')}</Button>}
                      {can.issue && <Button size="small" variant="contained" disabled={pending} onClick={() => step(r, 'issue')}>{t('doc.issue')}</Button>}
                      {r.status === 'requested' && <SendForApproval flow={BOUND_FLOWS[2]} flows={flows} sourceId={r.id} onSend={() => sendCertificate(r.id)} />}
                      {can.pdf && <Button size="small" href={docDownload.certificate(r.id)} target="_blank">{t('doc.openPdf')}</Button>}
                      {can.revoke && <Button size="small" color="error" disabled={pending} onClick={() => { setText(''); setAsking({ r, step: 'revoke' }); }}>{t('doc.revoke')}</Button>}
                    
                    </Box>
                  );
                },
              },
            ]}
          />
      )}

      {asking && (
        <Dialog open onClose={() => setAsking(null)} fullWidth maxWidth="xs">
          <DialogTitle>{t(asking.step === 'reject' ? 'doc.rejectTitle' : 'doc.revokeTitle', { name: asking.r.subject.name })}</DialogTitle>
          <DialogContent>
            <FormField label={t(asking.step === 'reject' ? 'doc.note' : 'doc.reason')}>
              <TextInput fullWidth multiline minRows={2} sx={{ mt: 1 }} value={text} onChange={(e) => setText(e.target.value)} />
            </FormField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAsking(null)}>{t('hr.cancel')}</Button>
            <Button
              variant="contained"
              color="error"
              disabled={pending || (asking.step === 'revoke' && text.trim().length < 3)}
              onClick={() =>
                start(async () => {
                  const r = await run(() => decideCertificate(asking.r.id, asking.step, text), t('hr.saved'));
                  if (r.ok) setAsking(null);
                })
              }
            >
              {t(asking.step === 'reject' ? 'doc.reject' : 'doc.revoke')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {creating && <RequestDialog templates={templates} classes={classes} staff={staff} onClose={() => setCreating(false)} run={run} />}
      {bulk && <BulkDialog templates={templates.filter((x) => x.subjectType === 'student')} classes={classes} onClose={() => setBulk(false)} run={run} />}
    </>
  );
}

function RequestDialog({ templates, classes, staff, onClose, run }: { templates: AvailableTemplate[]; classes: { id: string; name: string }[]; staff: { id: string; name: string }[]; onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [templateId, setTemplateId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [subject, setSubject] = useState('');
  const [purpose, setPurpose] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const tpl = templates.find((x) => x.id === templateId);
  const missing = tpl?.fields.some((f) => f.required && !fields[f.key]?.trim());
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('doc.newRequest')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormField label={t('doc.certificate')}>
            <TextInput select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setSubject(''); setFields({}); }}>
              {templates.map((x) => (
                <MenuItem key={x.id} value={x.id}>
                  {x.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          {tpl?.subjectType === 'student' && (
            <>
              <FormField label={t('doc.class')}>
                <TextInput select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setSubject(''); start(async () => { const r = await classStudents(e.target.value); setStudents(r.ok ? r.data : []); }); }}>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('doc.student')}>
                <TextInput select value={subject} onChange={(e) => setSubject(e.target.value)} helperText={sectionId && students.length === 0 && !pending ? t('doc.noStudents') : undefined}>
                  {students.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
            </>
          )}
          {tpl?.subjectType === 'staff' && (
            <FormField label={t('doc.staffMember')}>
              <TextInput select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {staff.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
          )}
          {tpl?.fields.map((f) => (
            <FormField key={f.key} label={f.label} required={f.required}>
              <TextInput required={f.required} value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
            </FormField>
          ))}
          <FormField label={t('doc.purpose')}>
            <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !tpl || !subject || missing}
          onClick={() =>
            start(async () => {
              const r = await run(() => requestCertificate({ templateId, purpose, fields, ...(tpl!.subjectType === 'student' ? { studentId: subject } : { staffUserId: subject }) }), t('hr.saved'));
              if (r.ok) onClose();
            })
          }
        >
          {t('doc.request')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BulkDialog({ templates, classes, onClose, run }: { templates: AvailableTemplate[]; classes: { id: string; name: string }[]; onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [templateId, setTemplateId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('doc.bulk')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('doc.bulkHelp')}
        </Typography>
        <Stack spacing={2}>
          <FormField label={t('doc.certificate')}>
            <TextInput select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((x) => (
                <MenuItem key={x.id} value={x.id}>
                  {x.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('doc.class')}>
            <TextInput select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('doc.purpose')}>
            <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !templateId || !sectionId}
          onClick={() =>
            start(async () => {
              const r = await run(() => bulkIssue({ templateId, sectionId, purpose }), t('doc.bulkDone'));
              if (r.ok) onClose();
            })
          }
        >
          {t('doc.issue')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
