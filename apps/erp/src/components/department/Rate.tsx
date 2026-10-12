'use client';
import type { ReactNode } from 'react';
import { MiniBar } from '@/components/Bars';
import { useI18n } from '@/i18n/client';
import { formatPercent, TONE_COLOR, toneOf, type THRESHOLDS } from '@/lib/department';

import { CircleAlert as ErrorOutline } from 'lucide-react';
import { cn } from '@/lib/utils';
/**
 * A percentage for a table cell, with a small bar; low values are red with an icon, so they read
 * without colour too. `detail` is a second line ("12 of 15"). `compact` narrows the bar for wide tables.
 */
export function Rate({
  value,
  kind,
  detail,
  testId,
  compact,
}: {
  value: number | null;
  kind: keyof typeof THRESHOLDS;
  detail?: ReactNode;
  testId?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const tone = toneOf(value, kind);
  if (tone === 'none')
    return (
      <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid={testId} data-tone="none">
        —
      </p>
    );
  const low = tone === 'low';
  return (
    <div className={cn('flex items-center justify-end', compact ? 'gap-2' : 'gap-2.5')} data-testid={testId} data-tone={tone}>
      <div className={compact ? 'w-9' : 'w-10 md:w-16'}>
        <MiniBar value={value ?? 0} color={TONE_COLOR[tone]} />
      </div>
      <div className={cn('text-right', compact ? 'min-w-[48px]' : 'min-w-[64px]')}>
        <p className={cn('text-[13px] leading-[19px] tabular-nums inline-flex items-center gap-1', low ? 'text-red-ink' : 'text-foreground', low ? 'font-medium' : 'font-normal')}>
          {low && <ErrorOutline className="text-[16px]" aria-label={t('dept.low')} />}
          {formatPercent(value)}
        </p>
        {detail && (
          <div className="text-xs tracking-[0.3px] text-muted-foreground tabular-nums leading-[16px] whitespace-nowrap">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
