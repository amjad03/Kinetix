import 'server-only';
import { cookies } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { canSee, homeFor, type Section } from './access';
import { API_URL, SESSION_COOKIE } from './config';
import type { ActionResult, Me } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send without the session token (login). */
  anonymous?: boolean;
}

async function messageFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[]; error?: string };
    const m = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    if (m) return m;
  } catch {
    /* not JSON */
  }
  if (res.status === 403) return "Your account doesn't have access to this.";
  if (res.status === 404) return 'Not found.';
  if (res.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return `KINETIX Cloud returned an error (${res.status}).`;
}

/**
 * Calls the KINETIX Cloud API from the server with the signed-in user's token.
 * The token lives in an httpOnly cookie and never reaches the browser.
 * A missing or expired session sends the user to the sign-in page.
 */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!opts.anonymous) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) redirect('/login');
    headers.authorization = `Bearer ${token}`;
  }
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, "Can't reach KINETIX Cloud. Check your connection and try again.");
  }
  if (res.status === 401 && !opts.anonymous) redirect('/auth/end?reason=expired');
  if (!res.ok) throw new ApiError(res.status, await messageFrom(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Loaded<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/** For pages: turns API failures into a message the page renders, instead of a generic error screen. */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof ApiError ? e.message : 'Something went wrong while loading this page.' };
  }
}

/** For server actions: returns `{ ok, error }` and lets redirects through. */
export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof ApiError ? e.message : 'Something went wrong. Try again.' };
  }
}

/** The signed-in user, once per request. */
export const getMe = cache(() => api<Me>('/v1/me'));

/**
 * For pages: the signed-in user, if their role may open this section; otherwise back to their
 * own home page (an accountant opening Today lands on Fees). The API checks roles as well.
 */
export async function requireSection(section: Section): Promise<Me | null> {
  let me: Me;
  try {
    me = await getMe();
  } catch (e) {
    unstable_rethrow(e);
    return null; // the layout shows the error
  }
  if (!canSee(me.roles, section)) redirect(homeFor(me.roles));
  return me;
}
