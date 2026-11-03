import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { AisheTable, ApprovalTable, IntakeTable } from '@/components/admissions/PassTables';
import { LinkButton } from '@/components/LinkButton';
import { Bar } from '@/components/ops/kit';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { Card } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import type { AisheRow, ApprovalRow, IntakeRow } from '@/lib/admissions-pass';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.tab.returns') };
}

interface Year { id: string; label: string; isCurrent: boolean }
interface Cycle { id: string; name: string; academicYearId: string }
const UUID = /^[0-9a-f-]{36}$/i;

/** What admissions files: the university approval list, intake against the sanctioned seats, and AISHE block 5. */
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ year?: string; cycle?: string }> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const { t } = await getI18n();
  const [years, cycles] = await Promise.all([load(async () => (await api<Structure>('/v1/admin/structure')).academicYears as Year[]), load(() => api<Cycle[]>('/v1/admissions/cycles'))]);
  const year = years.data?.find((y) => y.id === sp.year) ?? years.data?.find((y) => y.isCurrent) ?? years.data?.[0];
  const cycle = sp.cycle && UUID.test(sp.cycle) ? sp.cycle : '';
  const [approval, intake, aishe] = year
    ? await Promise.all([
        load(() => api<{ rows: ApprovalRow[] }>(`/v1/admissions/returns/approval-list?${cycle ? `cycleId=${cycle}` : `yearId=${year.id}`}`)),
        load(() => api<IntakeRow[]>(`/v1/admissions/returns/intake?yearId=${year.id}`)),
        load(() => api<{ rows: AisheRow[] }>(`/v1/admissions/returns/aishe?yearId=${year.id}`)),
      ])
    : [null, null, null];
  const err = years.error ?? cycles.error ?? approval?.error ?? intake?.error ?? aishe?.error;
  const csv = `/api/admissions/approval-list?${cycle ? `cycleId=${cycle}` : `yearId=${year?.id ?? ''}`}`;
  return (
    <>
      <PageHeader title={t('ap.tab.returns')} subtitle={t('ap.ret.subtitle')} />
      <AdmissionsTabs current="returns" />
      {err !== undefined ? (
        <ErrorState message={err} />
      ) : (
        <>
          <Bar>
            <UrlSelect label={t('ap.ret.year')} param="year" value={year?.id ?? ''} options={(years.data ?? []).map((y) => ({ value: y.id, label: y.label }))} minWidth={160} />
            <UrlSelect label={t('ap.cycle')} param="cycle" value={cycle} options={[{ value: '', label: t('ap.ret.allCycles') }, ...(cycles.data ?? []).filter((c) => c.academicYearId === year?.id).map((c) => ({ value: c.id, label: c.name }))]} minWidth={280} />
            <LinkButton href={csv} variant="outlined" startIcon={<Download />}>
              {t('ap.ret.csv')}
            </LinkButton>
          </Bar>
          <div className="grid gap-6">
            <Card title={t('ap.ret.approval')} subtitle={t('ap.ret.approvalHelp')}>
              <ApprovalTable rows={approval?.data?.rows ?? []} />
            </Card>
            <Card title={t('ap.ret.intake')} subtitle={t('ap.ret.intakeHelp')}>
              <IntakeTable rows={intake?.data ?? []} />
            </Card>
            <Card title={t('ap.ret.aishe')} subtitle={t('ap.ret.aisheHelp')}>
              <AisheTable rows={aishe?.data?.rows ?? []} />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
