'use client';
import { Fragment, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { hhmm } from '@/lib/dates';
import type { ClassRow, ClassStatus } from '@/lib/types';
import { StatusChip } from './StatusChip';

import { DoorOpen as MeetingRoomOutlined, ListChecks as FactCheckOutlined, Presentation as CastForEducationOutlined, User as PersonOutline } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pal } from '@/lib/sx';
const DOT: Record<ClassStatus, string> = {
  live: 'kx.live',
  taught: 'kx.success',
  not_started: 'error.main',
  missed: 'error.main',
  upcoming: 'm3.outline',
};

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 [&_svg]:text-[16px]">
      {icon}
      {children}
    </span>
  );
}

export function AttendanceSummary({ c }: { c: ClassRow }) {
  const { t } = useI18n();
  if (c.status === 'upcoming') return <>{t('att.notDue')}</>;
  if (!c.attendanceTaken) return <span className={cn(c.status === 'live' ? 'text-muted-foreground' : 'text-red-ink')}>{t('att.notTaken')}</span>;
  return (
    <>
      {t('att.taken')}{' '}
      <span className={cn(c.absent ? 'text-red-ink' : 'text-inherit', c.absent ? 'font-medium' : 'font-normal')}>
        {c.absent ? t('att.absent', { n: c.absent }) : t('att.allPresent')}
      </span>
    </>
  );
}

/** The day's classes as a vertical timeline, with a "now" line on today. */
export function ClassTimeline({ classes, nowTime }: { classes: ClassRow[]; nowTime?: string }) {
  const { t } = useI18n();
  const nowIndex = nowTime ? classes.findIndex((c) => c.startsAt > nowTime) : -1;
  const showNowAtEnd = !!nowTime && nowIndex === -1 && classes.length > 0;
  const nowLine = nowTime ? (
    <div className="grid grid-cols-[64px_20px_1fr] sm:grid-cols-[96px_24px_1fr] items-center my-1" aria-label={t('timeline.nowLabel', { time: nowTime.slice(0, 5) })}>
      <span className="text-xs leading-4 tracking-[0.3px] text-red-ink font-medium text-right pr-3">
        {t('timeline.now', { time: nowTime.slice(0, 5) })}
      </span>
      <div className="w-[10px] h-[10px] rounded-full bg-destructive justify-self-center" />
      <div className="h-[2px] bg-destructive rounded-[10px]" />
    </div>
  ) : null;

  return (
    <ol className="list-none m-0 p-0" data-testid="class-timeline">
      {classes.map((c, i) => (
        <Fragment key={c.id}>
          {i === nowIndex && nowLine}
          <li className="grid grid-cols-[64px_20px_1fr] sm:grid-cols-[96px_24px_1fr] min-h-[88px]"
            data-status={c.status}
          >
            <div className="text-right pr-3 pt-3.5">
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px] tabular-nums">
                {hhmm(c.startsAt)}
              </h6>
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground tabular-nums">
                {hhmm(c.endsAt)}
              </span>
            </div>
            <div className="relative flex justify-center">
              <div className={cn('absolute w-[2px] bg-border', i === 0 ? 'top-[24px]' : 'top-0', i === classes.length - 1 ? 'bottom-[calc(100%_-_24px)]' : 'bottom-0')}
              />
              <div className="mt-[18px] w-[12px] h-[12px] rounded-full border-2 z-[1]" style={{ backgroundColor: pal(c.status === 'upcoming' ? 'kx.pane' : DOT[c.status]), borderColor: pal(DOT[c.status]) }}
              />
            </div>
            <div className={cn('ml-2 mb-2.5 px-4 py-3 rounded-[12px] border flex gap-4 items-start justify-between min-w-0', c.status === 'live' ? 'border-orange' : 'border-border', c.status === 'live' ? 'bg-orange-soft' : 'bg-transparent')}
            >
              <div className="min-w-0">
                <h3 className="text-base font-medium tracking-[0.1px] leading-[24px]">
                  {c.subject.name}{' '}
                  <span className="text-[13px] leading-[19px] text-muted-foreground">
                    · {c.section.displayName}
                  </span>
                </h3>
                <div className="text-[13px] leading-[19px] text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1"
                >
                  <Meta icon={<PersonOutline />}>{c.teacher.fullName}</Meta>
                  {c.room && <Meta icon={<MeetingRoomOutlined />}>{c.room}</Meta>}
                  {c.board && <Meta icon={<CastForEducationOutlined />}>{c.board}</Meta>}
                  <Meta icon={<FactCheckOutlined />}>
                    <AttendanceSummary c={c} />
                  </Meta>
                </div>
              </div>
              <div className="shrink-0 pt-0.5">
                <StatusChip status={c.status} />
              </div>
            </div>
          </li>
        </Fragment>
      ))}
      {showNowAtEnd && nowLine}
    </ol>
  );
}
