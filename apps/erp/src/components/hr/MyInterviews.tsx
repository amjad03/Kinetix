'use client';

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type { MyInterview } from '@/lib/hr-depth';
import { Button } from '@/components/shadcn/button';
import { DataTable, EmptyState, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ScoreDialog } from './Hiring';

/** A panel member's interviews: when, where, for which opening, and their own score sheet while the interview is open. */
export function MyInterviews({ rows }: { rows: MyInterview[] }) {
  const { t, fmt } = useI18n();
  const [scoring, setScoring] = useState<string | null>(null);
  if (!rows.length)
    return (
      <EmptyState icon={<CalendarDays />} title={t('hk.myInterviews.none')}>
        {t('hk.myInterviews.noneBody')}
      </EmptyState>
    );
  return (
    <>
      <DataTable
        testId="my-interviews"
        label={t('hk.myInterviews.title')}
        rows={rows}
        rowId={(r) => r.id}
        exportName="my-interviews"
        columns={[
          { id: 'a', header: t('rk.f.job-interviews.applicantId'), rowHeader: true, sort: (r) => r.applicant, cell: (r) => r.applicant },
          { id: 'o', header: t('hk.col.opening'), sort: (r) => r.opening, hideBelow: 'md', cell: (r) => r.opening },
          { id: 'k', header: t('rk.f.job-interviews.kind'), sort: (r) => r.kind, cell: (r) => `${t('hk.rec.round', { n: r.round })} · ${t(`rk.o.job-interviews.kind.${r.kind}` as MessageKey)}` },
          { id: 'w', header: t('rk.f.job-interviews.date'), sort: (r) => r.scheduledAt, cell: (r) => fmt.dateTime(r.scheduledAt) },
          { id: 'v', header: t('rk.f.job-interviews.venue'), hideBelow: 'lg', cell: (r) => r.venue || '–' },
          { id: 's', header: t('hk.col.status'), sort: (r) => r.status, cell: (r) => <StatusPill tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'neutral' : 'info'}>{t(`rk.o.job-interviews.status.${r.status}` as MessageKey)}</StatusPill> },
          {
            id: 'x',
            header: '',
            align: 'right',
            csv: false,
            cell: (r) =>
              r.status === 'scheduled' ? (
                <Button size="sm" variant={r.scoredByMe ? 'outline' : 'default'} className="h-9" onClick={() => setScoring(r.id)}>
                  {r.scoredByMe ? t('hk.rec.editScores') : t('hk.rec.myScores')}
                </Button>
              ) : r.scoredByMe ? (
                <StatusPill tone="success">{t('hk.rec.scoredShort')}</StatusPill>
              ) : null,
          },
        ]}
      />
      {scoring && <ScoreDialog interviewId={scoring} onClose={() => setScoring(null)} />}
    </>
  );
}
