import type { Metadata } from 'next';
import { UserCheck } from 'lucide-react';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { KitList } from '@/components/admissions/KitList';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import type { Tone } from '@/components/ui';
import { requireSection } from '@/lib/api';
import { APPLICATION_STATUSES, applicationTone } from '@/lib/admissions';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.applications') };
}

const TONE: Record<string, Tone> = { default: 'neutral', info: 'info', success: 'success', warning: 'warning', error: 'danger' };

/**
 * Applications as a record kit list: search, filters (cycle, status, fee, quota, admission type, nationality,
 * documents to verify), counter applications and their import, bulk review, reject, reopen and withdraw with a
 * reason, export, history and saved views. A row opens the application's review page.
 */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  // Old links used ?cycle= and ?status=; they become the list's filters.
  const legacy = { ...(typeof sp.cycle === 'string' && { 'f.cycle': sp.cycle }), ...(typeof sp.status === 'string' && { 'f.status': sp.status }) };
  const loaded = await loadRecords('applications', { ...sp, ...legacy });
  const { t } = await getI18n();
  const statusLabels = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, t(`adm.app.${s}` as MessageKey)]));
  const statusTones = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, TONE[applicationTone(s)]]));
  const reason = (label: MessageKey) => [{ key: 'reason', label: t(label), type: 'textarea' as const, required: true, min: 3 }];
  return (
    <>
      <PageHeader title={t('adm.tab.applications')} subtitle={t('adm.apps.subtitle')} />
      <AdmissionsTabs current="applications" />
      {loaded.error !== undefined ? (
        <ErrorState message={loaded.error} />
      ) : (
        <KitList
          meta={loaded.data.meta}
          page={loaded.data.page}
          state={loaded.data.state}
          label={t('adm.tab.applications')}
          rowHref="/admissions/applications/{id}"
          columns={[
            { key: 'applicantName', header: t('adm.col.applicant'), sortKey: 'name', rowHeader: true, sub: 'applicationNo' },
            { key: 'cycleName', header: t('adm.cycle'), sortKey: 'cycle', hideBelow: 'md' },
            { key: 'status', header: t('adm.col.status'), sortKey: 'status', kind: 'pill', labels: statusLabels, tones: statusTones },
            { key: 'feeStatus', header: t('adm.col.fee'), hideBelow: 'lg', labels: Object.fromEntries(['none', 'pending', 'paid', 'waived'].map((s) => [s, t(`adm.fee.${s}` as MessageKey)])) },
            { key: 'quota', header: t('adk.col.quota'), hideBelow: 'lg', labels: Object.fromEntries(['merit', 'management', 'nri', 'sports', 'pwd', 'other'].map((s) => [s, t(`adk.quota.${s}` as MessageKey)])) },
            { key: 'admissionType', header: t('adk.col.admissionType'), defaultHidden: true, labels: Object.fromEntries(['regular', 'lateral', 'transfer'].map((s) => [s, t(`si.o.admissionType.${s}` as MessageKey)])) },
            { key: 'nationality', header: t('adk.col.nationality'), defaultHidden: true, labels: Object.fromEntries(['indian', 'nri', 'foreign'].map((s) => [s, t(`adk.nationality.${s}` as MessageKey)])) },
            { key: 'meritScore', header: t('adm.col.merit'), sortKey: 'merit', kind: 'number', hideBelow: 'md' },
            { key: 'docsPending', header: t('adk.col.docsPending'), kind: 'number', defaultHidden: true },
            { key: 'submittedAt', header: t('adm.col.submitted'), sortKey: 'submitted', kind: 'date', hideBelow: 'sm' },
          ]}
          rowActionKeys={['review', 'reject', 'reopen', 'withdraw']}
          actionParams={{ reject: reason('adk.why.reject'), reopen: reason('adk.why.reopen'), withdraw: reason('adk.why.withdraw') }}
          empty={
            <EmptyState icon={<UserCheck />} title={t('adm.apps.none')} testId="no-applications">
              {t('adm.apps.noneBody')}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
