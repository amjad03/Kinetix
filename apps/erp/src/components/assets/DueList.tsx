'use client';

import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { Grid } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MaintDue } from '@/lib/ops';

/** Assets whose next service falls due soon, soonest first. */
export function DueList({ rows }: { rows: MaintDue[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      testId="as-due-list"
      empty={t('ivd.as.noDue')}
      emptyIcon={<Wrench />}
      rows={[...rows].sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))}
      exportName="service-due"
      cols={[
        { label: t('as.tag'), cell: (d) => <Link className="font-medium text-primary hover:underline" href={`/assets/${d.assetId}`}>{d.tag}</Link> },
        { label: t('ops.f.name'), cell: (d) => d.name },
        { label: t('as.nextDue'), cell: (d) => fmt.date(d.nextDueOn, 'short') },
      ]}
    />
  );
}
