'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/shadcn/button';
import { Calendar } from '@/components/shadcn/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { useI18n } from '@/i18n/client';
import { addDays } from '@/lib/dates';
import { PendingBar } from './PendingBar';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Previous / Today / next, and a calendar. Keeps other query parameters. */
export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const { t, fmt } = useI18n();
  const go = (d: string) => {
    const q = new URLSearchParams(params.toString());
    if (d === today) q.delete('date');
    else q.set('date', d);
    const s = q.toString();
    start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  const [y, m, d] = date.split('-').map(Number);
  return (
    <div className="flex items-center gap-1" data-testid="date-nav">
      {pending && <PendingBar label={t('common.loading')} />}
      <Button variant="outline" onClick={() => go(today)} disabled={date === today} className="mr-1">
        {t('date.today')}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => go(addDays(date, -1))} aria-label={t('date.previousDay')} title={t('date.previousDay')}>
        <ChevronLeft />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => go(addDays(date, 1))} aria-label={t('date.nextDay')} title={t('date.nextDay')}>
        <ChevronRight />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label={t('date.pick')} data-testid="date-picker-button">
            <CalendarDays />
            {fmt.date(date, 'short')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={new Date(y, m - 1, d)}
            defaultMonth={new Date(y, m - 1, d)}
            showOutsideDays
            onSelect={(v) => {
              if (!v) return;
              setOpen(false);
              go(iso(v));
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
