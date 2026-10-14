'use client';

import { CloudOff, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { RetryButton } from './RetryButton';

/**
 * The shared empty state: an icon in a soft circle, what is missing, an optional line on why, and one
 * clear next step. Centred in a quiet card. Pass a lucide icon that says what the list holds; without one
 * an inbox is shown. `description` and `children` are the same slot; `action` and `actions` too.
 */
export function EmptyState({
  icon,
  title,
  description,
  children,
  action,
  actions,
  dense,
  testId,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
  testId?: string;
  className?: string;
}) {
  const body = description ?? children;
  const buttons = action ?? actions;
  return (
    <div
      data-testid={testId}
      data-slot="empty-state"
      className={cn('flex flex-col items-center rounded-lg border bg-card px-6 text-center text-muted-foreground', dense ? 'py-8' : 'py-12', className)}
    >
      <span aria-hidden className={cn('mb-3 grid shrink-0 place-items-center rounded-full bg-teal-soft text-teal-ink', dense ? 'size-10 [&_svg]:!size-5' : 'size-12 [&_svg]:!size-6')}>
        {icon ?? <Inbox />}
      </span>
      <p className="m-0 text-[15px] leading-6 font-semibold text-foreground">{title}</p>
      {body && <div className="mx-auto mt-1 max-w-[460px] text-[13px] leading-5">{body}</div>}
      {buttons && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{buttons}</div>}
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
