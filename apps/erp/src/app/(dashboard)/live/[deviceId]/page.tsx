import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { LiveWatch } from '@/components/live/LiveWatch';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import { canSee } from '@/lib/access';
import type { Board } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('live.watchTitle') };
}

export default async function WatchPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const me = await requireSection('live');
  const { t } = await getI18n();
  const { deviceId } = await params;
  const boards = await load(() => api<Board[]>('/v1/admin/devices'));
  if (boards.error !== undefined) {
    return (
      <>
        <PageHeader title={t('nav.live')} />
        <ErrorState message={boards.error} />
      </>
    );
  }
  const b = boards.data.find((x) => x.id === deviceId);
  if (!b) {
    return (
      <>
        <PageHeader title={t('nav.live')} />
        <EmptyState
          icon={<CastForEducationOutlined />}
          title={t('live.boardNotFound')}
          actions={
            <LinkButton href="/live" variant="contained">
              {t('live.back')}
            </LinkButton>
          }
        >
          {t('live.boardNotFoundBody')}
        </EmptyState>
      </>
    );
  }
  return (
    <LiveWatch
      key={b.id}
      timeZone={TIMEZONE}
      canChangeSettings={!!me && canSee(me.roles, 'settings')}
      board={{
        id: b.id,
        name: b.name,
        room: b.room,
        session: b.session ? { teacher: b.session.teacher, section: b.session.section, subject: b.session.subject, startedAt: b.session.startedAt } : null,
      }}
    />
  );
}
