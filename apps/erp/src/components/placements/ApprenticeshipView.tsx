'use client';

import { saveStipend } from '@/app/(dashboard)/placements/actions';
import { useDialog } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { Card, DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import type { StipendSheet } from '@/lib/placements-depth';

/** The apprenticeship row as the record kit lists it. */
export interface ApprenticeshipRow {
  id: string;
  rollNo: string;
  fullName: string;
  programName: string;
  establishment: string;
  establishmentCode: string;
  natsEnrolmentNo: string;
  contractNo: string;
  category: string;
  role: string;
  startsOn: string;
  endsOn: string;
  stipendPaise: number;
  govtSharePaise: number;
  status: string;
  certificateNo: string | null;
  certificateOn: string | null;
}

type Month = StipendSheet['months'][number];

/**
 * A NATS apprenticeship: the enrolment, establishment and contract, the statutory stipend with the Government of
 * India's share, and each month's payment by the establishment and DBT credit; a month is recorded (or corrected)
 * from its row.
 */
export function ApprenticeshipView({ row, sheet, canEdit }: { row: ApprenticeshipRow; sheet: StipendSheet; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [open, dialog] = useDialog();
  const money = (p: number | null) => (p === null ? '—' : fmt.rupees(p));
  const record = (m: Month) =>
    open({
      title: t('pp.ap.recordMonth', { month: m.month }),
      intro: t('pp.ap.recordHelp'),
      fields: [
        { name: 'employerPaid', label: t('pp.ap.employerPaid'), kind: 'number', required: true, init: String((m.employerPaidPaise ?? m.duePaise) / 100) },
        { name: 'dbt', label: t('pp.ap.dbtCredited'), kind: 'number', init: m.dbtPaise === null ? '' : String(m.dbtPaise / 100) },
        { name: 'dbtReference', label: t('pp.ap.dbtRef'), init: m.dbtReference },
        { name: 'paidOn', label: t('pp.ap.paidOn'), kind: 'date', init: m.paidOn ?? '' },
      ],
      done: t('ops.saved'),
      run: (v) => saveStipend(row.id, { ...v, month: m.month }),
    });
  const cols: Column<Month>[] = [
    { id: 'month', header: t('pp.ap.month'), rowHeader: true, cell: (m) => fmt.month(`${m.month}-01`) },
    { id: 'due', header: t('pp.ap.stipend'), align: 'right', cell: (m) => money(m.duePaise) },
    { id: 'paid', header: t('pp.ap.employerPaid'), align: 'right', cell: (m) => money(m.employerPaidPaise) },
    { id: 'share', header: t('pp.ap.govtShare'), align: 'right', hideBelow: 'sm', cell: (m) => money(m.govtSharePaise) },
    { id: 'dbt', header: t('pp.ap.dbtCredited'), align: 'right', cell: (m) => money(m.dbtPaise) },
    { id: 'ref', header: t('pp.ap.dbtRef'), hideBelow: 'md', cell: (m) => m.dbtReference || '—' },
    { id: 'state', header: t('ops.f.status'), cell: (m) => (m.employerPaidPaise === null ? <StatusPill tone="warning">{t('pp.ap.unpaid')}</StatusPill> : m.dbtPaise ? <StatusPill tone="success">{t('pp.ap.credited')}</StatusPill> : <StatusPill tone="info">{t('pp.ap.awaitingDbt')}</StatusPill>) },
    { id: 'act', header: '', csv: false, align: 'right', cell: (m) => (canEdit && !['enrolled', 'terminated'].includes(row.status) ? <Button size="sm" variant="ghost" onClick={() => record(m)}>{m.employerPaidPaise === null ? t('pp.ap.record') : t('ops.edit')}</Button> : null) },
  ];
  return (
    <>
      <RecordPage
        title={`${row.fullName} · ${row.establishment}`}
        subtitle={`${row.rollNo} · ${row.programName} · ${row.role}`}
        status={{ label: t(`pp.apStatus.${row.status as 'ongoing'}`), tone: statusTone(row.status === 'contract_registered' ? 'approved' : row.status) }}
        facts={[
          { label: t('pp.ap.enrolment'), value: row.natsEnrolmentNo || '—' },
          { label: t('pp.ap.contractNo'), value: row.contractNo || '—' },
          { label: t('pp.ap.period'), value: `${fmt.date(row.startsOn, 'short')} – ${fmt.date(row.endsOn, 'short')}` },
          { label: t('pp.ap.stipend'), value: money(row.stipendPaise) },
          { label: t('pp.ap.govtShare'), value: money(row.govtSharePaise) },
          { label: t('pp.ap.certificateNo'), value: row.certificateNo ?? '—' },
        ]}
        overview={
          <Card title={t('pp.ap.stipends')}>
            <p className="mb-3 text-sm text-muted-foreground">{t('pp.ap.sheetHelp', { paid: fmt.rupees(sheet.totals.employerPaidPaise), dbt: fmt.rupees(sheet.totals.dbtPaise), unpaid: sheet.totals.monthsUnpaid })}</p>
            <DataTable label={t('pp.ap.stipends')} columns={cols} rows={sheet.months} rowId={(m) => m.month} empty={t('pp.ap.noMonths')} exportName="apprentice-stipends" testId="apprentice-months" />
          </Card>
        }
      />
      {dialog}
    </>
  );
}
