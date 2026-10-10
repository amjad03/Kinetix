'use client';

import UploadFile from '@mui/icons-material/UploadFile';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { addMyEvidence, uploadMetricEvidence } from '@/app/(dashboard)/accreditation/actions';
import { FileFormDialog } from '@/components/pathways-b/common';
import { useI18n } from '@/i18n/client';

const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;

/** Upload a file (PDF, image or filled template) as evidence for a metric. */
export function MetricEvidenceUpload({ body, cycle, codes }: { body: string; cycle: string; codes: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" size="small" startIcon={<UploadFile />} onClick={() => setOpen(true)} data-testid="acc-upload">
        {t('acc.up.metric')}
      </Button>
      {open && (
        <FileFormDialog
          title={t('acc.up.metric')}
          allowed={TYPES}
          required
          submitLabel={t('acc.up.submit')}
          fields={[
            { name: 'code', label: t('acc.c.code'), kind: 'select', required: true, options: codes.map((c) => ({ value: c, label: c })) },
            { name: 'title', label: t('acc.c.title'), required: true },
            { name: 'note', label: t('acc.f.note') },
          ]}
          onSubmit={(v, file) => uploadMetricEvidence(body, cycle, v, file)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** A teacher adds evidence of their own work together with the certificate or paper. */
export function MyEvidenceUpload({ kinds }: { kinds: { value: string; label: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" size="small" startIcon={<UploadFile />} onClick={() => setOpen(true)} data-testid="acc-mine-upload" sx={{ mb: 2 }}>
        {t('acc.up.mine')}
      </Button>
      {open && (
        <FileFormDialog
          title={t('acc.up.mine')}
          allowed={TYPES.slice(0, 3)}
          submitLabel={t('acc.up.submit')}
          fields={[
            { name: 'kind', label: t('acc.c.kind'), kind: 'select', required: true, options: kinds },
            { name: 'title', label: t('acc.c.title'), required: true },
            { name: 'year', label: t('acc.c.year'), kind: 'number' },
            { name: 'venue', label: t('acc.c.venue') },
          ]}
          onSubmit={(v, file) => addMyEvidence(v, file)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
