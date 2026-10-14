import type { Metadata } from 'next';
import { VerificationRequestForm } from '@/components/exam-cell/VerificationRequestForm';
import { Logo } from '@/components/Logo';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xc.vr.title'), robots: { index: false } };
}

/**
 * Where an employer or another institution asks the institution to verify a transcript, grade card or certificate.
 * Public (no sign-in); the exam office checks the request and answers by email after the fee is paid.
 */
export default async function VerificationRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getI18n();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background p-4">
      <div className="w-full max-w-[520px] rounded-[16px] border border-border bg-card p-6 sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-[1.375rem] leading-7 font-semibold">{t('xc.vr.title')}</h1>
        <p className="mt-2 text-[13px] leading-[19px] text-muted-foreground">{t('xc.vr.intro')}</p>
        <VerificationRequestForm slug={/^[a-z0-9-]{1,60}$/.test(slug) ? slug : ''} />
      </div>
    </main>
  );
}
