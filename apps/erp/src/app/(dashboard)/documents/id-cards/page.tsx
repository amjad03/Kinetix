import type { Metadata } from 'next';
import { IdCardsDesk } from '@/components/documents/IdCardsDesk';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { api, ApiError, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.tab.idCards') };
}

export default async function IdCardsPage() {
  await requireSection('documents');
  const { t } = await getI18n();
  const structure = await api<Structure>('/v1/admin/structure').catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 403) return null;
    throw e;
  });
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('doc.id.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      <IdCardsDesk classes={(structure?.sections ?? []).map((s) => ({ id: s.id, name: s.displayName }))} canStudents={!!structure} />
    </>
  );
}
