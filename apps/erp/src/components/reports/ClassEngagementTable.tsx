import { TableFrame } from '@/components/DataTable';
import type { I18n } from '@/i18n/format';
import type { ClassEngagement } from '@/lib/insights';

import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
/** Per-class use of the board: sessions and hours, then what the class did (polls, answers, whiteboards, recordings). */
export function ClassEngagementTable({ rows, i18n: { t, fmt } }: { rows: ClassEngagement[]; i18n: I18n }) {
  const used = rows.filter((r) => r.sessions > 0);
  if (used.length === 0) return <p className="text-sm leading-[21px] text-muted-foreground">{t('reports.classroom.noSessions')}</p>;
  return (
    <TableFrame testId="class-engagement">
      <Table className="min-w-[720px]" size="small" aria-label={t('reports.classroom.byClass')}>
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
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{r.label}</h6>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {r.parent}
                </span>
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
