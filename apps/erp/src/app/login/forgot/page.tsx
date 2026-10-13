import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AuthShell } from '@/components/auth/AuthShell';
import { TENANT_COOKIE } from '@/lib/config';
import { getI18n } from '@/i18n/server';
import { LoginForm } from '../LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('v2.auth.forgotTitle') };
}

/** Forgot password: a one-time sign-in code by SMS to the registered phone. */
export default async function ForgotPage() {
  const jar = await cookies();
  const { t } = await getI18n();
  return (
    <AuthShell title={t('v2.auth.forgotArt')} lead={t('v2.auth.forgotArtLead')} cardTitle={t('v2.auth.smsCard')} cardText={t('v2.auth.smsCardText')}>
      <LoginForm defaultTenant={jar.get(TENANT_COOKIE)?.value ?? ''} mode="forgot" />
    </AuthShell>
  );
}
