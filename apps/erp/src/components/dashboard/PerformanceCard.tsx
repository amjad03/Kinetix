'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LineChart, SERIES, type LineSeries } from '@/components/ui/Charts';
import { useI18n } from '@/i18n/client';

import { ToggleButton, ToggleButtonGroup } from '@/components/kx';
type Metric = 'attendance' | 'internalMarks' | 'coAttainment' | 'overall';

/** Academic performance over the last six months: one metric at a time, or all three. */
export function PerformanceCard({ labels, attendance, internalMarks, coAttainment }: { labels: string[]; attendance: (number | null)[]; internalMarks: (number | null)[]; coAttainment: (number | null)[] }) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<Metric>('attendance');
  const all: Record<Exclude<Metric, 'overall'>, LineSeries> = {
    attendance: { key: 'attendance', label: t('dash.perf.attendance'), values: attendance, color: SERIES[0] },
    internalMarks: { key: 'internalMarks', label: t('dash.perf.internal'), values: internalMarks, color: SERIES[1] },
    coAttainment: { key: 'coAttainment', label: t('dash.perf.co'), values: coAttainment, color: SERIES[2] },
  };
  const series = metric === 'overall' ? Object.values(all) : [all[metric]];
  const options: { value: Metric; label: string }[] = [
    { value: 'attendance', label: t('dash.perf.attendance') },
    { value: 'internalMarks', label: t('dash.perf.internal') },
    { value: 'coAttainment', label: t('dash.perf.co') },
    { value: 'overall', label: t('dash.perf.overall') },
  ];
  return (
    <Card
      title={t('dash.perf.title')}
      subtitle={t('dash.perf.subtitle')}
      testId="performance-card"
      action={
        <ToggleButtonGroup className="flex-wrap" exclusive size="small" value={metric} onChange={(_, v: Metric | null) => v && setMetric(v)} aria-label={t('dash.perf.metric')}>
          {options.map((o) => (
            <ToggleButton className="h-[32px] px-3 text-[0.75rem]" key={o.value} value={o.value} data-testid={`perf-${o.value}`}>
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      <LineChart labels={labels} series={series} ariaLabel={t('dash.perf.aria', { metric: options.find((o) => o.value === metric)!.label })} height={260} />
    </Card>
  );
}
