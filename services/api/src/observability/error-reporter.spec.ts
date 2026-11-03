import { describe, expect, it } from 'vitest';
import { ErrorReporter, scrub } from './error-reporter.js';
import { requestContext } from './request-context.js';

describe('error tracking hook', () => {
  it('scrubs tokens, emails, phone numbers and connection strings from messages', () => {
    const s = scrub('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc failed for asha@school.in +91 98765 43210 at postgres://u:p@db:5432/x');
    expect(s).not.toMatch(/eyJ|asha@|98765|u:p@/);
    expect(s).toContain('[email]');
  });

  it('sends ids and the stack only, at most perMinute a minute', async () => {
    const sent: string[] = [];
    const r = new ErrorReporter('https://errors.example.in/hook', 'zynetix-api', 'abc123', 2, async (_u, body) => void sent.push(body));
    const ctx = { requestId: 'req-1', traceId: 't-1', spanId: 's', tenantId: 'ten-1', userId: 'u-1' };
    requestContext.run(ctx as never, () => {
      for (let i = 0; i < 5; i++) r.report(new Error(`boom for ravi@x.in ${i}`));
    });
    await new Promise((res) => setTimeout(res, 5));
    expect(sent).toHaveLength(2);
    const body = JSON.parse(sent[0]);
    expect(body).toMatchObject({ service: 'zynetix-api', release: 'abc123', name: 'Error', requestId: 'req-1', tenantId: 'ten-1', userId: 'u-1' });
    expect(body.message).toBe('boom for [email] 0');
    expect(Array.isArray(body.stack)).toBe(true);
  });

  it('only logs without a webhook', () => {
    expect(new ErrorReporter(undefined).report(new Error('x'))?.message).toBe('x');
  });
});
