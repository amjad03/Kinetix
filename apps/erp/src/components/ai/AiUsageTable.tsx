'use client';

import Typography from '@mui/material/Typography';
import { SegmentBar } from '@/components/Bars';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { TaskUsage } from '@/lib/ai-usage';

export const AI_COLORS = { answered: 'kx.success', blocked: 'kx.live', failed: 'error.main' };

const TASKS = ['explain', 'quiz', 'homework', 'lessonPlan', 'summarize'];

/** KINETIX AI use by task: requests, the outcome mix and tokens. */
export function AiUsageTable({ tasks }: { tasks: TaskUsage[] }) {
  const { t, fmt } = useI18n();
  const label = (r: TaskUsage) => (TASKS.includes(r.task) ? t(`ai.task.${r.task}` as MessageKey) : r.label);
  const columns: Column<TaskUsage>[] = [
    { id: 'task', header: t('ai.col.task'), rowHeader: true, sort: label, cell: (r) => <Typography variant="subtitle2">{label(r)}</Typography> },
    { id: 'requests', header: t('ai.col.requests'), align: 'right', sort: (r) => r.requests, cell: (r) => fmt.number(r.requests) },
    {
      id: 'outcome',
      header: t('ai.col.outcome'),
      width: '28%',
      hideBelow: 'sm',
      csv: false,
      cell: (r) => (
        <SegmentBar
          label={t('ai.bar', { answered: r.answered, blocked: r.blocked, failed: r.failed })}
          parts={[
            { value: r.answered, color: AI_COLORS.answered },
            { value: r.blocked, color: AI_COLORS.blocked },
            { value: r.failed, color: AI_COLORS.failed },
          ]}
        />
      ),
    },
    { id: 'answered', header: t('ai.col.answered'), align: 'right', sort: (r) => r.answered, cell: (r) => fmt.number(r.answered) },
    { id: 'blocked', header: t('ai.col.blocked'), align: 'right', sort: (r) => r.blocked, cell: (r) => <span style={{ opacity: r.blocked ? 1 : 0.7 }}>{fmt.number(r.blocked)}</span> },
    { id: 'failed', header: t('ai.col.failed'), align: 'right', sort: (r) => r.failed, cell: (r) => <Typography component="span" variant="body2" sx={{ color: r.failed ? 'error.main' : 'text.secondary' }}>{fmt.number(r.failed)}</Typography> },
    { id: 'tokens', header: t('ai.col.tokens'), align: 'right', sort: (r) => r.tokens, cell: (r) => fmt.number(r.tokens) },
  ];
  return <DataTable testId="ai-usage-table" label={t('ai.byTask')} rows={tasks} rowId={(r) => r.task} exportName="ai-usage" rowAttrs={() => ({ 'data-testid': 'ai-task-row' })} columns={columns} />;
}
