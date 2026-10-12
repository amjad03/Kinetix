import { getI18n } from '@/i18n/server';
import { LinkButton } from './LinkButton';

import { Umbrella as BeachAccessOutlined } from 'lucide-react';
/** A holiday for the whole institution on the day shown: no classes, none counted as missed. */
export async function HolidayBanner({ title, date }: { title: string; date: string }) {
  const { t } = await getI18n();
  return (
    <div className="flex items-center flex-wrap gap-4 px-5 py-4 mb-6 rounded-[16px] bg-amber-soft text-amber-ink"
      data-testid="holiday-banner"
      role="status"
    >
      <div className="w-[48px] h-[48px] rounded-full grid place-items-center bg-amber text-card shrink-0" aria-hidden>
        <BeachAccessOutlined />
      </div>
      <div className="flex-[1_1_260px] min-w-0">
        <p className="text-base leading-6 font-medium tracking-[0.1px]">
          {t('holiday.title', { title })}
        </p>
        <p className="text-[13px] leading-[19px]">{t('holiday.body')}</p>
      </div>
      <LinkButton href={`/calendar?month=${date.slice(0, 7)}`} variant="outlined" color="inherit">
        {t('holiday.openCalendar')}
      </LinkButton>
    </div>
  );
}
