import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The definition of done for an API module (PRD section 93, docs/product/definition-of-done.md): a test calls its routes,
// and what it writes leaves an audit entry. This keeps both true as modules are added. A module may be listed below only with a reason.
const SRC = join(__dirname, '..', 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(SRC);
const controllers = files.filter((f) => f.endsWith('.controller.ts'));

/** Modules whose writes are not business records, so they leave no audit entry. */
const NO_AUDIT: Record<string, string> = {
  code: 'Runs a snippet in a sandbox and returns its output; nothing is stored.',
  notifications: 'Marks a person\'s own notifications read; the notifications themselves are logged where they are sent.',
  push: 'Registers and removes a phone\'s push token for the signed-in person.',
  sync: 'The board\'s offline outbox replay; each replayed record is audited by the module that owns it.',
};

describe('definition of done', () => {
  it('every route family is called by at least one test', () => {
    const tests = [...walk(join(__dirname)), ...files.filter((f) => f.endsWith('.spec.ts'))].map((f) => readFileSync(f, 'utf8')).join('\n');
    const untested = new Set<string>();
    for (const f of controllers) for (const m of readFileSync(f, 'utf8').matchAll(/@Controller\('(v1\/[^'/]+)/g)) if (!tests.includes(`/${m[1]}`)) untested.add(`${m[1]} (${relative(SRC, f)})`);
    expect([...untested]).toEqual([]);
  });

  it('every module that writes through a controller records an audit entry', () => {
    const missing: string[] = [];
    const modules = new Set(controllers.map((f) => relative(SRC, f).split('/')[0]));
    for (const mod of modules) {
      const own = files.filter((f) => relative(SRC, f).startsWith(`${mod}/`) && f.endsWith('.ts') && !f.endsWith('.spec.ts'));
      const writes = own.some((f) => f.endsWith('.controller.ts') && /@(Post|Put|Patch|Delete)\(/.test(readFileSync(f, 'utf8')));
      const audits = own.some((f) => /\baudit\(|auditUser\(|\.audit\b|emit\(/.test(readFileSync(f, 'utf8')));
      if (writes && !audits && !NO_AUDIT[mod]) missing.push(mod);
    }
    expect(missing).toEqual([]);
  });

  it('every reason for skipping the audit still names a module that exists', () => {
    const modules = new Set(controllers.map((f) => relative(SRC, f).split('/')[0]));
    for (const mod of Object.keys(NO_AUDIT)) expect(modules.has(mod), mod).toBe(true);
  });
});
