'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { BoardMenu } from '@/components/boards/BoardMenu';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import type { Board } from '@/lib/types';

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

/** The classroom boards: status, room, what is on now, platform and last contact; admins get the row menu. */
export function BoardsTable({ boards, allowed, timeZone, nowIso }: { boards: Board[]; allowed: boolean; timeZone: string; nowIso: string }) {
  const { t, fmt } = useI18n();
  const now = new Date(nowIso);
  const status = (b: Board) => (!b.enrolled ? t('boards.waiting') : b.online ? t('boards.online') : t('boards.offline'));
  const nowText = (b: Board) => (b.session ? [b.session.subject, b.session.section].filter(Boolean).join(' · ') || t('boards.class') : !b.enrolled ? t('boards.waiting') : t('boards.free'));
  const columns: Column<Board>[] = [
    {
      id: 'board',
      header: t('boards.col.board'),
      rowHeader: true,
      sort: (b) => b.name,
      cell: (b) => (
        <>
          <Typography variant="subtitle2">{b.name}</Typography>
          {b.enrolledAt && (
            <Typography variant="caption" color="text.secondary">
              {t('boards.enrolled', { date: fmt.dateTime(b.enrolledAt, timeZone, false) })}
            </Typography>
          )}
        </>
      ),
    },
    { id: 'status', header: t('boards.col.status'), sort: status, cell: (b) => <StatusDot b={b} t={t} /> },
    { id: 'room', header: t('boards.col.room'), hideBelow: 'md', sort: (b) => b.room ?? '', cell: (b) => b.room ?? <Box component="span" sx={{ color: 'text.secondary' }}>—</Box> },
    {
      id: 'now',
      header: t('boards.col.now'),
      sort: nowText,
      cell: (b) =>
        b.session ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip size="small" label={t('boards.inClass')} sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />
              <Typography variant="subtitle2">{nowText(b)}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('boards.since', { teacher: b.session.teacher, time: fmt.time(b.session.startedAt, timeZone) })}
            </Typography>
          </Box>
        ) : !b.enrolled ? (
          <Typography variant="body2" color="text.secondary">
            {b.enrollmentExpiresAt && new Date(b.enrollmentExpiresAt) > now ? t('boards.codeValid', { date: fmt.dateTime(b.enrollmentExpiresAt, timeZone, false) }) : t('boards.codeExpired')}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('boards.free')}
          </Typography>
        ),
    },
    {
      id: 'platform',
      header: t('boards.col.platform'),
      hideBelow: 'lg',
      sort: (b) => (b.platform ? `${PLATFORM[b.platform] ?? b.platform}${b.appVersion ? ` v${b.appVersion}` : ''}` : ''),
      cell: (b) =>
        b.platform ? (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            {PLATFORM[b.platform] ?? b.platform}
            {b.appVersion && (
              <Typography variant="caption" color="text.secondary" component="span">
                {' '}
                · v{b.appVersion}
              </Typography>
            )}
          </Box>
        ) : (
          <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>
        ),
    },
    {
      id: 'lastSeen',
      header: t('boards.col.lastSeen'),
      hideBelow: 'md',
      sort: (b) => b.lastSeenAt ?? '',
      csv: (b) => b.lastSeenAt ?? '',
      cell: (b) =>
        b.lastSeenAt ? (
          <Tooltip title={fmt.dateTime(b.lastSeenAt, timeZone)}>
            <span style={{ whiteSpace: 'nowrap' }}>{fmt.relative(b.lastSeenAt, now, timeZone)}</span>
          </Tooltip>
        ) : (
          <Box component="span" sx={{ color: 'text.secondary' }}>{t('boards.never')}</Box>
        ),
    },
  ];
  if (allowed) columns.push({ id: 'actions', header: '', csv: false, align: 'right', cell: (b) => <BoardMenu id={b.id} name={b.name} enrolled={b.enrolled} timeZone={timeZone} /> });
  const statuses = [...new Set(boards.map(status))];
  return (
    <DataTable
      testId="boards-table"
      label={t('nav.boards')}
      rows={boards}
      rowId={(b) => b.id}
      exportName="boards"
      rowAttrs={() => ({ 'data-testid': 'board-row' })}
      filters={[{ id: 'status', label: t('boards.col.status'), options: statuses.map((s) => ({ value: s, label: s })), match: (b, v) => status(b) === v }]}
      columns={columns}
    />
  );
}
