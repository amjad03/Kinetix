import ArrowForward from '@mui/icons-material/ArrowForward';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import BeachAccessOutlined from '@mui/icons-material/BeachAccessOutlined';
import Box from '@mui/material/Box';
import { LinkButton } from '@/components/LinkButton';
import type { Metadata } from 'next';
import { MiniBar, SegmentBar } from '@/components/Bars';
import { ClassTimeline } from '@/components/ClassTimeline';
import { DateNav } from '@/components/DateNav';
import { hrefFor, NoClasses } from '@/components/NoClasses';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { HolidayBanner } from '@/components/HolidayBanner';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/translate';
import { api, load, requireSection } from '@/lib/api';
import { dateParam, schoolNowTime, schoolToday } from '@/lib/school';
import type { ClassesDay, Overview } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.today') };
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSection('school');
  const date = dateParam((await searchParams).date);
  const today = schoolToday();
  const [ov, day] = await Promise.all([
    load(() => api<Overview>(`/v1/admin/overview?date=${date}`)),
    load(() => api<ClassesDay>(`/v1/admin/classes?date=${date}`)),
  ]);
  const isToday = date === today;
  const { t, fmt } = await getI18n();
  const holiday = ov.data?.holiday ?? day.data?.holiday ?? null;

  return (
    <>
      <PageHeader
        title={isToday ? t('nav.today') : fmt.date(date, 'long')}
        subtitle={isToday ? fmt.date(date, 'long') : fmt.relativeDay(date, today)}
        actions={<DateNav date={date} today={today} />}
      />
      {holiday && <HolidayBanner title={holiday.title} date={date} />}
      {ov.error !== undefined ? <ErrorState message={ov.error} /> : <Stats o={ov.data} isToday={isToday} t={t} />}

      <SectionTitle
        action={
          day.data?.classes.length ? (
            <LinkButton href={hrefFor('/classes', date, today)} endIcon={<ArrowForward />} size="small">
              {t('today.allClasses')}
            </LinkButton>
          ) : undefined
        }
      >
        {isToday ? t('today.todaysClasses') : t('today.classes')}
      </SectionTitle>
      {day.error !== undefined ? (
        <ErrorState message={day.error} />
      ) : day.data.classes.length === 0 && holiday ? (
        <EmptyState dense icon={<BeachAccessOutlined />} title={t('holiday.noClasses', { title: holiday.title })} testId="no-classes-holiday" />
      ) : day.data.classes.length === 0 ? (
        <NoClasses date={date} today={today} path="/" />
      ) : (
        <ClassTimeline classes={day.data.classes} nowTime={isToday ? schoolNowTime() : undefined} />
      )}
    </>
  );
}

function Stats({ o, isToday, t }: { o: Overview; isToday: boolean; t: TFunction }) {
  const c = o.classes;
  const a = o.attendance;
  const held = c.taught + c.live;
  return (
    <StatGrid>
      <StatTile
        testId="stat-classes"
        icon={<ClassOutlined />}
        label={t('today.stat.classes')}
        value={held}
        unit={t('today.stat.classesUnit', { n: c.scheduled })}
        bar={
          <SegmentBar
            label={t('today.stat.classesBar', { taught: c.taught, live: c.live, notStarted: c.notStarted, missed: c.missed, upcoming: c.upcoming })}
            parts={[
              { value: c.taught, color: 'kx.success' },
              { value: c.live, color: 'kx.live' },
              { value: c.notStarted + c.missed, color: 'error.main' },
              { value: c.upcoming, color: 'm3.outlineVariant' },
            ]}
          />
        }
        caption={
          c.scheduled === 0
            ? t('today.stat.nothingScheduled')
            : [c.live && t('today.stat.live', { n: c.live }), t('today.stat.missed', { n: c.missed + c.notStarted }), c.upcoming && t('today.stat.upcoming', { n: c.upcoming })].filter(Boolean).join(' · ')
        }
      />
      <StatTile
        testId="stat-attendance"
        icon={<FactCheckOutlined />}
        label={t('today.stat.attendance')}
        value={a.rate === null ? '—' : `${a.rate}%`}
        bar={a.rate === null ? undefined : <MiniBar value={a.rate} color={a.rate >= 90 ? 'kx.success' : a.rate >= 75 ? 'primary.main' : 'error.main'} />}
        caption={a.periodsDue === 0 ? t('today.stat.noPeriods') : t('today.stat.periodsTaken', { taken: a.periodsTaken, due: a.periodsDue })}
      />
      <StatTile
        testId="stat-absent"
        icon={<PersonOffOutlined />}
        label={t('today.stat.absent')}
        value={a.absentStudents}
        unit={t.plural('today.stat.student', a.absentStudents)}
        caption={a.marked === 0 ? t('today.stat.noAttendance') : t('today.stat.absentLate', { absent: a.absent, late: a.late })}
      />
      <StatTile
        testId="stat-homework"
        icon={<AssignmentOutlined />}
        label={t('today.stat.homework')}
        value={o.homeworkAssigned}
        unit={t('today.stat.homeworkUnit')}
        caption={t.plural('today.stat.assignments', o.homeworkAssigned)}
      />
      <StatTile
        testId="stat-boards"
        icon={<CastForEducationOutlined />}
        label={t('today.stat.boards')}
        value={o.boards.online}
        unit={t('today.stat.boardsUnit', { n: o.boards.total })}
        caption={
          <Box component="span">
            {t('today.stat.inClass', { n: o.boards.inClass })}
            {isToday ? '' : ` ${t('today.stat.rightNow')}`}
          </Box>
        }
      />
      <StatTile testId="stat-messages" icon={<CampaignOutlined />} label={t('today.stat.messages')} value={o.broadcastsSent} unit={t('today.stat.messagesUnit')} caption={t('today.stat.messagesCaption')} />
    </StatGrid>
  );
}
