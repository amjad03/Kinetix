'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState, useTransition } from 'react';
import { DeskTable, Pill } from '@/components/campus/Desk';
import { previewMigration, rollbackBatch, runMigration, saveMigrationMapping, type MigrationPreview, type MigrationReport } from '@/app/(dashboard)/exams/university-actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export const MIGRATION_ENTITIES = ['programmes', 'faculty', 'students', 'marks', 'attendance', 'fees'] as const;
export interface SavedMapping {
  id: string;
  entity: string;
  name: string;
  mapping: Record<string, string>;
}
export interface Batch {
  id: string;
  entity: string;
  fileName: string;
  status: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  createdAt: string;
}

/** Linways / Excel data migration: read the headings, match columns (or use a saved mapping), check, import, reconcile, roll back. */
export function MigrationDesk({ mappings, batches }: { mappings: SavedMapping[]; batches: Batch[] }) {
  const { t } = useI18n();
  const [entity, setEntity] = useState<(typeof MIGRATION_ENTITIES)[number]>('students');
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [partial, setPartial] = useState(false);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    const f = fileRef.current?.files?.[0];
    if (f) fd.append('file', f);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return fd;
  };
  const read = () =>
    start(async () => {
      setReport(null);
      setMessage(null);
      const r = await previewMigration(entity, form());
      if (!r.ok) return setMessage({ tone: 'error', text: r.error });
      setPreview(r.data);
      setMapping(r.data.suggested);
    });
  const missing = preview ? preview.fields.filter((f) => f.required && !mapping[f.key]?.trim()).map((f) => f.label) : [];
  const go = (dryRun: boolean) =>
    start(async () => {
      setMessage(null);
      const r = await runMigration(entity, form({ mapping: JSON.stringify(mapping), dryRun: String(dryRun), partial: String(partial) }));
      if (!r.ok) return setMessage({ tone: 'error', text: r.error });
      setReport(r.data);
      setMessage({ tone: r.data.totals.error ? 'info' : 'success', text: t(r.data.committed ? 'uni.mig.done' : 'uni.mig.checked') });
    });
  const save = () =>
    start(async () => {
      const r = await saveMigrationMapping(entity, name, mapping);
      setMessage(r.ok ? { tone: 'success', text: t('uni.mig.mappingSaved') } : { tone: 'error', text: r.error });
    });
  const back = (id: string) => {
    if (!window.confirm(t('uni.mig.rollbackAsk'))) return;
    start(async () => {
      const r = await rollbackBatch(id);
      setMessage(r.ok ? { tone: 'success', text: t('uni.mig.rolledBack', { removed: r.data.removed, kept: r.data.kept }) } : { tone: 'error', text: r.error });
    });
  };

  const saved = mappings.filter((m) => m.entity === entity);
  return (
    <Stack spacing={3}>
      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField select size="small" label={t('uni.mig.entity')} value={entity} onChange={(e) => { setEntity(e.target.value as typeof entity); setPreview(null); setReport(null); }} sx={{ minWidth: 260 }}>
              {MIGRATION_ENTITIES.map((e) => (
                <MenuItem key={e} value={e}>{t(`uni.mig.entity.${e}` as MessageKey)}</MenuItem>
              ))}
            </TextField>
            <Button component="label" variant="outlined">
              {t('uni.mig.chooseFile')}
              <input ref={fileRef} hidden type="file" accept=".csv,.xlsx,text/csv" onChange={read} />
            </Button>
          </Stack>
          {message && <Alert severity={message.tone}>{message.text}</Alert>}
        </Stack>
      </Card>

      {preview && (
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>{t('uni.mig.mapTitle')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('uni.mig.constHint')}</Typography>
          {saved.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2, flexWrap: "wrap" }}>
              <Typography variant="body2">{t('uni.mig.savedMappings')}:</Typography>
              {saved.map((m) => (
                <Button key={m.id} size="small" variant="outlined" onClick={() => setMapping(m.mapping)}>{m.name}</Button>
              ))}
            </Stack>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {preview.fields.map((f) => {
              const v = mapping[f.key] ?? '';
              const isConst = v.startsWith('=');
              return (
                <Stack key={f.key} direction="row" spacing={1}>
                  <TextField select size="small" fullWidth required={f.required} label={f.label} value={isConst || preview.headers.includes(v) ? (isConst ? '__const' : v) : ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '__const' ? '=' : e.target.value })}>
                    <MenuItem value="">{t('uni.mig.notMapped')}</MenuItem>
                    {preview.headers.map((h) => (
                      <MenuItem key={h} value={h}>{h}</MenuItem>
                    ))}
                    <MenuItem value="__const">=…</MenuItem>
                  </TextField>
                  {isConst && <TextField size="small" value={v.slice(1)} onChange={(e) => setMapping({ ...mapping, [f.key]: `=${e.target.value}` })} sx={{ width: 140 }} />}
                </Stack>
              );
            })}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mt: 2 }}>
            <TextField size="small" label={t('uni.mig.mappingName')} value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="outlined" disabled={pending || !name.trim()} onClick={save}>{t('uni.mig.saveMapping')}</Button>
          </Stack>
          {missing.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>{t('uni.mig.missing', { fields: missing.join(', ') })}</Alert>}
          <FormControlLabel sx={{ display: 'block', mt: 1 }} control={<Checkbox checked={partial} onChange={(e) => setPartial(e.target.checked)} />} label={t('uni.mig.partial')} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="outlined" disabled={pending || missing.length > 0} onClick={() => go(true)}>{pending ? t('uni.mig.working') : t('uni.mig.dryRun')}</Button>
            <Button variant="contained" disabled={pending || missing.length > 0} onClick={() => go(false)}>{t('uni.mig.commit')}</Button>
          </Stack>
        </Card>
      )}

      {report && (
        <Card sx={{ p: 2.5 }}>
          <Alert severity={report.totals.error ? 'warning' : 'success'} sx={{ mb: 2 }}>{t('uni.mig.totals', report.totals)}</Alert>
          <DeskTable
            title={t('uni.mig.recon')}
            head={[t('uni.mig.what'), t('uni.mig.file'), t('uni.mig.stored'), t('uni.mig.match')]}
            rows={report.reconciliation.map((l) => [l.label, l.file, l.stored, <Pill key={l.label} tone={l.match ? 'success' : 'error'} label={t(l.match ? 'uni.mig.ok' : 'uni.mig.diff')} />])}
            testId="migration-recon"
          />
          {report.rows.some((r) => r.status === 'error') && (
            <DeskTable
              title={t('uni.mig.rowErrors')}
              head={[t('uni.mig.row'), t('uni.mig.what'), '']}
              rows={report.rows.filter((r) => r.status === 'error').map((r) => [r.row, r.message, r.detail ?? ''])}
              testId="migration-errors"
            />
          )}
        </Card>
      )}

      <DeskTable
        title={t('uni.mig.batches')}
        head={[t('uni.mig.file.name'), t('uni.mig.entity'), t('uni.mig.when'), t('uni.mig.match'), '']}
        rows={batches.map((b) => [
          b.fileName,
          t(`uni.mig.entity.${b.entity}` as MessageKey),
          b.createdAt.slice(0, 16).replace('T', ' '),
          <Pill key={b.id} tone={b.status === 'committed' ? 'success' : 'default'} label={t(`uni.mig.status.${b.status}` as MessageKey)} />,
          b.status === 'committed' ? <Button key={`r${b.id}`} size="small" color="error" disabled={pending} onClick={() => back(b.id)}>{t('uni.mig.rollback')}</Button> : '',
        ])}
        testId="migration-batches"
      />
    </Stack>
  );
}
