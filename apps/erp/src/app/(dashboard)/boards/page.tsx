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
import { formatDateTime, formatTime, relativeTime } from '@/lib/dates';
import { TIMEZONE } from '@/lib/school';
import { BOARD_ADMIN_ROLES, type Board, type Structure } from '@/lib/types';

export const metadata: Metadata = { title: 'Boards' };

const PLATFORM: Record<string, string> = { android: 'Android', windows: 'Windows', linux: 'Linux', web: 'Web' };

function StatusDot({ b }: { b: Board }) {
  const [color, label] = !b.enrolled ? ['m3.outline', 'Waiting to enrol'] : b.online ? ['kx.success', 'Online'] : ['m3.outlineVariant', 'Offline'];
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

  return (
    <>
      <PageHeader
        title="Boards"
        subtitle="Classroom boards: where they are, whether they are online, and who is teaching on them"
        actions={structure.data ? <AddBoardButton structure={structure.data} allowed={allowed} timeZone={TIMEZONE} /> : undefined}
      />
      {boards.error !== undefined ? (
        <ErrorState message={boards.error} />
      ) : list.length === 0 ? (
        <EmptyState icon={<CastForEducationOutlined />} title="No boards yet" testId="no-boards">
          Add a board to get a one-time code, then type the code on the board to connect it to your school.
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label="Boards" value={list.length} caption={waiting ? `${waiting} waiting to enrol` : 'All enrolled'} />
            <StatTile label="Online" value={online} unit={`of ${list.length - waiting}`} caption="Connected in the last 3 minutes" />
            <StatTile label="In class now" value={inClass} tone={inClass ? 'live' : 'default'} caption={inClass ? 'A teacher is signed in' : 'No teacher signed in'} />
          </StatGrid>
          <Box sx={{ mt: 3 }} />
          <TableFrame testId="boards-table">
            <Table sx={{ minWidth: 820 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Board</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Room</TableCell>
                  <TableCell>Now</TableCell>
                  <TableCell>Platform</TableCell>
                  <TableCell>Last seen</TableCell>
                  {allowed && <TableCell aria-label="Actions" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id} hover data-testid="board-row">
                    <TableCell>
                      <Typography variant="subtitle2">{b.name}</Typography>
                      {b.enrolledAt && (
                        <Typography variant="caption" color="text.secondary">
                          Enrolled {formatDateTime(b.enrolledAt, TIMEZONE, false)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusDot b={b} />
                    </TableCell>
                    <TableCell>{b.room ?? <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>}</TableCell>
                    <TableCell>
                      {b.session ? (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip size="small" label="In class" sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />
                            <Typography variant="subtitle2">{[b.session.subject, b.session.section].filter(Boolean).join(' · ') || 'Class'}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {b.session.teacher} · since {formatTime(b.session.startedAt, TIMEZONE)}
                          </Typography>
                        </Box>
                      ) : !b.enrolled ? (
                        <Typography variant="body2" color="text.secondary">
                          {b.enrollmentExpiresAt && new Date(b.enrollmentExpiresAt) > now
                            ? `Code valid until ${formatDateTime(b.enrollmentExpiresAt, TIMEZONE, false)}`
                            : 'Code expired · issue a new code from the menu'}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Free
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
                        <Tooltip title={formatDateTime(b.lastSeenAt, TIMEZONE)}>
                          <span>{relativeTime(b.lastSeenAt, now, TIMEZONE)}</span>
                        </Tooltip>
                      ) : (
                        <Box component="span" sx={{ color: 'text.secondary' }}>Never</Box>
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
