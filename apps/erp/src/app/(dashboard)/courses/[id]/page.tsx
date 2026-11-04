import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseDesk, type CourseRefs } from '@/components/lms/CourseDesk';
import { CertificatesTab, LiveTab, ModerationTab, RiskTab } from '@/components/lms/CoursePass';
import { LinkButton } from '@/components/LinkButton';
import { Tabbed } from '@/components/ops/kit';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import type { LmsCourse } from '@/lib/lms';
import type { AtRisk, CourseCerts, ForumQueue, LiveSession } from '@/lib/lms-pass';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.courses') };
}

const or = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireSection('courses');
  const { id } = await params;
  const { tab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t } = await getI18n();
  const data = await load(() => api<LmsCourse>(`/v1/lms/courses/${id}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const c = data.data;
  const me = await getMe();
  const enc = encodeURIComponent;
  const [live, risk, certs, queue, quizzes, packages] = c.canManage
    ? await Promise.all([
        or(api<LiveSession[]>(`/v1/lms/courses/${id}/live`), []),
        or(api<AtRisk>(`/v1/lms/courses/${id}/at-risk`), null),
        or(api<CourseCerts>(`/v1/lms/courses/${id}/certificates`), null),
        or(api<ForumQueue>(`/v1/lms/courses/${id}/forum/queue`), { threads: [], posts: [] }),
        or(api<{ id: string; title: string; subjectId: string }[]>(`/v1/lms/quizzes?sectionId=${enc(c.sectionId)}`), []),
        or(api<{ id: string; title: string; version: string }[]>('/v1/scorm/packages'), []),
      ])
    : [[], null, null, { threads: [], posts: [] }, [], []];
  const refs: CourseRefs = { quizzes: quizzes.filter((q) => !c.subjectId || q.subjectId === c.subjectId), packages, live: live.map((l) => ({ id: l.id, title: l.title })) };
  const canRevoke = (me?.roles ?? []).some((r: string) => ['principal', 'tenant_admin', 'hod'].includes(r));
  const pending = queue.threads.length + queue.posts.length;
  const tabs = [
    { id: 'content', label: t('lp.tab.content'), node: <CourseDesk course={c} refs={refs} /> },
    ...(c.canManage
      ? [
          { id: 'live', label: t('lp.tab.live'), node: <LiveTab courseId={id} sessions={live} canManage /> },
          ...(risk ? [{ id: 'risk', label: t('lp.tab.risk', { n: risk.atRisk }), node: <RiskTab data={risk} /> }] : []),
          ...(certs ? [{ id: 'certificates', label: t('lp.tab.certificates'), node: <CertificatesTab courseId={id} data={certs} canRevoke={canRevoke} /> }] : []),
          { id: 'moderation', label: t('lp.tab.moderation', { n: pending }), node: <ModerationTab courseId={id} queue={queue} /> },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader title={c.title} subtitle={`${c.section} · ${c.subject}`} actions={<LinkButton href={`/courses/${id}/gradebook`} variant="outlined">{t('lms.gradebook')}</LinkButton>} />
      <Tabbed tabs={tabs} initial={tab ?? 'content'} label={c.title} />
    </>
  );
}
