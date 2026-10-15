import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CoRegister } from '@/components/obe/ObeKitLists';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { CoursesTable } from '@/components/obe/ObeHome';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { YEAR_COOKIE } from '@/lib/config';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';
import type { ObeDash } from '@/lib/obe-flagship';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.courses') };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** The courses of the year with their OBE state (open one for its COs, papers, marks and attainment), and the register of every CO. */
export default async function ObeCoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('obe');
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const view = one(sp.view) === 'register' ? 'register' : 'courses';
  const { t } = await getI18n();
  const picked = (await cookies()).get(YEAR_COOKIE)?.value;
  const y = one(sp.academicYearId);
  const yearId = y && UUID.test(y) ? y : picked && UUID.test(picked) ? picked : '';
  const head = (
    <>
      <PageHeader title={t('of.tab.courses')} subtitle={t('of.courses.sub')} />
      <ObeTabs value="courses" />
      <LinkTabs value={view} label={t('of.tab.courses')} items={[{ value: 'courses', label: t('of.courses.list'), href: '/obe/courses' }, { value: 'register', label: t('of.reg.title'), href: '/obe/courses?view=register' }]} />
    </>
  );
  if (view === 'register') {
    const records = await loadRecords('obe-cos', sp);
    return <>{head}{records.error !== undefined ? <ErrorState message={records.error} /> : <CoRegister meta={records.data.meta} page={records.data.page} state={records.data.state} />}</>;
  }
  const data = await load(() => api<ObeDash>(`/v1/obe/dashboard${yearId ? `?academicYearId=${yearId}` : ''}`));
  if (data.error !== undefined) return <>{head}<ErrorState message={data.error} /></>;
  return (
    <>
      {head}
      <Card padded={false} testId="of-courses">
        <CoursesTable courses={data.data.courses} programs={data.data.programs} yearId={data.data.year?.id} label={t('of.courses.list')} />
      </Card>
    </>
  );
}
