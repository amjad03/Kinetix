import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { RecruiterHome, RecruiterWelcome, type PortalHome } from '@/components/placements/RecruiterPortal';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { portalKey } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('pd.rc.title'), robots: { index: false } };
}

/**
 * The recruiter portal, without an institution login: a company registers itself, and once the placement cell has
 * verified it signs in with its portal key to post job descriptions, read shortlists, upload round results and give
 * feedback on the graduates it hired.
 */
export default async function RecruiterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getI18n();
  const valid = /^[a-z0-9-]{1,60}$/.test(slug);
  const inst = valid ? await api<{ name: string }>(`/v1/public/recruiters/${slug}`, { anonymous: true }).catch(() => null) : null;
  const key = inst ? await portalKey(slug) : null;
  const home = key ? await act(() => api<PortalHome>(`/v1/public/recruiters/${slug}/me`, { anonymous: true, headers: { 'x-recruiter-key': key } })) : null;
  return (
    <main className="min-h-[100dvh] bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-[960px]">
        <div className="mb-6">
          <Logo />
        </div>
        <h1 className="mb-1 text-[1.375rem] leading-7">{t('pd.rc.title')}</h1>
        {inst?.name ? <p className="mb-6 text-sm text-muted-foreground">{inst.name}</p> : null}
        {!inst?.name ? (
          <p className="text-sm">{t('pd.rc.unknown')}</p>
        ) : home?.ok ? (
          <RecruiterHome slug={slug} home={home.data} />
        ) : (
          <RecruiterWelcome slug={slug} expired={home !== null} />
        )}
      </div>
    </main>
  );
}
