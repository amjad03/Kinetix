import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE } from './config';

export const secureCookies = () => process.env.NODE_ENV === 'production' && process.env.KINETIX_INSECURE_COOKIES !== '1';

/** Keeps the API token in the httpOnly session cookie (sign-in, and the new token after a password change). */
export async function storeSession(accessToken: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: SESSION_MAX_AGE });
}
