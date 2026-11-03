import { describe, expect, it } from 'vitest';
import { assertPublicUrl, assertSafeUrl, isPrivateAddress } from './safe-url.js';

const prod = (resolve: Record<string, string[]>) => ({ production: true, resolve: async (h: string) => resolve[h] ?? [] });

describe('SSRF: server-side requests to addresses institutions type', () => {
  it('knows the private, metadata and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '169.254.170.2', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '224.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '13.232.1.1', '2606:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('refuses names that resolve to the VPC or the metadata service (DNS, not just the text)', async () => {
    await expect(assertPublicUrl('https://metadata.attacker.example/x', prod({ 'metadata.attacker.example': ['169.254.169.254'] }))).rejects.toThrow(/public address/);
    await expect(assertPublicUrl('https://mixed.example/x', prod({ 'mixed.example': ['13.232.1.1', '10.0.0.5'] }))).rejects.toThrow(/public address/);
    await expect(assertPublicUrl('https://hooks.example/x', prod({ 'hooks.example': ['13.232.1.1'] }))).resolves.toBeUndefined();
    await expect(assertPublicUrl('https://nowhere.example/x', prod({}))).rejects.toThrow();
  });

  it('refuses literal private addresses, internal names and plain HTTP in production', async () => {
    for (const u of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'https://db.internal/', 'https://intranet/', 'http://hooks.example/']) {
      await expect(assertPublicUrl(u, prod({ 'hooks.example': ['13.232.1.1'] })), u).rejects.toThrow();
    }
    // Tally speaks only HTTP; still public only.
    await expect(assertPublicUrl('http://tally.school.example:9000', { ...prod({ 'tally.school.example': ['49.36.1.1'] }), allowHttp: true })).resolves.toBeUndefined();
    await expect(assertPublicUrl('http://10.0.0.8:9000', { ...prod({}), allowHttp: true })).rejects.toThrow();
    expect(() => assertSafeUrl('https://[::ffff:127.0.0.1]/', true)).toThrow();
    expect(() => assertSafeUrl('file:///etc/passwd', true)).toThrow();
  });

  it('allows anything http(s) in development', async () => {
    await expect(assertPublicUrl('http://localhost:9000/hook', { production: false })).resolves.toBeUndefined();
  });
});
