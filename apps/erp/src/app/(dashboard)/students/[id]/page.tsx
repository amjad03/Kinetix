import NextLink from 'next/link';
import type { MessageKey } from '@/i18n/messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequestList } from '@/components/academics/shared';
import { RecordPage } from '@/components/templates';
import { LinkButton } from '@/components/LinkButton';
import { SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LifecycleTimeline } from '@/components/students/LifecycleTimeline';
import { StudentActions } from '@/components/students/StudentActions';
import { ApiError, api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentProfile } from '@/lib/admissions';
import { statusTone, type AuditRow, type RequestRow } from '@/lib/academics';
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
  const [requests, activity] = await Promise.all([load(() => api<RequestRow[]>(`/v1/academics/requests?studentId=${id}`)), load(() => api<AuditRow[]>(`/v1/academics/activity/${id}`))]);
  const reqRows = requests.data ?? [];
  const onRolls = ['active', 'enrolled', 'on_leave', 'detained'].includes(s.status);
  return (
    <>
      {back}
      <RecordPage
        title={s.fullName}
        subtitle={`${s.section.displayName} · ${t('stu.rollNo', { roll: s.rollNo })} · ${s.program.name}`}
        status={{ label: t(`acad.stu.${s.status}` as MessageKey), tone: statusTone(s.status) }}
        facts={[
          { label: t('acad.col.section'), value: <NextLink className="underline" href={`/academics/sections/${s.section.id}`}>{s.section.displayName}</NextLink> },
          { label: t('acad.col.rollNo'), value: s.rollNo },
          { label: t('acad.col.program'), value: s.program.name },
          { label: t('acad.joined'), value: s.enrolledOn ? formatDate(s.enrolledOn, 'long', locale) : '—' },
          { label: t('acad.children'), value: String(s.guardians.length) },
        ]}
        primary={onRolls ? <LinkButton variant="contained" href={`/academics?new=section_change&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.section_change')}</LinkButton> : undefined}
        secondary={onRolls ? <LinkButton variant="outlined" href={`/academics?new=withdrawal&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.withdrawal')}</LinkButton> : undefined}
        overview={
          <>
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
        }
        related={[
          {
            value: 'guardians',
            label: t('acad.guardians'),
            count: s.guardians.length,
            content: (
              <ul className="grid gap-3">
                {s.guardians.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[12px] border bg-card p-4">
                    {g.userId ? <NextLink className="font-medium underline" href={`/academics/guardians/${g.userId}`}>{g.fullName}</NextLink> : <span className="font-medium">{g.fullName}</span>}
                    <span className="text-sm text-muted-foreground">{g.relation}{g.isPrimary ? ` · ${t('acad.primary')}` : ''}</span>
                    <span className="text-sm">{g.phone ?? ''}</span>
                  </li>
                ))}
              </ul>
            ),
          },
          { value: 'requests', label: t('acad.tab.requests'), count: reqRows.length, content: <RequestList rows={reqRows} label={t('acad.tab.requests')} /> },
        ]}
        activity={(activity.data ?? []).map((a) => {
          const key = `acad.audit.${a.action}`;
          const label = t(key as MessageKey);
          return { id: String(a.id), at: a.at, actor: a.actor ?? t('acad.system'), action: label === key ? a.action.replace(/[._]/g, ' ') : label };
        })}
      />
    </>
  );
}
