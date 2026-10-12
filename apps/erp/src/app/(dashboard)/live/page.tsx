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

import { Card, Chip } from '@/components/kx';
import { Eye as VisibilityOutlined, Play as PlayArrow, Tv as LiveTvOutlined } from 'lucide-react';
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
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]" data-testid="live-list">
          {inClass.map((b) => {
            const s = b.session!;
            const title = [s.subject, s.section].filter(Boolean).join(' · ') || t('live.unscheduled');
            return (
              <Card className="p-5 flex flex-col gap-3" key={b.id} data-testid="live-card">
                <div className="flex items-center gap-2 min-h-[28px]">
                  {b.online ? (
                    <LiveChip />
                  ) : (
                    <Chip className="text-muted-foreground" size="small" label={t('live.boardOffline')} variant="outlined" />
                  )}
                  <div className="flex-1" />
                  {(b.viewers ?? 0) > 0 && (
                    <div className="inline-flex items-center gap-1 text-muted-foreground" title={t('live.watchingTip')}>
                      <VisibilityOutlined className="text-[18px]" />
                      <p className="text-[13px] leading-[19px]">{t('live.watching', { n: b.viewers ?? 0 })}</p>
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="font-medium tracking-[0.1px] text-[1.125rem]">
                    {title}
                  </h2>
                  <p className="text-[13px] leading-[19px] text-muted-foreground">
                    {s.teacher}
                  </p>
                </div>
                <div className="text-[13px] leading-[19px] text-muted-foreground">
                  {b.name}
                  {b.room && ` · ${b.room}`}
                  <br />
                  {t('live.started', { time: fmt.time(s.startedAt, TIMEZONE), ago: fmt.relative(s.startedAt, now, TIMEZONE) })}
                </div>
                <div className="mt-auto pt-1">
                  <LinkButton
                    href={`/live/${b.id}`}
                    variant={b.online ? 'contained' : 'outlined'}
                    startIcon={<PlayArrow />}
                    disabled={!b.online}
                    aria-label={t('live.watchLabel', { title, board: b.name })}
                  >
                    {t('live.watch')}
                  </LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
