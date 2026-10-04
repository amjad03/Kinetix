import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { TENANT_TABLES } from '../src/db/schema.js';
import { createTenant, env, ownerPool } from './helpers.js';

describe('row-level security', () => {
  const owner = ownerPool();
  const appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 2 });
  const app = drizzle(appPool, { schema: s });
  let a: Awaited<ReturnType<typeof createTenant>>;
  let b: Awaited<ReturnType<typeof createTenant>>;

  const asTenant = <T>(tenantId: string, fn: (tx: Parameters<Parameters<typeof app.transaction>[0]>[0]) => Promise<T>) =>
    app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });

  beforeAll(async () => {
    a = await createTenant(owner);
    b = await createTenant(owner);
  });
  afterAll(async () => {
    await owner.end();
    await appPool.end();
  });

  it('every tenant table has RLS enabled with a tenant policy', async () => {
    const { rows } = await owner.query<{ relname: string; relrowsecurity: boolean; policies: string }>(`
      select c.relname, c.relrowsecurity, count(p.polname)::text as policies
      from pg_class c left join pg_policy p on p.polrelid = c.oid
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      group by c.relname, c.relrowsecurity`);
    const byName = new Map(rows.map((r) => [r.relname, r]));
    for (const t of [...TENANT_TABLES, 'tenants']) {
      expect(byName.get(t)?.relrowsecurity, `${t} has RLS`).toBe(true);
      expect(Number(byName.get(t)?.policies), `${t} has a policy`).toBeGreaterThan(0);
    }
    // Every table with a tenant_id column must be listed, so new tables cannot be forgotten.
    const { rows: withTenantId } = await owner.query<{ table_name: string }>(
      `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'`,
    );
    expect(withTenantId.map((r) => r.table_name).sort()).toEqual([...TENANT_TABLES].sort());
  });

  it("a tenant sees only its own rows", async () => {
    const users = await asTenant(a.tenantId, (tx) => tx.select().from(s.users));
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.tenantId === a.tenantId)).toBe(true);
    const leaked = await asTenant(a.tenantId, (tx) => tx.select().from(s.students).where(eq(s.students.id, b.students[0].id)));
    expect(leaked).toEqual([]);
    const tenants = await asTenant(a.tenantId, (tx) => tx.select().from(s.tenants));
    expect(tenants.map((t) => t.id)).toEqual([a.tenantId]);
  });

  it('without a tenant context nothing is visible (fails closed)', async () => {
    const rows = await app.select().from(s.users);
    expect(rows).toEqual([]);
  });

  it("a tenant cannot write rows into another tenant", async () => {
    await expect(
      asTenant(a.tenantId, (tx) => tx.insert(s.rooms).values({ tenantId: b.tenantId, campusId: b.campus.id, name: 'sneaky' })),
    ).rejects.toThrow();
  });

  it("a tenant cannot update another tenant's rows", async () => {
    const updated = await asTenant(a.tenantId, (tx) =>
      tx.update(s.students).set({ fullName: 'hacked' }).where(eq(s.students.id, b.students[0].id)).returning(),
    );
    expect(updated).toEqual([]);
  });

  it('the app role cannot modify tenants or delete audit history', async () => {
    const denied = async (fn: () => Promise<unknown>) => {
      const err = await fn().then(() => null, (e: Error & { cause?: Error }) => e);
      expect(err?.cause?.message ?? err?.message).toMatch(/permission denied/);
    };
    await denied(() => asTenant(a.tenantId, (tx) => tx.update(s.tenants).set({ name: 'x' }).where(eq(s.tenants.id, a.tenantId))));
    await denied(() => asTenant(a.tenantId, (tx) => tx.delete(s.auditLog)));
  });
});
