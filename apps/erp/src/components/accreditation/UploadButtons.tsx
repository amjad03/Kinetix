'use client';
import { useState } from 'react';
import { addMyEvidence } from '@/app/(dashboard)/accreditation/actions';
import { FileFormDialog } from '@/components/pathways-b/common';
import { useI18n } from '@/i18n/client';

import { Button } from '@/components/kx';
import { FileUp as UploadFile } from 'lucide-react';
const TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

/** A teacher adds evidence of their own work together with the certificate or paper. */
export function MyEvidenceUpload({ kinds }: { kinds: { value: string; label: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="mb-4" variant="outlined" size="small" startIcon={<UploadFile />} onClick={() => setOpen(true)} data-testid="acc-mine-upload">
        {t('acc.up.mine')}
      </Button>
      {open && (
        <FileFormDialog
          title={t('acc.up.mine')}
          allowed={TYPES}
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
