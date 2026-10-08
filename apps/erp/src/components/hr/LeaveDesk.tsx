'use client';

import Add from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addLeaveType, decideLeave, getBalances } from '@/app/(dashboard)/hr/actions';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import { LEAVE_TONE } from '@/lib/hr';
import type { Holiday, LeaveBalance, LeaveRequest, LeaveType, StaffSummary } from '@/lib/hr-types';
import { pillTone, useNotice } from './Common';

type Tab_ = 'requests' | 'balances' | 'types' | 'holidays';

export function LeaveDesk({ requests, types, holidays, staff }: { requests: LeaveRequest[]; types: LeaveType[]; holidays: Holiday[]; staff: StaffSummary[] }) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab_>('requests');
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const [deciding, setDeciding] = useState<{ r: LeaveRequest; decision: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [who, setWho] = useState('');
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [adding, setAdding] = useState(false);
  const open = requests.filter((r) => r.status === 'pending').length;
  const range = (r: LeaveRequest) => (r.fromDate === r.toDate ? formatDate(r.fromDate, 'short', locale) : `${formatDate(r.fromDate, 'short', locale)} – ${formatDate(r.toDate, 'short', locale)}`);

  return (
    <>
      {view}
      <Tabs value={tab} onChange={(_, v: Tab_) => setTab(v)} aria-label={t('hr.tab.leave')} variant="scrollable" scrollButtons={false} sx={{ mb: 2 }}>
        <Tab value="requests" label={t('hr.leave.tab.requests', { n: open })} />
        <Tab value="balances" label={t('hr.leave.tab.balances')} />
        <Tab value="types" label={t('hr.leave.tab.types')} />
        <Tab value="holidays" label={t('hr.leave.tab.holidays')} />
      </Tabs>

      {tab === 'requests' &&
        (requests.length === 0 ? (
          <EmptyState icon={<Add />} title={t('hr.leave.none')} />
        ) : (
          <DataTable
            testId="leave-requests"
            label={t('hr.leave.applicant')}
            rows={requests}
            rowId={(r) => String(r.id)}
            exportName="leave-requests"
            columns={[
              { id: 'c0', header: t('hr.leave.applicant'), rowHeader: true, sort: (r) => r.user.fullName, cell: (r) => r.user.fullName },
              { id: 'c1', header: t('hr.leave.type'), sort: (r) => r.leaveType.name, cell: (r) => r.leaveType.name },
              { id: 'c2', header: t('hr.leave.dates'), sort: (r) => range(r), cell: (r) => range(r) },
              { id: 'c3', header: t('hr.leave.days'), align: 'right', sort: (r) => r.days, cell: (r) => r.days },
              { id: 'c4', header: t('hr.leave.reason'), sort: (r) => r.reason || '–', cell: (r) => r.reason || '–' },
              { id: 'c5', header: t('hr.f.status'), sort: (r) => r.status, cell: (r) => (<><StatusPill tone={pillTone(LEAVE_TONE[r.status])}>{t(`hr.leave.status.${r.status}` as MessageKey)}</StatusPill></>) },
              { id: 'c6', header: '', align: 'right', csv: false, cell: (r) => (<>{r.status === 'pending' && (
                                    <>
                                      <Button size="small" onClick={() => { setNote(''); setDeciding({ r, decision: 'reject' }); }}>
                                        {t('hr.leave.reject')}
                                      </Button>
                                      <Button size="small" variant="contained" onClick={() => { setNote(''); setDeciding({ r, decision: 'approve' }); }}>
                                        {t('hr.leave.approve')}
                                      </Button>
                                    </>
                                  )}</>) },
            ]}
          />
        ))}

      {tab === 'balances' && (
        <>
          <FormField label={t('hr.leave.pickStaff')}>
            <TextInput select value={who} onChange={(e) => { setWho(e.target.value); setBalances(null); start(async () => { const r = await run(() => getBalances(e.target.value)); if (r.ok) setBalances(r.data); }); }} sx={{ minWidth: 260, mb: 2 }}>
              {staff.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.fullName}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          {balances && (
            <DataTable
              testId="leave-balances"
              label={t('hr.leave.type')}
              rows={balances}
              rowId={(b) => String(b.leaveType.id)}
              columns={[
                { id: 'c0', header: t('hr.leave.type'), rowHeader: true, sort: (b) => b.leaveType.name, cell: (b) => b.leaveType.name },
                { id: 'c1', header: t('hr.leave.opening'), align: 'right', sort: (b) => b.opening, cell: (b) => b.opening },
                { id: 'c2', header: t('hr.leave.accrued'), align: 'right', sort: (b) => b.accrued, cell: (b) => b.accrued },
                { id: 'c3', header: t('hr.leave.used'), align: 'right', sort: (b) => b.used, cell: (b) => b.used },
                { id: 'c4', header: t('hr.leave.pending'), align: 'right', sort: (b) => b.pending, cell: (b) => b.pending },
                { id: 'c5', header: t('hr.leave.available'), align: 'right', sort: (b) => b.leaveType.paid ? b.available : t('hr.leave.unlimited'), cell: (b) => b.leaveType.paid ? b.available : t('hr.leave.unlimited') },
              ]}
            />
          )}
          {pending && !balances && <Typography variant="body2">{t('hr.loading')}</Typography>}
        </>
      )}

      {tab === 'types' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Button variant="outlined" startIcon={<Add />} onClick={() => setAdding(true)}>
              {t('hr.leave.addType')}
            </Button>
          </Box>
          <DataTable
            testId="leave-types"
            label={t('hr.leave.name')}
            rows={types}
            rowId={(x) => String(x.id)}
            exportName="leave-types"
            columns={[
              { id: 'c0', header: t('hr.leave.code'), rowHeader: true, sort: (x) => x.code, cell: (x) => x.code },
              { id: 'c1', header: t('hr.leave.name'), sort: (x) => x.name, cell: (x) => x.name },
              { id: 'c2', header: t('hr.leave.paid'), sort: (x) => x.paid ? t('hr.yes') : t('hr.no'), cell: (x) => x.paid ? t('hr.yes') : t('hr.no') },
              { id: 'c3', header: t('hr.leave.annual'), align: 'right', sort: (x) => x.annualDays, cell: (x) => x.annualDays },
              { id: 'c4', header: t('hr.leave.accrual'), sort: (x) => t(`hr.leave.${x.accrual}` as MessageKey), cell: (x) => t(`hr.leave.${x.accrual}` as MessageKey) },
              { id: 'c5', header: t('hr.leave.carry'), align: 'right', sort: (x) => x.carryForwardMax, cell: (x) => x.carryForwardMax },
            ]}
          />
        </>
      )}

      {tab === 'holidays' &&
        (holidays.length === 0 ? (
          <EmptyState icon={<Add />} title={t('hr.leave.noHolidays')}>
            {t('hr.leave.holidaysHelp')}
          </EmptyState>
        ) : (
          <DataTable
            testId="holidays"
            label={t('hr.leave.dates')}
            rows={holidays}
            rowId={(h) => String(h.date)}
            columns={[
              { id: 'c0', header: t('hr.leave.dates'), rowHeader: true, sort: (h) => formatDate(h.date, 'short', locale), cell: (h) => formatDate(h.date, 'short', locale) },
              { id: 'c1', header: t('hr.leave.name'), sort: (h) => h.title, cell: (h) => h.title },
            ]}
          />
        ))}

      {deciding && (
        <Dialog open onClose={() => setDeciding(null)} fullWidth maxWidth="xs">
          <DialogTitle>{t(deciding.decision === 'approve' ? 'hr.leave.approveTitle' : 'hr.leave.rejectTitle', { name: deciding.r.user.fullName })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {deciding.r.leaveType.name} · {range(deciding.r)} · {deciding.r.days}
            </Typography>
            <FormField label={t('hr.leave.note')}>
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} />
            </FormField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeciding(null)}>{t('hr.cancel')}</Button>
            <Button
              variant="contained"
              color={deciding.decision === 'approve' ? 'primary' : 'error'}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await run(() => decideLeave(deciding.r.id, deciding.decision, note), t('hr.saved'));
                  if (r.ok) setDeciding(null);
                })
              }
            >
              {t(deciding.decision === 'approve' ? 'hr.leave.approve' : 'hr.leave.reject')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {adding && <TypeDialog onClose={() => setAdding(false)} run={run} />}
    </>
  );
}

