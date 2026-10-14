import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A card (redesign: white, 14 px radius, hairline border): an optional header (title, subtitle,
 * one action) and a body. It is a labelled region when it has a title.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  padded = true,
  tone = 'default',
  testId,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** false: the body runs edge to edge (tables, lists). */
  padded?: boolean;
  /** `ai` tints the card amber; use only for AI content. */
  tone?: 'default' | 'ai' | 'tonal';
  testId?: string;
  className?: string;
}) {
  const id = useId();
  const cls = cn(
    'flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground shadow-card',
    tone === 'ai' && 'border-transparent bg-amber-soft text-foreground',
    tone === 'tonal' && 'bg-muted',
    className,
  );
  const inner = (
    <>
      {(title || action) && (
        <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-[18px]', padded ? 'pb-0' : 'pb-3')}>
          <div className="min-w-0">
            {title && (
              <h2 id={id} className="m-0 text-[15px] leading-6 font-semibold">
                {title}
              </h2>
            )}
            {subtitle && <p className={cn('m-0 mt-0.5 text-[12.5px]', tone === 'ai' ? 'text-inherit' : 'text-muted-foreground')}>{subtitle}</p>}
          </div>
          {action && <div className="max-w-full min-w-0 shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn('min-w-0 flex-1', padded && 'px-5 pb-5', padded && (title || action ? 'pt-4' : 'pt-5'))}>{children}</div>
    </>
  );
  return (
    <section aria-labelledby={title ? id : undefined} data-testid={testId} className={cls}>
      {inner}
    </section>
  );
}
