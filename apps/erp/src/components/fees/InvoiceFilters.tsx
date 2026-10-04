'use client';

import Check from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useI18n } from '@/i18n/client';
import { INVOICE_FILTERS, type InvoiceFilter } from '@/lib/invoices';

/** Status chips and a class picker; both live in the URL. */
export function InvoiceFilters({ status, classId, classes }: { status: InvoiceFilter; classId: string; classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const { t } = useI18n();

  const set = (key: 'status' | 'class', value: string) => {
    const q = new URLSearchParams(params.toString());
    if (!value || (key === 'status' && value === 'due')) q.delete(key);
    else q.set(key, value);
    const s = q.toString();
    start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label={t('common.loading')} />}
      <Box role="group" aria-label={t('fees.filterStatus')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {INVOICE_FILTERS.map((f) => {
          const on = status === f;
          return (
            <Chip
              key={f}
              label={t(`fees.filter.${f}`)}
              variant={on ? 'filled' : 'outlined'}
              onClick={() => set('status', f)}
              icon={on ? <Check sx={{ fontSize: '18px !important' }} /> : undefined}
              sx={on ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '& .MuiChip-icon': { color: 'inherit' } } : undefined}
              aria-pressed={on}
              data-testid={`invoice-filter-${f}`}
            />
          );
        })}
      </Box>
      <Box sx={{ flex: 1 }} />
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="f-fee-class" shrink>
          {t('fees.class')}
        </InputLabel>
        <Select labelId="f-fee-class" label={t('fees.class')} notched displayEmpty value={classId} onChange={(e) => set('class', e.target.value)} data-testid="invoice-class">
          <MenuItem value="">{t('fees.allClasses')}</MenuItem>
          {classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
