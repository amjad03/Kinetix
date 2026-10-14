'use client';

import { useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { useI18n } from '@/i18n/client';
import { DeskDialog } from './DeskDialog';

/** Cancels an unpaid challan (with a reason); a paid one stays. */
export function CancelChallan({ id }: { id: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)}>
        {t('fx.cancelChallan')}
      </Button>
      {open && <DeskDialog title={t('fx.cancelChallan')} path={`/v1/fee-collect/challans/${id}/cancel`} fields={[{ name: 'reason', label: 'fx.col.reason', kind: 'textarea', required: true }]} done="fx.done.challanCancelled" onClose={() => setOpen(false)} />}
    </>
  );
}
