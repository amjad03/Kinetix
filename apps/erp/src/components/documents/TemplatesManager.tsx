'use client';

import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { saveTemplate } from '@/app/(dashboard)/documents/actions';
import { TableFrame } from '@/components/DataTable';
import { useNotice } from '@/components/hr/Common';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { CERT_KINDS, fieldLines, fieldsHelp, parseFieldLines, PLACEHOLDERS } from '@/lib/documents';
import type { CertificateTemplate } from '@/lib/hr-types';

export function TemplatesManager({ templates, canEdit }: { templates: CertificateTemplate[]; canEdit: boolean }) {
  const { t } = useI18n();
  const { run, view } = useNotice();
  const [editing, setEditing] = useState<CertificateTemplate | 'new' | null>(null);
  return (
    <>
      {view}
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('doc.tpl.help')} {PLACEHOLDERS.map((p) => `{{${p}}}`).join(' ')}
      </Alert>
      {canEdit && (
        <Box sx={{ mb: 2 }}>
          <Button variant="contained" startIcon={<Add />} onClick={() => setEditing('new')}>
            {t('doc.tpl.new')}
          </Button>
        </Box>
      )}
      <TableFrame testId="templates">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('hr.leave.name')}</TableCell>
              <TableCell>{t('doc.tpl.kind')}</TableCell>
              <TableCell>{t('doc.tpl.subject')}</TableCell>
              <TableCell>{t('doc.tpl.prefix')}</TableCell>
              <TableCell>{t('doc.tpl.version')}</TableCell>
              <TableCell>{t('hr.f.status')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.name}</TableCell>
                <TableCell>{t(`doc.kind.${x.kind}` as MessageKey)}</TableCell>
                <TableCell>{t(`doc.subject.${x.subjectType}` as MessageKey)}</TableCell>
                <TableCell>{x.serialPrefix}</TableCell>
                <TableCell>{x.version}</TableCell>
                <TableCell>
                  <Chip size="small" color={x.active ? 'success' : 'default'} label={t(x.active ? 'doc.tpl.active' : 'doc.tpl.inactive')} />
                </TableCell>
                <TableCell align="right">
                  {canEdit && (
                    <Button size="small" onClick={() => setEditing(x)}>
                      {t('hr.edit')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      {editing && <TemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} run={run} />}
    </>
  );
}

function TemplateDialog({ template, onClose, run }: { template: CertificateTemplate | null; onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    kind: template?.kind ?? ('custom' as CertificateTemplate['kind']),
    name: template?.name ?? '',
    subjectType: template?.subjectType ?? ('student' as CertificateTemplate['subjectType']),
    title: template?.title ?? '',
    body: template?.body ?? '',
    prefix: template?.serialPrefix ?? '',
    active: template?.active ?? true,
    fields: fieldLines(template?.fields ?? []),
  });
  const [pending, start] = useTransition();
  const fields = parseFieldLines(f.fields);
  const valid = f.name.trim() && f.title.trim() && f.body.trim().length >= 10 && /^[A-Za-z]{1,6}$/.test(f.prefix) && fields;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{template ? t('doc.tpl.edit') : t('doc.tpl.new')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField size="small" label={t('hr.leave.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <TextField size="small" label={t('doc.tpl.titleLabel')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextField select size="small" label={t('doc.tpl.kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CertificateTemplate['kind'] })}>
              {CERT_KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {t(`doc.kind.${k}` as MessageKey)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={t('doc.tpl.subject')} value={f.subjectType} onChange={(e) => setF({ ...f, subjectType: e.target.value as CertificateTemplate['subjectType'] })}>
              <MenuItem value="student">{t('doc.subject.student')}</MenuItem>
              <MenuItem value="staff">{t('doc.subject.staff')}</MenuItem>
            </TextField>
            <TextField size="small" label={t('doc.tpl.prefix')} value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value.toUpperCase() })} />
            <FormControlLabel control={<Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />} label={t('doc.tpl.active')} />
          </Box>
          <TextField multiline minRows={6} size="small" label={t('doc.tpl.body')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <TextField multiline minRows={2} size="small" label={t('doc.tpl.fields')} value={f.fields} onChange={(e) => setF({ ...f, fields: e.target.value })} error={!fields} helperText={t('doc.tpl.fieldsHelp')} />
          {fields && fields.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {fieldsHelp(fields).join(' ')}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !valid}
          onClick={() =>
            start(async () => {
              const r = await run(() => saveTemplate(template?.id ?? null, { kind: f.kind, name: f.name.trim(), subjectType: f.subjectType, title: f.title.trim(), body: f.body.trim(), fields: fields!, serialPrefix: f.prefix, active: f.active }), t('hr.saved'));
              if (r.ok) onClose();
            })
          }
        >
          {t('hr.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
