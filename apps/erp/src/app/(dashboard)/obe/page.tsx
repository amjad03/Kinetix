import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { ObeHome } from '@/components/obe/ObeHome';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkButton } from '@/components/LinkButton';
import { api, load, requireSection } from '@/lib/api';
import { YEAR_COOKIE } from '@/lib/config';
import { getI18n } from '@/i18n/server';
import type { ObeDash } from '@/lib/obe-flagship';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.obe') };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** The OBE dashboard for the person signed in: leaders and the IQAC see every programme, a head of department their department's courses, an OBE coordinator their programmes. */
export default async function ObeHomePage({ searchParams }: { searchParams: Promise<{ academicYearId?: string; programId?: string }> }) {
  await requireSection('obe');
  const q = await searchParams;
  const { t } = await getI18n();
  const picked = (await cookies()).get(YEAR_COOKIE)?.value;
  const yearId = q.academicYearId && UUID.test(q.academicYearId) ? q.academicYearId : picked && UUID.test(picked) ? picked : '';
  const programId = q.programId && UUID.test(q.programId) ? q.programId : '';
  const data = await load(() => api<ObeDash>(`/v1/obe/dashboard?${new URLSearchParams({ ...(yearId ? { academicYearId: yearId } : {}), ...(programId ? { programId } : {}) })}`));
  return (
    <>
      <PageHeader
        title={t('nav.obe')}
        subtitle={t('of.home.sub')}
        actions={
          <>
            <LinkButton href="/obe/reports" variant="outlined">{t('of.tab.reports')}</LinkButton>
            <LinkButton href="/obe/courses" variant="contained">{t('of.home.open')}</LinkButton>
          </>
        }
      />
      <ObeTabs value="home" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <ObeHome data={data.data} programId={programId} />}
    </>
  );
}
