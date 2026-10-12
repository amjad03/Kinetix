import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplyForm, EnquiryForm } from '@/components/admissions/ApplyForm';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { ApiError, api, load } from '@/lib/api';
import type { PublicCycles } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';

import { Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('apply.title') };
}

/** The institution's public admissions page: no sign-in. Apply, or ask a question first. */
export default async function ApplyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { slug } = await params;
  const { ref } = await searchParams;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  const { t } = await getI18n();
  const data = await load(async () => {
    try {
      return await api<PublicCycles>(`/v1/public/admissions/${slug}/cycles`, { anonymous: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="md">
        <Logo />
        {data.error !== undefined ? (
          <div className="mt-8">
            <ErrorState message={data.error} />
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl leading-8 mt-6">
              {t('apply.heading', { institution: data.data.institution })}
            </h1>
            <p className="text-sm leading-[21px] text-muted-foreground mb-6">
              {t('apply.intro')}
            </p>
            <ApplyForm slug={slug} data={data.data} />
            <h2 className="text-[1.375rem] leading-7 mt-12 mb-2">
              {t('apply.questions')}
            </h2>
            <p className="text-sm leading-[21px] text-muted-foreground mb-4">
              {t('apply.questionsBody')}
            </p>
            <EnquiryForm slug={slug} programs={data.data.programs} referral={/^[A-Za-z0-9-]{4,20}$/.test(ref ?? '') ? ref!.toUpperCase() : ''} />
          </>
        )}
      </Container>
    </div>
  );
}
