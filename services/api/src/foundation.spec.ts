import { describe, expect, it } from 'vitest';
import { nextRun } from './analytics/reports.service.js';
import { crc32, zip } from './analytics/zip.js';
import { base32Decode, base32Encode, hashBackupCode, newBackupCode, normalizeBackupCode, totpCode, totpStep, verifyTotp } from './auth/totp.js';
import { deviceLabel } from './auth/mfa.service.js';
import { MetricsRegistry } from './observability/metrics.js';
import { currentContext, requestContext } from './observability/request-context.js';
import { StructuredLogger } from './observability/structured-logger.js';
import { otlpBody, parseTraceparent, Tracer } from './observability/tracer.js';

describe('TOTP (RFC 6238)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches the RFC test vectors (SHA-1, last six digits)', () => {
    expect(totpCode(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(secret, Math.floor(20000000000 / 30))).toBe('353130');
  });
  it('round-trips base32', () => {
    expect(base32Decode(base32Encode(Buffer.from('hello world'))).toString()).toBe('hello world');
    expect(() => base32Decode('not base32!')).toThrow();
  });
  it('accepts one period of clock drift, never replays a step, rejects junk', () => {
    const now = new Date(1_700_000_000_000);
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), now, 0)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, 0)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), now, 0)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, 0)).toBeNull();
  });
  it('makes backup codes that hash the same however they are typed', () => {
    const c = newBackupCode();
    expect(c).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    expect(hashBackupCode(c.toUpperCase().replace('-', ' '))).toBe(hashBackupCode(c));
    expect(normalizeBackupCode(' AB-CD ')).toBe('abcd');
  });
  it('labels devices for the sessions list', () => {
    expect(deviceLabel({ deviceName: 'Teacher App on Pixel 7' })).toBe('Teacher App on Pixel 7');
    expect(deviceLabel({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' })).toBe('Chrome on macOS');
    expect(deviceLabel({})).toBe('Unknown device');
  });
});

describe('structured logging, metrics and tracing', () => {
  it('writes JSON lines carrying the request context', () => {
    const lines: string[] = [];
    const log = new StructuredLogger((l) => lines.push(l));
    log.log('outside a request', 'Boot');
    requestContext.run({ requestId: 'req-1', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), tenantId: 'tenant-1', userId: 'user-1' }, () => {
      expect(currentContext()?.requestId).toBe('req-1');
      log.warn('inside', 'Svc');
      log.error('failed', 'stack trace', 'Svc');
    });
    const [a, b, c] = lines.map((l) => JSON.parse(l));
    expect(a).toMatchObject({ level: 'info', context: 'Boot', message: 'outside a request' });
    expect(a.requestId).toBeUndefined();
    expect(b).toMatchObject({ level: 'warn', context: 'Svc', requestId: 'req-1', traceId: 'a'.repeat(32), tenantId: 'tenant-1', userId: 'user-1' });
    expect(c).toMatchObject({ level: 'error', stack: 'stack trace', requestId: 'req-1' });
  });

  it('renders Prometheus text', () => {
    const r = new MetricsRegistry();
    r.counter('hits_total', 'Hits.').inc({ route: '/a"b' });
    r.counter('hits_total', 'Hits.').inc({ route: '/a"b' }, 2);
    r.histogram('lat_seconds', 'Latency.', [0.1, 1]).observe({ m: 'GET' }, 0.5);
    const text = r.render();
    expect(text).toContain('# TYPE hits_total counter');
    expect(text).toContain('hits_total{route="/a\\"b"} 3');
    expect(text).toContain('lat_seconds_bucket{m="GET",le="0.1"} 0');
    expect(text).toContain('lat_seconds_bucket{m="GET",le="1"} 1');
    expect(text).toContain('lat_seconds_bucket{m="GET",le="+Inf"} 1');
    expect(text).toContain('lat_seconds_sum{m="GET"} 0.5');
  });

  it('parses traceparent and exports OTLP/HTTP JSON only when an endpoint is set', async () => {
    expect(parseTraceparent(`00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`)).toEqual({ traceId: '1'.repeat(32), parentSpanId: '2'.repeat(16), sampled: true });
    expect(parseTraceparent('garbage')).toBeNull();
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${'2'.repeat(16)}-01`)).toBeNull();
    const span = { traceId: '1'.repeat(32), spanId: '2'.repeat(16), name: 'GET /x', startMs: 1000, endMs: 1500, attributes: { 'http.status_code': 200, ok: true, route: '/x' }, error: false };
    const body = otlpBody('kinetix-api', [span]);
    const s = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(s).toMatchObject({ name: 'GET /x', kind: 2, startTimeUnixNano: '1000000000', endTimeUnixNano: '1500000000', status: { code: 1 } });
    expect(s.attributes).toContainEqual({ key: 'http.status_code', value: { intValue: '200' } });
    const sent: { url: string; body: string }[] = [];
    const send = async (url: string, b: string) => sent.push({ url, body: b });
    const off = new Tracer(undefined, 'svc', 1, send);
    off.record(span);
    await off.flush();
    expect(sent).toHaveLength(0);
    const on = new Tracer('http://collector:4318/', 'svc', 1, send);
    on.record(span);
    await on.flush();
    expect(sent[0].url).toBe('http://collector:4318/v1/traces');
    expect(JSON.parse(sent[0].body).resourceSpans[0].resource.attributes[0]).toEqual({ key: 'service.name', value: { stringValue: 'svc' } });
    expect(new Tracer('http://c', 'svc', 0, send).shouldSample()).toBe(false);
    expect(new Tracer('http://c', 'svc', 0, send).shouldSample(true)).toBe(true);
  });
});

describe('report helpers', () => {
  it('writes a valid store-only ZIP', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const z = zip([{ name: 'a.csv', data: Buffer.from('x,y\n1,2\n') }, { name: 'b.csv', data: Buffer.from('z\n') }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    expect(z.readUInt16LE(z.length - 12)).toBe(2); // entries in the central directory
    expect(z.includes('a.csv')).toBe(true);
  });

  it('schedules at 06:00 local time', () => {
    const tz = 'Asia/Kolkata';
    const after = new Date('2026-10-08T01:00:00Z'); // 06:30 IST: today's 06:00 has passed
    expect(nextRun(after, 'daily', tz).toISOString()).toBe('2026-10-09T00:30:00.000Z');
    expect(nextRun(new Date('2026-10-07T20:00:00Z'), 'daily', tz).toISOString()).toBe('2026-10-08T00:30:00.000Z'); // 01:30 IST: later today
    expect(nextRun(after, 'weekly', tz, true).toISOString()).toBe('2026-10-15T00:30:00.000Z');
    expect(nextRun(after, 'monthly', tz, true).toISOString()).toBe('2026-11-08T00:30:00.000Z');
    expect(nextRun(new Date('2026-01-31T10:00:00Z'), 'monthly', tz, true).toISOString()).toBe('2026-02-28T00:30:00.000Z');
  });
});
