import type { Metadata } from 'next';
import { VaultDesk } from '@/components/documents/VaultDesk';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { api, ApiError, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { StaffSummary, VaultDocument } from '@/lib/hr-types';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.tab.vault') };
}

const quiet = <T,>(empty: T) => (e: unknown): T => {
  if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return empty;
  throw e;
};

export default async function VaultPage() {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const principalish = roles.some((r) => r === 'principal' || r === 'tenant_admin');
  const canStaff = principalish || roles.includes('hr_manager');
  const [structure, staff, expiring] = await Promise.all([
    principalish ? api<Structure>('/v1/admin/structure').catch(quiet(null)) : null,
    canStaff ? api<StaffSummary[]>('/v1/hr/staff').catch(quiet([] as StaffSummary[])) : [],
    canStaff ? api<VaultDocument[]>('/v1/documents/vault/expiring?days=30').catch(quiet([] as VaultDocument[])) : [],
  ]);
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('doc.vault.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      <VaultDesk
        classes={(structure?.sections ?? []).map((s) => ({ id: s.id, name: s.displayName }))}
        staff={staff.map((s) => ({ id: s.userId, name: s.fullName }))}
        canStudents={principalish}
        canStaff={canStaff}
        expiring={expiring}
      />
    </>
  );
}
