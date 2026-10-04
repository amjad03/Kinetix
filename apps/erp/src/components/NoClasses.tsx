import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import { LinkButton } from './LinkButton';
import { addDays, formatDate, isoWeekday } from '@/lib/dates';
import { EmptyState } from './States';

function hrefFor(path: string, date: string, today: string, extra?: Record<string, string>) {
  const q = new URLSearchParams(extra);
  if (date !== today) q.set('date', date);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Empty state for a day without classes. Sundays point to Saturday and Monday. */
export function NoClasses({ date, today, path, extra }: { date: string; today: string; path: string; extra?: Record<string, string> }) {
  const sunday = isoWeekday(date) === 7;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <EmptyState
      testId="no-classes"
      icon={<EventBusyOutlined />}
      title={sunday ? 'No classes on Sundays' : `No classes on ${formatDate(date, 'weekday')}`}
      actions={
        <>
          <LinkButton variant="outlined" href={hrefFor(path, prev, today, extra)}>
            View {formatDate(prev, 'short')}
          </LinkButton>
          <LinkButton variant="contained" color="secondary" href={hrefFor(path, next, today, extra)}>
            View {formatDate(next, 'short')}
          </LinkButton>
        </>
      }
    >
      {sunday
        ? 'The timetable runs Monday to Saturday. Look at the last school day, or what is coming up next.'
        : 'Nothing is on the timetable for this day. It may be a holiday, or the timetable has not been set up for it.'}
    </EmptyState>
  );
}

export { hrefFor };
