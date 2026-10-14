import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { FunnelChart } from '@/components/admissions/FunnelChart';
import { Button } from '@/components/kx';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { ReportTable, type ReportColumn } from '@/components/students/ReportTable';
import { Card, FormRow, LinkTabs, SelectInput, StatGrid, StatTile, TextInput } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { ADMISSION_REPORTS, type AdmissionReport, type Funnel } from '@/lib/admissions-desk';
import type { Structure } from '@/lib/types';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adk.tab.reports') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BY_YEAR: AdmissionReport[] = ['category-stats', 'quota-fill', 'fee-reconciliation', 'drafts'];

/** Change against last year, as a percentage (null when last year had none). */
const delta = (now: number, last: number) => (last ? Math.round(((now - last) / last) * 100) : null);

/**
 * Admissions reports: the funnel this period against the same days last year, and the registers and statements:
 * daily admission register, category-wise statistics (AISHE), quota fill, conversion by programme, source or
 * counsellor, agent statement, counsellor activity, application fees to reconcile and saved drafts.
 */
export default async function AdmissionReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const kind = (ADMISSION_REPORTS as readonly string[]).includes(sp.kind ?? '') ? (sp.kind as AdmissionReport) : 'daily-register';
  const from = sp.from && DAY.test(sp.from) ? sp.from : '';
  const to = sp.to && DAY.test(sp.to) ? sp.to : '';
  const yearId = sp.yearId && UUID.test(sp.yearId) ? sp.yearId : '';
  const by = ['programme', 'source', 'counsellor'].includes(sp.by ?? '') ? (sp.by as string) : 'programme';
  const q = new URLSearchParams({ ...(from && { from }), ...(to && { to }), ...(yearId && { yearId }), by });
  const [funnel, rows, structure] = await Promise.all([
    load(() => api<Funnel>(`/v1/admissions/desk/funnel?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`)),
    load(() => api<Record<string, unknown>[]>(`/v1/admissions/desk/reports/${kind}?${q}`)),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);

  const n = (key: string, header: MessageKey, kindOf: ReportColumn['kind'] = 'number'): ReportColumn => ({ key, header: t(header), kind: kindOf });
  const sources = Object.fromEntries(['web', 'walk_in', 'phone', 'campaign', 'referral', 'import', 'whatsapp', 'fair', 'meta', 'google', 'email'].map((s) => [s, t(`adm.source.${s}` as MessageKey)]));
  const COLUMNS: Record<AdmissionReport, ReportColumn[]> = {
    'daily-register': [
      { key: 'admittedOn', header: t('adk.rep.admittedOn'), kind: 'date' },
      { key: 'admissionNo', header: t('si.col.admissionNo') },
      { key: 'name', header: t('si.col.student'), rowHeader: true },
      { key: 'programme', header: t('si.reg.programme'), hideBelow: 'md' },
      { key: 'className', header: t('si.reg.class'), hideBelow: 'md' },
      { key: 'rollNo', header: t('si.reg.roll'), hideBelow: 'lg' },
      { key: 'category', header: t('si.f.category'), hideBelow: 'lg' },
      { key: 'quota', header: t('adk.col.quota'), hideBelow: 'lg', labels: Object.fromEntries(['merit', 'management', 'nri', 'sports', 'pwd', 'other'].map((s) => [s, t(`adk.quota.${s}` as MessageKey)])) },
      { key: 'applicationNo', header: t('adk.rep.applicationNo'), hideBelow: 'lg' },
      { key: 'guardianName', header: t('si.col.guardian'), hideBelow: 'lg' },
    ],
    'category-stats': [
      { key: 'programme', header: t('si.reg.programme'), rowHeader: true },
      n('total', 'si.reg.total'),
      n('male', 'si.o.gender.male'),
      n('female', 'si.o.gender.female'),
      n('transgender', 'adk.rep.transgender'),
      n('general', 'si.o.category.general'),
      n('obc', 'si.o.category.obc'),
      n('sc', 'si.o.category.sc'),
      n('st', 'si.o.category.st'),
      n('ews', 'si.o.category.ews'),
      n('pwd', 'si.reg.pwd'),
      n('minority', 'si.reg.minority'),
    ],
    'quota-fill': [
      { key: 'cycle', header: t('adm.cycle'), rowHeader: true },
      { key: 'kind', header: t('adk.col.kind'), labels: { Total: t('adk.rep.allSeats'), Category: t('adk.rep.category'), Quota: t('adk.col.quota') } },
      { key: 'name', header: t('adk.rep.seatGroup'), labels: { 'All seats': t('adk.rep.allSeats') } },
      n('seats', 'adm.cycle.seats'),
      n('filled', 'adk.rep.filled'),
      n('vacant', 'adk.rep.vacant'),
    ],
    conversion: [
      { key: 'group', header: t(`adk.rep.by.${by}` as MessageKey), rowHeader: true, labels: by === 'source' ? sources : undefined },
      n('enquiries', 'adk.funnel.enquiries'),
      n('applied', 'adk.rep.applied'),
      n('enrolled', 'adk.funnel.enrolled'),
      n('lost', 'adk.rep.lost'),
      n('lastYearEnquiries', 'adk.rep.lastYearEnquiries'),
      n('lastYearEnrolled', 'adk.rep.lastYearEnrolled'),
    ],
    'agent-statement': [
      { key: 'agent', header: t('adk.rep.agent'), rowHeader: true },
      { key: 'code', header: t('adk.rep.code'), hideBelow: 'md' },
      n('referrals', 'adk.rep.referrals'),
      n('enrolled', 'adk.funnel.enrolled'),
      n('duePaise', 'adk.rep.due', 'rupees'),
      n('paidGrossPaise', 'adk.rep.paidGross', 'rupees'),
      n('tdsPaise', 'adk.rep.tds', 'rupees'),
      n('paidNetPaise', 'adk.rep.paidNet', 'rupees'),
      n('clawedBackPaise', 'adk.rep.clawedBack', 'rupees'),
      n('toRecoverPaise', 'adk.rep.toRecover', 'rupees'),
    ],
    counsellors: [
      { key: 'counsellor', header: t('adk.col.counsellor'), rowHeader: true },
      n('open', 'adk.rep.open'),
      n('overdue', 'adk.rep.overdue'),
      n('dueToday', 'adk.rep.dueToday'),
      n('calls', 'adk.rep.calls'),
      n('visits', 'adk.rep.visits'),
      n('messages', 'adk.rep.messages'),
      n('converted', 'adk.rep.converted'),
    ],
    'fee-reconciliation': [
      { key: 'applicationNo', header: t('adk.rep.applicationNo') },
      { key: 'name', header: t('adm.col.applicant'), rowHeader: true },
      { key: 'phone', header: t('adk.rep.phone'), hideBelow: 'md' },
      { key: 'cycle', header: t('adm.cycle'), hideBelow: 'lg' },
      n('feePaise', 'adm.cycle.fee', 'rupees'),
      n('daysPending', 'adk.rep.daysPending'),
      n('ordersStarted', 'adk.rep.ordersStarted'),
      n('ordersFailed', 'adk.rep.ordersFailed'),
    ],
    drafts: [
      { key: 'name', header: t('adm.col.applicant'), rowHeader: true },
      { key: 'phone', header: t('adk.rep.phone') },
      { key: 'cycle', header: t('adm.cycle'), hideBelow: 'md' },
      n('step', 'adk.rep.step'),
      { key: 'startedOn', header: t('adk.rep.startedOn'), kind: 'date', hideBelow: 'lg' },
      { key: 'lastSavedOn', header: t('adk.rep.lastSavedOn'), kind: 'date' },
      { key: 'expiresOn', header: t('adk.rep.expiresOn'), kind: 'date', hideBelow: 'lg' },
    ],
  };
  const href = (k: AdmissionReport) => `/admissions/reports?${new URLSearchParams({ kind: k, ...(from && { from }), ...(to && { to }), ...(yearId && { yearId }) })}`;
  const f = funnel.data;
  const vsLast = t('adk.funnel.vsLastYear');

  return (
    <>
      <PageHeader title={t('adk.tab.reports')} subtitle={t('adk.rep.subtitle')} />
      <AdmissionsTabs current="reports" />
      {f && (
        <div className="mb-6 grid gap-4">
          <StatGrid min={180}>
            <StatTile label={t('adk.funnel.enquiries')} value={fmt.number(f.now.enquiries)} trend={{ delta: delta(f.now.enquiries, f.lastYear.enquiries), label: vsLast }} testId="funnel-enquiries" />
            <StatTile label={t('adk.funnel.applications')} value={fmt.number(f.now.applications)} trend={{ delta: delta(f.now.applications, f.lastYear.applications), label: vsLast }} />
            <StatTile label={t('adk.funnel.enrolled')} value={fmt.number(f.now.enrolled)} trend={{ delta: delta(f.now.enrolled, f.lastYear.enrolled), label: vsLast }} />
            <StatTile label={t('adk.funnel.conversion')} value={f.now.enquiries ? `${Math.round((f.now.enrolled / f.now.enquiries) * 1000) / 10}%` : '—'} caption={t('adk.funnel.period', { from: fmt.date(f.from, 'short'), to: fmt.date(f.to, 'short') })} />
            <StatTile label={t('adk.funnel.pending')} value={fmt.number(f.pendingRequests)} href="/admissions/office?view=approvals" tone={f.pendingRequests ? 'warning' : 'default'} />
            <StatTile label={t('adk.funnel.originals')} value={fmt.number(f.originalsHeld)} href="/admissions/office?view=originals&f.status=held" />
          </StatGrid>
          <Card title={t('adk.funnel.chart')}>
            <FunnelChart funnel={f} />
          </Card>
        </div>
      )}
      <LinkTabs value={kind} label={t('adk.tab.reports')} items={ADMISSION_REPORTS.map((k) => ({ value: k, label: t(`adk.rep.kind.${k}` as MessageKey), href: href(k) }))} />
      <FormRow component="form" method="get" className="mb-4">
        <input type="hidden" name="kind" value={kind} />
        <TextInput type="date" name="from" label={t('si.reg.from')} defaultValue={from} slotProps={{ inputLabel: { shrink: true } }} />
        <TextInput type="date" name="to" label={t('si.reg.to')} defaultValue={to} slotProps={{ inputLabel: { shrink: true } }} />
        {BY_YEAR.includes(kind) && <SelectInput name="yearId" label={t('adk.col.year')} defaultValue={yearId} options={(structure.data?.academicYears ?? []).map((y) => ({ value: y.id, label: y.label }))} empty={t('adk.rep.allYears')} className="min-w-[180px]" />}
        {kind === 'conversion' && <SelectInput name="by" label={t('adk.rep.groupBy')} defaultValue={by} options={['programme', 'source', 'counsellor'].map((b) => ({ value: b, label: t(`adk.rep.by.${b}` as MessageKey) }))} className="min-w-[180px]" />}
        <Button type="submit" variant="outlined">
          {t('si.reg.apply')}
        </Button>
      </FormRow>
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : (
        <ReportTable
          rows={rows.data}
          columns={COLUMNS[kind]}
          label={t(`adk.rep.kind.${kind}` as MessageKey)}
          exportName={`admissions-${kind}`}
          totals={kind === 'category-stats' || kind === 'conversion' || kind === 'agent-statement' || kind === 'counsellors'}
          testId={`admission-report-${kind}`}
          empty={
            <EmptyState icon={<ClipboardList />} title={t('si.reg.none')}>
              {t(`adk.rep.none.${kind}` as MessageKey)}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
