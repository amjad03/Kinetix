import { randomInt } from 'node:crypto';

/** A temporary password: 14 characters without look-alikes (0/O, 1/l/I). */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export const MIN_PASSWORD_LENGTH = 10;

/** The 20 passwords seen most often in leaks (with the Indian favourites), compared ignoring case. */
export const COMMON_PASSWORDS: readonly string[] = [
  '123456', '123456789', '12345678', 'password', 'qwerty', '12345', '1234567', '111111', '1234567890', '123123',
  'abc123', 'password1', 'iloveyou', '000000', 'qwerty123', 'password123', 'password@123', 'qwertyuiop', 'india@123', 'admin@123',
];

/** The API's messages (and so the error codes in common/error-codes.ts) for each rule. */
export const PASSWORD_ERRORS = {
  tooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters`,
  tooWeak: 'This password is too easy to guess',
  unchanged: 'Choose a password different from the current one',
  containsLogin: 'The password must not contain your email name',
} as const;

/**
 * Checks a new password against the policy: at least 10 characters, not the current one, not
 * containing the local part of the user's email (when it is 3+ characters), and not one of the
 * most common passwords. Returns the message for the first rule broken, or null.
 */
export function passwordProblem(password: string, ctx: { email: string | null; current?: string }): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_ERRORS.tooShort;
  if (ctx.current !== undefined && password === ctx.current) return PASSWORD_ERRORS.unchanged;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lower)) return PASSWORD_ERRORS.tooWeak;
  const local = ctx.email?.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 3 && lower.includes(local)) return PASSWORD_ERRORS.containsLogin;
  return null;
}
