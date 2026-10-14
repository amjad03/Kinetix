import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rk.entity.designations') };
}

/** Designations with their grade, cadre (for the AICTE ratio and NAAC lists) and category, in the institution's order. */
export default async function DesignationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hr');
  const { t } = await getI18n();
  const list = await loadRecords('designations', await searchParams);
  return (
    <>
      <PageHeader title={t('rk.entity.designations')} subtitle={t('hk.designations.subtitle')} actions={<LinkButton href="/hr">{t('hf.backToStaff')}</LinkButton>} />
      <SectionTabs tabs={HR_TABS} label="nav.hr" />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="designations" data={list.data} />}
    </>
  );
}
