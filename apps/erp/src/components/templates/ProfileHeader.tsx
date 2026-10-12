import type { ReactNode } from 'react';
import { initials } from '@/components/initials';
import { StatusPill, type Tone } from '@/components/ui';

const COVERS = {
  teal: 'from-teal-500 via-teal-700 to-indigo-900',
  violet: 'from-violet-500 via-indigo-700 to-slate-900',
  blue: 'from-sky-500 via-blue-700 to-indigo-900',
  pink: 'from-pink-500 via-fuchsia-700 to-indigo-900',
} as const;
export type ProfileCover = keyof typeof COVERS;

/**
 * Profile header (redesign v2, AdminCN profile style): a gradient cover, the avatar overlapping it,
 * name, status and chips, the actions, and the key facts in a row.
 */
export function ProfileHeader({ title, subtitle, status, chips = [], facts = [], actions, cover = 'teal' }: { title: string; subtitle?: ReactNode; status?: { label: string; tone?: Tone }; chips?: string[]; facts?: { label: string; value: ReactNode }[]; actions?: ReactNode; cover?: ProfileCover }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card" data-testid="profile-header">
      <div className={`relative h-28 bg-gradient-to-br md:h-36 ${COVERS[cover]}`} aria-hidden>
        <svg className="absolute inset-0 size-full opacity-30" viewBox="0 0 600 140" preserveAspectRatio="none">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M-20 ${30 + i * 30} C 150 ${0 + i * 30}, 380 ${90 + i * 30}, 620 ${20 + i * 30}`} fill="none" stroke="white" strokeOpacity={0.25 - i * 0.04} strokeWidth={10 - i * 2} />
          ))}
        </svg>
      </div>
      <div className="px-5 pb-5 md:px-6">
        <div className="-mt-10 flex flex-wrap items-end gap-4 md:-mt-12">
          <span className="grid size-20 shrink-0 place-items-center rounded-full border-4 border-card bg-teal-soft text-2xl font-semibold text-teal-ink md:size-24 md:text-3xl">{initials(title) || '?'}</span>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="m-0 truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
              {subtitle}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2 pb-1">{actions}</div>}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {c}
              </span>
            ))}
          </div>
        )}
        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-3 lg:grid-cols-6">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 truncate text-sm font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