function TypeDialog({ onClose, run }: { onClose: () => void; run: ReturnType<typeof useNotice>['run'] }) {
  const { t } = useI18n();
  const [f, setF] = useState({ code: '', name: '', paid: true, annualDays: '12', accrual: 'monthly' as 'yearly' | 'monthly', carryForwardMax: '0' });
  const [pending, start] = useTransition();
  const days = (s: string) => (/^\d{1,3}(\.5)?$/.test(s) ? Number(s) : null);
  const valid = f.code.trim() && f.name.trim() && days(f.annualDays) !== null && days(f.carryForwardMax) !== null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('hr.leave.addType')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormField label={t('hr.leave.code')}>
            <TextInput value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          </FormField>
          <FormField label={t('hr.leave.name')}>
            <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </FormField>
          <FormControlLabel control={<Checkbox checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />} label={t('hr.leave.paid')} />
          <FormField label={t('hr.leave.annual')}>
            <TextInput value={f.annualDays} onChange={(e) => setF({ ...f, annualDays: e.target.value })} />
          </FormField>
          <FormField label={t('hr.leave.accrual')}>
            <TextInput select value={f.accrual} onChange={(e) => setF({ ...f, accrual: e.target.value as 'yearly' | 'monthly' })}>
              <MenuItem value="yearly">{t('hr.leave.yearly')}</MenuItem>
              <MenuItem value="monthly">{t('hr.leave.monthly')}</MenuItem>
            </TextInput>
          </FormField>
          <FormField label={t('hr.leave.carry')}>
            <TextInput value={f.carryForwardMax} onChange={(e) => setF({ ...f, carryForwardMax: e.target.value })} />
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('hr.cancel')}</Button>
        <Button
          variant="contained"
          disabled={pending || !valid}
          onClick={() =>
            start(async () => {
              const r = await run(() => addLeaveType({ ...f, annualDays: days(f.annualDays)!, carryForwardMax: days(f.carryForwardMax)! }), t('hr.saved'));
              if (r.ok) onClose();
            })
          }
        >
          {t('hr.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
