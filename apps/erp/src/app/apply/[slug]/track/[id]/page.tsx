import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
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
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', py: 4 }}>
      <Container maxWidth="sm">
        <Logo />
        {res.error !== undefined ? (
          <Box sx={{ mt: 4 }}>
            <ErrorState message={res.error} />
          </Box>
        ) : (
          <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
            {sp.new === '1' && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {t('apply.submitted')}
              </Alert>
            )}
            <Typography variant="h5" component="h1">
              {res.data.applicantName}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {res.data.applicationNo} · {res.data.cycleName}
            </Typography>
            <Box sx={{ mb: 3 }}>
              <StatusPill kind="application" status={res.data.status} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t(`apply.status.${res.data.status}` as MessageKey)}
                {res.data.statusReason ? ` ${res.data.statusReason}` : ''}
              </Typography>
              {res.data.meritRank && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {t('apply.rank', { rank: res.data.meritRank })}
                </Typography>
              )}
            </Box>
            <TrackActions slug={slug} app={res.data} token={token} />
            <Alert severity="warning" sx={{ mt: 3 }}>
              {t('apply.keepLink')}
            </Alert>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
