import { CorrectionPanel, type Correction } from '@/components/admissions/CorrectionPanel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/admissions/Chips';
import { TrackActions } from '@/components/admissions/TrackActions';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { ApiError, api, load } from '@/lib/api';
import type { PublicApplication } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('apply.trackTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The applicant's own page. The secret link (`?t=`) is the only key: keep it private. */
export default async function TrackPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ t?: string; new?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const token = sp.t ?? '';
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !UUID.test(id) || token.length < 10 || token.length > 100) notFound();
  const { t } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<PublicApplication>(`/v1/public/admissions/${slug}/applications/${id}`, { anonymous: true, headers: { 'x-application-token': token } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const fix = res.data?.status === 'correction_requested' ? await load(() => api<Correction>(`/v1/public/admissions/${slug}/applications/${id}/corrections`, { anonymous: true, headers: { 'x-application-token': token } })) : null;
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="sm">
        <Logo />
        {res.error !== undefined ? (
          <div className="mt-8">
            <ErrorState message={res.error} />
          </div>
        ) : (
          <div className="rounded-[12px] border bg-card p-6 mt-6">
            {sp.new === '1' && (
              <Alert className="mb-4" severity="success">
                {t('apply.submitted')}
              </Alert>
            )}
            <h1 className="text-[1.375rem] leading-7">
              {res.data.applicantName}
            </h1>
            <p className="text-sm leading-[21px] text-muted-foreground mb-4">
              {res.data.applicationNo} · {res.data.cycleName}
            </p>
            <div className="mb-6">
              <StatusPill kind="application" status={res.data.status} />
              <p className="text-[13px] leading-[19px] text-muted-foreground mt-2">
                {t(`apply.status.${res.data.status}` as MessageKey)}
                {res.data.statusReason ? ` ${res.data.statusReason}` : ''}
              </p>
              {res.data.meritRank && (
                <p className="text-[13px] leading-[19px] mt-1">
                  {t('apply.rank', { rank: res.data.meritRank })}
                </p>
              )}
            </div>
            {res.data.status === 'correction_requested' && fix?.data && <CorrectionPanel slug={slug} id={id} token={token} fix={fix.data} name={res.data.applicantName} dob={res.data.dateOfBirth ?? ''} />}
            <TrackActions slug={slug} app={res.data} token={token} />
            <Alert className="mt-6" severity="warning">
              {t('apply.keepLink')}
            </Alert>
          </div>
        )}
      </Container>
    </div>
  );
}
