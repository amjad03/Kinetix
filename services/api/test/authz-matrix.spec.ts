import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { renderMatrix, scanRoutes } from './authz/scan.js';

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
  it('every route flagged BROAD or OWNERSHIP? has been reviewed (test/authz/scan.ts REVIEWED)', () => {
    expect(routes.filter((r) => r.flags.some((f) => f === 'BROAD' || f === 'OWNERSHIP?') && !r.flags.includes('reviewed')).map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
});
