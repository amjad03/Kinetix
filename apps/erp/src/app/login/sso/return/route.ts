import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { api } from '@/lib/api';
import { canUseErp, landingFor } from '@/lib/access';
import { SESSION_COOKIE, TENANT_COOKIE } from '@/lib/config';
import { secureCookies, storeSession } from '@/lib/session';
import type { LoginResponse, MfaChallenge } from '@/lib/types';

/** The browser comes back from the provider with a one-time ticket; trade it for a session. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const ticket = req.nextUrl.searchParams.get('ticket');
  const tenant = req.nextUrl.searchParams.get('tenant');
  const denied = NextResponse.redirect(`${origin}/login?reason=denied`);
  if (!ticket || !tenant) return denied;
  try {
    const res = await api<LoginResponse | MfaChallenge>('/v1/auth/sso/exchange', { method: 'POST', body: { tenant, ticket }, anonymous: true });
    // Two-step verification still applies: finish it on the sign-in page.
    if ('mfaRequired' in res || !canUseErp(res.user.roles)) return denied;
    await storeSession(res.accessToken);
    (await cookies()).set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 365 * 86_400 });
    void SESSION_COOKIE;
    return NextResponse.redirect(`${origin}${landingFor(res.user.roles, '')}`);
  } catch {
    return denied;
  }
}
