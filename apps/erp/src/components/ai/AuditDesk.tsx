'use client';

import Box from '@mui/material/Box';
import { Grid } from '@/components/ops/kit';
import { StatTile } from '@/components/ui';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AiActionRow, AiActionSummary } from '@/lib/governance';

/** Every AI answer that reached a person: who asked, what for, what grounded it, and whether they kept it. */
export function AuditDesk({ actions, summary }: { actions: AiActionRow[]; summary: AiActionSummary }) {
  const { t, fmt } = useI18n();
  const count = (list: { n: number }[]) => list.reduce((n, x) => n + x.n, 0);
  const decided = (d: string) => summary.byDecision.find((x) => x.decision === d)?.n ?? 0;
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatTile label={t('aa.total')} value={fmt.number(count(summary.bySurface))} />
        <StatTile label={t('aa.decision.accepted')} value={fmt.number(decided('accepted'))} />
        <StatTile label={t('aa.decision.rejected')} value={fmt.number(decided('rejected'))} />
        <StatTile label={t('aa.decision.undecided')} value={fmt.number(decided('undecided'))} />
      </Box>
      <Grid
        testId="aa-table"
        empty={t('aa.empty')}
        rows={actions}
        exportName="ai-actions"
        cols={[
          { label: t('aa.col.when'), cell: (r) => fmt.dateTime(r.createdAt), sort: (r) => r.createdAt },
          { label: t('aa.col.who'), cell: (r) => r.user ?? '—', sort: (r) => r.user ?? '' },
          { label: t('aa.col.surface'), cell: (r) => t(`aa.surface.${r.surface}` as MessageKey), sort: (r) => r.surface },
          { label: t('aa.col.task'), cell: (r) => r.task, sort: (r) => r.task },
          { label: t('aa.col.asked'), cell: (r) => r.inputPreview.slice(0, 90) },
          { label: t('aa.col.sources'), cell: (r) => (r.sources.length ? r.sources.map((s) => s.title).join(', ') : '—') },
          { label: t('aa.col.decision'), cell: (r) => <StatusPill tone={r.decision === 'rejected' ? 'warning' : r.decision ? 'success' : 'neutral'}>{t(`aa.decision.${r.decision ?? 'undecided'}` as MessageKey)}</StatusPill>, sort: (r) => r.decision ?? '' },
        ]}
      />
    </>
  );
}
