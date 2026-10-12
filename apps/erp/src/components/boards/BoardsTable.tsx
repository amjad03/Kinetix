'use client';
import { BoardMenu } from '@/components/boards/BoardMenu';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import type { Board } from '@/lib/types';

import { Chip, Tooltip } from '@/components/kx';
import { cn } from '@/lib/utils';
import { pal } from '@/lib/sx';
const PLATFORM: Record<string, string> = { android: 'Android', windows: 'Windows', linux: 'Linux', web: 'Web' };

function StatusDot({ b, t }: { b: Board; t: TFunction }) {
  const [color, label] = !b.enrolled ? ['m3.outline', t('boards.waiting')] : b.online ? ['kx.success', t('boards.online')] : ['m3.outlineVariant', t('boards.offline')];
  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cn('w-[10px] h-[10px] rounded-full', b.enrolled ? 'border-0' : 'border-2', b.online ? 'shadow-[0_0_0_3px_rgba(24,128,56,.18)]' : 'shadow-none')} style={{ backgroundColor: pal(b.enrolled ? color : 'transparent'), borderColor: pal(color) }}
      />
      <p className={cn('text-[13px] leading-[19px]', b.online ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </p>
    </div>
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
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{b.name}</h6>
          {b.enrolledAt && (
            <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
              {t('boards.enrolled', { date: fmt.dateTime(b.enrolledAt, timeZone, false) })}
            </span>
          )}
        </>
      ),
    },
    { id: 'status', header: t('boards.col.status'), sort: status, cell: (b) => <StatusDot b={b} t={t} /> },
    { id: 'room', header: t('boards.col.room'), hideBelow: 'md', sort: (b) => b.room ?? '', cell: (b) => b.room ?? <span className="text-muted-foreground">—</span> },
    {
      id: 'now',
      header: t('boards.col.now'),
      sort: nowText,
      cell: (b) =>
        b.session ? (
          <div>
            <div className="flex items-center gap-2">
              <Chip className="bg-orange-soft text-orange-ink" size="small" label={t('boards.inClass')} />
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{nowText(b)}</h6>
            </div>
            <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
              {t('boards.since', { teacher: b.session.teacher, time: fmt.time(b.session.startedAt, timeZone) })}
            </span>
          </div>
        ) : !b.enrolled ? (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {b.enrollmentExpiresAt && new Date(b.enrollmentExpiresAt) > now ? t('boards.codeValid', { date: fmt.dateTime(b.enrollmentExpiresAt, timeZone, false) }) : t('boards.codeExpired')}
          </p>
        ) : (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('boards.free')}
          </p>
        ),
    },
    {
      id: 'platform',
      header: t('boards.col.platform'),
      hideBelow: 'lg',
      sort: (b) => (b.platform ? `${PLATFORM[b.platform] ?? b.platform}${b.appVersion ? ` v${b.appVersion}` : ''}` : ''),
      cell: (b) =>
        b.platform ? (
          <div className="whitespace-nowrap">
            {PLATFORM[b.platform] ?? b.platform}
            {b.appVersion && (
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                {' '}
                · v{b.appVersion}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
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
          <span className="text-muted-foreground">{t('boards.never')}</span>
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
