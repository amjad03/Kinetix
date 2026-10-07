import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplyForm, EnquiryForm } from '@/components/admissions/ApplyForm';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { ApiError, api, load } from '@/lib/api';
import type { PublicCycles } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('apply.title') };
}

/** The institution's public admissions page: no sign-in. Apply, or ask a question first. */
export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
    <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', py: 4 }}>
      <Container maxWidth="md">
        <Logo />
        {data.error !== undefined ? (
          <Box sx={{ mt: 4 }}>
            <ErrorState message={data.error} />
          </Box>
        ) : (
          <>
            <Typography variant="h4" component="h1" sx={{ mt: 3 }}>
              {t('apply.heading', { institution: data.data.institution })}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t('apply.intro')}
            </Typography>
            <ApplyForm slug={slug} data={data.data} />
            <Typography variant="h5" component="h2" sx={{ mt: 6, mb: 1 }}>
              {t('apply.questions')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t('apply.questionsBody')}
            </Typography>
            <EnquiryForm slug={slug} programs={data.data.programs} />
          </>
        )}
      </Container>
    </Box>
  );
}
