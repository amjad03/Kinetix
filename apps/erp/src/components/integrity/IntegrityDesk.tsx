'use client';

import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { reviewFlag, runIntegrityCheck } from '@/app/(dashboard)/integrity/actions';
import { ActionButton, Bar, Grid, useToast } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { IntegrityReport } from '@/lib/governance';

/** Similarity flags for one homework: the pair, how much overlaps, the phrase they share and the teacher's decision. */
export function IntegrityDesk({ homeworkId, report }: { homeworkId: string; report: IntegrityReport }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [threshold, setThreshold] = useState(50);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('ig.hint')}
      </Typography>
      <Bar>
        <label>
          {t('ig.threshold')}{' '}
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label={t('ig.threshold')}>
            {[40, 50, 60, 70, 80].map((x) => (
              <option key={x} value={x}>
                {x}%
              </option>
            ))}
          </select>
        </label>
        <ActionButton label={t('ig.run')} run={() => runIntegrityCheck(homeworkId, threshold / 100)} onDone={toast} />
      </Bar>
      {report.check && (
        <Typography sx={{ mb: 2 }} data-testid="ig-summary">
          {t('ig.summary', { compared: report.check.compared, flagged: report.check.flagged, when: fmt.dateTime(report.check.createdAt) })}
        </Typography>
      )}
      <Grid
        testId="ig-table"
        empty={report.check ? t('ig.none') : t('ig.notRun')}
        rows={report.matches}
        cols={[
          { label: t('ig.col.student'), cell: (r) => `${r.student ?? ''} (${r.studentRollNo ?? ''})`, sort: (r) => r.student ?? '' },
          { label: t('ig.col.matched'), cell: (r) => `${r.matchedStudent ?? ''} (${r.matchedRollNo ?? ''})`, sort: (r) => r.matchedStudent ?? '' },
          { label: t('ig.col.similarity'), cell: (r) => `${Math.round(r.similarity * 100)}%`, num: true, sort: (r) => r.similarity },
          { label: t('ig.col.phrase'), cell: (r) => `“${r.sharedPhrase}”` },
          { label: t('ig.col.decision'), cell: (r) => (r.reviewed ? <StatusPill tone={r.reviewed === 'confirmed' ? 'warning' : 'neutral'}>{t(`ig.rv.${r.reviewed}` as MessageKey)}</StatusPill> : '—') },
          {
            label: '',
            cell: (r) =>
              r.reviewed ? null : (
                <>
                  <ActionButton label={t('ig.confirm')} run={() => reviewFlag(r.id, 'confirmed')} onDone={toast} />
                  <ActionButton label={t('ig.dismiss')} run={() => reviewFlag(r.id, 'dismissed')} onDone={toast} />
                </>
              ),
          },
        ]}
      />
      {toastNode}
    </>
  );
}
