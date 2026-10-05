import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { canUseErp, landingFor } from '@/lib/access';
import { getMe, load } from '@/lib/api';
import { emailName } from '@/lib/password';
import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('account.password.title') };
}

/**
 * Change password: from the account menu at any time, and forced (outside the dashboard layout,
 * which sends people here) after signing in with a temporary password.
 */
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
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
  return (
    <ChangePasswordForm
      forced={!!me.data.mustChangePassword}
      hasPassword={me.data.hasPassword !== false}
      emailName={emailName(me.data.email)}
      next={next ?? ''}
      back={landingFor(me.data.roles, next)}
    />
  );
}
