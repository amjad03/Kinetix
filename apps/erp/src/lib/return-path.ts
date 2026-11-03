/** The request header the proxy sets to the page being opened, so a sign-in can come back to it. */
export const PATH_HEADER = 'x-kx-path';

/** A local page worth returning to after signing in (never the sign-in pages themselves). */
export function safeReturnPath(p: string | null | undefined): string | null {
  // Browsers drop tabs and newlines from URLs, so "/\t/evil.example" would become "//evil.example": refuse any control character.
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.includes('\\') || /[\u0000-\u001f\u007f]/.test(p)) return null;
  if (p === '/' || /^\/(login|auth|account|api|_next)(\/|\?|$)/.test(p)) return null;
  return p.length > 512 ? null : p;
}

/** `/login`, or `/login?next=…` when there is a page to come back to. */
export function loginUrl(path: string | null | undefined, base = '/login', extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra);
  const next = safeReturnPath(path);
  if (next) q.set('next', next);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
