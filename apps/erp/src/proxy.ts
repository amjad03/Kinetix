import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER } from '@/lib/return-path';

/** Tells server code which page is being opened, so an expired or missing session can return to it after sign-in. */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|api/|favicon|.*\\.[a-z0-9]+$).*)'] };
