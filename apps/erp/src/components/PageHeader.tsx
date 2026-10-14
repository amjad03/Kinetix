import type { ReactNode } from 'react';

/**
 * The title row every page starts with: one h1, a line of context and the page's primary actions on the right,
 * vertically centred on the title block. Action buttons share the 36px control height.
 * It sticks under the top bar and tab bar while the page scrolls, so the primary action stays one click away.
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sticky top-[99px] z-10 mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-background py-1 [box-shadow:0_0_0_24px_var(--background)] [clip-path:inset(-24px_-24px_-8px_-24px)]" data-slot="page-header">
      <div className="min-w-0">
        <h1 className="m-0 text-[22px] leading-tight font-[650] tracking-[-0.015em] md:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 [&>a]:h-9 [&>button]:h-9">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, id, flush }: { children: ReactNode; action?: ReactNode; id?: string; flush?: boolean }) {
  return (
    <div className={`mb-3 flex min-h-9 items-center justify-between gap-4 ${flush ? '' : 'mt-7'}`}>
      <h2 id={id} className="m-0 text-[15px] leading-6 font-semibold">
        {children}
      </h2>
      {action}
    </div>
  );
}
