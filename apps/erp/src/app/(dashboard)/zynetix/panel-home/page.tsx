import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LauncherDesk } from '@/components/zynetix/LauncherDesk';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { LauncherApp } from '@/lib/panel';
import type { Fleet } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxPanelHome') };
}

/** Zynetix → Panel home: the apps allowed on Android panels' home, for the institution or one board. */
export default async function PanelHomePage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const [launcher, fleet] = await Promise.all([load(() => api<{ apps: LauncherApp[] }>('/v1/panel/launcher')), load(() => api<Fleet>('/v1/devices/fleet'))]);
  const error = launcher.error ?? fleet.error;
  return (
    <>
      <PageHeader title={t('nav.zxPanelHome')} subtitle={t('zx.p.homeSubtitle')} />
      {error !== undefined || !launcher.data || !fleet.data ? (
        <ErrorState message={error ?? ''} />
      ) : (
        <LauncherDesk initial={launcher.data.apps} boards={fleet.data.boards.map((b) => ({ id: b.id, name: b.name, platform: b.platform, appVersion: b.appVersion, enrolled: b.enrolled }))} />
      )}
    </>
  );
}
