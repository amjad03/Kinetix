'use client';

import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import UploadFile from '@mui/icons-material/UploadFile';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useState, useTransition } from 'react';
import { archiveVaultFile, classStudents, listVault } from '@/app/(dashboard)/documents/actions';
import { DataTable, FormField, TextInput } from '@/components/ui';
import { useNotice } from '@/components/hr/Common';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import { CATEGORY, docDownload, fileSize, vaultFileProblem, vaultQuery } from '@/lib/documents';
import type { VaultDocument } from '@/lib/hr-types';

type Owner = { type: 'student' | 'staff'; id: string; name: string };

export function VaultDesk({ classes, staff, canStudents, canStaff, expiring }: { classes: { id: string; name: string }[]; staff: { id: string; name: string }[]; canStudents: boolean; canStaff: boolean; expiring: VaultDocument[] }) {
  const { t, locale } = useI18n();
  const { run, view, setError } = useNotice();
  const [pending, start] = useTransition();
  const [type, setType] = useState<'student' | 'staff'>(canStudents ? 'student' : 'staff');
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [uploading, setUploading] = useState<{ replaces?: VaultDocument } | null>(null);

  const open = (o: Owner) => {
    setOwner(o);
    start(async () => {
      const r = await run(() => listVault(o.type, o.id));
      setDocs(r.ok ? r.data : []);
    });
  };
  const refresh = () => owner && open(owner);
  const people = type === 'student' ? students : staff;

  return (
    <>
      {view}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <FormField label={t('doc.vault.owner')}>
          <TextInput select value={type} onChange={(e) => { setType(e.target.value as 'student' | 'staff'); setOwner(null); setDocs([]); }} sx={{ minWidth: 150 }}>
            {canStudents && <MenuItem value="student">{t('doc.subject.student')}</MenuItem>}
            {canStaff && <MenuItem value="staff">{t('doc.subject.staff')}</MenuItem>}
          </TextInput>
        </FormField>
        {type === 'student' && (
          <FormField label={t('doc.class')}>
            <TextInput select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setOwner(null); start(async () => { const r = await classStudents(e.target.value); setStudents(r.ok ? r.data : []); }); }} sx={{ minWidth: 220 }}>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
        )}
        <FormField label={type === 'student' ? t('doc.student') : t('doc.staffMember')}>
          <TextInput select value={owner?.type === type ? owner.id : ''} onChange={(e) => { const p = people.find((x) => x.id === e.target.value); if (p) open({ type, id: p.id, name: p.name }); }} sx={{ minWidth: 260 }}>
            {people.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<UploadFile />} disabled={!owner} onClick={() => setUploading({})}>
          {t('doc.vault.upload')}
        </Button>
      </Box>

      {owner ? (
        docs.length === 0 && !pending ? (
          <EmptyState icon={<FolderOutlined />} title={t('doc.vault.empty', { name: owner.name })} />
        ) : (
          <DataTable
            testId="vault-docs"
            label={t('doc.vault.title')}
            rows={docs}
            rowId={(d) => String(d.id)}
            exportName="vault"
            columns={[
              { id: 'c0', header: t('doc.vault.title'), rowHeader: true, sort: (d) => d.title, cell: (d) => (<>{d.title} <Chip size="small" label={fileSize(d.sizeBytes)} sx={{ ml: 0.5 }} /></>) },
              { id: 'c1', header: t('doc.vault.category'), sort: (d) => d.category, cell: (d) => d.category },
              { id: 'c2', header: t('doc.vault.version'), sort: (d) => d.version, cell: (d) => `v${d.version}` },
              { id: 'c3', header: t('doc.vault.visibility'), sort: (d) => d.visibility, cell: (d) => t(d.visibility === 'owner' ? 'doc.vault.vis.owner' : 'doc.vault.vis.staff') },
              { id: 'c4', header: t('doc.vault.expires'), sort: (d) => d.expiresOn ?? '', cell: (d) => d.expiresOn ? formatDate(d.expiresOn, 'short', locale) : '–' },
              { id: 'c5', header: '', align: 'right', csv: false, cell: (d) => (<><Button size="small" href={docDownload.vault(d.id)}>
                                    {t('doc.vault.download')}
                                  </Button>
                                  <Button size="small" onClick={() => setUploading({ replaces: d })}>
                                    {t('doc.vault.newVersion')}
                                  </Button>
                                  <IconButton aria-label={t('doc.vault.archive')} disabled={pending} onClick={() => start(async () => { const r = await run(() => archiveVaultFile(d.id), t('hr.saved')); if (r.ok) refresh(); })}>
                                    <ArchiveOutlined />
                                  </IconButton></>) },
            ]}
          />
        )
      ) : (
        <EmptyState icon={<FolderOutlined />} title={t('doc.vault.pick')} />
      )}

      {expiring.length > 0 && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          {t('doc.vault.expiring')}: {expiring.map((d) => `${d.title} (${d.expiresOn ? formatDate(d.expiresOn, 'short', locale) : ''})`).join(', ')}
        </Alert>
      )}
      {uploading && owner && <UploadDialog owner={owner} replaces={uploading.replaces} onClose={(done) => { setUploading(null); if (done) refresh(); }} setError={setError} />}
    </>
  );
}

function UploadDialog({ owner, replaces, onClose, setError }: { owner: Owner; replaces?: VaultDocument; onClose: (done: boolean) => void; setError: (e: string | null) => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ title: replaces?.title ?? '', category: replaces?.category ?? '', visibility: replaces?.visibility ?? ('staff' as 'staff' | 'owner'), expiresOn: replaces?.expiresOn ?? '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (picked: File | null) => {
    setFile(picked);
    const p = picked ? vaultFileProblem(picked) : null;
    setProblem(p ? t(`doc.vault.err.${p}` as MessageKey) : null);
  };
  const category = f.category.trim().toLowerCase().replace(/\s+/g, '_');
  const valid = file && !problem && f.title.trim() && CATEGORY.test(category);
  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vault?${vaultQuery({ ownerType: owner.type, ownerId: owner.id, ...f, replacesId: replaces?.id })}`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        setError((Array.isArray(body.message) ? body.message[0] : body.message) ?? t('error.generic'));
        setBusy(false);
        return;
      }
      onClose(true);
    } catch {
      setError(t('error.generic'));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={() => !busy && onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{replaces ? t('doc.vault.newVersion') : t('doc.vault.upload')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Button component="label" variant="outlined" startIcon={<UploadFile />}>
            {file ? file.name : t('doc.vault.chooseFile')}
            <input hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </Button>
          {problem && <Alert severity="error">{problem}</Alert>}
          <FormField label={t('doc.vault.title')}>
            <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </FormField>
          <FormField label={t('doc.vault.category')}>
            <TextInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={!!f.category && !CATEGORY.test(category)} helperText={t('doc.vault.categoryHelp')} />
          </FormField>
          <FormField label={t('doc.vault.visibility')}>
            <TextInput select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as 'staff' | 'owner' })}>
              <MenuItem value="staff">{t('doc.vault.vis.staff')}</MenuItem>
              <MenuItem value="owner">{t('doc.vault.vis.owner')}</MenuItem>
            </TextInput>
          </FormField>
          <FormField label={t('doc.vault.expires')}>
            <TextInput type="date" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={busy}>
          {t('hr.cancel')}
        </Button>
        <Button variant="contained" disabled={busy || !valid} onClick={send}>
          {t('doc.vault.upload')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
