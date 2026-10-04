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
import { getI18n } from '@/i18n/server';
import { TIMEZONE } from '@/lib/school';
import type { Board } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.live') };
}

export default async function LivePage() {
  await requireSection('live');
  const boards = await load(() => api<Board[]>('/v1/admin/devices'));
  const now = new Date();
  const inClass = (boards.data ?? []).filter((b) => b.session);
  const online = (boards.data ?? []).filter((b) => b.online).length;
  const { t, fmt } = await getI18n();

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={t('nav.live')}
        subtitle={t('live.subtitle')}
      />
      {boards.error !== undefined ? (
        <ErrorState message={boards.error} />
      ) : inClass.length === 0 ? (
        <EmptyState icon={<LiveTvOutlined />} title={t('live.none')} testId="no-live">
          {t('live.noneBody')} {boards.data.length > 0 && t('live.boardsOnline', { n: online, d: boards.data.length })}
        </EmptyState>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }} data-testid="live-list">
          {inClass.map((b) => {
            const s = b.session!;
            const title = [s.subject, s.section].filter(Boolean).join(' · ') || t('live.unscheduled');
            return (
              <Card key={b.id} data-testid="live-card" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 28 }}>
                  {b.online ? (
                    <LiveChip />
                  ) : (
                    <Chip size="small" label={t('live.boardOffline')} variant="outlined" sx={{ color: 'text.secondary' }} />
                  )}
                  <Box sx={{ flex: 1 }} />
                  {(b.viewers ?? 0) > 0 && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }} title={t('live.watchingTip')}>
                      <VisibilityOutlined sx={{ fontSize: 18 }} />
                      <Typography variant="body2">{t('live.watching', { n: b.viewers ?? 0 })}</Typography>
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
                  {t('live.started', { time: fmt.time(s.startedAt, TIMEZONE), ago: fmt.relative(s.startedAt, now, TIMEZONE) })}
                </Typography>
                <Box sx={{ mt: 'auto', pt: 0.5 }}>
                  <LinkButton
                    href={`/live/${b.id}`}
                    variant={b.online ? 'contained' : 'outlined'}
                    startIcon={<PlayArrow />}
                    disabled={!b.online}
                    aria-label={t('live.watchLabel', { title, board: b.name })}
                  >
                    {t('live.watch')}
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
