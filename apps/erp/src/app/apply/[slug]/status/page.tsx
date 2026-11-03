import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StatusLookup } from '@/components/admissions/StatusLookup';
import { Logo } from '@/components/Logo';
import { Container } from '@/components/kx';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.status.title') };
}

/** The public status page: an applicant or parent checks progress with the application number and date of birth. */
export default async function StatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  const { t } = await getI18n();
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-xl font-semibold leading-7">{t('ap.status.title')}</h1>
            <p className="text-[13px] text-muted-foreground">{t('ap.status.help')}</p>
          </div>
        </div>
        <StatusLookup slug={slug} />
      </Container>
    </div>
  );
}
