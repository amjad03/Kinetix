'use client';

import { LineChart } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Funnel } from '@/lib/admissions-desk';

/** Enquiries, applications and admissions per day over the chosen period. */
export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const { t, fmt } = useI18n();
  const max = Math.max(1, ...funnel.days.flatMap((d) => [d.enquiries, d.applications, d.enrolled]));
  return (
    <LineChart
      ariaLabel={t('adk.funnel.chart')}
      labels={funnel.days.map((d) => fmt.date(d.day, 'short'))}
      unit=""
      max={Math.ceil(max * 1.2)}
      area={false}
      series={[
        { key: 'enquiries', label: t('adk.funnel.enquiries'), values: funnel.days.map((d) => d.enquiries) },
        { key: 'applications', label: t('adk.funnel.applications'), values: funnel.days.map((d) => d.applications) },
        { key: 'enrolled', label: t('adk.funnel.enrolled'), values: funnel.days.map((d) => d.enrolled) },
      ]}
    />
  );
}
