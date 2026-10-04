import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, TENANT_COOKIE } from '@/lib/config';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

const NOTICES: Record<string, { severity: 'info' | 'warning'; text: string }> = {
  expired: { severity: 'info', text: 'Your session has ended. Sign in again to continue.' },
  denied: {
    severity: 'warning',
    text: 'KINETIX ERP is for principals, administrators and heads of department. Teachers can use the KINETIX Teacher App.',
  },
  'signed-out': { severity: 'info', text: 'You have signed out.' },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const jar = await cookies();
  const { reason, next } = await searchParams;
  if (jar.get(SESSION_COOKIE) && !reason) redirect('/');
  return <LoginForm defaultTenant={jar.get(TENANT_COOKIE)?.value ?? ''} notice={reason ? NOTICES[reason] : undefined} next={next} />;
}
