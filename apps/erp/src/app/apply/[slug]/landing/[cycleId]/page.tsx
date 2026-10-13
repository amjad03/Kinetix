import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';

import { Button, Container } from '@/components/kx';
import { pal } from '@/lib/sx';
export const dynamic = 'force-dynamic';

interface Landing {
  institution: string;
  cycle: { id: string; name: string; programName: string; status: string; opensOn: string; closesOn: string; seats: number; applicationFeePaise: number };
  documents: { label: string; required: boolean }[];
  headline: string;
  intro: string;
  highlights: { title: string; text: string }[];
  faqs: { q: string; a: string }[];
  contactPhone: string | null;
  contactEmail: string | null;
  accentColour: string;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('apply.title') };
}

/** The public page that introduces one admission cycle (set up in Admissions tools) before the application form. */
export default async function LandingPage({ params }: { params: Promise<{ slug: string; cycleId: string }> }) {
  const { slug, cycleId } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(cycleId)) notFound();
  const { t, fmt } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<Landing>(`/v1/public/admissions/${slug}/landing/${cycleId}`, { anonymous: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  if (res.error !== undefined)
    return (
      <div className="min-h-[100dvh] bg-background py-8">
        <Container maxWidth="md">
          <ErrorState message={res.error} />
        </Container>
      </div>
    );
  const p = res.data;
  const open = p.cycle.status === 'open';
  return (
    <div className="min-h-[100dvh] bg-background py-8">
      <Container maxWidth="md">
        <Logo />
        <div className="rounded-[12px] border bg-card mt-6 p-5 md:p-8" style={{ borderTop: `6px solid ${p.accentColour}` }}>
          <span className="text-[11px] leading-4 font-medium tracking-[0.5px] text-muted-foreground">
            {p.institution} · {p.cycle.programName}
          </span>
          <h1 className="font-display text-2xl leading-8 mt-1">
            {p.headline}
          </h1>
          {p.intro && (
            <p className="text-sm leading-[21px] text-muted-foreground mt-4 whitespace-pre-line">
              {p.intro}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-6 mt-6">
            <p className="text-[13px] leading-[19px]">{t('g1.land.closes', { date: fmt.date(p.cycle.closesOn, 'long') })}</p>
            <p className="text-[13px] leading-[19px]">{t('g1.land.seats', { n: p.cycle.seats })}</p>
            <p className="text-[13px] leading-[19px]">{p.cycle.applicationFeePaise > 0 ? t('g1.land.fee', { amount: fmt.rupees(p.cycle.applicationFeePaise) }) : t('g1.land.free')}</p>
          </div>
          {open && (
            <Button className="mt-6" style={{ backgroundColor: pal(p.accentColour) }} href={`/apply/${slug}`} variant="contained" size="large" data-testid="landing-apply">
              {t('g1.land.apply')}
            </Button>
          )}
          {!open && <p className="text-sm leading-[21px] mt-6">{t('g1.land.closed')}</p>}
        </div>

        {p.highlights.length > 0 && (
          <div className="flex flex-col md:flex-row gap-4 mt-6">
            {p.highlights.map((h) => (
              <div className="rounded-[12px] border bg-card p-5 flex-1" key={h.title}>
                <h6 className="text-base leading-6 tracking-[0.1px] font-bold">
                  {h.title}
                </h6>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {h.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {p.documents.length > 0 && (
          <div className="rounded-[12px] border bg-card p-5 mt-6">
            <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
              {t('g1.land.documents')}
            </h2>
            <ul className="m-0 mt-2 pl-6">
              {p.documents.map((d) => (
                <li key={d.label}>
                  <p className="text-[13px] leading-[19px]">
                    {d.label}
                    {d.required ? ' *' : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.faqs.length > 0 && (
          <div className="rounded-[12px] border bg-card p-5 mt-6">
            <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
              {t('g1.land.faq')}
            </h2>
            {p.faqs.map((f) => (
              <div className="mt-3" key={f.q}>
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{f.q}</h6>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        )}

        {(p.contactPhone || p.contactEmail) && (
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-6">
            {t('g1.land.contact')}: {[p.contactPhone, p.contactEmail].filter(Boolean).join(' · ')}
          </p>
        )}
      </Container>
    </div>
  );
}
