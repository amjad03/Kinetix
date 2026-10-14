import type { Metadata } from 'next';
import { StructureRecords, type StructureEntity } from '@/components/academics/StructureRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.structure') };
}

const TABS: StructureEntity[] = ['programmes', 'classes', 'subjects'];

/** Academics → Programmes, classes and subjects: the academic structure as record kit lists, one tab each. */
export default async function StructurePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('departments');
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as StructureEntity) ? (sp.tab as StructureEntity) : 'programmes';
  const { t } = await getI18n();
  const records = await loadRecords(tab, sp);
  return (
    <>
      <PageHeader title={t('nav.structure')} subtitle={t('rk.structure.subtitle')} />
      <LinkTabs value={tab} label={t('nav.structure')} items={TABS.map((x) => ({ value: x, label: t(`rk.entity.${x}`), href: `/academics/structure?tab=${x}` }))} />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <StructureRecords entity={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
