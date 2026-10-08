import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { canUseErp, landingFor } from '@/lib/access';
import { api, getMe, load } from '@/lib/api';
import type { MfaStatus, SessionRow } from '@/lib/insights';
import { SecurityPanel } from './SecurityPanel';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('security.title') };
}

/**
 * Two-step sign-in and signed-in devices. Outside the dashboard layout, like the password page, because a
 * user whose institution requires two-step sign-in and who has none yet can open nothing else.
 */
export default async function SecurityPage() {
  const me = await load(getMe);
  const { t } = await getI18n();
  if (me.error !== undefined) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', p: 3 }}>
        <Logo />
        <Box sx={{ maxWidth: 640, mx: 'auto', mt: 10 }}>
          <ErrorState title={t('state.cantOpen')} message={me.error} />
        </Box>
      </Box>
    );
  }
  if (!canUseErp(me.data.roles)) redirect('/auth/end?reason=denied');
  const [status, sessions] = await Promise.all([load(() => api<MfaStatus>('/v1/me/mfa')), load(() => api<SessionRow[]>('/v1/me/sessions'))]);
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', p: { xs: 2, md: 4 } }}>
      <Logo />
      <Box sx={{ maxWidth: 720, mx: 'auto', mt: 6 }}>
        <Typography variant="h4" component="h1">
          {t('security.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('security.lead')}
        </Typography>
        {status.error !== undefined || sessions.error !== undefined ? (
          <ErrorState message={status.error ?? sessions.error ?? ''} />
        ) : (
          <SecurityPanel status={status.data} sessions={sessions.data} back={landingFor(me.data.roles, undefined)} />
        )}
      </Box>
    </Box>
  );
}
