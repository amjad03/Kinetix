'use client';

import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { Bar, Grid } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { Voucher } from '@/lib/finance';

export function GlExport({ range, vouchers }: { range: { from: string; to: string } | null; vouchers: Voucher[] | null }) {
  const { t, fmt } = useI18n();
  const q = range ? `from=${range.from}&to=${range.to}` : '';
  const debit = (v: Voucher) => v.lines.reduce((s, l) => s + l.debitPaise, 0);
  return (
    <>
      <form method="get" action="/gl-export">
        <Bar>
          <TextField name="from" type="date" size="small" label={t('fin.gl.from')} defaultValue={range?.from ?? ''} required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField name="to" type="date" size="small" label={t('fin.gl.to')} defaultValue={range?.to ?? ''} required slotProps={{ inputLabel: { shrink: true } }} />
          <Button type="submit" variant="contained">{t('fin.gl.preview')}</Button>
          {range && <Button href={`/api/download?kind=gl-csv&${q}`} variant="outlined">{t('fin.gl.csv')}</Button>}
          {range && <Button href={`/api/download?kind=gl-tally&${q}`} variant="outlined">{t('fin.gl.tally')}</Button>}
        </Bar>
      </form>
      {vouchers && (
        <Grid
          testId="gl-table"
          empty={t('fin.gl.empty')}
          rows={vouchers}
          cols={[
            { label: t('fin.gl.date'), cell: (v) => v.date },
            { label: t('fin.gl.type'), cell: (v) => v.type },
            { label: t('fin.gl.number'), cell: (v) => v.number },
            { label: t('fin.gl.narration'), cell: (v) => v.narration },
            { label: t('fin.gl.amount'), num: true, cell: (v) => fmt.rupees(debit(v)), sort: debit },
          ]}
        />
      )}
    </>
  );
}
