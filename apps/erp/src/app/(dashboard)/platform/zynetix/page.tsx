import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs, StatusPill } from '@/components/ui';
import { UrlSelect } from '@/components/UrlSelect';
import { LibraryDesk } from '@/components/zynetix/LibraryDesk';
import { TenantsDesk } from '@/components/zynetix/TenantsDesk';
import { YoutubeImport } from '@/components/zynetix/YoutubeImport';
import { getI18n } from '@/i18n/server';
import { api, load, requirePlatformAdmin } from '@/lib/api';
import type { PlatformCourseTree, PlatformLibraryCurriculum } from '@/lib/types';
import type { PlatformTenant } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxPlatform') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tab = 'institutions' | 'library' | 'youtube';

/** Platform team: institutions and their edition, the global library's materials, and YouTube import into it. */
export default async function PlatformZynetixPage({ searchParams }: { searchParams: Promise<{ tab?: string; course?: string }> }) {
  await requirePlatformAdmin();
  const { t } = await getI18n();
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'library' || sp.tab === 'youtube' ? sp.tab : 'institutions';
  const tabs = (['institutions', 'library', 'youtube'] as const).map((v) => ({ value: v, label: t(`zx.pl.tab.${v}`), href: `/platform/zynetix?tab=${v}` }));

  let body: React.ReactNode;
  if (tab === 'institutions') {
    const tenants = await load(() => api<PlatformTenant[]>('/v1/platform/tenants'));
    body = tenants.error !== undefined ? <ErrorState message={tenants.error} /> : <TenantsDesk tenants={tenants.data} />;
  } else {
    const library = await load(() => api<PlatformLibraryCurriculum[]>('/v1/platform/library'));
    if (library.error !== undefined) body = <ErrorState message={library.error} />;
    else {
      const courses = library.data.flatMap((c) => c.courses.map((x) => ({ id: x.id, label: `${x.code} · ${x.title}`, group: c.name })));
      if (tab === 'youtube') body = <YoutubeImport scope="platform" courses={courses} />;
      else {
        const course = courses.find((c) => c.id === sp.course) ?? courses[0];
        const [tree, animations] = course && UUID.test(course.id) ? await Promise.all([load(() => api<PlatformCourseTree>(`/v1/platform/library/courses/${course.id}`)), load(() => api<{ id: string; title: string }[]>('/v1/topics/animations'))]) : [null, null];
        body = (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-4">
              {course && <UrlSelect label={t('zx.pl.course')} value={`tab=library&course=${course.id}`} minWidth={360} options={courses.map((c) => ({ value: `tab=library&course=${c.id}`, label: c.label, group: c.group }))} />}
              {course && (
                <LinkButton href={`/platform/concept-videos/${course.id}`} variant="outlined">
                  {t('nav.conceptVideos')}
                </LinkButton>
              )}
            </div>
            {!tree ? (
              <p className="text-sm text-muted-foreground">{t('zx.pl.noCourses')}</p>
            ) : tree.error !== undefined ? (
              <ErrorState message={tree.error} />
            ) : (
              <LibraryDesk scope="platform" videosHref={`/platform/concept-videos/${tree.data.id}`} animations={animations?.data ?? []} chapters={tree.data.chapters.map((c) => ({ id: c.id, title: c.title, topics: c.topics.map((tp) => ({ id: tp.id, title: tp.title, videos: tp.videos })) }))} />
            )}
          </>
        );
      }
    }
  }

  return (
    <>
      <PageHeader title={t('nav.zxPlatform')} subtitle={t('zx.pl.subtitle')} actions={<StatusPill tone="info">{t('pv.teamOnly')}</StatusPill>} />
      <div className="mb-4">
        <LinkTabs value={tab} items={tabs} label={t('nav.zxPlatform')} />
      </div>
      {body}
    </>
  );
}
