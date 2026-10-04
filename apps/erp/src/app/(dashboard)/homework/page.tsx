import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { TableFrame } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RangeToggle } from '@/components/RangeToggle';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { I18n } from '@/i18n/format';
import { daysBetween } from '@/lib/dates';
import { schoolToday, TIMEZONE } from '@/lib/school';
import type { HomeworkRow } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.homework') };
}

const RANGES = [7, 14, 30];

function Due({ dueOn, today, i18n: { t, fmt } }: { dueOn: string | null; today: string; i18n: I18n }) {
  if (!dueOn)
    return (
      <Typography variant="body2" color="text.secondary">
        {t('hw.noDue')}
      </Typography>
    );
  const n = daysBetween(today, dueOn);
  const label = n === 0 ? t('hw.dueToday') : n === 1 ? t('hw.dueTomorrow') : n > 1 ? t('hw.inDays', { n }) : n === -1 ? t('hw.wasYesterday') : t('hw.wasDaysAgo', { n: -n });
  return (
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {fmt.date(dueOn, 'short')}
      </Typography>
      {n >= 0 ? (
        <Chip
          size="small"
          label={label}
          sx={{ mt: 0.5, ...(n <= 1 ? { bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' } : { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer' }) }}
        />
      ) : (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      )}
    </Box>
  );
}

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireSection('school');
  const d = Number((await searchParams).days);
  const days = RANGES.includes(d) ? d : 7;
  const today = schoolToday();
  const res = await load(() => api<HomeworkRow[]>(`/v1/admin/homework?days=${days}`));
  const rows = res.data ?? [];
  const classes = new Set(rows.map((r) => r.section)).size;
  const teachers = new Set(rows.map((r) => r.teacher)).size;
  const i18n = await getI18n();
  const { t, fmt } = i18n;

  return (
    <>
      <PageHeader
        title={t('nav.homework')}
        subtitle={
          res.data
            ? `${t.plural('hw.subtitle', rows.length, { days })}${rows.length ? ` · ${t.plural('hw.classes', classes)} · ${t.plural('hw.teachers', teachers)}` : ''}`
            : t('hw.setInLast', { days })
        }
        actions={<RangeToggle value={days} options={RANGES} />}
      />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AssignmentOutlined />} title={t('hw.none', { days })} testId="no-homework">
          {t('hw.noneBody')} {days < 30 ? t('hw.tryLonger') : ''}
        </EmptyState>
      ) : (
        <TableFrame testId="homework-table">
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '38%' }}>{t('hw.col.homework')}</TableCell>
                <TableCell>{t('hw.col.class')}</TableCell>
                <TableCell>{t('hw.col.subject')}</TableCell>
                <TableCell>{t('hw.col.teacher')}</TableCell>
                <TableCell>{t('hw.col.set')}</TableCell>
                <TableCell sx={{ minWidth: 150 }}>{t('hw.col.due')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id} hover>
                  <TableCell>
                    <Typography variant="subtitle2">{h.title}</Typography>
                    {h.instructions && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.25 }}
                      >
                        {h.instructions}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{h.section}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{h.subject}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{h.teacher}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{fmt.dateTime(h.createdAt, TIMEZONE)}</TableCell>
                  <TableCell>
                    <Due dueOn={h.dueOn} today={today} i18n={i18n} />
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
