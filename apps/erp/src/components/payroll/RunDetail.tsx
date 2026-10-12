'use client';
import { DataTable, StatusPill } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runAction } from '@/app/(dashboard)/payroll/actions';
import { pillTone, useNotice } from '@/components/hr/Common';
import { StatGrid, StatTile } from '@/components/StatTile';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { downloadUrl, RUN_TONE, runActions, type StatutoryKind } from '@/lib/hr';
import { formatRupees } from '@/lib/money';
import type { PayrollRunDetail } from '@/lib/hr-types';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@/components/kx';
import { Download } from 'lucide-react';
type Step = 'recompute' | 'approve' | 'lock' | 'reopen';

export function RunDetail({ run, canApprove }: { run: PayrollRunDetail; canApprove: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run: call, view } = useNotice();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Step | null>(null);
  const can = runActions(run.status, canApprove);

  const go = (step: Step) =>
    start(async () => {
      const r = await call(() => runAction(run.id, step, run.version), t('hr.saved'));
      setConfirm(null);
      if (r.ok) router.refresh();
    });
  const statutory: StatutoryKind[] = ['pf', 'esi', 'pt', 'tds'];

  return (
    <>
      {view}
      <div className="flex flex-row gap-2 flex-wrap items-center mb-6">
        <StatusPill tone={pillTone(RUN_TONE[run.status])}>{t(`pay.status.${run.status}` as MessageKey)}</StatusPill>
        <div className="flex-1" />
        {can.recompute && <Button variant="outlined" disabled={pending} onClick={() => go('recompute')}>{t('pay.recompute')}</Button>}
        {can.reopen && <Button variant="outlined" disabled={pending} onClick={() => setConfirm('reopen')}>{t('pay.reopen')}</Button>}
        {can.approve && <Button variant="contained" disabled={pending || run.payslips.length === 0} onClick={() => setConfirm('approve')}>{t('pay.approve')}</Button>}
        {can.lock && <Button variant="contained" disabled={pending} onClick={() => setConfirm('lock')}>{t('pay.lock')}</Button>}
      </div>
      <StatGrid min={140}>
        <StatTile label={t('pay.staff')} value={run.staffCount} />
        <StatTile label={t('pay.gross')} value={formatRupees(run.grossPaise)} />
        <StatTile label={t('pay.deductions')} value={formatRupees(run.deductionsPaise)} />
        <StatTile label={t('pay.net')} value={formatRupees(run.netPaise)} />
        <StatTile label={t('pay.cost')} value={formatRupees(run.employerCostPaise)} />
      </StatGrid>

      {can.exports && (
        <div className="flex flex-row gap-2 flex-wrap mt-6">
          <Button variant="outlined" startIcon={<Download />} href={downloadUrl.bank(run.id)}>{t('pay.dl.bank')}</Button>
          {statutory.map((k) => (
            <Button key={k} variant="outlined" startIcon={<Download />} href={downloadUrl.statutory(run.id, k)}>{t(`pay.dl.${k}` as MessageKey)}</Button>
          ))}
          <Button variant="outlined" startIcon={<Download />} href={downloadUrl.tally(run.id)}>{t('pay.dl.tally')}</Button>
        </div>
      )}

      {run.skipped.length > 0 && (
        <Alert className="mt-6" severity="warning">
          {t('pay.skipped')}: {run.skipped.map((s) => `${s.fullName} (${s.reason})`).join(', ')}
        </Alert>
      )}

      <div className="mt-6">
        <DataTable
          testId="payslips"
          label={t('nav.payslips')}
          rows={run.payslips}
          rowId={(p) => String(p.id)}
          exportName="run-payslips"
          columns={[
            { id: 'c0', header: t('hr.staff.name'), rowHeader: true, sort: (p) => p.user.fullName, cell: (p) => `${p.user.fullName} ${p.user.employeeCode ? ` · ${p.user.employeeCode}` : ''}` },
            { id: 'c1', header: t('pay.lop'), align: 'right', sort: (p) => p.lopDays, cell: (p) => p.lopDays },
            { id: 'c2', header: t('pay.gross'), align: 'right', sort: (p) => p.grossPaise, cell: (p) => formatRupees(p.grossPaise) },
            { id: 'c3', header: t('pay.deductions'), align: 'right', sort: (p) => p.deductionsPaise, cell: (p) => formatRupees(p.deductionsPaise) },
            { id: 'c4', header: t('pay.net'), align: 'right', sort: (p) => p.netPaise, cell: (p) => formatRupees(p.netPaise) },
            { id: 'c5', header: t('pay.deductionsList'), sort: (p) => p.deductions.map((d) => `${d.code} ${formatRupees(d.amountPaise)}`).join(' · ') || '–', cell: (p) => p.deductions.map((d) => `${d.code} ${formatRupees(d.amountPaise)}`).join(' · ') || '–' },
            { id: 'c6', header: '', align: 'right', csv: false, cell: (p) => (<><Button size="small" href={downloadUrl.payslip(p.id)}>{t('pay.dl.pdf')}</Button></>) },
          ]}
        />
      </div>

      {confirm && (
        <Dialog open onClose={() => setConfirm(null)}>
          <DialogTitle>{t(`pay.confirm.${confirm}.title` as MessageKey)}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t(`pay.confirm.${confirm}.body` as MessageKey)}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirm(null)}>{t('hr.cancel')}</Button>
            <Button variant="contained" disabled={pending} onClick={() => go(confirm)}>
              {t(`pay.${confirm}` as MessageKey)}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
