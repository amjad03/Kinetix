import 'server-only';

export const API_URL = (process.env.KINETIX_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
export const SESSION_COOKIE = 'kx_session';
export const TENANT_COOKIE = 'kx_tenant';
/** Matches the API's user token lifetime (12 h). */
export const SESSION_MAX_AGE = 12 * 3600;
/** The academic year chosen in the top bar (an id); pages that can show another year read it. */
export const YEAR_COOKIE = 'kx_year';
