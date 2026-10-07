import type { Metadata } from 'next';
import { TemplatesManager } from '@/components/documents/TemplatesManager';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { CertificateTemplate } from '@/lib/hr-types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.tab.templates') };
}

export default async function TemplatesPage() {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const data = await load(() => api<CertificateTemplate[]>('/v1/documents/templates'));
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('doc.tpl.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TemplatesManager templates={data.data} canEdit={!!me && canApprovePayroll(me.roles)} />}
    </>
  );
}
