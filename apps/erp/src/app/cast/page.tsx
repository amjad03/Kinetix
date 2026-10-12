import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CastClient, type CastBoard } from '@/components/cast/CastClient';
import { CastSignIn } from '@/components/cast/CastSignIn';
import { getI18n } from '@/i18n/server';
import { API_URL, TENANT_COOKIE } from '@/lib/config';
import { castToken } from '@/lib/cast/relay';
import { castSignOut } from './actions';

import { Button } from '@/components/kx';
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
    <main className="min-h-[100dvh] bg-muted p-4 sm:p-8">
      <div className="max-w-[720px] mx-auto bg-card rounded-[28px] p-6 sm:p-10">
        <h1 className="font-display text-2xl leading-8 mb-[0.35em]">
          {t('cast.title')}
        </h1>
        <p className="text-sm leading-[21px] text-muted-foreground mb-6">
          {t('cast.lead')}
        </p>
        {boards === 'signin' ? (
          <CastSignIn defaultTenant={tenant} />
        ) : (
          <>
            <CastClient boards={boards} />
            <form className="mt-8" action={castSignOut}>
              <Button type="submit" size="small" color="inherit">
                {t('cast.signOut')}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
