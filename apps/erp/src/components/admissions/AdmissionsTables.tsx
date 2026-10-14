'use client';
import NextLink from 'next/link';
import { StatusPill as AdmissionStatus } from '@/components/admissions/Chips';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { MeritListDetail } from '@/lib/admissions';


type MeritEntry = MeritListDetail['entries'][number];

/** A merit list: rank, applicant, score and decision. */
export function MeritListTable({ rows }: { rows: MeritEntry[] }) {
  const { t } = useI18n();
  const decision = (e: MeritEntry) => t(e.decision === 'offer' ? 'adm.cycle.offer' : 'adm.cycle.waitlist');
  const columns: Column<MeritEntry>[] = [
    { id: 'rank', header: '#', sort: (e) => e.rank, cell: (e) => e.rank },
    {
      id: 'applicant',
      header: t('adm.col.applicant'),
      rowHeader: true,
      sort: (e) => e.applicantName,
      csv: (e) => `${e.applicantName} (${e.applicationNo})`,
      cell: (e) => (
        <>
          <NextLink className="text-[13px] leading-[19px] text-teal-ink no-underline hover:underline" href={`/admissions/applications/${e.applicationId}`}>
            {e.applicantName}
          </NextLink>
          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {e.applicationNo}
          </div>
        </>
      ),
    },
    { id: 'score', header: t('adm.col.merit'), align: 'right', sort: (e) => e.score, cell: (e) => e.score },
    { id: 'decision', header: t('adm.cycle.decision'), sort: decision, cell: decision },
    { id: 'status', header: t('adm.col.status'), sort: (e) => (e.status ? t(`adm.app.${e.status}` as MessageKey) : ''), cell: (e) => e.status && <AdmissionStatus kind="application" status={e.status} /> },
  ];
  const filters = [{ id: 'decision', label: t('adm.cycle.decision'), options: [{ value: 'offer', label: t('adm.cycle.offer') }, { value: 'waitlist', label: t('adm.cycle.waitlist') }], match: (e: MeritEntry, v: string) => e.decision === v }];
  return <DataTable testId="merit-list" label={t('adm.cycle.meritList')} columns={columns} rows={rows} rowId={(e) => e.applicationId} filters={filters} exportName="merit-list" initialSort={{ id: 'rank', dir: 'asc' }} />;
}
