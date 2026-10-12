import NextLink from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/admissions/Chips';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LifecycleTimeline } from '@/components/students/LifecycleTimeline';
import { StudentActions } from '@/components/students/StudentActions';
import { ApiError, api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentProfile } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { Alert, Link } from '@/components/kx';
import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('stu.profile') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('students');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<StudentProfile>(`/v1/students/${id}/profile`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/students" size="small" startIcon={<ArrowBack />}>
        {t('nav.students')}
      </LinkButton>
    </div>
  );
  if (res.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={res.error} />
      </>
    );
  }
  const s = res.data;
  const canChange = me ? canChangeLifecycle(me.roles) : false;
  const structure = canChange ? await load(() => api<Structure>('/v1/admin/structure')) : undefined;
  const sameProgram = (structure?.data?.sections ?? []).filter((x) => x.programId === s.program.id && x.id !== s.section.id).map((x) => ({ id: x.id, name: x.displayName }));
  return (
    <>
      {back}
      <PageHeader title={s.fullName} subtitle={`${s.section.displayName} · ${t('stu.rollNo', { roll: s.rollNo })} · ${s.program.name}`} actions={<StatusPill kind="student" status={s.status} />} />
      {s.finalTerm && s.status === 'active' && (
        <Alert className="mb-4" severity="info">
          {t('stu.finalTerm')}
        </Alert>
      )}
      <div className="grid grid-cols-[1fr] lg:grid-cols-[1fr_1fr] gap-6">
        <div>
          <div className="rounded-[12px] border bg-card p-5">
            <SectionTitle flush>{t('stu.admission')}</SectionTitle>
            <p className="text-[13px] leading-[19px]">{s.enrolledOn ? t('stu.joined', { date: formatDate(s.enrolledOn, 'long', locale) }) : t('stu.noJoinDate')}</p>
            {s.application && (
              <p className="text-[13px] leading-[19px] mt-1">
                <Link component={NextLink} href={`/admissions/applications/${s.application.id}`}>
                  {s.application.applicationNo}
                </Link>{' '}
                · {s.application.cycleName}
              </p>
            )}
          </div>
          <StudentActions student={s} canChange={canChange} canGuardians classes={sameProgram} />
        </div>
        <div className="rounded-[12px] border bg-card p-5">
          <SectionTitle flush>{t('stu.timeline')}</SectionTitle>
          <LifecycleTimeline events={s.timeline} />
        </div>
      </div>
    </>
  );
}
