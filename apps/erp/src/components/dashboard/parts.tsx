import { ArrowRight, CalendarCheck, CircleCheck, ChevronRight, Megaphone, TriangleAlert } from 'lucide-react';
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
import { cn } from '@/lib/utils';

const ICON_CHIP = 'grid size-[34px] shrink-0 place-items-center rounded-[10px] [&_svg]:!size-4';

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
        <div className="px-[18px] pb-[18px]">
          <EmptyState dense icon={<CircleCheck />} title={t('dash.pendingNone')}>
            {t('dash.pendingNoneHelp')}
          </EmptyState>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((x) => (
            <li key={x.key} className="border-t">
              <Link href={x.href} data-testid={`task-${x.key}`} className="flex items-center gap-3 px-[18px] py-3 text-inherit no-underline hover:bg-muted">
                <span aria-hidden className={cn(ICON_CHIP, 'bg-muted text-muted-foreground')}>
                  {x.icon}
                </span>
                <span className="flex-1 text-[13.5px] font-[550]">{x.label}</span>
                <CountBadge count={x.count ?? 0} tone={(x.count ?? 0) === 0 ? 'neutral' : (x.tone ?? 'info')} showZero />
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export interface QuickAction {
  href: string;
  label: string;
  icon: ReactNode;
  /** AI actions are amber. */
  ai?: boolean;
}

export function QuickActions({ actions, t, wide = true }: { actions: QuickAction[]; t: TFunction; wide?: boolean }) {
  if (actions.length === 0) return null;
  return (
    <Card title={t('dash.quick')} className={wide ? 'lg:col-span-full xl:col-span-1' : undefined} testId="quick-actions">
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 xl:grid-cols-2">
        {actions.map((a) => (
          <li key={a.href + a.label}>
            <Link href={a.href} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-[13px] font-[550] text-inherit no-underline transition-colors hover:border-border-strong hover:bg-muted">
              <span aria-hidden className={cn(ICON_CHIP, 'size-9', a.ai ? 'bg-amber-soft text-amber-ink' : 'bg-teal-soft text-teal-ink')}>
                {a.icon}
              </span>
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
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
          <LinkButton href="/messages" size="small" variant="outlined" endIcon={<ArrowRight />}>
            {t('dash.viewAll')}
          </LinkButton>
        ) : undefined
      }
      testId="announcements"
    >
      {items.length === 0 ? (
        <div className="px-[18px] pb-[18px]">
          <EmptyState dense icon={<Megaphone />} title={t('dash.announcementsNone')} />
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((m) => (
            <li key={m.id} className="flex items-start gap-3 border-t px-[18px] py-3">
              <span aria-hidden className={cn(ICON_CHIP, m.priority === 'info' ? 'bg-blue-soft text-blue-ink' : m.priority === 'important' ? 'bg-amber-soft text-amber-ink' : 'bg-red-soft text-red-ink')}>
                {m.priority === 'info' ? <Megaphone /> : <TriangleAlert />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13.5px] font-[550]">{m.title}</p>
                <span className="text-[12.5px] text-muted-foreground">{fmt.relative(m.createdAt)}</span>
              </div>
              {m.priority !== 'info' && <StatusPill tone={PRIORITY_TONE[m.priority]}>{t(`msg.pri.${m.priority}` as never)}</StatusPill>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Upcoming calendar events as date tiles (redesign: month in orange over the day). */
export function UpcomingEvents({ events, t, fmt, locale, grid }: { events: CalendarEvent[]; t: TFunction; fmt: Fmt; locale: string; grid?: boolean }) {
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  return (
    <Card
      title={t('dash.events')}
      subtitle={grid ? t('home.eventsSub') : undefined}
      padded={!!grid}
      action={
        <LinkButton href="/calendar" size="small" variant="outlined" endIcon={<ArrowRight />}>
          {t('dash.viewCalendar')}
        </LinkButton>
      }
      testId="upcoming-events"
    >
      {events.length === 0 ? (
        <div className={grid ? undefined : 'px-[18px] pb-[18px]'}>
          <EmptyState dense icon={<CalendarCheck />} title={t('dash.eventsNone')} />
        </div>
      ) : (
        <ul className={cn('m-0 list-none p-0', grid && 'grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]')}>
          {events.map((e) => {
            const d = new Date(`${e.startsOn}T00:00:00Z`);
            return (
              <li key={e.id} className={cn('flex items-center gap-3', grid ? 'rounded-xl border p-3' : 'border-t px-[18px] py-2.5')}>
                <span aria-hidden className="w-[46px] shrink-0 rounded-[10px] border bg-background py-1 text-center">
                  <small className="block text-[10.5px] font-semibold text-orange-ink uppercase">{month.format(d)}</small>
                  <b className="block text-lg leading-tight tabular-nums">{d.getUTCDate()}</b>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13.5px] font-[550]">{e.title}</p>
                  <span className="text-[12.5px] text-muted-foreground">
                    {e.startsOn === e.endsOn ? fmt.date(e.startsOn, 'weekday') : `${fmt.date(e.startsOn, 'dayMonth')} – ${fmt.date(e.endsOn, 'dayMonth')}`}
                  </span>
                </div>
                {!grid && <StatusPill tone={e.kind === 'holiday' ? 'success' : e.kind === 'exam' ? 'warning' : 'info'}>{t(`cal.kind.${e.kind}` as never)}</StatusPill>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The grid the dashboard rows sit in. */
export function Row({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn('mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2', cols === 3 && 'xl:grid-cols-3')}>{children}</div>;
}
