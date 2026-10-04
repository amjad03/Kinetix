import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { LiveWatch } from '@/components/live/LiveWatch';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { TIMEZONE } from '@/lib/school';
import type { Board } from '@/lib/types';

export const metadata: Metadata = { title: 'Watch live' };

export default async function WatchPage({ params }: { params: Promise<{ deviceId: string }> }) {
  await requireSection('live');
  const { deviceId } = await params;
  const boards = await load(() => api<Board[]>('/v1/admin/devices'));
  if (boards.error !== undefined) {
    return (
      <>
        <PageHeader title="Live" />
        <ErrorState message={boards.error} />
      </>
    );
  }
  const b = boards.data.find((x) => x.id === deviceId);
  if (!b) {
    return (
      <>
        <PageHeader title="Live" />
        <EmptyState
          icon={<CastForEducationOutlined />}
          title="Board not found"
          actions={
            <LinkButton href="/live" variant="contained">
              Back to Live
            </LinkButton>
          }
        >
          It may have been removed, or the link is wrong.
        </EmptyState>
      </>
    );
  }
  return (
    <LiveWatch
      key={b.id}
      timeZone={TIMEZONE}
      board={{
        id: b.id,
        name: b.name,
        room: b.room,
        session: b.session ? { teacher: b.session.teacher, section: b.session.section, subject: b.session.subject, startedAt: b.session.startedAt } : null,
      }}
    />
  );
}
