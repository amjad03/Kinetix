'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useI18n } from '@/i18n/client';
import { INVOICE_FILTERS, type InvoiceFilter } from '@/lib/invoices';
import { cn } from '@/lib/utils';

import { Chip, FormControl, InputLabel, LinearProgress, MenuItem, Select } from '@/components/kx';
import { Check } from 'lucide-react';
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
    <div className="mb-4 flex flex-wrap items-end gap-2">
      {pending && <LinearProgress className="fixed top-0 left-0 right-0 z-[2000] h-[3px] rounded-none" aria-label={t('common.loading')} />}
      <div className="flex min-h-9 flex-wrap items-center gap-2" role="group" aria-label={t('fees.filterStatus')}>
        {INVOICE_FILTERS.map((f) => {
          const on = status === f;
          return (
            <Chip className={cn(on && 'bg-secondary text-secondary-foreground [&_svg]:text-inherit')}
              key={f}
              label={t(`fees.filter.${f}`)}
              variant={on ? 'filled' : 'outlined'}
              onClick={() => set('status', f)}
              icon={on ? <Check className="text-[18px_!important]" /> : undefined}
              aria-pressed={on}
              data-testid={`invoice-filter-${f}`}
            />
          );
        })}
      </div>
      <div className="flex-1" />
      <FormControl className="min-w-[200px]" size="small">
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
    </div>
  );
}
