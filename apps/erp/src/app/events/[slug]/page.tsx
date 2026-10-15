import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';

import { Container } from '@/components/kx';
export const dynamic = 'force-dynamic';

interface PublicEvents {
  institution: string;
  events: { id: string; title: string; description: string; eventType: string; venue: string; startsAt: string; endsAt: string; capacity: number; seatsLeft: number; feePaise: number }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('g1.ev.title') };
}

/** The public list of the institution's open events (fests, seminars, open days): no sign-in; registering happens in the ZYNETIX app. */
export default async function PublicEventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  const { t, fmt } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<PublicEvents>(`/v1/public/events/${slug}`, { anonymous: true });
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
            <h1 className="font-display text-2xl leading-8 mt-6">
              {t('g1.ev.heading', { institution: res.data.institution })}
            </h1>
            <p className="text-sm leading-[21px] text-muted-foreground mb-6">
              {t('g1.ev.how')}
            </p>
            {res.data.events.length === 0 && <EmptyState icon={<span>·</span>} title={t('g1.ev.empty')} />}
            {res.data.events.map((e) => (
              <div className="rounded-[12px] border bg-card p-5 mb-4" key={e.id} data-testid="public-event">
                <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
                  {e.title}
                </h2>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {fmt.dateTime(e.startsAt)} · {e.venue}
                </p>
                {e.description && <p className="text-sm leading-[21px] mt-2">{e.description}</p>}
                <p className="text-[13px] leading-[19px] mt-2">
                  {e.seatsLeft > 0 ? t('g1.ev.seats', { n: e.seatsLeft }) : t('g1.ev.full')} · {e.feePaise > 0 ? fmt.rupees(e.feePaise) : t('g1.ev.free')}
                </p>
              </div>
            ))}
          </>
        )}
      </Container>
    </div>
  );
}
