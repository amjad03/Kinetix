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
import { daysBetween, formatDate, formatDateTime } from '@/lib/dates';
import { schoolToday, TIMEZONE } from '@/lib/school';
import type { HomeworkRow } from '@/lib/types';

export const metadata: Metadata = { title: 'Homework' };

const RANGES = [7, 14, 30];

function Due({ dueOn, today }: { dueOn: string | null; today: string }) {
  if (!dueOn)
    return (
      <Typography variant="body2" color="text.secondary">
        No due date
      </Typography>
    );
  const n = daysBetween(today, dueOn);
  const label = n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n > 1 ? `In ${n} days` : n === -1 ? 'Was due yesterday' : `Was due ${-n} days ago`;
  return (
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(dueOn, 'short')}
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

  return (
    <>
      <PageHeader
        title="Homework"
        subtitle={
          res.data
            ? `${rows.length} ${rows.length === 1 ? 'assignment' : 'assignments'} set in the last ${days} days${rows.length ? ` · ${classes} ${classes === 1 ? 'class' : 'classes'} · ${teachers} ${teachers === 1 ? 'teacher' : 'teachers'}` : ''}`
            : `Set in the last ${days} days`
        }
        actions={<RangeToggle value={days} options={RANGES} />}
      />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AssignmentOutlined />} title={`No homework in the last ${days} days`} testId="no-homework">
          Teachers set homework from the board or the Teacher App. {days < 30 ? 'Try a longer range.' : ''}
        </EmptyState>
      ) : (
        <TableFrame testId="homework-table">
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '38%' }}>Homework</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Teacher</TableCell>
                <TableCell>Set</TableCell>
                <TableCell sx={{ minWidth: 150 }}>Due</TableCell>
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
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{formatDateTime(h.createdAt, TIMEZONE)}</TableCell>
                  <TableCell>
                    <Due dueOn={h.dueOn} today={today} />
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
