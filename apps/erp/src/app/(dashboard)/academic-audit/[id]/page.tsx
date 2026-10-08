import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { AuditSheet } from '@/components/quality/AuditSheet';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { AuditDetail, AuditOptions } from '@/lib/quality';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.academicAudit') };
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('academicAudit');
  const { id } = await params;
  const { t } = await getI18n();
  const data = await load(async () => {
    const [audit, options] = await Promise.all([api<AuditDetail & { conductedOn: string; departmentId: string }>(`/v1/academic-audit/audits/${encodeURIComponent(id)}`), api<AuditOptions>('/v1/academic-audit/options')]);
    return { audit, options };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { audit, options } = data.data;
  const department = options.departments.find((d) => d.id === audit.departmentId)?.name ?? '';
  return (
    <>
      <PageHeader title={audit.title} subtitle={t('au.sheet.subtitle', { department, date: audit.conductedOn })} />
      <AuditSheet audit={audit} owners={options.owners} />
    </>
  );
}
