import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';

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
      <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', py: 4 }}>
        <Container maxWidth="md">
          <ErrorState message={res.error} />
        </Container>
      </Box>
    );
  const p = res.data;
  const open = p.cycle.status === 'open';
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', py: 4 }}>
      <Container maxWidth="md">
        <Logo />
        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2.5, md: 4 }, borderTop: `6px solid ${p.accentColour}` }}>
          <Typography variant="overline" color="text.secondary">
            {p.institution} · {p.cycle.programName}
          </Typography>
          <Typography variant="h4" component="h1" sx={{ mt: 0.5 }}>
            {p.headline}
          </Typography>
          {p.intro && (
            <Typography sx={{ mt: 2, whiteSpace: 'pre-line' }} color="text.secondary">
              {p.intro}
            </Typography>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 3 }}>
            <Typography variant="body2">{t('g1.land.closes', { date: fmt.date(p.cycle.closesOn, 'long') })}</Typography>
            <Typography variant="body2">{t('g1.land.seats', { n: p.cycle.seats })}</Typography>
            <Typography variant="body2">{p.cycle.applicationFeePaise > 0 ? t('g1.land.fee', { amount: fmt.rupees(p.cycle.applicationFeePaise) }) : t('g1.land.free')}</Typography>
          </Stack>
          {open && (
            <Button component={Link} href={`/apply/${slug}`} variant="contained" size="large" sx={{ mt: 3, bgcolor: p.accentColour }} data-testid="landing-apply">
              {t('g1.land.apply')}
            </Button>
          )}
          {!open && <Typography sx={{ mt: 3 }}>{t('g1.land.closed')}</Typography>}
        </Paper>

        {p.highlights.length > 0 && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 3 }}>
            {p.highlights.map((h) => (
              <Paper key={h.title} variant="outlined" sx={{ p: 2.5, flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {h.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {h.text}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}

        {p.documents.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2.5, mt: 3 }}>
            <Typography variant="h6" component="h2">
              {t('g1.land.documents')}
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
              {p.documents.map((d) => (
                <li key={d.label}>
                  <Typography variant="body2">
                    {d.label}
                    {d.required ? ' *' : ''}
                  </Typography>
                </li>
              ))}
            </Box>
          </Paper>
        )}

        {p.faqs.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2.5, mt: 3 }}>
            <Typography variant="h6" component="h2">
              {t('g1.land.faq')}
            </Typography>
            {p.faqs.map((f) => (
              <Box key={f.q} sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2">{f.q}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {f.a}
                </Typography>
              </Box>
            ))}
          </Paper>
        )}

        {(p.contactPhone || p.contactEmail) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            {t('g1.land.contact')}: {[p.contactPhone, p.contactEmail].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </Container>
    </Box>
  );
}
