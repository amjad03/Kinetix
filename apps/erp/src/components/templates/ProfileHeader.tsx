import type { ReactNode } from 'react';
import { initials } from '@/components/initials';
import { StatusPill, type Tone } from '@/components/ui';

/** Kept for callers that still name a colour; the cover is now one neutral pattern for every profile. */
export type ProfileCover = 'teal' | 'violet' | 'blue' | 'pink';

export interface ProfileMeta {
  icon: ReactNode;
  text: ReactNode;
}

/**
 * Profile header (AdminCN user-profile style): a short, quiet patterned cover, a square rounded avatar
 * overlapping its bottom-left corner, then the name, status and a row of small icon facts beside the
 * avatar, with the primary action on the right of that row.
 */
export function ProfileHeader({ title, status, meta = [], chips = [], actions, extra }: { title: string; status?: { label: string; tone?: Tone }; meta?: ProfileMeta[]; chips?: string[]; actions?: ReactNode; extra?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card" data-testid="profile-header">
      <div
        aria-hidden
        className="h-[110px] bg-muted/50 dark:bg-muted/30"
        style={{
          backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, #000 30%, rgba(0,0,0,.55))',
        }}
      />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 pb-5 md:px-6">
        <span className="-mt-11 grid size-[88px] shrink-0 place-items-center rounded-2xl border-4 border-card bg-teal-soft text-[28px] font-semibold text-teal-ink shadow-sm" data-testid="profile-avatar">
          {initials(title) || '?'}
        </span>
        <div className="min-w-0 flex-1 basis-56 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-xl leading-tight font-[650] tracking-[-0.015em] md:text-[22px]">{title}</h1>
            {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
            {extra}
          </div>
          {meta.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground" data-testid="profile-meta">
              {meta.map((m, i) => (
                <li key={i} className="flex min-w-0 items-center gap-1.5 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0">
                  {m.icon}
                  <span>{m.text}</span>
                </li>
              ))}
            </ul>
          )}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 pt-3">{actions}</div>}
      </div>
    </section>
  );
}
