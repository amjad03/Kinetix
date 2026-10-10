'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useState, useTransition } from 'react';
import { DeskTable, Pill } from '@/components/campus/Desk';
import { decideDoc, issueDoc } from '@/app/(dashboard)/exams/university-actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface DocRequest {
  id: string;
  title: string;
  studentName: string;
  rollNo: string;
  purpose: string;
  status: 'requested' | 'approved' | 'rejected' | 'issued';
  serialNo: string | null;
}

/** The exam office queue for transcripts, provisional certificates and grade cards: approve or reject, issue, download. */
export function DocRequestsDesk({ rows }: { rows: DocRequest[] }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? null));
    });
  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <DeskTable
        title={t('nav.docRequests')}
        head={[t('uni.doc.student'), t('uni.doc.kind'), t('uni.doc.purpose'), t('uni.doc.status'), t('uni.doc.serial'), '']}
        rows={rows.map((r) => [
          `${r.studentName} (${r.rollNo})`,
          r.title,
          r.purpose,
          <Pill key={r.id} tone={r.status === 'issued' ? 'success' : r.status === 'rejected' ? 'error' : 'warning'} label={t(`uni.doc.status.${r.status}` as MessageKey)} />,
          r.serialNo ?? '',
          <Stack key={`a${r.id}`} direction="row" spacing={1}>
            {r.status === 'requested' && (
              <>
                <Button size="small" disabled={pending} onClick={() => run(() => decideDoc(r.id, true))}>{t('uni.doc.approve')}</Button>
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => decideDoc(r.id, false))}>{t('uni.doc.reject')}</Button>
              </>
            )}
            {r.status === 'approved' && <Button size="small" variant="contained" disabled={pending} onClick={() => run(() => issueDoc(r.id))}>{t('uni.doc.issue')}</Button>}
            {r.status === 'issued' && <Button size="small" href={`/api/download?kind=academic-doc&id=${r.id}`}>{t('uni.doc.download')}</Button>}
          </Stack>,
        ])}
        testId="doc-requests"
      />
      {rows.length === 0 && <Alert severity="info">{t('uni.doc.empty')}</Alert>}
    </Stack>
  );
}
