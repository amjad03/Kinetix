import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UpdatesDesk, type UpdatesBoard } from '@/components/zynetix/UpdatesDesk';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { PanelRelease, Rollout } from '@/lib/panel';
import type { Fleet, FleetBoard } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxUpdates') };
}

/** Zynetix → Updates: board app releases (APK, desktop builds), rollouts and each board's state. */
export default async function UpdatesPage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const [releases, rollouts, fleet] = await Promise.all([
    load(() => api<PanelRelease[]>('/v1/panel/releases')),
    load(() => api<Rollout[]>('/v1/panel/rollouts')),
    load(() => api<Omit<Fleet, 'boards'> & { boards: (FleetBoard & { updateChannel?: UpdatesBoard['updateChannel'] })[] }>('/v1/devices/fleet')),
  ]);
  const error = releases.error ?? rollouts.error ?? fleet.error;
  return (
    <>
      <PageHeader title={t('nav.zxUpdates')} subtitle={t('zx.p.updatesSubtitle')} />
      {error !== undefined || !releases.data || !rollouts.data || !fleet.data ? (
        <ErrorState message={error ?? ''} />
      ) : (
        <UpdatesDesk
          releases={releases.data}
          rollouts={rollouts.data}
          boards={fleet.data.boards.map((b) => ({ id: b.id, name: b.name, platform: b.platform, appVersion: b.appVersion, enrolled: b.enrolled, updateChannel: b.updateChannel ?? 'stable' }))}
        />
      )}
    </>
  );
}
