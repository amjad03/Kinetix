// Changing the password (POST /v1/me/password). The API checks the full policy (also the most
// common passwords); the ERP checks what it can before sending, in the user's language.

/** The API's minimum (services/api/src/auth/password-policy.ts). */
export const MIN_PASSWORD_LENGTH = 10;

export const CHANGE_PASSWORD_PATH = '/account/password';

export type PasswordIssue = 'missing' | 'tooShort' | 'mismatch' | 'unchanged' | 'containsLogin';

/** The first problem with the form, or null to send it. `current` is undefined when the account has no password yet. */
export function passwordIssue(f: { current?: string; next: string; confirm: string; email: string | null }): PasswordIssue | null {
  if ((f.current !== undefined && !f.current) || !f.next || !f.confirm) return 'missing';
  if (f.next.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (f.next !== f.confirm) return 'mismatch';
  if (f.current !== undefined && f.next === f.current) return 'unchanged';
  const local = emailName(f.email);
  if (local.length >= 3 && f.next.toLowerCase().includes(local.toLowerCase())) return 'containsLogin';
  return null;
}

/** The part of the email before @, which a password must not contain. */
export function emailName(email: string | null | undefined): string {
  return email?.split('@')[0] ?? '';
}

/** Where to send someone who signed in with a temporary password, keeping where they were going. */
export function changePasswordUrl(next?: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && next !== '/' ? `${CHANGE_PASSWORD_PATH}?next=${encodeURIComponent(next)}` : CHANGE_PASSWORD_PATH;
}
