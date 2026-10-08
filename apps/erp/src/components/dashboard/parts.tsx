import ArrowForward from '@mui/icons-material/ArrowForward';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { CountBadge, StatusPill, type Tone } from '@/components/ui/Badge';
import type { Fmt } from '@/i18n/format';
import type { TFunction } from '@/i18n/translate';
import type { CalendarEvent } from '@/lib/calendar';
import type { Priority, SentBroadcast } from '@/lib/types';

const link = { color: 'inherit', textDecoration: 'none' } as const;

export interface Task {
  key: string;
  label: string;
  count: number | null;
  href: string;
  icon: ReactNode;
  /** The count's colour: warning for things that are late. */
  tone?: Tone;
}

/** What needs a decision today, each with its count and a link to where it is done. Hides what the role cannot see. */
export function PendingTasks({ tasks, t }: { tasks: Task[]; t: TFunction }) {
  const shown = tasks.filter((x) => x.count !== null);
  const open = shown.reduce((s, x) => s + (x.count ?? 0), 0);
  return (
    <Card title={t('dash.pending')} subtitle={open ? t('dash.pendingOpen', { n: open }) : undefined} padded={false} testId="pending-tasks">
      {shown.length === 0 || open === 0 ? (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <EmptyState dense icon={<CheckCircleOutline />} title={t('dash.pendingNone')}>
            {t('dash.pendingNoneHelp')}
          </EmptyState>
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {shown.map((x) => (
            <Box component="li" key={x.key} sx={{ borderTop: 1, borderColor: 'm3.outlineVariant' }}>
              <Box component={Link} href={x.href} data-testid={`task-${x.key}`} sx={{ ...link, display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
                <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '10px', bgcolor: 'm3.surfaceContainer', color: 'm3.onSurfaceVariant', '& svg': { fontSize: 20 } }}>
                  {x.icon}
                </Box>
                <Typography sx={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{x.label}</Typography>
                <CountBadge count={x.count ?? 0} tone={(x.count ?? 0) === 0 ? 'neutral' : (x.tone ?? 'info')} showZero />
                <ChevronRight aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

export interface QuickAction {
  href: string;
  label: string;
  icon: ReactNode;
  /** AI actions are marigold. */
  ai?: boolean;
}

export function QuickActions({ actions, t }: { actions: QuickAction[]; t: TFunction }) {
  if (actions.length === 0) return null;
  return (
    <Card title={t('dash.quick')} sx={{ gridColumn: { lg: '1 / -1', xl: 'auto' } }} testId="quick-actions">
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(2, minmax(0, 1fr))' } }}>
        {actions.map((a) => (
          <li key={a.href + a.label}>
            <Box
              component={Link}
              href={a.href}
              sx={{ ...link, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center', p: 1.5, minHeight: 92, borderRadius: '12px', border: 1, borderColor: 'm3.outlineVariant', fontSize: '0.8125rem', fontWeight: 500, '&:hover': { borderColor: a.ai ? 'm3.tertiary' : 'm3.primary', bgcolor: 'action.hover' } }}
            >
              <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: '12px', bgcolor: a.ai ? 'm3.tertiaryContainer' : 'm3.primaryContainer', color: a.ai ? 'm3.onTertiaryContainer' : 'm3.onPrimaryContainer', '& svg': { fontSize: 22 } }}>{a.icon}</Box>
              {a.label}
            </Box>
          </li>
        ))}
      </Box>
    </Card>
  );
}

const PRIORITY_TONE: Record<Priority, Tone> = { info: 'neutral', important: 'warning', emergency: 'danger' } as never;

export function Announcements({ items, t, fmt, canOpen }: { items: SentBroadcast[]; t: TFunction; fmt: Fmt; canOpen: boolean }) {
  return (
    <Card
      title={t('dash.announcements')}
      padded={false}
      action={
        canOpen ? (
          <LinkButton href="/messages" size="small" endIcon={<ArrowForward />}>
            {t('dash.viewAll')}
          </LinkButton>
        ) : undefined
      }
      testId="announcements"
    >
      {items.length === 0 ? (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <EmptyState dense icon={<CampaignOutlined />} title={t('dash.announcementsNone')} />
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {items.map((m) => (
            <Box component="li" key={m.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2.5, py: 1.5, borderTop: 1, borderColor: 'm3.outlineVariant' }}>
              <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '10px', flexShrink: 0, bgcolor: m.priority === 'info' ? 'm3.primaryContainer' : m.priority === 'important' ? 'kx.warningContainer' : 'm3.errorContainer', color: m.priority === 'info' ? 'm3.onPrimaryContainer' : m.priority === 'important' ? 'kx.onWarningContainer' : 'm3.onErrorContainer', '& svg': { fontSize: 20 } }}>
                {m.priority === 'info' ? <CampaignOutlined /> : <ReportProblemOutlined />}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
                  {m.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmt.relative(m.createdAt)}
                </Typography>
              </Box>
              {m.priority !== 'info' && <StatusPill tone={PRIORITY_TONE[m.priority]}>{t(`msg.pri.${m.priority}` as never)}</StatusPill>}
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

export function UpcomingEvents({ events, t, fmt, locale }: { events: CalendarEvent[]; t: TFunction; fmt: Fmt; locale: string }) {
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return (
    <Card
      title={t('dash.events')}
      padded={false}
      action={
        <LinkButton href="/calendar" size="small" endIcon={<ArrowForward />}>
          {t('dash.viewCalendar')}
        </LinkButton>
      }
      testId="upcoming-events"
    >
      {events.length === 0 ? (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <EmptyState dense icon={<EventAvailableOutlined />} title={t('dash.eventsNone')} />
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {events.map((e) => {
            const d = new Date(`${e.startsOn}T00:00:00Z`);
            return (
              <Box component="li" key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderTop: 1, borderColor: 'm3.outlineVariant' }}>
                <Box aria-hidden sx={{ width: 44, flexShrink: 0, textAlign: 'center', borderRadius: '10px', bgcolor: 'm3.surfaceContainer', py: 0.5 }}>
                  <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, lineHeight: '20px', fontVariantNumeric: 'tabular-nums' }}>{d.getUTCDate()}</Typography>
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', color: 'text.secondary', fontWeight: 600, fontSize: '0.6875rem' }}>
                    {month.format(d)}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
                    {e.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {e.startsOn === e.endsOn ? fmt.date(e.startsOn, 'weekday') : `${fmt.date(e.startsOn, 'dayMonth')} – ${fmt.date(e.endsOn, 'dayMonth')}`}
                  </Typography>
                </Box>
                <StatusPill tone={e.kind === 'holiday' ? 'success' : e.kind === 'exam' ? 'warning' : 'info'}>{t(`cal.kind.${e.kind}` as never)}</StatusPill>
              </Box>
            );
          })}
        </Box>
      )}
    </Card>
  );
}

/** The grid the dashboard rows sit in. */
export function Row({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2.5,
        mt: 2.5,
        alignItems: 'start',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))', xl: `repeat(${cols}, minmax(0, 1fr))` },
      }}
    >
      {children}
    </Box>
  );
}
