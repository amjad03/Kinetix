'use client';

import UploadFile from '@mui/icons-material/UploadFile';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { StatusPill } from '@/components/ui';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { importAttendance, markAttendance } from '@/app/(dashboard)/hr/actions';
import { TableFrame } from '@/components/DataTable';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { clockTime } from '@/lib/hr';
import type { AttendanceImportResult, StaffAttendanceRow, StaffAttendanceStatus } from '@/lib/hr-types';
import { useNotice } from './Common';

const STATUSES: StaffAttendanceStatus[] = ['present', 'absent', 'half_day', 'on_leave'];

export function AttendanceDesk({ date, today, timeZone, rows }: { date: string; today: string; timeZone: string; rows: StaffAttendanceRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [edits, setEdits] = useState<Record<string, StaffAttendanceStatus>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AttendanceImportResult | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = Object.keys(edits).length;

  const save = () =>
    start(async () => {
      const r = await run(() => markAttendance(date, Object.entries(edits).map(([userId, status]) => ({ userId, status }))), t('hr.saved'));
      if (r.ok) setEdits({});
    });

  const upload = (f: File) =>
    start(async () => {
      const r = await run(async () => importAttendance(await f.text()));
      if (r.ok) setResult(r.data);
      if (file.current) file.current.value = '';
    });

  return (
    <>
      {view}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField type="date" size="small" label={t('hr.att.date')} value={date} onChange={(e) => e.target.value && router.push(`/hr/attendance?date=${e.target.value}`)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }} />
        <Box sx={{ flex: 1 }} />
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="outlined" startIcon={<UploadFile />} onClick={() => file.current?.click()} disabled={pending}>
          {t('hr.att.import')}
        </Button>
        <Button variant="contained" onClick={save} disabled={pending || dirty === 0}>
          {t('hr.att.saveAll')}
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
        {t('hr.att.importHelp')}
      </Typography>
      {result && (
        <Alert severity={result.errors.length ? 'warning' : 'success'} onClose={() => setResult(null)} sx={{ mb: 2 }}>
          {t('hr.att.importDone', { n: result.imported })}
          {result.errors.slice(0, 8).map((e) => (
            <div key={`${e.line}-${e.error}`}>{t('hr.att.importError', { line: e.line, error: e.error })}</div>
          ))}
          {result.errors.length > 8 && <div>{t('hr.att.moreErrors', { n: result.errors.length - 8 })}</div>}
        </Alert>
      )}
      <TableFrame testId="staff-attendance">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('hr.att.employee')}</TableCell>
              <TableCell>{t('hr.att.status')}</TableCell>
              <TableCell>{t('hr.att.in')}</TableCell>
              <TableCell>{t('hr.att.out')}</TableCell>
              <TableCell>{t('hr.att.source')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell>
                  {r.fullName}
                  {r.employeeCode && (
                    <Typography variant="caption" color="text.secondary" component="span">
                      {' '}
                      · {r.employeeCode}
                    </Typography>
                  )}
                  {r.onLeave && <Box component="span" sx={{ ml: 1 }}><StatusPill tone="info">{t('hr.att.onLeave')}</StatusPill></Box>}
                </TableCell>
                <TableCell sx={{ minWidth: 170 }}>
                  <TextField select size="small" fullWidth value={edits[r.userId] ?? r.status ?? ''} onChange={(e) => setEdits({ ...edits, [r.userId]: e.target.value as StaffAttendanceStatus })} aria-label={`${t('hr.att.status')} ${r.fullName}`}>
                    <MenuItem value="" disabled>
                      {t('hr.att.unmarked')}
                    </MenuItem>
                    {STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {t(`hr.att.s.${s}` as MessageKey)}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{clockTime(r.checkInAt, timeZone)}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{clockTime(r.checkOutAt, timeZone)}</TableCell>
                <TableCell>{r.source ? t(`hr.att.src.${r.source}` as MessageKey) : '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}
