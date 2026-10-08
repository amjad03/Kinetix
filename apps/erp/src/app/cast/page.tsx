import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CastClient, type CastBoard } from '@/components/cast/CastClient';
import { CastSignIn } from '@/components/cast/CastSignIn';
import { getI18n } from '@/i18n/server';
import { API_URL, TENANT_COOKIE } from '@/lib/config';
import { castToken } from '@/lib/cast/relay';
import { castSignOut } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cast.title') };
}

async function boardsFor(token: string): Promise<CastBoard[] | 'signin'> {
  try {
    const res = await fetch(`${API_URL}/v1/cast/boards`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return 'signin';
    return res.ok ? ((await res.json()) as CastBoard[]) : [];
  } catch {
    return [];
  }
}

/** Screen sharing from a laptop: choose the board of your class, share the screen, the teacher approves on the board. */
export default async function CastPage() {
  const { t } = await getI18n();
  const token = await castToken();
  const boards = token ? await boardsFor(token) : 'signin';
  const tenant = (await cookies()).get(TENANT_COOKIE)?.value ?? '';
  return (
    <Box component="main" sx={{ minHeight: '100dvh', bgcolor: 'm3.surfaceContainer', p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', bgcolor: 'm3.surfaceContainerLowest', borderRadius: '28px', p: { xs: 3, sm: 5 } }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('cast.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t('cast.lead')}
        </Typography>
        {boards === 'signin' ? (
          <CastSignIn defaultTenant={tenant} />
        ) : (
          <>
            <CastClient boards={boards} />
            <Box component="form" action={castSignOut} sx={{ mt: 4 }}>
              <Button type="submit" size="small" color="inherit">
                {t('cast.signOut')}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
