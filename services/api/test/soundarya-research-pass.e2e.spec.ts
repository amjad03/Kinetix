import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ctx, UserRef } from '../src/db/soundarya/ctx.js';
import { makeKit } from '../src/db/soundarya/kit.js';
import { researchPass } from '../src/db/soundarya/research-pass.js';
import { createTenant, ownerPool } from './helpers.js';

// The Soundarya research pass sample must load into the schema and keep its own rules: heads within each sanction,
// releases within it, valid ORCID iDs, one profile per teacher, and figures for the NAAC, NIRF, NBA and AISHE reports.
describe('Soundarya research pass sample', () => {
  const owner = ownerPool();
  afterAll(() => owner.end());
  let t: Awaited<ReturnType<typeof createTenant>>;
  beforeAll(async () => {
    t = await createTenant(owner);
  });

  it('seeds identifiers, centres, outputs, grants with heads and releases, incentives and Ph.D. progress', async () => {
    const q = (sql: string, p: unknown[] = []) => owner.query(sql, [t.tenantId, ...p]);
    const one = async (sql: string, p: unknown[] = []) => (await q(sql, p)).rows[0];
    const departments: Record<string, string> = {};
    for (const name of ['Commerce', 'Management Studies', 'Computer Applications']) departments[name] = (await one(`insert into departments (tenant_id, name) values ($1, $2) returning id`, [name])).id;
    const byEmail: Record<string, UserRef> = {};
    const emails: [string, string][] = [['hod.commerce', 'Commerce'], ['hod.management', 'Management Studies'], ['hod.computers', 'Computer Applications'], ['sudhir.kamath', 'Commerce'], ['latha.gowda', 'Commerce'], ['harini.acharya', 'Commerce'], ['deepa.nair', 'Management Studies'], ['shalini.desai', 'Management Studies'], ['sowmya.reddy', 'Computer Applications'], ['arvind.shetty', 'Computer Applications'], ['research', 'Commerce']];
    for (const [e, dept] of emails) {
      const u = await one(`insert into users (tenant_id, full_name, email) values ($1, $2, $3) returning id`, [`Staff ${e}`, `${e}-${t.slug}@x.in`]);
      byEmail[e] = { id: u.id, name: `Staff ${e}`, email: e, dept: dept as UserRef['dept'] };
    }
    byEmail.principal = { id: t.principal.id, name: 'Principal', email: 'principal' };
    const ctx = { kit: makeKit(owner, t.tenantId), tenantId: t.tenantId, today: '2026-11-03', byEmail, departments, teachers: Object.values(byEmail) } as unknown as Ctx;
    await researchPass(ctx);

    expect(Number((await one(`select count(*)::int as n from research_profiles where tenant_id = $1`)).n)).toBe(8);
    // Every ORCID iD carries a valid mod 11-2 check digit.
    const { validOrcid } = await import('../src/research/orcid.js');
    for (const r of (await q(`select orcid from research_profiles where tenant_id = $1`)).rows) expect(validOrcid(r.orcid), r.orcid).toBe(true);
    // Budget heads and releases never exceed a sanction; every expense of a grant with heads names one.
    const over = await q(`select g.id from research_grants g where g.tenant_id = $1 and (coalesce((select sum(h.sanctioned_paise) from research_grant_heads h where h.grant_id = g.id), 0) > g.sanctioned_paise or coalesce((select sum(r.amount_paise) from research_grant_releases r where r.grant_id = g.id), 0) > g.sanctioned_paise)`);
    expect(over.rows).toHaveLength(0);
    const headless = await q(`select e.id from grant_expenses e where e.tenant_id = $1 and exists (select 1 from research_grant_heads h where h.grant_id = e.grant_id) and (e.budget_head is null or not exists (select 1 from research_grant_heads h where h.grant_id = e.grant_id and h.head = e.budget_head))`);
    expect(headless.rows).toHaveLength(0);
    const headOver = await q(`select h.id from research_grant_heads h where h.tenant_id = $1 and h.sanctioned_paise < (select coalesce(sum(e.amount_paise), 0) from grant_expenses e where e.grant_id = h.grant_id and e.budget_head = h.head)`);
    expect(headOver.rows).toHaveLength(0);
    // Outputs over five years, one retracted, one waiting for the registry; claims in every state; reports in each state.
    const pubYears = (await q(`select distinct year from publications where tenant_id = $1 order by year`)).rows.map((r) => r.year);
    expect(pubYears).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(Number((await one(`select count(*)::int as n from publications where tenant_id = $1 and status = 'retracted'`)).n)).toBe(1);
    expect(Number((await one(`select count(*)::int as n from publications where tenant_id = $1 and metadata_source = 'pending'`)).n)).toBe(1);
    const claims = (await q(`select status from research_incentive_claims where tenant_id = $1`)).rows.map((r) => r.status);
    expect(new Set(claims)).toEqual(new Set(['claimed', 'approved', 'paid', 'rejected']));
    const reports = (await q(`select status from scholar_progress_reports where tenant_id = $1`)).rows.map((r) => r.status);
    expect(new Set(reports)).toEqual(new Set(['submitted', 'accepted', 'returned']));
    // Scholars carry what AISHE asks: gender, category and mode on each new one; a call closes within a fortnight.
    expect(Number((await one(`select count(*)::int as n from research_scholars where tenant_id = $1 and (gender is null or category is null)`)).n)).toBe(0);
    expect(Number((await one(`select count(*)::int as n from research_calls where tenant_id = $1 and coalesce(internal_deadline, deadline) between '2026-11-03' and '2026-11-17'`)).n)).toBe(1);
    expect(Number((await one(`select count(*)::int as n from conferences where tenant_id = $1 and role = 'organised' and theme in ('ipr', 'research_methodology', 'entrepreneurship')`)).n)).toBe(3);
    expect(Number((await one(`select count(*)::int as n from thesis_records where tenant_id = $1 and shodhganga_handle is not null`)).n)).toBe(1);
  });
});
