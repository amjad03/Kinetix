'use client';
import { useState } from 'react';
import { giveDelegation, revokeDelegation } from '@/app/(dashboard)/delegations/actions';
import { ActionButton, Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { delegationState, type DelegationRow } from '@/lib/dpdp';

import { Button } from '@/components/kx';
const TONE = { active: 'success', upcoming: 'neutral', ended: 'neutral', revoked: 'warning' } as const;

/** Approvals I delegated and approvals delegated to me, with the form to hand mine to a colleague. */
export function DelegationDesk({ rows, colleagues, today }: { rows: DelegationRow[]; colleagues: { id: string; fullName: string }[]; today: string }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const given = rows.filter((r) => r.mine);
  const received = rows.filter((r) => !r.mine);

  const table = (list: DelegationRow[], testId: string, withRevoke: boolean) => (
    <Grid
      testId={testId}
      empty={t('dg.empty')}
      rows={list}
      cols={[
        { label: t('dg.col.who'), cell: (r) => (withRevoke ? r.delegateName : r.delegatorName), sort: (r) => (withRevoke ? r.delegateName : r.delegatorName) },
        { label: t('dg.col.scope'), cell: (r) => t(`dg.scope.${r.scope}` as MessageKey) },
        { label: t('dg.col.dates'), cell: (r) => `${r.startsOn} – ${r.endsOn}`, sort: (r) => r.startsOn },
        { label: t('dg.col.reason'), cell: (r) => r.reason || '—' },
        { label: t('dg.col.state'), cell: (r) => <StatusPill tone={TONE[delegationState(r, today)]}>{t(`dg.st.${delegationState(r, today)}` as MessageKey)}</StatusPill>, sort: (r) => delegationState(r, today) },
        {
          label: '',
          cell: (r) => (withRevoke && !r.revokedAt && r.endsOn >= today ? <ActionButton label={t('dg.revoke')} tone="error" run={() => revokeDelegation(r.id)} onDone={toast} /> : null),
        },
      ]}
    />
  );

  return (
    <>
      <Bar>
        <Button variant="contained" onClick={() => setOpen(true)} data-testid="dg-give">
          {t('dg.give')}
        </Button>
      </Bar>
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mb-2">
        {t('dg.given')}
      </h2>
      {table(given, 'dg-given', true)}
      <h2 className="text-base leading-6 font-medium tracking-[0.1px] mt-6 mb-2">
        {t('dg.received')}
      </h2>
      {table(received, 'dg-received', false)}
      {open && (
        <FormDialog
          title={t('dg.give')}
          onSubmit={giveDelegation}
          onClose={(m) => {
            setOpen(false);
            if (m) toast(t('dg.created'));
          }}
          fields={[
            { name: 'delegateId', label: t('dg.f.delegate'), kind: 'select', required: true, options: colleagues.map((c) => ({ value: c.id, label: c.fullName })) },
            { name: 'scope', label: t('dg.f.scope'), kind: 'select', init: 'all', options: (['all', 'workflows', 'leave'] as const).map((s) => ({ value: s, label: t(`dg.scope.${s}` as MessageKey) })) },
            { name: 'startsOn', label: t('dg.f.starts'), kind: 'date', required: true, init: today },
            { name: 'endsOn', label: t('dg.f.ends'), kind: 'date', required: true },
            { name: 'reason', label: t('dg.f.reason') },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
