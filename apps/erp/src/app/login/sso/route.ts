import { NextResponse, type NextRequest } from 'next/server';
import { api } from '@/lib/api';

/** Starts single sign-on: asks the API for the provider's address (PKCE is handled there) and sends the browser to it. */
export async function GET(req: NextRequest) {
  const tenant = (req.nextUrl.searchParams.get('tenant') ?? '').trim().toLowerCase();
  const origin = req.nextUrl.origin;
  if (!/^[a-z0-9-]{1,64}$/.test(tenant)) return NextResponse.redirect(`${origin}/login?reason=denied`);
  try {
    const r = await api<{ authorizationUrl: string }>('/v1/auth/sso/start', { method: 'POST', body: { tenant, redirectUri: `${origin}/login/sso/return` }, anonymous: true });
    return NextResponse.redirect(r.authorizationUrl);
  } catch {
    return NextResponse.redirect(`${origin}/login?reason=denied`);
  }
}
