import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { ApiError, api, load } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PublicEvents {
  institution: string;
  events: { id: string; title: string; description: string; eventType: string; venue: string; startsAt: string; endsAt: string; capacity: number; seatsLeft: number; feePaise: number }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('g1.ev.title') };
}

/** The public list of the institution's open events (fests, seminars, open days): no sign-in; registering happens in the KINETIX app. */
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
    <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', py: 4 }}>
      <Container maxWidth="md">
        <Logo />
        {res.error !== undefined ? (
          <Box sx={{ mt: 4 }}>
            <ErrorState message={res.error} />
          </Box>
        ) : (
          <>
            <Typography variant="h4" component="h1" sx={{ mt: 3 }}>
              {t('g1.ev.heading', { institution: res.data.institution })}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t('g1.ev.how')}
            </Typography>
            {res.data.events.length === 0 && <EmptyState icon={<Box component="span">·</Box>} title={t('g1.ev.empty')} />}
            {res.data.events.map((e) => (
              <Paper key={e.id} variant="outlined" sx={{ p: 2.5, mb: 2 }} data-testid="public-event">
                <Typography variant="h6" component="h2">
                  {e.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {fmt.dateTime(e.startsAt)} · {e.venue}
                </Typography>
                {e.description && <Typography sx={{ mt: 1 }}>{e.description}</Typography>}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {e.seatsLeft > 0 ? t('g1.ev.seats', { n: e.seatsLeft }) : t('g1.ev.full')} · {e.feePaise > 0 ? fmt.rupees(e.feePaise) : t('g1.ev.free')}
                </Typography>
              </Paper>
            ))}
          </>
        )}
      </Container>
    </Box>
  );
}
