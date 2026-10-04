'use client';

import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import dayjs from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useI18n } from '@/i18n/client';
import { addDays } from '@/lib/dates';

/** Previous / Today / next, and a calendar. Keeps other query parameters. */
export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { t, fmt } = useI18n();

  const go = (d: string) => {
    const q = new URLSearchParams(params.toString());
    if (d === today) q.delete('date');
    else q.set('date', d);
    const s = q.toString();
    start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} data-testid="date-nav">
      {pending && (
        <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label={t('common.loading')} />
      )}
      <Button variant="outlined" size="small" onClick={() => go(today)} disabled={date === today} sx={{ mr: 1, minHeight: 36 }}>
        {t('date.today')}
      </Button>
      <Tooltip title={t('date.previousDay')}>
        <IconButton onClick={() => go(addDays(date, -1))} aria-label={t('date.previousDay')}>
          <ChevronLeft />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('date.nextDay')}>
        <IconButton onClick={() => go(addDays(date, 1))} aria-label={t('date.nextDay')}>
          <ChevronRight />
        </IconButton>
      </Tooltip>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<CalendarMonthOutlined />}
        aria-label={t('date.pick')}
        sx={{ color: 'text.primary', fontSize: '1rem', fontWeight: 400, minHeight: 40 }}
        data-testid="date-picker-button"
      >
        {fmt.date(date, 'short')}
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <DateCalendar
          value={dayjs(date)}
          onChange={(v) => {
            if (!v) return;
            setAnchor(null);
            go(v.format('YYYY-MM-DD'));
          }}
          showDaysOutsideCurrentMonth
        />
      </Popover>
    </Box>
  );
}
