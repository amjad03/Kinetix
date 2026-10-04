import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { AddBoardButton } from '@/components/boards/AddBoardDialog';
import { BoardMenu } from '@/components/boards/BoardMenu';
import { TableFrame } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { api, getMe, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/translate';
import { TIMEZONE } from '@/lib/school';
import { BOARD_ADMIN_ROLES, type Board, type Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.boards') };
}

const PLATFORM: Record<string, string> = { android: 'Android', windows: 'Windows', linux: 'Linux', web: 'Web' };

function StatusDot({ b, t }: { b: Board; t: TFunction }) {
  const [color, label] = !b.enrolled ? ['m3.outline', t('boards.waiting')] : b.online ? ['kx.success', t('boards.online')] : ['m3.outlineVariant', t('boards.offline')];
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
      <Box
        component="span"
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: b.enrolled ? color : 'transparent',
          border: b.enrolled ? 0 : 2,
          borderColor: color,
          boxShadow: b.online ? '0 0 0 3px rgba(24,128,56,.18)' : 'none',
        }}
      />
      <Typography variant="body2" sx={{ color: b.online ? 'text.primary' : 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  );
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
  const { t, fmt } = await getI18n();

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
          <TableFrame testId="boards-table">
            <Table sx={{ minWidth: 820 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('boards.col.board')}</TableCell>
                  <TableCell>{t('boards.col.status')}</TableCell>
                  <TableCell>{t('boards.col.room')}</TableCell>
                  <TableCell>{t('boards.col.now')}</TableCell>
                  <TableCell>{t('boards.col.platform')}</TableCell>
                  <TableCell>{t('boards.col.lastSeen')}</TableCell>
                  {allowed && <TableCell aria-label={t('boards.col.actions')} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id} hover data-testid="board-row">
                    <TableCell>
                      <Typography variant="subtitle2">{b.name}</Typography>
                      {b.enrolledAt && (
                        <Typography variant="caption" color="text.secondary">
                          {t('boards.enrolled', { date: fmt.dateTime(b.enrolledAt, TIMEZONE, false) })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusDot b={b} t={t} />
                    </TableCell>
                    <TableCell>{b.room ?? <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>}</TableCell>
                    <TableCell>
                      {b.session ? (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip size="small" label={t('boards.inClass')} sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />
                            <Typography variant="subtitle2">{[b.session.subject, b.session.section].filter(Boolean).join(' · ') || t('boards.class')}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('boards.since', { teacher: b.session.teacher, time: fmt.time(b.session.startedAt, TIMEZONE) })}
                          </Typography>
                        </Box>
                      ) : !b.enrolled ? (
                        <Typography variant="body2" color="text.secondary">
                          {b.enrollmentExpiresAt && new Date(b.enrollmentExpiresAt) > now
                            ? t('boards.codeValid', { date: fmt.dateTime(b.enrollmentExpiresAt, TIMEZONE, false) })
                            : t('boards.codeExpired')}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {t('boards.free')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {b.platform ? (
                        <>
                          {PLATFORM[b.platform] ?? b.platform}
                          {b.appVersion && (
                            <Typography variant="caption" color="text.secondary" component="span">
                              {' '}
                              · v{b.appVersion}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {b.lastSeenAt ? (
                        <Tooltip title={fmt.dateTime(b.lastSeenAt, TIMEZONE)}>
                          <span>{fmt.relative(b.lastSeenAt, now, TIMEZONE)}</span>
                        </Tooltip>
                      ) : (
                        <Box component="span" sx={{ color: 'text.secondary' }}>{t('boards.never')}</Box>
                      )}
                    </TableCell>
                    {allowed && (
                      <TableCell align="right" padding="checkbox">
                        <BoardMenu id={b.id} name={b.name} enrolled={b.enrolled} timeZone={TIMEZONE} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}
    </>
  );
}
