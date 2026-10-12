import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OnlineTestRunner } from '@/components/admissions/OnlineTestRunner';
import { Logo } from '@/components/Logo';
import { getI18n } from '@/i18n/server';

import { Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ag.take.title') };
}

/** The applicant's online entrance test: no staff sign-in, the application number and access token are the key. */
export default async function OnlineTestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="md">
        <Logo />
        <OnlineTestRunner slug={slug} />
      </Container>
    </div>
  );
}
