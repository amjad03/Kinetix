import Box from '@mui/material/Box';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getMe, load } from '@/lib/api';
import { canUseErp } from '@/lib/access';
import { CHANGE_PASSWORD_PATH } from '@/lib/password';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
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
  // Signed in with a temporary password: nothing else until a new one is chosen.
  if (me.data.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (me.data.mustSetUpMfa) redirect('/account/security');
  return (
    <AppShell user={{ fullName: me.data.fullName, email: me.data.email, roles: me.data.roles, platformAdmin: !!me.data.platformAdmin }} school={me.data.tenant.name}>
      {children}
    </AppShell>
  );
}
