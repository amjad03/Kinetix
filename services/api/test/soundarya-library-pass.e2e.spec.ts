import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ctx } from '../src/db/soundarya/ctx.js';
import { libraryPass } from '../src/db/soundarya/library-pass.js';
import { makeKit } from '../src/db/soundarya/kit.js';
import { createTenant, ownerPool } from './helpers.js';

// The Soundarya library sample must load into the schema and keep the register consistent with the loans.
describe('Soundarya library pass sample', () => {
  const owner = ownerPool();
  afterAll(() => owner.end());
  let t: Awaited<ReturnType<typeof createTenant>>;
  const today = '2026-10-30';
  beforeAll(async () => {
    t = await createTenant(owner);
  });

  it('fills cards, copies, rules, gate, orders, serials, e-resources and binding, and ties loans to copies', async () => {
    const q = (sql: string, p: unknown[] = []) => owner.query(sql, [t.tenantId, ...p]);
    // A small catalogue with one loan out (overdue) and one returned with a fine, as the base library stage leaves it.
    const books = (await q(`insert into library_books (tenant_id, title, author, call_no, copies, price_paise) values ($1, 'Corporate Accounting', 'S. N. Maheshwari', '657.95 MAH', 3, 45000), ($1, 'Let Us C', 'Yashavant Kanetkar', '005.133 KAN', 2, 32000) returning id`)).rows;
    await q(`insert into library_loans (tenant_id, book_id, student_id, issued_at, due_on, issued_by) values ($1, $2, $3, '2026-10-01T05:30:00Z', '2026-10-15', $4)`, [books[0].id, t.students[0].id, t.principal.id]);
    await q(`insert into library_loans (tenant_id, book_id, student_id, issued_at, due_on, returned_at, fine_paise, issued_by) values ($1, $2, $3, '2026-09-01T05:30:00Z', '2026-09-15', '2026-09-18T10:00:00Z', 600, $4)`, [books[1].id, t.students[1].id, t.principal.id]);
    const dept = (await q(`insert into departments (tenant_id, name) values ($1, 'Commerce') returning id`)).rows[0].id;
    const who = (id: string, name = 'Staff') => ({ id, name, email: `${id}@x.in` });
    const ctx = {
      kit: makeKit(owner, t.tenantId),
      r: { int: (a: number) => a, pick: <T>(xs: T[]) => xs[0] },
      tenantId: t.tenantId,
      today,
      byEmail: { library: who(t.principal.id), principal: who(t.principal.id) },
      teachers: [who(t.teacher.id, 'Deepa Nair'), who(t.teacher2.id, 'Sudhir Kamath')],
      students: t.students.map((s, i) => ({ id: s.id, name: s.fullName, rollNo: s.rollNo, prog: 'BCM', userId: i === 2 ? t.studentUser.id : undefined })),
      programs: { BCM: { id: t.program.id, def: { code: 'BCM', level: 'ug' } } },
      departments: { Commerce: dept },
      workingDays: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
      holidays: new Set<string>(['2026-10-20']),
    } as unknown as Ctx;
    await libraryPass(ctx);

    const count = async (table: string, where = '') => Number((await q(`select count(*)::int as n from ${table} where tenant_id = $1 ${where}`)).rows[0].n);
    expect(await count('library_branches')).toBe(2);
    expect(await count('library_member_categories')).toBe(6);
    expect(await count('library_members')).toBe(3 + 2 + 1); // students, teachers, one alumnus
    expect(await count('library_circ_rules')).toBe(6);
    // Every catalogued copy has its accession number; received orders added their own titles and copies.
    expect(await count('library_copies', `and book_id in ('${books[0].id}', '${books[1].id}')`)).toBe(5);
    expect(await count('library_copies', 'and acquisition_id is not null')).toBe(4 + 3);
    // The open loan holds a copy on loan; both loans carry the borrower's card.
    const loans = (await q(`select l.returned_at, l.member_id, c.status from library_loans l left join library_copies c on c.id = l.copy_id where l.tenant_id = $1 and l.student_id is not null order by l.issued_at`)).rows;
    expect(loans.every((l: { member_id: string | null }) => l.member_id)).toBe(true);
    expect(loans.find((l: { returned_at: string | null }) => !l.returned_at).status).toBe('on_loan');
    expect(await count('library_overdue_notices')).toBe(3); // 15 days late: the first, second and final notices
    expect(await count('library_gate_log')).toBeGreaterThan(100);
    expect(await count('library_vendors')).toBe(4);
    expect(await count('library_purchase_orders')).toBe(3);
    const inv = (await q(`select gross_paise, discount_paise, net_paise from library_invoices where tenant_id = $1 and po_id is not null`)).rows[0];
    expect(Number(inv.gross_paise)).toBe(4 * 67_500 + 3 * 56_000);
    expect(Number(inv.net_paise)).toBe(Number(inv.gross_paise) - Number(inv.discount_paise));
    const shares = (await q(`select coalesce(sum(invoice_amount_paise), 0)::bigint as s from library_acquisitions where tenant_id = $1 and status = 'invoiced'`)).rows[0].s;
    expect(Number(shares)).toBe(Number(inv.net_paise));
    expect(await count('library_periodicals')).toBe(6);
    expect(await count('library_periodical_issues', "and status = 'claimed'")).toBeGreaterThan(0);
    expect(await count('library_eresources', "and provider in ('delnet', 'nlist', 'eshodhsindhu')")).toBe(3);
    expect(await count('library_eresource_usage')).toBe(3 * 6);
    expect(await count('library_binding_items')).toBeGreaterThanOrEqual(4);
    expect(await count('library_copies', "and status = 'binding'")).toBe(3);
    // The next numbers follow the seeded ones.
    const counters = Object.fromEntries((await q(`select kind, last_no from doc_counters where tenant_id = $1 and kind in ('ACC', 'MEM', 'LPO', 'ACQ', 'LBB')`)).rows.map((r: { kind: string; last_no: number }) => [r.kind, r.last_no]));
    expect(counters).toEqual({ ACC: 5 + 7, MEM: 6, LPO: 3, ACQ: 8, LBB: 2 });
  });
});
