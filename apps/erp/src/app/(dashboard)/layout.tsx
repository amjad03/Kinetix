import Box from '@mui/material/Box';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Logo } from '@/components/Logo';
import { ErrorState } from '@/components/States';
import { api, getMe, load } from '@/lib/api';
import { canSee, canUseErp } from '@/lib/access';
import { YEAR_COOKIE } from '@/lib/config';
import { densityFor, DENSITY_COOKIE } from '@/lib/density';
import { CHANGE_PASSWORD_PATH } from '@/lib/password';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

interface Notifications {
  unread: number;
  items: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[];
}

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
  // The top bar's extras are best effort: a failure hides them rather than the page.
  const roles = me.data.roles;
  const [structure, notes, caps] = await Promise.all([
    canSee(roles, 'school') || canSee(roles, 'fees') || canSee(roles, 'admissions')
      ? load(() => api<{ academicYears: { id: string; label: string; isCurrent: boolean }[] }>('/v1/admin/structure'))
      : Promise.resolve(null),
    load(() => api<Notifications>('/v1/notifications?limit=10')),
    load(() => api<{ disabledModules: string[]; academicModel?: string }>('/v1/institution/capabilities')),
  ]);
  const years = structure?.data?.academicYears ?? [];
  const picked = (await cookies()).get(YEAR_COOKIE)?.value ?? '';
  const yearId = years.find((y) => y.id === picked)?.id ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '';
  return (
    <AppShell
      user={{ fullName: me.data.fullName, email: me.data.email, roles, platformAdmin: !!me.data.platformAdmin }}
      school={me.data.tenant.name}
      years={years}
      yearId={yearId}
      notices={notes.data?.items ?? []}
      unread={notes.data?.unread ?? 0}
      disabledModules={caps.data?.disabledModules ?? []}
      density={densityFor(caps.data?.academicModel, (await cookies()).get(DENSITY_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  );
}
