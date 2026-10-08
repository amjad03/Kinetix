import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { AddBoardButton } from '@/components/boards/AddBoardDialog';
import { BoardsTable } from '@/components/boards/BoardsTable';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { TIMEZONE } from '@/lib/school';
import { BOARD_ADMIN_ROLES, type Board, type Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.boards') };
}

export default async function BoardsPage() {
  await requireSection('boards');
  const [me, boards, structure] = await Promise.all([getMe(), load(() => api<Board[]>('/v1/admin/devices')), load(() => api<Structure>('/v1/admin/structure'))]);
  const allowed = me.roles.some((r) => BOARD_ADMIN_ROLES.includes(r));
  const list = boards.data ?? [];
  const now = new Date();
  const online = list.filter((b) => b.online).length;
  const inClass = list.filter((b) => b.session).length;
  const waiting = list.filter((b) => !b.enrolled).length;
  const { t } = await getI18n();

  return (
    <>
      <PageHeader
        title={t('nav.boards')}
        subtitle={t('boards.subtitle')}
        actions={structure.data ? <AddBoardButton structure={structure.data} allowed={allowed} timeZone={TIMEZONE} /> : undefined}
      />
      {boards.error !== undefined ? (
        <ErrorState message={boards.error} />
      ) : list.length === 0 ? (
        <EmptyState icon={<CastForEducationOutlined />} title={t('boards.none')} testId="no-boards">
          {t('boards.noneBody')}
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label={t('boards.stat.boards')} value={list.length} caption={waiting ? t('boards.stat.waiting', { n: waiting }) : t('boards.stat.allEnrolled')} />
            <StatTile label={t('boards.stat.online')} value={online} unit={t('boards.stat.of', { n: list.length - waiting })} caption={t('boards.stat.onlineCaption')} />
            <StatTile label={t('boards.stat.inClass')} value={inClass} tone={inClass ? 'live' : 'default'} caption={inClass ? t('boards.stat.teacherIn') : t('boards.stat.noTeacher')} />
          </StatGrid>
          <Box sx={{ mt: 3 }} />
          <BoardsTable boards={list} allowed={allowed} timeZone={TIMEZONE} nowIso={now.toISOString()} />
        </>
      )}
    </>
  );
}
