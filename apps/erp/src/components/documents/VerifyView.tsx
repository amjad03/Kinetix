import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

import { CircleCheck as CheckCircleOutlined, CircleHelp as HelpOutlineOutlined, CircleX as CancelOutlined } from 'lucide-react';
export type VerifyTone = 'valid' | 'bad' | 'unknown';

/** The public verification result: no sign-in, and only what is printed on the document. */
export function VerifyView({ tone, heading, lines, footer, brand, extra }: { tone: VerifyTone; heading: string; lines: { label: string; value: string }[]; footer: string; brand?: { name: string; logo: string | null }; extra?: ReactNode }) {
  const Icon = tone === 'valid' ? CheckCircleOutlined : tone === 'bad' ? CancelOutlined : HelpOutlineOutlined;
  const color = tone === 'valid' ? 'success.main' : tone === 'bad' ? 'error.main' : 'text.secondary';
  return (
    <main className="min-h-[100dvh] bg-background grid place-items-center p-4">
      <div className="w-full max-w-[480px] bg-card border border-border rounded-[16px] p-6 sm:p-8 text-center">
        <div className="mb-6 flex justify-center">
          {brand ? (
            <span className="grid justify-items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.logo && <img src={brand.logo} alt="" className="size-16 object-contain" />}
              <b className="text-[15px] leading-5">{brand.name}</b>
            </span>
          ) : (
            <Logo />
          )}
        </div>
        <Icon className="mx-auto size-16" style={{ color }} aria-hidden />
        <h1 className="text-[1.375rem] leading-7 mt-2" style={{ color }} role="status" data-testid="verify-heading">
          {heading}
        </h1>
        <dl className="mt-6 mb-0 text-left grid grid-cols-[auto_1fr] gap-2 gap-x-4">
          {lines.map((l) => (
            <div className="contents" key={l.label}>
              <dt className="text-[13px] leading-[19px] text-muted-foreground">
                {l.label}
              </dt>
              <dd className="text-[13px] leading-[19px] m-0 font-medium wrap-anywhere">
                {l.value}
              </dd>
            </div>
          ))}
        </dl>
        {extra}
        <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-6">
          {footer}
        </p>
      </div>
    </main>
  );
}
