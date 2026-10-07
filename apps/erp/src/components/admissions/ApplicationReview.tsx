'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { enrollApplicant, recordApplicationFee, reviewDocument, setApplicationStatus } from '@/app/(dashboard)/admissions/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { APPLICATION_REASON_REQUIRED, type ApplicationDetail } from '@/lib/admissions';
import { formatRupees, PAY_METHODS, type CounterMethod } from '@/lib/money';
import { ReasonDialog } from './ReasonDialog';

type Dialog = { kind: 'status'; status: string } | { kind: 'reject-doc'; docId: string } | { kind: 'waive' } | null;

/** The reviewer's side of an application: move it along, check documents, take the fee, enrol. */
export function ApplicationReview({ app, classes, canWaive }: { app: ApplicationDetail; classes: { id: string; name: string; term: number }[]; canWaive: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<CounterMethod>('cash');
  const [reference, setReference] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? null);
    });
  const moves = app.allowedStatuses.filter((s) => s !== 'enrolled');
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('adm.review.actions')}</SectionTitle>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {moves.map((s) => (
            <Button key={s} size="small" variant="outlined" color={s === 'rejected' || s === 'withdrawn' || s === 'ineligible' ? 'error' : 'primary'} disabled={pending} onClick={() => (APPLICATION_REASON_REQUIRED.includes(s) ? setDialog({ kind: 'status', status: s }) : run(() => setApplicationStatus(app.id, s)))}>
              {t(`adm.moveTo.${s}` as MessageKey)}
            </Button>
          ))}
          {moves.length === 0 && app.status !== 'accepted' && (
            <Typography variant="body2" color="text.secondary">
              {t('adm.review.noMoves')}
            </Typography>
          )}
        </Stack>
        {app.status === 'accepted' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('adm.review.enrol')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
              <TextField select size="small" label={t('adm.review.class')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">{t('adm.review.autoClass')}</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" disabled={pending} onClick={() => run(() => enrollApplicant(app.id, sectionId || undefined))}>
                {t('adm.review.enrolNow')}
              </Button>
            </Stack>
          </Box>
        )}
        {app.studentId && (
          <Box sx={{ mt: 2 }}>
            <Link component={NextLink} href={`/students/${app.studentId}`}>
              {t('adm.review.openStudent')}
            </Link>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('adm.review.documents')}</SectionTitle>
        <Stack spacing={1.5}>
          {app.cycle.documents.map((spec) => {
            const d = app.documents.find((x) => x.docKey === spec.key);
            return (
              <Box key={spec.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {spec.label}
                    {spec.required ? ' *' : ''}
                  </Typography>
                  {d ? (
                    <Link href={`/admissions/applications/${app.id}/documents/${d.id}`} target="_blank" rel="noreferrer" variant="body2">
                      {d.fileName}
                    </Link>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('adm.review.notUploaded')}
                    </Typography>
                  )}
                  {d?.reviewNote && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      {d.reviewNote}
                    </Typography>
                  )}
                </Box>
                {d && <Chip size="small" color={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'error' : 'default'} label={t(`adm.doc.${d.status}` as MessageKey)} />}
                {d && d.status !== 'verified' && (
                  <Button size="small" disabled={pending} onClick={() => run(() => reviewDocument(app.id, d.id, 'verified'))}>
                    {t('adm.doc.verify')}
                  </Button>
                )}
                {d && d.status !== 'rejected' && (
                  <Button size="small" color="error" disabled={pending} onClick={() => setDialog({ kind: 'reject-doc', docId: d.id })}>
                    {t('adm.doc.reject')}
                  </Button>
                )}
              </Box>
            );
          })}
          {app.cycle.documents.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('adm.review.noDocuments')}
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('adm.review.fee')}</SectionTitle>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {formatRupees(app.cycle.applicationFeePaise)} · {t(`adm.fee.${app.feeStatus}` as MessageKey)}
        </Typography>
        {app.payments
          .filter((p) => p.status === 'paid')
          .map((p) => (
            <Typography key={p.id} variant="caption" color="text.secondary" component="div">
              {p.receiptNo} · {p.method}
              {p.reference ? ` · ${p.reference}` : ''}
            </Typography>
          ))}
        {app.feeStatus === 'pending' && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
            <TextField select size="small" label={t('adm.fee.method')} value={method} onChange={(e) => setMethod(e.target.value as CounterMethod)} sx={{ minWidth: 140 }}>
              {PAY_METHODS.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={t('adm.fee.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
            <Button variant="contained" size="small" disabled={pending} onClick={() => run(() => recordApplicationFee(app.id, { kind: 'counter', method, reference }))}>
              {t('adm.fee.record')}
            </Button>
            {canWaive && (
              <Button size="small" disabled={pending} onClick={() => setDialog({ kind: 'waive' })}>
                {t('adm.fee.waive')}
              </Button>
            )}
          </Stack>
        )}
      </Paper>

      {dialog?.kind === 'status' && (
        <ReasonDialog
          title={t(`adm.moveTo.${dialog.status}` as MessageKey)}
          help={t('adm.review.reasonHelp')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => setApplicationStatus(app.id, dialog.status, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'reject-doc' && (
        <ReasonDialog
          title={t('adm.doc.reject')}
          label={t('adm.doc.whatsWrong')}
          required
          confirm={t('adm.doc.reject')}
          onSubmit={(note) => reviewDocument(app.id, dialog.docId, 'rejected', note)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'waive' && (
        <ReasonDialog
          title={t('adm.fee.waive')}
          label={t('adm.field.reason')}
          required
          confirm={t('adm.fee.waive')}
          onSubmit={(reason) => recordApplicationFee(app.id, { kind: 'waive', reason })}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
    </Stack>
  );
}
