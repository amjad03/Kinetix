import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CastClient, type CastBoard } from '@/components/cast/CastClient';
import { CastGuestJoin } from '@/components/cast/CastGuestJoin';
import { CastSignIn } from '@/components/cast/CastSignIn';
import { getI18n } from '@/i18n/server';
import { API_URL, TENANT_COOKIE } from '@/lib/config';
import { castGuest, castToken } from '@/lib/cast/relay';
import { castLeave, castSignOut } from './actions';

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

/**
 * Screen sharing from any laptop or phone browser. A guest types the code on the board (or scans its QR,
 * which opens this page with the code) and their name: no account, no app. Teachers and students can sign
 * in instead and choose the board of their class. The teacher approves each screen on the board.
 */
export default async function CastPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { t } = await getI18n();
  const code = ((await searchParams).code ?? '').slice(0, 12);
  const guest = await castGuest();
  const token = guest ? undefined : await castToken();
  const boards = guest ? null : token ? await boardsFor(token) : 'signin';
  const tenant = (await cookies()).get(TENANT_COOKIE)?.value ?? '';
  return (
    <main className="min-h-[100dvh] bg-muted p-4 sm:p-8">
      <div className="max-w-[720px] mx-auto bg-card rounded-[28px] p-6 sm:p-10">
        <h1 className="font-display text-2xl leading-8 mb-[0.35em]">{t('cast.title')}</h1>
        <p className="text-sm leading-[21px] text-muted-foreground mb-6">{t('cast.lead')}</p>
        {guest ? (
          <>
            <CastClient boards={[{ deviceId: guest.deviceId, name: guest.board, room: null, teacher: guest.name, section: null, subject: null, needsApproval: true }]} guest />
            <form className="mt-8" action={castLeave}>
              <Button type="submit" size="small" color="inherit">
                {t('cast.guest.leave')}
              </Button>
            </form>
          </>
        ) : boards === 'signin' ? (
          <div className="flex flex-col gap-10">
            <CastGuestJoin code={code} />
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t('cast.guest.or')}</p>
              <CastSignIn defaultTenant={tenant} />
            </div>
          </div>
        ) : (
          <>
            {code && <CastGuestJoin code={code} />}
            <CastClient boards={boards ?? []} />
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
