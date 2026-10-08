'use client';

import Button from '@mui/material/Button';
import { DataTable } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { downloadUrl } from '@/lib/hr';
import type { Payslip } from '@/lib/hr-types';

/** The signed-in person's payslips: sortable by month and amount, with the PDF a click away. */
export function MyPayslipsTable({ rows }: { rows: Payslip[] }) {
  const { t, fmt } = useI18n();
  return (
    <DataTable
      testId="my-payslips"
      label={t('nav.payslips')}
      rows={rows}
      rowId={(p) => p.id}
      exportName="my-payslips"
      initialSort={{ id: 'month', dir: 'desc' }}
      columns={[
        { id: 'month', header: t('pay.month'), rowHeader: true, sort: (p) => p.month, csv: (p) => p.month, cell: (p) => fmt.month(`${p.month}-01`) },
        { id: 'gross', header: t('pay.gross'), align: 'right', sort: (p) => p.grossPaise / 100, cell: (p) => fmt.rupees(p.grossPaise) },
        { id: 'deductions', header: t('pay.deductions'), align: 'right', sort: (p) => p.deductionsPaise / 100, cell: (p) => fmt.rupees(p.deductionsPaise) },
        { id: 'net', header: t('pay.net'), align: 'right', sort: (p) => p.netPaise / 100, cell: (p) => fmt.rupees(p.netPaise) },
        {
          id: 'pdf',
          header: '',
          csv: false,
          align: 'right',
          cell: (p) => (
            <Button size="small" href={downloadUrl.payslip(p.id)}>
              {t('pay.dl.pdf')}
            </Button>
          ),
        },
      ]}
    />
  );
}
