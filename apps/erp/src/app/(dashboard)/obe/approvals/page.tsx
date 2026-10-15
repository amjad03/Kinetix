import type { Metadata } from 'next';
import { ApprovalsList } from '@/components/obe/CourseWorkspace';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { Approval } from '@/lib/obe-flagship';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.approvals') };
}

/** Course outcomes waiting at a step the person decides: head of department, OBE coordinator or IQAC. */
export default async function ObeApprovalsPage() {
  await requireSection('obe');
  const { t } = await getI18n();
  const rows = await load(() => api<Approval[]>('/v1/obe/approvals'));
  return (
    <>
      <PageHeader title={t('of.tab.approvals')} subtitle={t('of.appr.sub')} />
      <ObeTabs value="approvals" />
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : (
        <Card padded={false} testId="of-approvals">
          <ApprovalsList rows={rows.data} />
        </Card>
      )}
    </>
  );
}
