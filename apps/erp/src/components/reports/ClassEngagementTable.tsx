import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { TableFrame } from '@/components/DataTable';
import type { I18n } from '@/i18n/format';
import type { ClassEngagement } from '@/lib/insights';

/** Per-class use of the board: sessions and hours, then what the class did (polls, answers, whiteboards, recordings). */
export function ClassEngagementTable({ rows, i18n: { t, fmt } }: { rows: ClassEngagement[]; i18n: I18n }) {
  const used = rows.filter((r) => r.sessions > 0);
  if (used.length === 0) return <Typography color="text.secondary">{t('reports.classroom.noSessions')}</Typography>;
  return (
    <TableFrame testId="class-engagement">
      <Table size="small" aria-label={t('reports.classroom.byClass')} sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('reports.classroom.col.class')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.sessions')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.hours')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.polls')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.answers')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.boards')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.recordings')}</TableCell>
            <TableCell align="right">{t('reports.classroom.col.perSession')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {used.map((r) => (
            <TableRow key={r.id} hover data-testid="class-engagement-row">
              <TableCell>
                <Typography variant="subtitle2">{r.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.parent}
                </Typography>
              </TableCell>
              <TableCell align="right">{fmt.number(r.sessions)}</TableCell>
              <TableCell align="right">{fmt.number(r.hours)}</TableCell>
              <TableCell align="right">{fmt.number(r.polls)}</TableCell>
              <TableCell align="right">{fmt.number(r.answers)}</TableCell>
              <TableCell align="right">{fmt.number(r.whiteboards)}</TableCell>
              <TableCell align="right">{fmt.number(r.recordings)}</TableCell>
              <TableCell align="right">{r.perSession === null ? '–' : fmt.number(r.perSession)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
