'use client';

import { CloudOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { RetryButton } from './RetryButton';

/** The shared empty state: what the page is for, why it is empty, and one clear next step. */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  dense,
  testId,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn('grid place-items-center rounded-lg border border-dashed border-border-strong px-5 text-center text-muted-foreground', dense ? 'py-6' : 'py-10')}>
      <span
        aria-hidden
        className={cn(
          'mb-3 grid place-items-center rounded-[14px] border border-dashed border-border-strong bg-background text-muted-foreground [&_svg]:!size-6',
          dense ? 'size-11' : 'size-[52px]',
        )}
      >
        {icon}
      </span>
      <p className="m-0 text-base font-semibold text-foreground">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[460px] text-[13px]">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ message, title }: { message: string; title?: string }) {
  const { t } = useI18n();
  return (
    <EmptyState icon={<CloudOff />} title={title ?? t('state.loadFailed')} actions={<RetryButton />} testId="error-state">
      {message}
    </EmptyState>
  );
}
