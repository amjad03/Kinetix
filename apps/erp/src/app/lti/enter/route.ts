import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { canUseErp, landingFor } from '@/lib/access';
import { api } from '@/lib/api';
import { TENANT_COOKIE } from '@/lib/config';
import { secureCookies, storeSession } from '@/lib/session';
import type { LoginResponse } from '@/lib/types';

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Where a launch from Moodle (or another LMS) lands: the API sends the browser here with a one-time ticket,
 * which is swapped for a normal sign-in. Anything wrong sends the person to the ordinary sign-in page.
 */
export async function GET(req: NextRequest) {
  const ticket = req.nextUrl.searchParams.get('ticket') ?? '';
  const tenant = req.nextUrl.searchParams.get('tenant') ?? '';
  const fail = () => NextResponse.redirect(new URL('/login?reason=expired', req.nextUrl));
  if (!ticket || !UUID.test(tenant)) return fail();
  try {
    const res = await api<LoginResponse & { courseId?: string | null }>(`/v1/lti/provider/${tenant}/exchange`, { method: 'POST', body: { ticket }, anonymous: true });
    if (!canUseErp(res.user.roles)) return NextResponse.redirect(new URL('/login?reason=denied', req.nextUrl));
    await storeSession(res.accessToken);
    (await cookies()).set(TENANT_COOKIE, tenant, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 365 * 86_400 });
    return NextResponse.redirect(new URL(landingFor(res.user.roles, res.courseId ? `/courses/${res.courseId}` : ''), req.nextUrl));
  } catch {
    return fail();
  }
}
