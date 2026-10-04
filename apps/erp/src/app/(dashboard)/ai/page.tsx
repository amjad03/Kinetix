import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { SegmentBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { compactNumber, summarizeUsage } from '@/lib/ai-usage';
import { api, load, requireSection } from '@/lib/api';
import type { AiUsage } from '@/lib/types';

export const metadata: Metadata = { title: 'KINETIX AI usage' };

const n = (v: number) => v.toLocaleString('en-IN');
const COLORS = { answered: 'kx.success', blocked: 'kx.live', failed: 'error.main' };

function Legend() {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', color: 'text.secondary', mb: 1.5 }}>
      {(
        [
          ['answered', 'Answered (including repeats served from cache)'],
          ['blocked', 'Stopped by the safety check'],
          ['failed', 'Not answered (AI unavailable, unusable answer or over the limit)'],
        ] as const
      ).map(([k, label]) => (
        <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS[k] }} />
          <Typography variant="caption">{label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default async function AiUsagePage() {
  await requireSection('ai');
  const usage = await load(() => api<AiUsage>('/v1/ai/usage'));
  const s = usage.data ? summarizeUsage(usage.data) : null;
  const days = usage.data?.days ?? 30;

  return (
    <>
      <PageHeader title="KINETIX AI usage" subtitle={`How teachers used KINETIX AI on the boards and in the apps over the last ${days} days`} />
      {usage.error !== undefined ? (
        <ErrorState message={usage.error} />
      ) : s!.total.requests === 0 ? (
        <EmptyState icon={<AutoAwesomeOutlined />} title={`No KINETIX AI requests in the last ${days} days`} testId="no-ai-usage">
          Teachers ask KINETIX AI for explanations, quizzes, homework and lesson plans from the board&apos;s AI panel and the Teacher App.
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label="Requests" value={n(s!.total.requests)} caption={`Last ${days} days`} testId="ai-requests" />
            <StatTile
              label="Answered"
              value={`${Math.round((s!.total.answered / s!.total.requests) * 100)}%`}
              caption={`${n(s!.total.answered)} of ${n(s!.total.requests)} requests`}
              testId="ai-answered"
            />
            <StatTile
              label="Not answered"
              value={n(s!.total.blocked + s!.total.failed)}
              tone={s!.total.failed > 0 ? 'warning' : 'default'}
              caption={`${n(s!.total.blocked)} blocked · ${n(s!.total.failed)} failed`}
              testId="ai-not-answered"
            />
            <StatTile label="Tokens" value={compactNumber(s!.total.tokens)} caption={`${n(s!.total.tokens)} tokens processed`} testId="ai-tokens" />
          </StatGrid>

          <SectionTitle>By task</SectionTitle>
          <Legend />
          <TableFrame testId="ai-usage-table">
            <Table sx={{ minWidth: 680 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Task</TableCell>
                  <TableCell align="right">Requests</TableCell>
                  <TableCell sx={{ width: '28%' }}>Outcome</TableCell>
                  <TableCell align="right">Answered</TableCell>
                  <TableCell align="right">Blocked</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {s!.tasks.map((t) => (
                  <TableRow key={t.task} data-testid="ai-task-row">
                    <TableCell>
                      <Typography variant="subtitle2">{t.label}</Typography>
                    </TableCell>
                    <TableCell align="right">{n(t.requests)}</TableCell>
                    <TableCell>
                      <SegmentBar
                        label={`${t.answered} answered, ${t.blocked} blocked, ${t.failed} failed`}
                        parts={[
                          { value: t.answered, color: COLORS.answered },
                          { value: t.blocked, color: COLORS.blocked },
                          { value: t.failed, color: COLORS.failed },
                        ]}
                      />
                    </TableCell>
                    <TableCell align="right">{n(t.answered)}</TableCell>
                    <TableCell align="right" sx={{ color: t.blocked ? 'text.primary' : 'text.secondary' }}>
                      {n(t.blocked)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: t.failed ? 'error.main' : 'text.secondary' }}>
                      {n(t.failed)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {n(t.tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            Tokens are the units of text KINETIX AI reads and writes; repeats served from cache use none.
          </Typography>
        </>
      )}
    </>
  );
}
