import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HrList } from '@/components/hr/HrList';
import { FacultyProfile } from '@/components/hr/StaffDepth';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState, LinkTabs, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { StaffDetails } from '@/lib/hr-depth';
import type { StaffProfile } from '@/lib/hr-types';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hk.fp.title') };
}

const LISTS = ['qualifications', 'experience', 'publications', 'documents'] as const;
type List = (typeof LISTS)[number];
const ENTITY = { qualifications: 'staff-qualifications', experience: 'staff-experience', publications: 'staff-publications', documents: 'staff-documents' } as const;

/** A staff member's faculty profile: personal, statutory and eligibility details, and their qualifications, experience, publications and documents. */
export default async function FacultyProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { t } = await getI18n();
  const list: List = LISTS.includes(sp.list as List) ? (sp.list as List) : 'qualifications';
  const entity = ENTITY[list];
  const data = await load(() => Promise.all([api<StaffProfile>(`/v1/hr/staff/${id}`), api<StaffDetails>(`/v1/hr/staff/${id}/details`)]));
  const rows = await loadRecords(entity, { ...sp, 'f.user': id });
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hk.fp.title')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const [s, details] = data.data;
  const canEdit = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hr_manager');
  return (
    <>
      <PageHeader title={s.fullName} subtitle={[s.employeeCode, s.designation?.name, s.department?.name].filter(Boolean).join(' · ')} actions={<LinkButton href={`/hr/staff/${id}`}>{t('hk.fp.back')}</LinkButton>} />
      <FacultyProfile details={details} canEdit={canEdit} />
      <div className="mt-6">
        <LinkTabs value={list} label={t('hk.fp.title')} items={LISTS.map((l) => ({ value: l, href: `/hr/staff/${id}/faculty${l === 'qualifications' ? '' : `?list=${l}`}`, label: t(`hk.fac.view.${l}`) }))} />
        {rows.error !== undefined ? <ErrorState message={rows.error} /> : <HrList entity={entity} data={rows.data} extraParams={list === 'qualifications' ? {} : { list }} createDefaults={{ userId: id }} />}
      </div>
    </>
  );
}
