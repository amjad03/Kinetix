import type { Metadata } from 'next';
import { QrReviewTable } from '@/components/attendance-desk/PassViews';
import { AttendanceTabs, DateField, FilterForm } from '@/components/attendance-desk/kit';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { QrScanRow } from '@/lib/attendance-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atdp.qr.title') };
}

const STATUSES = ['flagged', 'decided', 'refused', 'all'] as const;
type Status = (typeof STATUSES)[number];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Attendance → QR review: self-marks held by the anti-proxy checks (another phone, outside the campus geofence, a poor
 * or mocked location, a late scan) for the period's teacher, head of department or principal to accept or reject,
 * with decided and refused scans kept for the record.
 */
export default async function QrReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const status: Status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : 'flagged';
  const q = new URLSearchParams({ status, pageSize: '200', ...(sp.from && DAY.test(sp.from) ? { from: sp.from } : {}), ...(sp.to && DAY.test(sp.to) ? { to: sp.to } : {}) });
  const res = await load(() => api<{ from: string; to: string; total: number; rows: QrScanRow[] }>(`/v1/attendance-desk/qr-scans?${q.toString()}`));
  const keep = (s: Status) => `/attendance/qr-review?${new URLSearchParams({ status: s, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString()}`;
  return (
    <>
      <PageHeader title={t('atdp.qr.title')} subtitle={t('atdp.qr.subtitle')} />
      <AttendanceTabs value="qr" t={t} />
      <LinkTabs value={status} label={t('atdp.qr.title')} items={STATUSES.map((s) => ({ value: s, label: t(`atdp.qr.tab.${s}`), href: keep(s) }))} />
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <FilterForm submit={t('atd.show')} hidden={{ status }}>
            <DateField label={t('atd.from')} name="from" value={res.data.from} />
            <DateField label={t('atd.to')} name="to" value={res.data.to} />
          </FilterForm>
          <p className="mb-3 text-sm text-muted-foreground">{t('atdp.qr.count', { n: res.data.total })}</p>
          <QrReviewTable rows={res.data.rows} status={status} />
        </>
      )}
    </>
  );
}
