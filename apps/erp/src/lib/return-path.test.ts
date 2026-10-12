import { describe, expect, it } from 'vitest';
import { loginUrl, safeReturnPath } from './return-path';

describe('return path after sign-in', () => {
  it('keeps local pages and drops sign-in pages and other origins', () => {
    expect(safeReturnPath('/fees/invoices?status=due')).toBe('/fees/invoices?status=due');
    for (const p of ['/', '//evil.example', 'https://x.y', '/login', '/auth/end', '/\\evil', null]) expect(safeReturnPath(p)).toBeNull();
  });
  it('builds the sign-in link', () => {
    expect(loginUrl('/fees/invoices')).toBe('/login?next=%2Ffees%2Finvoices');
    expect(loginUrl('/')).toBe('/login');
    expect(loginUrl('/students', '/auth/end', { reason: 'expired' })).toBe('/auth/end?reason=expired&next=%2Fstudents');
  });
});
