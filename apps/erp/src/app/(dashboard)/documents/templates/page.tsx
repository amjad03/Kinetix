import type { Metadata } from 'next';
import { DesignGallery } from '@/components/documents/DesignGallery';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import { type Branding, DOC_TYPES, type DocTemplateSummary, type DocType } from '@/lib/doc-designs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.tab.templates') };
}

/** Documents > Templates: the gallery of designs per document type. */
export default async function DesignsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const { type } = await searchParams;
  const data = await load(() => Promise.all([api<DocTemplateSummary[]>('/v1/documents/designs'), api<Branding>('/v1/admin/branding')]));
  const initialType: DocType = (DOC_TYPES as readonly string[]).includes(type ?? '') ? (type as DocType) : 'student_id_card';
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('dt.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <DesignGallery designs={data.data[0]} stamp={data.data[1].updatedAt ?? '0'} canEdit={!!me && canApprovePayroll(me.roles)} initialType={initialType} />
      )}
    </>
  );
}
