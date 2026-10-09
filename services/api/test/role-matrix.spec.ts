import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const doc = () => readFileSync(join(__dirname, '..', '..', '..', 'docs', 'product', 'role-matrix.md'), 'utf8');

describe('role matrix', () => {
  it('docs/product/role-matrix.md matches the @Auth decorators in the code', () => {
    const script = join(__dirname, '..', 'scripts', 'role-matrix.mjs');
    const fresh = execFileSync('node', [script, '--stdout'], { encoding: 'utf8' });
    expect(doc(), 'Run: node services/api/scripts/role-matrix.mjs').toBe(fresh);
  });
  it('lists the governance and billing modules with their roles', () => {
    expect(doc()).toMatch(/\| billing \| principal, tenant_admin \|/);
    expect(doc()).toMatch(/\| governance \|.*quality_officer/);
  });
});
