import ArrowForward from '@mui/icons-material/ArrowForward';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import Box from '@mui/material/Box';
import { LinkButton } from '@/components/LinkButton';
import type { Metadata } from 'next';
import { MiniBar, SegmentBar } from '@/components/Bars';
import { ClassTimeline } from '@/components/ClassTimeline';
import { DateNav } from '@/components/DateNav';
import { hrefFor, NoClasses } from '@/components/NoClasses';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { dateParam, relativeDay, schoolNowTime, schoolToday } from '@/lib/school';
import type { ClassesDay, Overview } from '@/lib/types';

export const metadata: Metadata = { title: 'Today' };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSection('school');
  const date = dateParam((await searchParams).date);
  const today = schoolToday();
  const [ov, day] = await Promise.all([
    load(() => api<Overview>(`/v1/admin/overview?date=${date}`)),
    load(() => api<ClassesDay>(`/v1/admin/classes?date=${date}`)),
  ]);
  const isToday = date === today;

  return (
    <>
      <PageHeader
        title={isToday ? 'Today' : formatDate(date, 'long')}
        subtitle={isToday ? formatDate(date, 'long') : relativeDay(date, today)}
        actions={<DateNav date={date} today={today} />}
      />
      {ov.error !== undefined ? <ErrorState message={ov.error} /> : <Stats o={ov.data} isToday={isToday} />}

      <SectionTitle
        action={
          day.data?.classes.length ? (
            <LinkButton href={hrefFor('/classes', date, today)} endIcon={<ArrowForward />} size="small">
              All classes
            </LinkButton>
          ) : undefined
        }
      >
        {isToday ? "Today's classes" : 'Classes'}
      </SectionTitle>
      {day.error !== undefined ? (
        <ErrorState message={day.error} />
      ) : day.data.classes.length === 0 ? (
        <NoClasses date={date} today={today} path="/" />
      ) : (
        <ClassTimeline classes={day.data.classes} nowTime={isToday ? schoolNowTime() : undefined} />
      )}
    </>
  );
}

function Stats({ o, isToday }: { o: Overview; isToday: boolean }) {
  const c = o.classes;
  const a = o.attendance;
  const held = c.taught + c.live;
  return (
    <StatGrid>
      <StatTile
        testId="stat-classes"
        icon={<ClassOutlined />}
        label="Classes"
        value={held}
        unit={`of ${c.scheduled} taught`}
        bar={
          <SegmentBar
            label={`${c.taught} taught, ${c.live} live, ${c.notStarted} not started, ${c.missed} missed, ${c.upcoming} upcoming`}
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
            ? 'Nothing scheduled'
            : [c.live && `${c.live} live`, `${c.missed + c.notStarted} missed`, c.upcoming && `${c.upcoming} upcoming`].filter(Boolean).join(' · ')
        }
      />
      <StatTile
        testId="stat-attendance"
        icon={<FactCheckOutlined />}
        label="Attendance"
        value={a.rate === null ? '—' : `${a.rate}%`}
        bar={a.rate === null ? undefined : <MiniBar value={a.rate} color={a.rate >= 90 ? 'kx.success' : a.rate >= 75 ? 'primary.main' : 'error.main'} />}
        caption={a.periodsDue === 0 ? 'No periods due yet' : `${a.periodsTaken} of ${a.periodsDue} periods taken`}
      />
      <StatTile
        testId="stat-absent"
        icon={<PersonOffOutlined />}
        label="Absent"
        value={a.absentStudents}
        unit={a.absentStudents === 1 ? 'student' : 'students'}
        caption={a.marked === 0 ? 'No attendance marked' : `${a.absent} absent and ${a.late} late marks`}
      />
      <StatTile
        testId="stat-homework"
        icon={<AssignmentOutlined />}
        label="Homework"
        value={o.homeworkAssigned}
        unit="set"
        caption={o.homeworkAssigned === 1 ? 'assignment for students' : 'assignments for students'}
      />
      <StatTile
        testId="stat-boards"
        icon={<CastForEducationOutlined />}
        label="Boards"
        value={o.boards.online}
        unit={`of ${o.boards.total} online`}
        caption={
          <Box component="span">
            {o.boards.inClass} in class{isToday ? '' : ' (right now)'}
          </Box>
        }
      />
      <StatTile testId="stat-messages" icon={<CampaignOutlined />} label="Messages" value={o.broadcastsSent} unit="sent" caption="To boards and families" />
    </StatGrid>
  );
}
