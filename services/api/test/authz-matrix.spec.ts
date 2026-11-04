import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PUBLIC_ALLOWED, renderMatrix, scanRoutes } from './authz/scan.js';

const OUT = join(__dirname, '..', '..', '..', 'docs', 'security', 'AUTHZ_MATRIX.md');

describe('authorization matrix', () => {
  const routes = scanRoutes(AppModule);
  it('finds the routes of every controller', () => {
    expect(routes.length).toBeGreaterThan(2000);
  });
  it('docs/security/AUTHZ_MATRIX.md matches the route metadata', () => {
    const fresh = renderMatrix(routes);
    if (process.env.UPDATE_AUTHZ) {
      mkdirSync(join(OUT, '..'), { recursive: true });
      writeFileSync(OUT, fresh);
      if (process.env.AUTHZ_JSON) writeFileSync(process.env.AUTHZ_JSON, JSON.stringify(routes, null, 1));
    }
    expect(readFileSync(OUT, 'utf8'), 'Run: UPDATE_AUTHZ=1 vitest run -c vitest.scan.config.ts').toBe(fresh);
  });
  it('has no public route outside the allow list', () => {
    expect(routes.filter((r) => r.flags.includes('PUBLIC?')).map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
  it('every public allow-list entry is used by a public route (no stale entries that would admit a new route)', () => {
    const pub = routes.filter((r) => !r.kinds && !r.guards.length);
    expect(PUBLIC_ALLOWED.filter(([re]) => !pub.some((r) => re.test(r.path))).map(([re]) => re.source)).toEqual([]);
  });
  it('the public allow list is anchored: a staff route without @Auth that merely contains webhook, verify, public or platform is not admitted', () => {
    const canaries = ['/v1/integrations/webhooks', '/v1/comms/webhook-settings', '/v1/hr/payroll/return', '/v1/exams/marks/verify/:id', '/v1/students/public/list', '/v1/platform/tenants', '/v1/admin/sso/callback-urls', '/v1/fees/refunds/callback'];
    expect(canaries.filter((path) => PUBLIC_ALLOWED.some(([re]) => re.test(path)))).toEqual([]);
  });
  it('every route flagged BROAD or OWNERSHIP? has been reviewed (test/authz/scan.ts REVIEWED)', () => {
    expect(routes.filter((r) => r.flags.some((f) => f === 'BROAD' || f === 'OWNERSHIP?') && !r.flags.includes('reviewed')).map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
});
