'use client';
import NextLink from 'next/link';
import { StatusPill as AdmissionStatus } from '@/components/admissions/Chips';
import { DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ApplicationRow, CycleRow, MeritListDetail } from '@/lib/admissions';


/** Admission cycles: search, sortable columns and CSV export. */
export function CyclesTable({ rows }: { rows: CycleRow[] }) {
  const { t, fmt } = useI18n();
  const total = (c: CycleRow) => Object.values(c.counts).reduce((a, b) => a + b, 0);
  const columns: Column<CycleRow>[] = [
    {
      id: 'name',
      header: t('adm.cycle'),
      rowHeader: true,
      sort: (c) => c.name,
      csv: (c) => `${c.name} (${c.programName}, ${c.yearLabel})`,
      cell: (c) => (
        <>
          <NextLink className="text-sm leading-5 font-medium tracking-[0.1px] text-teal-ink no-underline hover:underline" href={`/admissions/cycles/${c.id}`}>
            {c.name}
          </NextLink>
          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {c.programName} · {c.yearLabel}
          </div>
        </>
      ),
    },
    { id: 'status', header: t('adm.col.status'), sort: (c) => t(`adm.cycleStatus.${c.status}` as MessageKey), cell: (c) => <StatusPill tone={c.status === 'open' ? 'success' : 'neutral'}>{t(`adm.cycleStatus.${c.status}` as MessageKey)}</StatusPill> },
    { id: 'seats', header: t('adm.cycle.seats'), align: 'right', sort: (c) => c.seats, cell: (c) => t('adm.cycle.seatsLeft', { left: c.seatsLeft, seats: c.seats }) },
    { id: 'apps', header: t('adm.col.applications'), align: 'right', sort: total, cell: total },
    { id: 'fee', header: t('adm.cycle.fee'), sort: (c) => c.applicationFeePaise / 100, cell: (c) => (c.applicationFeePaise ? fmt.rupees(c.applicationFeePaise) : t('adm.cycle.noFee')) },
    { id: 'closes', header: t('adm.cycle.closes'), sort: (c) => c.closesOn, cell: (c) => fmt.date(c.closesOn, 'short') },
  ];
  const statuses = [...new Set(rows.map((c) => c.status))];
  return (
    <DataTable
      testId="cycles"
      label={t('adm.tab.cycles')}
      columns={columns}
      rows={rows}
      rowId={(c) => c.id}
      exportName="admission-cycles"
      initialSort={{ id: 'closes', dir: 'desc' }}
      filters={[{ id: 'status', label: t('adm.col.status'), options: statuses.map((s) => ({ value: s, label: t(`adm.cycleStatus.${s}` as MessageKey) })), match: (c, v) => c.status === v }]}
    />
  );
}

/** Admission applications: search, sortable columns and CSV export (the cycle and status filters stay in the URL). */
export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  const { t, fmt } = useI18n();
  const merit = (a: ApplicationRow) => (a.meritScore === null ? '–' : `${a.meritScore}${a.meritRank ? ` (#${a.meritRank})` : ''}`);
  const columns: Column<ApplicationRow>[] = [
    {
      id: 'applicant',
      header: t('adm.col.applicant'),
      rowHeader: true,
      sort: (a) => a.applicantName,
      csv: (a) => `${a.applicantName} (${a.applicationNo}, ${a.phone})`,
      cell: (a) => (
        <>
          <NextLink className="text-sm leading-5 font-medium tracking-[0.1px] text-teal-ink no-underline hover:underline" href={`/admissions/applications/${a.id}`}>
            {a.applicantName}
          </NextLink>
          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {a.applicationNo} · {a.phone}
          </div>
        </>
      ),
    },
    { id: 'cycle', header: t('adm.cycle'), hideBelow: 'md', sort: (a) => a.cycleName, cell: (a) => a.cycleName },
    { id: 'status', header: t('adm.col.status'), sort: (a) => t(`adm.app.${a.status}` as MessageKey), cell: (a) => <AdmissionStatus kind="application" status={a.status} /> },
    { id: 'fee', header: t('adm.col.fee'), hideBelow: 'md', sort: (a) => t(`adm.fee.${a.feeStatus}` as MessageKey), cell: (a) => t(`adm.fee.${a.feeStatus}` as MessageKey) },
    { id: 'merit', header: t('adm.col.merit'), align: 'right', sort: (a) => a.meritScore, csv: merit, cell: merit },
    { id: 'submitted', header: t('adm.col.submitted'), hideBelow: 'sm', sort: (a) => a.submittedAt, csv: (a) => a.submittedAt.slice(0, 10), cell: (a) => fmt.date(a.submittedAt.slice(0, 10), 'short') },
  ];
  return <DataTable testId="applications" label={t('adm.tab.applications')} columns={columns} rows={rows} rowId={(a) => a.id} exportName="admission-applications" initialSort={{ id: 'submitted', dir: 'desc' }} />;
}

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
