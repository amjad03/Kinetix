import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeKit } from '../src/db/soundarya/kit.js';
import { governanceDepth } from '../src/db/soundarya/governance-depth.js';
import type { Ctx } from '../src/db/soundarya/ctx.js';
import { createTenant, ownerPool } from './helpers.js';

// The Soundarya sample for rules, incidents, retention, the KINETIX plan, AI evaluation and the tutor: it must load into the schema.
describe('Soundarya governance sample', () => {
  const owner = ownerPool();
  afterAll(() => owner.end());
  let t: Awaited<ReturnType<typeof createTenant>>;
  beforeAll(async () => {
    t = await createTenant(owner);
  });

  it('inserts rules, incidents, retention, subscription, invoices, eval cases and a tutor thread', async () => {
    const who = (id: string) => ({ id, name: id, email: id });
    const byEmail = { principal: who(t.principal.id), admin: who(t.principal.id), accounts: who(t.teacher.id), 'hod.commerce': who(t.teacher.id), 'hod.computers': who(t.teacher2.id) };
    const ctx = { kit: makeKit(owner, t.tenantId), tenantId: t.tenantId, today: '2026-10-10', byEmail, students: [{ id: t.students[0].id, userId: t.studentUser.id }] } as unknown as Ctx;
    await governanceDepth(ctx);
    const count = async (table: string) => Number((await owner.query(`select count(*)::int as n from ${table} where tenant_id = $1`, [t.tenantId])).rows[0].n);
    expect(await count('business_rules')).toBe(5);
    expect(await count('incidents')).toBe(2);
    expect(await count('incident_updates')).toBe(3);
    expect(await count('document_retention_policies')).toBe(4);
    expect(await count('saas_subscriptions')).toBe(1);
    expect(await count('saas_invoices')).toBe(2);
    expect(await count('ai_eval_cases')).toBe(3);
    expect(await count('ai_tutor_messages')).toBe(4);
    const inv = (await owner.query('select number, total_paise, tax_breakdown from saas_invoices where tenant_id = $1 order by number', [t.tenantId])).rows;
    expect(inv.map((r: { number: string }) => r.number)).toEqual(['KX/2026-27/0001', 'KX/2026-27/0002']);
    expect(Number(inv[0].tax_breakdown.cgstPaise)).toBe(Number(inv[0].tax_breakdown.sgstPaise));
  });
});
