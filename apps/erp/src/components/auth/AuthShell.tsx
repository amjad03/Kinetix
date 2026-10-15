import type { ReactNode } from 'react';

/**
 * Redesign v2 auth layout: the form on the left, a gradient art panel with a message on the right
 * (hidden on phones).
 */
export function AuthShell({ children, title, lead, cardTitle, cardText, footer, brand }: { children: ReactNode; title: string; lead: string; cardTitle: string; cardText: string; footer?: ReactNode; /** The institution last signed in to (Settings > Branding). */ brand?: { name: string; logo: string | null } | null }) {
  return (
    <div className="grid min-h-[100dvh] bg-card md:grid-cols-2" data-testid="auth-shell">
      <div className="flex min-h-[100dvh] flex-col px-5 py-6 md:px-10">
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-4 py-8">
          {brand ? (
            <div className="flex items-center gap-3" data-testid="auth-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.logo && <img src={brand.logo} alt="" className="size-12 shrink-0 object-contain" />}
              <b className="text-[17px] leading-tight">{brand.name}</b>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[9px] bg-[linear-gradient(135deg,#0f9488,#4f46e5)] font-bold text-white">K</span>
              <b className="text-[17px]">Zynetix</b>
            </div>
          )}
          {children}
        </div>
        <div className="text-center text-xs text-muted-foreground">{footer ?? '© 2026 Zynetix'}</div>
      </div>
      <div className="sticky top-0 hidden h-[100dvh] p-4 md:block">
        <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[22px] bg-[#101826] p-10 text-white">
          <svg className="absolute inset-0 size-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <linearGradient id="kx-auth-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0f9488" />
                <stop offset=".55" stopColor="#312e81" />
                <stop offset="1" stopColor="#111827" />
              </linearGradient>
            </defs>
            <rect width="600" height="800" fill="url(#kx-auth-g)" />
            {Array.from({ length: 9 }, (_, i) => (
              <path key={i} d={`M-50 ${120 + i * 70} C 150 ${40 + i * 70}, 350 ${220 + i * 70}, 650 ${100 + i * 70}`} fill="none" stroke={`rgba(255,255,255,${0.05 + i * 0.012})`} strokeWidth={18 - i} />
            ))}
            <circle cx="520" cy="110" r="70" fill="rgba(255,255,255,.07)" />
          </svg>
          <div className="relative">
            <h2 className="m-0 max-w-[460px] text-[34px] leading-[1.15] font-semibold tracking-tight">{title}</h2>
            <p className="mt-3 max-w-[460px] text-white/75">{lead}</p>
          </div>
          <div className="relative rounded-2xl bg-white/90 p-5 text-zinc-900 backdrop-blur">
            <b className="text-lg">{cardTitle}</b>
            <p className="mt-1 text-sm text-zinc-600">{cardText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
