'use client';

import Add from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addLeaveType, decideLeave, getBalances } from '@/app/(dashboard)/hr/actions';
import { TableFrame } from '@/components/DataTable';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import { LEAVE_TONE } from '@/lib/hr';
import type { Holiday, LeaveBalance, LeaveRequest, LeaveType, StaffSummary } from '@/lib/hr-types';
import { useNotice } from './Common';

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
          <TableFrame testId="leave-requests">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('hr.leave.applicant')}</TableCell>
                  <TableCell>{t('hr.leave.type')}</TableCell>
                  <TableCell>{t('hr.leave.dates')}</TableCell>
                  <TableCell align="right">{t('hr.leave.days')}</TableCell>
                  <TableCell>{t('hr.leave.reason')}</TableCell>
                  <TableCell>{t('hr.f.status')}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.user.fullName}</TableCell>
                    <TableCell>{r.leaveType.name}</TableCell>
                    <TableCell>{range(r)}</TableCell>
                    <TableCell align="right">{r.days}</TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>{r.reason || '–'}</TableCell>
                    <TableCell>
                      <Chip size="small" color={LEAVE_TONE[r.status]} label={t(`hr.leave.status.${r.status}` as MessageKey)} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'pending' && (
                        <>
                          <Button size="small" onClick={() => { setNote(''); setDeciding({ r, decision: 'reject' }); }}>
                            {t('hr.leave.reject')}
                          </Button>
                          <Button size="small" variant="contained" onClick={() => { setNote(''); setDeciding({ r, decision: 'approve' }); }}>
                            {t('hr.leave.approve')}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        ))}

      {tab === 'balances' && (
        <>
          <TextField select size="small" label={t('hr.leave.pickStaff')} value={who} onChange={(e) => { setWho(e.target.value); setBalances(null); start(async () => { const r = await run(() => getBalances(e.target.value)); if (r.ok) setBalances(r.data); }); }} sx={{ minWidth: 260, mb: 2 }}>
            {staff.map((s) => (
              <MenuItem key={s.userId} value={s.userId}>
                {s.fullName}
              </MenuItem>
            ))}
          </TextField>
          {balances && (
            <TableFrame testId="leave-balances">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('hr.leave.type')}</TableCell>
                    {(['opening', 'accrued', 'used', 'pending', 'available'] as const).map((k) => (
                      <TableCell key={k} align="right">
                        {t(`hr.leave.${k}` as MessageKey)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {balances.map((b) => (
                    <TableRow key={b.leaveType.id}>
                      <TableCell>{b.leaveType.name}</TableCell>
                      <TableCell align="right">{b.opening}</TableCell>
                      <TableCell align="right">{b.accrued}</TableCell>
                      <TableCell align="right">{b.used}</TableCell>
                      <TableCell align="right">{b.pending}</TableCell>
                      <TableCell align="right">{b.leaveType.paid ? b.available : t('hr.leave.unlimited')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
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
          <TableFrame testId="leave-types">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('hr.leave.code')}</TableCell>
                  <TableCell>{t('hr.leave.name')}</TableCell>
                  <TableCell>{t('hr.leave.paid')}</TableCell>
                  <TableCell align="right">{t('hr.leave.annual')}</TableCell>
                  <TableCell>{t('hr.leave.accrual')}</TableCell>
                  <TableCell align="right">{t('hr.leave.carry')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {types.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{x.code}</TableCell>
                    <TableCell>{x.name}</TableCell>
                    <TableCell>{x.paid ? t('hr.yes') : t('hr.no')}</TableCell>
                    <TableCell align="right">{x.annualDays}</TableCell>
                    <TableCell>{t(`hr.leave.${x.accrual}` as MessageKey)}</TableCell>
                    <TableCell align="right">{x.carryForwardMax}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}

      {tab === 'holidays' &&
        (holidays.length === 0 ? (
          <EmptyState icon={<Add />} title={t('hr.leave.noHolidays')}>
            {t('hr.leave.holidaysHelp')}
          </EmptyState>
        ) : (
          <TableFrame testId="holidays">
            <Table size="small">
              <TableBody>
                {holidays.map((h) => (
                  <TableRow key={h.date}>
                    <TableCell sx={{ width: 200 }}>{formatDate(h.date, 'short', locale)}</TableCell>
                    <TableCell>{h.title}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        ))}

      {deciding && (
        <Dialog open onClose={() => setDeciding(null)} fullWidth maxWidth="xs">
          <DialogTitle>{t(deciding.decision === 'approve' ? 'hr.leave.approveTitle' : 'hr.leave.rejectTitle', { name: deciding.r.user.fullName })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {deciding.r.leaveType.name} · {range(deciding.r)} · {deciding.r.days}
            </Typography>
            <TextField label={t('hr.leave.note')} value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} />
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
          <TextField size="small" label={t('hr.leave.code')} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <TextField size="small" label={t('hr.leave.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />} label={t('hr.leave.paid')} />
          <TextField size="small" label={t('hr.leave.annual')} value={f.annualDays} onChange={(e) => setF({ ...f, annualDays: e.target.value })} />
          <TextField select size="small" label={t('hr.leave.accrual')} value={f.accrual} onChange={(e) => setF({ ...f, accrual: e.target.value as 'yearly' | 'monthly' })}>
            <MenuItem value="yearly">{t('hr.leave.yearly')}</MenuItem>
            <MenuItem value="monthly">{t('hr.leave.monthly')}</MenuItem>
          </TextField>
          <TextField size="small" label={t('hr.leave.carry')} value={f.carryForwardMax} onChange={(e) => setF({ ...f, carryForwardMax: e.target.value })} />
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
