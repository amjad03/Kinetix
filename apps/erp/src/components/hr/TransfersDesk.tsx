'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelTransfer, recordTransfer } from '@/app/(dashboard)/hr/staff-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { Transfer, TransferOptions } from '@/lib/staff-changes';

const BLANK = { userId: '', toDepartmentId: '', toDesignationId: '', toCampusId: '', effectiveOn: '', reason: '' };
const TONE: Record<string, Tone> = { scheduled: 'warning', applied: 'success', cancelled: 'neutral' };

const place = (p: Transfer['from']) => [p.department, p.designation, p.campus].filter(Boolean).join(' · ') || '-';

/** Staff transfers: record a move with its effective date, and read the history. */
export function TransfersDesk({ transfers, options, staff }: { transfers: Transfer[]; options: TransferOptions; staff: { userId: string; fullName: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [f, setF] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  const choose = (label: string, value: string, key: 'toDepartmentId' | 'toDesignationId' | 'toCampusId', list: { id: string; name: string }[]) => (
    <FormField label={label}>
      <TextInput select value={value} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
        <MenuItem value="">{t('as.tr.keep')}</MenuItem>
        {list.map((x) => (
          <MenuItem key={x.id} value={x.id}>
            {x.name}
          </MenuItem>
        ))}
      </TextInput>
    </FormField>
  );
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('as.tr.new')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => recordTransfer(f), () => setF(BLANK));
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('as.tr.staff')} required>
            <TextInput select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required>
              <MenuItem value="">{t('as.tr.chooseStaff')}</MenuItem>
              {staff.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.fullName}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          {choose(t('as.tr.toDept'), f.toDepartmentId, 'toDepartmentId', options.departments)}
          {choose(t('as.tr.toDesig'), f.toDesignationId, 'toDesignationId', options.designations)}
          {choose(t('as.tr.toCampus'), f.toCampusId, 'toCampusId', options.campuses)}
          <FormField label={t('as.tr.effective')} required>
            <TextInput type="date" value={f.effectiveOn} onChange={(e) => setF({ ...f, effectiveOn: e.target.value })} required />
          </FormField>
          <FormField label={t('as.tr.reason')}>
            <TextInput value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          </FormField>
          <Box sx={{ alignSelf: 'end' }}>
            <Button type="submit" variant="contained" disabled={pending || !f.userId || !f.effectiveOn}>
              {t('as.tr.create')}
            </Button>
          </Box>
        </Box>
      </Paper>

      <SectionTitle flush>{t('as.tr.history')}</SectionTitle>
      {transfers.length === 0 ? (
        <Typography color="text.secondary">{t('as.tr.none')}</Typography>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="transfer-list">
            <TableHead>
              <TableRow>
                <TableCell>{t('as.tr.staff')}</TableCell>
                <TableCell>{t('as.tr.from')}</TableCell>
                <TableCell>{t('as.tr.to')}</TableCell>
                <TableCell>{t('as.tr.effective')}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.fullName}</TableCell>
                  <TableCell>{place(r.from)}</TableCell>
                  <TableCell>
                    {place(r.to)}
                    {r.reason && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {r.reason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(r.effectiveOn, 'dayMonth', locale)}</TableCell>
                  <TableCell>
                    <StatusPill tone={TONE[r.status]}>{t(`as.tr.status.${r.status}` as MessageKey)}</StatusPill>
                  </TableCell>
                  <TableCell align="right">
                    {r.status === 'scheduled' && (
                      <Button size="small" color="inherit" disabled={pending} onClick={() => run(() => cancelTransfer(r.id))}>
                        {t('as.tr.cancel')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
