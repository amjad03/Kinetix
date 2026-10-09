'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { createScheme, decideApplication, setSchemeActive } from '@/app/(dashboard)/scholarships/actions';
import { sendScholarship } from '@/app/(dashboard)/workflows/bound-actions';
import { SendForApproval } from '@/components/pathways-b/SendForApproval';
import { BOUND_FLOWS } from '@/lib/pathways-b';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { Application, Scheme } from '@/lib/finance';

export function ScholarshipsDesk({ schemes, applications, initialTab, flows }: { schemes: Scheme[]; applications: Application[]; initialTab: string; flows: Record<string, boolean> | null }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<'scheme' | { reject: Application } | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const value = (s: Scheme) => (s.kind === 'percent' ? `${s.value}%` : fmt.rupees(s.value));
  return (
    <>
      <Tabbed
        label={t('nav.scholarships')}
        initial={initialTab}
        tabs={[
          {
            id: 'applications',
            label: t('fin.sch.applications'),
            node: (
              <Grid
                testId="applications-table"
                empty={t('fin.sch.noApplications')}
                rows={applications}
                cols={[
                  { label: t('fin.col.student'), cell: (a) => `${a.fullName} (${a.rollNo})`, sort: (a) => a.fullName },
                  { label: t('fin.sch.scheme'), cell: (a) => a.scheme },
                  { label: t('fin.sch.income'), num: true, cell: (a) => (a.incomePaise === null ? '-' : fmt.rupees(a.incomePaise)), sort: (a) => a.incomePaise },
                  { label: t('fin.col.status'), cell: (a) => <Pill label={t(`fin.sch.status.${a.status}`)} warn={a.status === 'rejected'} />, sort: (a) => a.status },
                  { label: t('fin.sch.awarded'), num: true, cell: (a) => (a.awardedPaise ? fmt.rupees(a.awardedPaise) : '-'), sort: (a) => a.awardedPaise },
                  {
                    label: '',
                    cell: (a) =>
                      a.status === 'pending' && (
                        <>
                          <ActionButton label={t('fin.sch.approve')} run={() => decideApplication(a.id, true)} onDone={toast} />
                          <Button size="small" color="error" onClick={() => setDlg({ reject: a })}>{t('fin.sch.reject')}</Button>
                          <SendForApproval flow={BOUND_FLOWS[0]} flows={flows} sourceId={a.id} onSend={() => sendScholarship(a.id)} />
                        </>
                      ),
                  },
                ]}
              />
            ),
          },
          {
            id: 'schemes',
            label: t('fin.sch.schemes'),
            node: (
              <>
                <Bar>
                  <Button variant="contained" onClick={() => setDlg('scheme')} data-testid="new-scheme">{t('fin.sch.newScheme')}</Button>
                </Bar>
                <Grid
                  testId="schemes-table"
                  empty={t('fin.sch.noSchemes')}
                  rows={schemes}
                  cols={[
                    { label: t('fin.sch.scheme'), cell: (s) => s.name },
                    { label: t('fin.sch.discount'), num: true, cell: (s) => value(s), sort: (s) => s.value },
                    { label: t('fin.sch.minPct'), num: true, cell: (s) => (s.minPercentage === null ? '-' : `${s.minPercentage}%`) },
                    { label: t('fin.sch.maxIncome'), num: true, cell: (s) => (s.maxIncomePaise === null ? '-' : fmt.rupees(s.maxIncomePaise)) },
                    { label: t('fin.col.status'), cell: (s) => <Pill label={t(s.active ? 'fin.sch.open' : 'fin.sch.closed')} warn={!s.active} /> },
                    { label: '', cell: (s) => <ActionButton label={t(s.active ? 'fin.sch.close' : 'fin.sch.reopen')} run={() => setSchemeActive(s.id, !s.active)} onDone={toast} /> },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      {dlg === 'scheme' && (
        <FormDialog
          title={t('fin.sch.newScheme')}
          intro={t('fin.sch.schemeHint')}
          onSubmit={createScheme}
          onClose={done}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'kind', label: t('fin.sch.kind'), kind: 'select', required: true, init: 'percent', options: [{ value: 'percent', label: t('fin.sch.kind.percent') }, { value: 'fixed', label: t('fin.sch.kind.fixed') }] },
            { name: 'percent', label: t('fin.sch.percent'), kind: 'number' },
            { name: 'amount', label: t('fin.sch.amount'), kind: 'rupees' },
            { name: 'minPercentage', label: t('fin.sch.minPct'), kind: 'number' },
            { name: 'maxIncome', label: t('fin.sch.maxIncome'), kind: 'rupees' },
            { name: 'validUntil', label: t('fin.sch.validUntil'), kind: 'date' },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && <FormDialog title={t('fin.sch.reject')} submitLabel={t('fin.sch.reject')} onSubmit={(v) => decideApplication(dlg.reject.id, false, v)} onClose={done} fields={[{ name: 'note', label: t('ops.f.note') }]} />}
      {toastNode}
    </>
  );
}
