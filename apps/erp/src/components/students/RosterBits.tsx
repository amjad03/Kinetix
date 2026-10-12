'use client';
import { Badge } from '@/components/shadcn/badge';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { FEE_TONE, type RosterRow } from '@/lib/roster';
import { cn } from '@/lib/utils';

/** The attendance cell: a short bar with the percentage, amber under the minimum. */
export function AttendanceBar({ pct, min = 75 }: { pct: number | null; min?: number }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const low = pct < min;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <i className={cn('block h-full rounded-full', low ? 'bg-amber' : 'bg-teal')} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span className={cn('text-[13px] tabular-nums', low && 'font-semibold text-amber-ink')}>{Math.round(pct)}%</span>
    </span>
  );
}

export function FeeBadge({ state }: { state: RosterRow['fee'] }) {
  const { t } = useI18n();
  if (state === null) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={FEE_TONE[state]}>{t(`ro.fee.${state}` as MessageKey)}</Badge>;
}
