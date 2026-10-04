import 'server-only';
import { cookies } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { errorText } from '@/i18n/errors';
import { getI18n } from '@/i18n/server';
import { canSee, homeFor, type Section } from './access';
import { API_URL, SESSION_COOKIE } from './config';
import type { ActionResult, Me } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The API's stable error code (services/api/src/common/error-codes.ts), when it sent one. */
    readonly code?: string,
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
  /** Send this text as a CSV body (bulk import) instead of `body` as JSON. */
  csv?: string;
  /** Return the response body as text (a CSV template) instead of parsing JSON. */
  text?: boolean;
  /** Request timeout; a large import takes longer than a page load. */
  timeoutMs?: number;
}

interface ErrorBody {
  message?: string | string[];
  code?: string;
  /** A validation error is the flattened zod error itself. */
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

/** The API's error: its English message (the first one) and its `code`. */
async function errorFrom(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    /* not JSON */
  }
  const m =
    (Array.isArray(body.message) ? body.message.join(', ') : body.message) ??
    body.formErrors?.[0] ??
    Object.values(body.fieldErrors ?? {}).find((v) => v?.length)?.[0];
  if (m) return new ApiError(res.status, m, body.code);
  if (res.status === 403) return new ApiError(403, "Your account doesn't have access to this.", body.code ?? 'FORBIDDEN');
  if (res.status === 404) return new ApiError(404, 'Not found.', body.code ?? 'NOT_FOUND');
  if (res.status === 429) return new ApiError(429, 'Too many attempts. Wait a minute and try again.', body.code ?? 'RATE_LIMITED');
  return new ApiError(res.status, `KINETIX Cloud returned an error (${res.status}).`, body.code);
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
  if (opts.csv !== undefined) headers['content-type'] = 'text/csv; charset=utf-8';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.csv !== undefined ? opts.csv : opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch {
    throw new ApiError(0, "Can't reach KINETIX Cloud. Check your connection and try again.", 'NETWORK');
  }
  if (res.status === 401 && !opts.anonymous) redirect('/auth/end?reason=expired');
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  // A handler that returns null sends an empty body.
  const text = await res.text();
  if (opts.text) return text as T;
  return (text ? JSON.parse(text) : null) as T;
}

export type Loaded<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/** For pages: turns API failures into a message the page renders, instead of a generic error screen. */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    const { t } = await getI18n();
    return { error: e instanceof ApiError ? errorText(e, t) : t('error.loadPage') };
  }
}

/** For server actions: returns `{ ok, error }` and lets redirects through. */
export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    const { t } = await getI18n();
    return { ok: false, error: e instanceof ApiError ? errorText(e, t) : t('error.generic') };
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
