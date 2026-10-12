'use client';
import { useState } from 'react';
import { holdFile, removeRetention, runRetention, setRetention } from '@/app/(dashboard)/governance/actions';
import { ActionButton, Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { DueFile, RetentionPolicy } from '@/lib/governance';

import { Button } from '@/components/kx';
/** How long each category of file is kept, the files that are past it, and a legal hold that keeps a file out. */
export function RetentionDesk({ policies, due }: { policies: RetentionPolicy[]; due: DueFile[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-4">
        {t('ret.hint')}
      </p>
      <Bar>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="ret-set">
          {t('ret.set')}
        </Button>
      </Bar>
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-2">
        {t('ret.policies')}
      </h2>
      <Grid
        testId="ret-policies"
        empty={t('ret.noPolicies')}
        rows={policies}
        cols={[
          { label: t('ret.col.category'), cell: (r) => r.category, sort: (r) => r.category },
          { label: t('ret.col.months'), cell: (r) => fmt.number(r.retainMonths), num: true, sort: (r) => r.retainMonths },
          { label: t('ret.col.note'), cell: (r) => r.note || '—' },
          { label: '', cell: (r) => <ActionButton label={t('ret.remove')} tone="error" run={() => removeRetention(r.category)} onDone={toast} /> },
        ]}
      />
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-2">
        {t('ret.due')}
      </h2>
      <Bar>
        <ActionButton label={t('ret.run', { n: due.length })} run={runRetention} onDone={toast} disabled={due.length === 0} />
      </Bar>
      <Grid
        testId="ret-due"
        empty={t('ret.noneDue')}
        rows={due}
        cols={[
          { label: t('ret.col.file'), cell: (r) => r.title, sort: (r) => r.title },
          { label: t('ret.col.category'), cell: (r) => r.category, sort: (r) => r.category },
          { label: t('ret.col.kept'), cell: (r) => fmt.dateTime(r.createdAt, undefined, false), sort: (r) => r.createdAt },
          { label: t('ret.col.months'), cell: (r) => fmt.number(r.retainMonths), num: true },
          { label: '', cell: (r) => <ActionButton label={t('ret.hold')} run={() => holdFile(r.id, true)} onDone={toast} /> },
        ]}
      />
      {open && (
        <FormDialog
          title={t('ret.set')}
          onSubmit={setRetention}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(t('ops.saved'));
          }}
          fields={[
            { name: 'category', label: t('ret.f.category'), required: true },
            { name: 'retainMonths', label: t('ret.f.months'), kind: 'number', required: true },
            { name: 'note', label: t('ret.f.note') },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
