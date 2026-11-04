import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';

import { Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.dv.policies') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A published public policy's text, linked from the disclosure page. */
export default async function PublicPolicyPage({ params }: { params: Promise<{ slug: string; versionId: string }> }) {
  const { slug, versionId } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !UUID.test(versionId)) notFound();
  const { t, fmt } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<{ code: string; title: string; version: number; body: string; effectiveFrom: string | null }>(`/v1/public/disclosure/${slug}/policies/${versionId}`, { anonymous: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="md">
        <Logo />
        <p className="mt-6 mb-0 text-[13px]">
          <Link href={`/disclosure/${slug}`}>{t('gp.dv.back')}</Link>
        </p>
        {res.error !== undefined ? (
          <ErrorState message={res.error} />
        ) : (
          <>
            <h1 className="mt-2 mb-1 font-display text-2xl leading-8">{res.data.title}</h1>
            <p className="mb-6 text-[13px] text-muted-foreground">{t('gp.dv.policyLine', { code: res.data.code, v: res.data.version, from: res.data.effectiveFrom ? fmt.date(res.data.effectiveFrom, 'short') : '-' })}</p>
            <div className="whitespace-pre-wrap text-[14px] leading-[22px]">{res.data.body}</div>
          </>
        )}
      </Container>
    </div>
  );
}
