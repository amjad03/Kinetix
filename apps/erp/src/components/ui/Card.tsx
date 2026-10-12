import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A card (redesign: white, 14 px radius, hairline border): an optional header (title, subtitle,
 * one action) and a body. It is a labelled region when it has a title.
 * `sx` is kept for older callers (spacing, grid placement) and only then renders through MUI's Box.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  padded = true,
  tone = 'default',
  sx,
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
  sx?: SxProps<Theme>;
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
        <div className={cn('flex items-start justify-between gap-3 px-[18px] pt-4', padded ? 'pb-0' : 'pb-3')}>
          <div className="min-w-0">
            {title && (
              <h2 id={id} className="m-0 text-[15px] leading-6 font-semibold">
                {title}
              </h2>
            )}
            {subtitle && <p className={cn('m-0 mt-0.5 text-[12.5px]', tone === 'ai' ? 'text-inherit' : 'text-muted-foreground')}>{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn('min-w-0 flex-1', padded && 'px-[18px] pb-[18px]', padded && (title || action ? 'pt-3' : 'pt-[18px]'))}>{children}</div>
    </>
  );
  if (sx)
    return (
      <Box component="section" aria-labelledby={title ? id : undefined} data-testid={testId} className={cls} sx={sx}>
        {inner}
      </Box>
    );
  return (
    <section aria-labelledby={title ? id : undefined} data-testid={testId} className={cls}>
      {inner}
    </section>
  );
}
