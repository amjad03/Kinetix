import type { Metadata } from 'next';
import { DocumentsDesk, type AvailableTemplate } from '@/components/documents/DocumentsDesk';
import { DOC_TABS, SectionTabs } from '@/components/hr/Common';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { CERT_STATUSES } from '@/lib/documents';
import { getI18n } from '@/i18n/server';
import type { CertificateRequest, StaffSummary } from '@/lib/hr-types';
import { loadFlows } from '@/lib/pathways-b-server';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.documents') };
}

const orEmpty = <T,>(e: unknown, empty: T): T => {
  // Class and staff pickers need roles some office users lack; the page still works without them.
  if (e instanceof ApiError && e.status === 403) return empty;
  throw e;
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const { status } = await searchParams;
  const st = CERT_STATUSES.find((s) => s === status) ?? '';
  const data = await load(async () => {
    const [requests, templates, structure, staff] = await Promise.all([
      api<CertificateRequest[]>(`/v1/documents/requests${st ? `?status=${st}` : ''}`),
      api<AvailableTemplate[]>('/v1/documents/templates/available'),
      api<Structure>('/v1/admin/structure').catch((e: unknown) => orEmpty(e, null)),
      api<StaffSummary[]>('/v1/hr/staff').catch((e: unknown) => orEmpty(e, [] as StaffSummary[])),
    ]);
    return { requests, templates, structure, staff };
  });
  const flows = await loadFlows();
  const roles = me?.roles ?? [];
  const principalish = roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('doc.subtitle')} />
      <SectionTabs tabs={DOC_TABS} label="nav.documents" />
      {data.error !== undefined ? (
        <ErrorState message={data.error} />
      ) : (
        <DocumentsDesk
          requests={data.data.requests}
          status={st}
          templates={data.data.templates}
          classes={(data.data.structure?.sections ?? []).map((s) => ({ id: s.id, name: s.displayName }))}
          staff={data.data.staff.map((s) => ({ id: s.userId, name: s.fullName }))}
          approver={principalish || roles.includes('hr_manager')}
          canBulk={principalish}
          flows={flows}
        />
      )}
    </>
  );
}
