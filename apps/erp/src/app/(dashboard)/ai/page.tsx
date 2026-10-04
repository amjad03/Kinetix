import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/translate';
import type { MessageKey } from '@/i18n/messages';
import { SegmentBar } from '@/components/Bars';
import { TableFrame } from '@/components/DataTable';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { compactNumber, summarizeUsage } from '@/lib/ai-usage';
import { api, load, requireSection } from '@/lib/api';
import type { AiUsage } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ai.title') };
}

const n = (v: number) => v.toLocaleString('en-IN');
const COLORS = { answered: 'kx.success', blocked: 'kx.live', failed: 'error.main' };

const TASKS = ['explain', 'quiz', 'homework', 'lessonPlan', 'summarize'];
const taskLabel = (task: string, fallback: string, t: TFunction) => (TASKS.includes(task) ? t(`ai.task.${task}` as MessageKey) : fallback);

function Legend({ t }: { t: TFunction }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', color: 'text.secondary', mb: 1.5 }}>
      {(
        [
          ['answered', t('ai.legend.answered')],
          ['blocked', t('ai.legend.blocked')],
          ['failed', t('ai.legend.failed')],
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
  const { t } = await getI18n();

  return (
    <>
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle', { days })} />
      {usage.error !== undefined ? (
        <ErrorState message={usage.error} />
      ) : s!.total.requests === 0 ? (
        <EmptyState icon={<AutoAwesomeOutlined />} title={t('ai.none', { days })} testId="no-ai-usage">
          {t('ai.noneBody')}
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label={t('ai.requests')} value={n(s!.total.requests)} caption={t('ai.lastDays', { days })} testId="ai-requests" />
            <StatTile
              label={t('ai.answered')}
              value={`${Math.round((s!.total.answered / s!.total.requests) * 100)}%`}
              caption={t('ai.ofRequests', { n: s!.total.answered, d: s!.total.requests })}
              testId="ai-answered"
            />
            <StatTile
              label={t('ai.notAnswered')}
              value={n(s!.total.blocked + s!.total.failed)}
              tone={s!.total.failed > 0 ? 'warning' : 'default'}
              caption={t('ai.blockedFailed', { blocked: s!.total.blocked, failed: s!.total.failed })}
              testId="ai-not-answered"
            />
            <StatTile label={t('ai.tokens')} value={compactNumber(s!.total.tokens)} caption={t('ai.tokensProcessed', { n: s!.total.tokens })} testId="ai-tokens" />
          </StatGrid>

          <SectionTitle>{t('ai.byTask')}</SectionTitle>
          <Legend t={t} />
          <TableFrame testId="ai-usage-table">
            <Table sx={{ minWidth: 680 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('ai.col.task')}</TableCell>
                  <TableCell align="right">{t('ai.col.requests')}</TableCell>
                  <TableCell sx={{ width: '28%' }}>{t('ai.col.outcome')}</TableCell>
                  <TableCell align="right">{t('ai.col.answered')}</TableCell>
                  <TableCell align="right">{t('ai.col.blocked')}</TableCell>
                  <TableCell align="right">{t('ai.col.failed')}</TableCell>
                  <TableCell align="right">{t('ai.col.tokens')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {s!.tasks.map((r) => (
                  <TableRow key={r.task} data-testid="ai-task-row">
                    <TableCell>
                      <Typography variant="subtitle2">{taskLabel(r.task, r.label, t)}</Typography>
                    </TableCell>
                    <TableCell align="right">{n(r.requests)}</TableCell>
                    <TableCell>
                      <SegmentBar
                        label={t('ai.bar', { answered: r.answered, blocked: r.blocked, failed: r.failed })}
                        parts={[
                          { value: r.answered, color: COLORS.answered },
                          { value: r.blocked, color: COLORS.blocked },
                          { value: r.failed, color: COLORS.failed },
                        ]}
                      />
                    </TableCell>
                    <TableCell align="right">{n(r.answered)}</TableCell>
                    <TableCell align="right" sx={{ color: r.blocked ? 'text.primary' : 'text.secondary' }}>
                      {n(r.blocked)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: r.failed ? 'error.main' : 'text.secondary' }}>
                      {n(r.failed)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {n(r.tokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            {t('ai.tokensNote')}
          </Typography>
        </>
      )}
    </>
  );
}
