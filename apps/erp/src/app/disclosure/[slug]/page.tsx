import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DisclosureView } from '@/components/governance/DisclosureView';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';
import type { Disclosure } from '@/lib/governance-pass';

import { Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.disclosure') };
}

/** The institution's published mandatory disclosure page (UGC self-disclosure, AICTE mandatory disclosure): no sign-in. */
export default async function PublicDisclosurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  const { t, fmt } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<Disclosure>(`/v1/public/disclosure/${slug}`, { anonymous: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="md">
        <Logo />
        {res.error !== undefined ? (
          <div className="mt-8">
            <ErrorState message={res.error} />
          </div>
        ) : (
          <>
            <h1 className="mt-6 mb-1 font-display text-2xl leading-8">{t('gp.dv.heading', { institution: res.data.institution.name })}</h1>
            <p className="mb-6 text-[13px] text-muted-foreground">{res.data.publishedAt ? t('gp.dv.updated', { at: fmt.date(res.data.publishedAt.slice(0, 10), 'long') }) : null}</p>
            <DisclosureView d={res.data} t={t} date={(d) => fmt.date(d, 'short')} policyHref={(v) => `/disclosure/${slug}/policies/${v}`} />
          </>
        )}
      </Container>
    </div>
  );
}
