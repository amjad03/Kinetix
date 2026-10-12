'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group';
import { useI18n } from '@/i18n/client';
import { PendingBar } from './PendingBar';

/** A segmented control that sets `?days=`. */
export function RangeToggle({ value, options }: { value: number; options: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const { t } = useI18n();
  return (
    <>
      {pending && <PendingBar label={t('common.loading')} />}
      <ToggleGroup
        type="single"
        value={String(value)}
        aria-label={t('range.label')}
        className="gap-0.5 rounded-md border bg-card p-[3px]"
        onValueChange={(v) => {
          if (!v) return;
          const q = new URLSearchParams(params.toString());
          q.set('days', v);
          start(() => router.push(`${pathname}?${q}`, { scroll: false }));
        }}
      >
        {options.map((d) => (
          <ToggleGroupItem key={d} value={String(d)} aria-label={t('range.lastDays', { n: d })} className="h-7 rounded-[7px] px-2.5 text-[12.5px] font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-foreground">
            {t('range.days', { n: d })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}
