import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/config';
import { safeReturnPath } from '@/lib/return-path';

/** Ends the session (expired token, or an account without dashboard access) and returns to sign-in. */
export async function GET(req: NextRequest) {
  (await cookies()).delete(SESSION_COOKIE);
  const reason = req.nextUrl.searchParams.get('reason');
  const url = new URL('/login', req.nextUrl);
  if (reason === 'expired' || reason === 'denied') url.searchParams.set('reason', reason);
  const next = safeReturnPath(req.nextUrl.searchParams.get('next'));
  if (next && reason !== 'denied') url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}
