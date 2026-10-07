import type { Metadata } from 'next';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { TableFrame } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { formatMonth } from '@/lib/dates';
import { downloadUrl } from '@/lib/hr';
import { formatRupees } from '@/lib/money';
import { getI18n } from '@/i18n/server';
import type { Payslip } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.payslips') };
}

export default async function MyPayslipsPage() {
  await requireSection('payslips');
  const { t, locale } = await getI18n();
  const data = await load(() => api<Payslip[]>('/v1/payroll/payslips/me'));
  return (
    <>
      <PageHeader title={t('nav.payslips')} subtitle={t('pay.my.subtitle')} />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={<span aria-hidden>₹</span>} title={t('pay.my.none')} />
      ) : (
        <TableFrame testId="my-payslips">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('pay.month')}</TableCell>
                <TableCell align="right">{t('pay.gross')}</TableCell>
                <TableCell align="right">{t('pay.deductions')}</TableCell>
                <TableCell align="right">{t('pay.net')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatMonth(`${p.month}-01`, locale)}</TableCell>
                  <TableCell align="right">{formatRupees(p.grossPaise)}</TableCell>
                  <TableCell align="right">{formatRupees(p.deductionsPaise)}</TableCell>
                  <TableCell align="right">{formatRupees(p.netPaise)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" href={downloadUrl.payslip(p.id)}>{t('pay.dl.pdf')}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}
