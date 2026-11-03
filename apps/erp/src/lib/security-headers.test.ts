import { describe, expect, it } from 'vitest';
import nextConfig, { CONTENT_SECURITY_POLICY } from '../../next.config';

describe('ERP security headers', () => {
  it('sends CSP, HSTS, no-sniff and no framing on every page', async () => {
    const rules = await nextConfig.headers!();
    expect(rules[0].source).toBe('/:path*');
    const h = Object.fromEntries(rules[0].headers.map((x) => [x.key, x.value]));
    expect(h['Strict-Transport-Security']).toMatch(/max-age=31536000/);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY);
  });
  it('the policy allows no other origin for scripts or connections and no framing', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toMatch(/script-src 'self' 'unsafe-inline'( 'unsafe-eval')?;/);
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self';");
  });
});
