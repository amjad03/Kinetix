import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { Metadata } from 'next';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { NewCycleButton } from '@/components/admissions/CycleDialog';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { CycleRow } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import { formatRupees } from '@/lib/money';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.cycles') };
}

export default async function CyclesPage() {
  await requireSection('admissions');
  const [cycles, structure] = await Promise.all([load(() => api<CycleRow[]>('/v1/admissions/cycles')), load(() => api<Structure>('/v1/admin/structure'))]);
  const { t, locale } = await getI18n();
  return (
    <>
      <PageHeader
        title={t('adm.tab.cycles')}
        subtitle={t('adm.cycles.subtitle')}
        actions={<NewCycleButton programs={structure.data?.programs ?? []} years={structure.data?.academicYears ?? []} today={schoolToday()} />}
      />
      <AdmissionsTabs current="cycles" />
      {cycles.error !== undefined ? (
        <ErrorState message={cycles.error} />
      ) : cycles.data!.length === 0 ? (
        <EmptyState icon={<HowToRegOutlined />} title={t('adm.cycles.none')} testId="no-cycles">
          {t('adm.cycles.noneBody')}
        </EmptyState>
      ) : (
        <Card padded={false} testId="cycles" sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('adm.cycle')}</TableCell>
                <TableCell>{t('adm.col.status')}</TableCell>
                <TableCell align="right">{t('adm.cycle.seats')}</TableCell>
                <TableCell align="right">{t('adm.col.applications')}</TableCell>
                <TableCell>{t('adm.cycle.fee')}</TableCell>
                <TableCell>{t('adm.cycle.closes')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.data!.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography component={NextLink} href={`/admissions/cycles/${c.id}`} variant="subtitle2" sx={{ color: 'primary.main', textDecoration: 'none' }}>
                      {c.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {c.programName} · {c.yearLabel}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={c.status === 'open' ? 'success' : 'default'} variant={c.status === 'open' ? 'filled' : 'outlined'} label={t(`adm.cycleStatus.${c.status}` as MessageKey)} />
                  </TableCell>
                  <TableCell align="right">{t('adm.cycle.seatsLeft', { left: c.seatsLeft, seats: c.seats })}</TableCell>
                  <TableCell align="right">{Object.values(c.counts).reduce((a, b) => a + b, 0)}</TableCell>
                  <TableCell>{c.applicationFeePaise ? formatRupees(c.applicationFeePaise) : t('adm.cycle.noFee')}</TableCell>
                  <TableCell>{formatDate(c.closesOn, 'short', locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
