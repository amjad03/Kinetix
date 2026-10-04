import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, TENANT_COOKIE } from '@/lib/config';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('login.title') };
}

const NOTICES: Record<string, { severity: 'info' | 'warning'; text: MessageKey }> = {
  expired: { severity: 'info', text: 'login.expired' },
  denied: { severity: 'warning', text: 'login.denied' },
  'signed-out': { severity: 'info', text: 'login.signedOut' },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const jar = await cookies();
  const { reason, next } = await searchParams;
  if (jar.get(SESSION_COOKIE) && !reason) redirect('/');
  const { t } = await getI18n();
  const notice = reason ? NOTICES[reason] : undefined;
  return <LoginForm defaultTenant={jar.get(TENANT_COOKIE)?.value ?? ''} notice={notice ? { severity: notice.severity, text: t(notice.text) } : undefined} next={next} />;
}
