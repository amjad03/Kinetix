import type { Metadata } from 'next';
import { IssuedRegister } from '@/components/documents/IssuedRegister';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canApprovePayroll } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { IssuedDocument } from '@/lib/doc-designs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.tab.issued') };
}

/** Documents > Issued: every document issued with a verification QR. */
export default async function IssuedPage() {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const data = await load(() => api<IssuedDocument[]>('/v1/documents/issued'));
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('di.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <IssuedRegister rows={data.data} canManage={!!me && canApprovePayroll(me.roles)} />}
    </>
  );
}
