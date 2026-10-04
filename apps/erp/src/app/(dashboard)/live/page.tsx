import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined';
import PlayArrow from '@mui/icons-material/PlayArrow';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LinkButton } from '@/components/LinkButton';
import { LiveChip } from '@/components/live/LiveChip';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { formatTime } from '@/lib/dates';
import { TIMEZONE } from '@/lib/school';
import type { Board } from '@/lib/types';

export const metadata: Metadata = { title: 'Live' };

function minutesSince(iso: string, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

export default async function LivePage() {
  await requireSection('live');
  const boards = await load(() => api<Board[]>('/v1/admin/devices'));
  const now = new Date();
  const inClass = (boards.data ?? []).filter((b) => b.session);
  const online = (boards.data ?? []).filter((b) => b.online).length;

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Live"
        subtitle="Look into a class while it is being taught. You see the board as the class does; every viewing is recorded in the audit log."
      />
      {boards.error !== undefined ? (
        <ErrorState message={boards.error} />
      ) : inClass.length === 0 ? (
        <EmptyState icon={<LiveTvOutlined />} title="No classes on the boards right now" testId="no-live">
          When a teacher signs in on a board, the class appears here and you can watch it.{' '}
          {boards.data.length > 0 && `${online} of ${boards.data.length} boards online.`}
        </EmptyState>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }} data-testid="live-list">
          {inClass.map((b) => {
            const s = b.session!;
            const title = [s.subject, s.section].filter(Boolean).join(' · ') || 'Unscheduled class';
            return (
              <Card key={b.id} data-testid="live-card" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 28 }}>
                  {b.online ? (
                    <LiveChip />
                  ) : (
                    <Chip size="small" label="Board offline" variant="outlined" sx={{ color: 'text.secondary' }} />
                  )}
                  <Box sx={{ flex: 1 }} />
                  {(b.viewers ?? 0) > 0 && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }} title="People watching now">
                      <VisibilityOutlined sx={{ fontSize: 18 }} />
                      <Typography variant="body2">{b.viewers} watching</Typography>
                    </Box>
                  )}
                </Box>
                <Box>
                  <Typography variant="h6" component="h2" sx={{ fontSize: '1.125rem' }}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {s.teacher}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" component="div">
                  {b.name}
                  {b.room && ` · ${b.room}`}
                  <br />
                  Started {formatTime(s.startedAt, TIMEZONE)} · {minutesSince(s.startedAt, now)}
                </Typography>
                <Box sx={{ mt: 'auto', pt: 0.5 }}>
                  <LinkButton
                    href={`/live/${b.id}`}
                    variant={b.online ? 'contained' : 'outlined'}
                    startIcon={<PlayArrow />}
                    disabled={!b.online}
                    aria-label={`Watch ${title} on ${b.name}`}
                  >
                    Watch
                  </LinkButton>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
}
