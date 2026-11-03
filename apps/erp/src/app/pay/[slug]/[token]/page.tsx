import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayLink, type PayPage } from '@/components/fee-flagship/PayLink';
import { Container } from '@/components/kx';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ff.pay.title'), robots: { index: false, follow: false } };
}

/** A fee payment link opened by the family (no sign-in): pay online through the fee account's gateway, or by UPI QR. */
export default async function PayLinkPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) notFound();
  const res = await load(() => api<PayPage>(`/v1/public/pay/${slug}/${token}`, { anonymous: true }));
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="sm">
        <Logo />
        <div className="mt-6 rounded-[12px] border bg-card p-5">{res.error !== undefined ? <ErrorState message={res.error} /> : <PayLink slug={slug} token={token} page={res.data} />}</div>
      </Container>
    </div>
  );
}
