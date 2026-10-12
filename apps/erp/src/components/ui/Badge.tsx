import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'live' | 'ai';

/** Tone → the redesign's pill colours (soft background, ink text). */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-soft text-slate-ink',
  info: 'bg-blue-soft text-blue-ink',
  success: 'bg-green-soft text-green-ink',
  warning: 'bg-amber-soft text-amber-ink',
  danger: 'bg-red-soft text-red-ink',
  live: 'bg-orange-soft text-orange-ink',
  ai: 'bg-amber-soft text-amber-ink',
};

/**
 * A status pill: a coloured dot and a word. Colour is never the only signal; the label always says it.
 * Pass `icon` instead of the dot when an icon helps (it is hidden from screen readers).
 */
export function StatusPill({ tone = 'neutral', children, icon, testId, title }: { tone?: Tone; children: ReactNode; icon?: ReactNode; testId?: string; title?: string }) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      title={title}
      className={cn('inline-flex h-[22px] items-center gap-[5px] rounded-full px-[9px] text-xs leading-normal font-[550] whitespace-nowrap', TONE_CLASS[tone])}
    >
      {icon ? (
        <span aria-hidden className="inline-flex [&_svg]:!size-3.5">
          {icon}
        </span>
      ) : (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full bg-current opacity-80', tone === 'live' && 'animate-[kx-pulse_1.6s_infinite]')} />
      )}
      {children}
    </span>
  );
}

/** A small count, for nav items and tabs ("12 pending"). Zero renders nothing unless `showZero`. */
export function CountBadge({ count, tone = 'info', label, showZero }: { count: number; tone?: Tone; label?: string; showZero?: boolean }) {
  if (count === 0 && !showZero) return null;
  return (
    <span
      aria-label={label ? `${count} ${label}` : undefined}
      className={cn('inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', TONE_CLASS[tone])}
    >
      {count > 999 ? '999+' : count}
    </span>
  );
}
