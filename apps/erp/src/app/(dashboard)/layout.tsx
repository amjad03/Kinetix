import Box from '@mui/material/Box';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { getMe, load } from '@/lib/api';
import { DASHBOARD_ROLES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const me = await load(getMe);
  if (me.error !== undefined) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', p: 3 }}>
        <Logo />
        <Box sx={{ maxWidth: 640, mx: 'auto', mt: 10 }}>
          <ErrorState title="Can't open KINETIX ERP" message={me.error} />
        </Box>
      </Box>
    );
  }
  if (!me.data.roles.some((r) => DASHBOARD_ROLES.includes(r))) redirect('/auth/end?reason=denied');
  return (
    <AppShell user={{ fullName: me.data.fullName, email: me.data.email, roles: me.data.roles }} school={me.data.tenant.name}>
      {children}
    </AppShell>
  );
}
