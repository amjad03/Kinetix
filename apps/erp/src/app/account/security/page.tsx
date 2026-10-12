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
      <div className="min-h-[100dvh] bg-background p-6">
        <Logo />
        <div className="max-w-[640px] mx-auto mt-20">
          <ErrorState title={t('state.cantOpen')} message={me.error} />
        </div>
      </div>
    );
  }
  if (!canUseErp(me.data.roles)) redirect('/auth/end?reason=denied');
  const [status, sessions] = await Promise.all([load(() => api<MfaStatus>('/v1/me/mfa')), load(() => api<SessionRow[]>('/v1/me/sessions'))]);
  return (
    <div className="min-h-[100dvh] bg-background p-4 md:p-8">
      <Logo />
      <div className="max-w-[720px] mx-auto mt-12">
        <h1 className="font-display text-2xl leading-8">
          {t('security.title')}
        </h1>
        <p className="text-sm leading-[21px] text-muted-foreground mb-6">
          {t('security.lead')}
        </p>
        {status.error !== undefined || sessions.error !== undefined ? (
          <ErrorState message={status.error ?? sessions.error ?? ''} />
        ) : (
          <SecurityPanel status={status.data} sessions={sessions.data} back={landingFor(me.data.roles, undefined)} />
        )}
      </div>
    </div>
  );
}
