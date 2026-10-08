import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import { LinkButton } from './LinkButton';
import { getI18n } from '@/i18n/server';
import { addDays, isoWeekday } from '@/lib/dates';
import { EmptyState } from './States';

function hrefFor(path: string, date: string, today: string, extra?: Record<string, string>) {
  const q = new URLSearchParams(extra);
  if (date !== today) q.set('date', date);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Empty state for a day without classes. Sundays point to Saturday and Monday. */
export async function NoClasses({ date, today, path, extra }: { date: string; today: string; path: string; extra?: Record<string, string> }) {
  const { t, fmt } = await getI18n();
  const sunday = isoWeekday(date) === 7;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <EmptyState
      testId="no-classes"
      icon={<EventBusyOutlined />}
      title={sunday ? t('noClasses.sunday') : t('noClasses.day', { day: fmt.date(date, 'weekday') })}
      actions={
        <>
          <LinkButton variant="outlined" href={hrefFor(path, prev, today, extra)}>
            {t('noClasses.view', { date: fmt.date(prev, 'short') })}
          </LinkButton>
          <LinkButton variant="contained"href={hrefFor(path, next, today, extra)}>
            {t('noClasses.view', { date: fmt.date(next, 'short') })}
          </LinkButton>
        </>
      }
    >
      {sunday
        ? t('noClasses.sundayBody')
        : t('noClasses.dayBody')}
    </EmptyState>
  );
}

export { hrefFor };
