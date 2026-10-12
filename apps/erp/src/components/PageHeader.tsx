import type { ReactNode } from 'react';

/** The title row every page starts with: one h1, a line of context and the page's primary actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4" data-slot="page-header">
      <div className="min-w-0">
        <h1 className="m-0 text-[22px] leading-tight font-[650] tracking-[-0.015em] md:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
