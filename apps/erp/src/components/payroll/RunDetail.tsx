'use client';

import Download from '@mui/icons-material/Download';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { StatusPill } from '@/components/ui';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runAction } from '@/app/(dashboard)/payroll/actions';
import { TableFrame } from '@/components/DataTable';
import { pillTone, useNotice } from '@/components/hr/Common';
import { StatGrid, StatTile } from '@/components/StatTile';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { downloadUrl, RUN_TONE, runActions, type StatutoryKind } from '@/lib/hr';
import { formatRupees } from '@/lib/money';
import type { PayrollRunDetail } from '@/lib/hr-types';

const num = { fontVariantNumeric: 'tabular-nums' } as const;
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
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <StatusPill tone={pillTone(RUN_TONE[run.status])}>{t(`pay.status.${run.status}` as MessageKey)}</StatusPill>
        <Box sx={{ flex: 1 }} />
        {can.recompute && <Button variant="outlined" disabled={pending} onClick={() => go('recompute')}>{t('pay.recompute')}</Button>}
        {can.reopen && <Button variant="outlined" disabled={pending} onClick={() => setConfirm('reopen')}>{t('pay.reopen')}</Button>}
        {can.approve && <Button variant="contained" disabled={pending || run.payslips.length === 0} onClick={() => setConfirm('approve')}>{t('pay.approve')}</Button>}
        {can.lock && <Button variant="contained" disabled={pending} onClick={() => setConfirm('lock')}>{t('pay.lock')}</Button>}
      </Stack>
      <StatGrid min={140}>
        <StatTile label={t('pay.staff')} value={run.staffCount} />
        <StatTile label={t('pay.gross')} value={formatRupees(run.grossPaise)} />
        <StatTile label={t('pay.deductions')} value={formatRupees(run.deductionsPaise)} />
        <StatTile label={t('pay.net')} value={formatRupees(run.netPaise)} />
        <StatTile label={t('pay.cost')} value={formatRupees(run.employerCostPaise)} />
      </StatGrid>

      {can.exports && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 3 }}>
          <Button variant="outlined" startIcon={<Download />} href={downloadUrl.bank(run.id)}>{t('pay.dl.bank')}</Button>
          {statutory.map((k) => (
            <Button key={k} variant="outlined" startIcon={<Download />} href={downloadUrl.statutory(run.id, k)}>{t(`pay.dl.${k}` as MessageKey)}</Button>
          ))}
          <Button variant="outlined" startIcon={<Download />} href={downloadUrl.tally(run.id)}>{t('pay.dl.tally')}</Button>
        </Stack>
      )}

      {run.skipped.length > 0 && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          {t('pay.skipped')}: {run.skipped.map((s) => `${s.fullName} (${s.reason})`).join(', ')}
        </Alert>
      )}

      <Box sx={{ mt: 3 }}>
        <TableFrame testId="payslips">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('hr.staff.name')}</TableCell>
                <TableCell align="right">{t('pay.lop')}</TableCell>
                <TableCell align="right">{t('pay.gross')}</TableCell>
                <TableCell align="right">{t('pay.deductions')}</TableCell>
                <TableCell align="right">{t('pay.net')}</TableCell>
                <TableCell>{t('pay.deductionsList')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {run.payslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.user.fullName}
                    {p.user.employeeCode ? ` · ${p.user.employeeCode}` : ''}
                  </TableCell>
                  <TableCell align="right" sx={num}>{p.lopDays}</TableCell>
                  <TableCell align="right" sx={num}>{formatRupees(p.grossPaise)}</TableCell>
                  <TableCell align="right" sx={num}>{formatRupees(p.deductionsPaise)}</TableCell>
                  <TableCell align="right" sx={num}>{formatRupees(p.netPaise)}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{p.deductions.map((d) => `${d.code} ${formatRupees(d.amountPaise)}`).join(' · ') || '–'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" href={downloadUrl.payslip(p.id)}>{t('pay.dl.pdf')}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Box>

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
