'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelTransfer, recordTransfer } from '@/app/(dashboard)/hr/staff-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { Transfer, TransferOptions } from '@/lib/staff-changes';

import { Alert, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('as.tr.new')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(3,1fr)] gap-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => recordTransfer(f), () => setF(BLANK));
          }}
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
          <div className="self-end">
            <Button type="submit" variant="contained" disabled={pending || !f.userId || !f.effectiveOn}>
              {t('as.tr.create')}
            </Button>
          </div>
        </form>
      </div>

      <SectionTitle flush>{t('as.tr.history')}</SectionTitle>
      {transfers.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('as.tr.none')}</p>
      ) : (
        <div className="rounded-[12px] border bg-card overflow-x-auto">
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
                      <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {r.reason}
                      </div>
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
        </div>
      )}
    </div>
  );
}
