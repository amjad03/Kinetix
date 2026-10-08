import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { AuditDesk } from '@/components/quality/AuditDesk';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { AuditOptions, AuditRow, AuditSummaryRow, AuditTemplateRow, NonConformityRow } from '@/lib/quality';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.academicAudit') };
}

export default async function AcademicAuditPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('academicAudit');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const [summary, audits, templates, ncs, options] = await Promise.all([
      api<AuditSummaryRow[]>('/v1/academic-audit/summary'),
      api<AuditRow[]>('/v1/academic-audit/audits'),
      api<AuditTemplateRow[]>('/v1/academic-audit/templates'),
      api<NonConformityRow[]>('/v1/academic-audit/non-conformities'),
      api<AuditOptions>('/v1/academic-audit/options'),
    ]);
    return { summary, audits, templates, ncs, options };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const leader = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return (
    <>
      <PageHeader title={t('nav.academicAudit')} subtitle={t('au.subtitle')} />
      <AuditDesk {...data.data} canWriteTemplates={leader} initialTab={tab ?? 'summary'} />
    </>
  );
}
