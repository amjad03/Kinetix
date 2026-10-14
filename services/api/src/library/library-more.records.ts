import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { departmentOptions } from '../admin/structure.records.js';
import { auditUser } from '../common/audit.js';
import { choiceFilter, choices, oneOf, OptionalInt, qual, Rupees, rupeesOf, Url, yesNo } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { departments, libraryBooks, users } from '../db/schema.js';
import { libraryEresourceAccess, libraryEresources } from '../db/schema-depth.js';
import { libraryAcquisitions, libraryBranches, libraryBudgets, libraryGateLog, libraryIll, libraryMembers, libraryPeriodicalIssues, libraryPeriodicals, libraryRepository } from '../db/schema-lht.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, Int, OptionalRef, Text, uuidEq } from '../records/helpers.js';
import { addCopies, findMember, tenantToday } from './circulation.js';
import { LIBRARY_ROLES } from './library.controller.js';
import { branchOptions } from './library.records.js';
import { normaliseIsbn } from './marc.js';

/** Acquisitions and budgets, periodicals and their issues, e-resources, the repository, inter-library loans and the gate register. */

const ACQ_STATUSES = choices(['suggested', 'Suggested'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['ordered', 'Ordered'], ['received', 'Received'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled']);
const HEADS = choices(['books', 'Books'], ['journals', 'Journals and magazines'], ['eresources', 'E-resources'], ['other', 'Other']);
const PERIODICAL_KINDS = choices(['journal', 'Journal'], ['magazine', 'Magazine'], ['newspaper', 'Newspaper']);
const FREQUENCIES = choices(['daily', 'Daily'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['bimonthly', 'Every two months'], ['quarterly', 'Quarterly'], ['halfyearly', 'Half-yearly'], ['annual', 'Annual']);
const ISSUE_STATUSES = choices(['expected', 'Expected'], ['received', 'Received'], ['missing', 'Missing'], ['claimed', 'Claimed'], ['cancelled', 'Cancelled']);
const ER_KINDS = choices(['ebook', 'E-book'], ['journal', 'E-journal'], ['database', 'Database'], ['video', 'Video'], ['other', 'Other']);
const REPO_KINDS = choices(['thesis', 'Thesis'], ['dissertation', 'Dissertation'], ['paper', 'Paper'], ['project', 'Project report'], ['question_paper', 'Question paper'], ['book_chapter', 'Book chapter'], ['other', 'Other']);
const ACCESS = choices(['open', 'Open to all'], ['campus', 'Campus only'], ['restricted', 'Restricted']);
const REPO_STATUSES = choices(['draft', 'Draft'], ['published', 'Published'], ['withdrawn', 'Withdrawn']);
const DIRECTIONS = choices(['borrow', 'Borrowed from another library'], ['lend', 'Lent to another library']);
const NETWORKS = choices(['direct', 'Direct'], ['delnet', 'DELNET'], ['nlist', 'N-LIST'], ['other', 'Other network']);
const ILL_STATUSES = choices(['requested', 'Requested'], ['in_hand', 'Received or sent'], ['returned', 'Returned'], ['cancelled', 'Cancelled']);
const PURPOSES = choices(['reading', 'Reading'], ['borrow', 'Borrow or return'], ['reference', 'Reference'], ['eresources', 'E-resources'], ['other', 'Other']);

/** Days between expected issues for a frequency. */
export const FREQUENCY_DAYS: Record<string, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: 30, bimonthly: 61, quarterly: 91, halfyearly: 182, annual: 365 };

/** The dates issues are expected between two days: monthly issues fall on the same day of each month. */
export function expectedDates(from: string, to: string, frequency: string): string[] {
  const out: string[] = [];
  const step = FREQUENCY_DAYS[frequency] ?? 30;
  const monthly = { monthly: 1, bimonthly: 2, quarterly: 3, halfyearly: 6, annual: 12 }[frequency];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; out.length < 400; i++) {
    let day: string;
    if (monthly) {
      const mm = m - 1 + i * monthly;
      const yy = y + Math.floor(mm / 12);
      const mon = (mm % 12) + 1;
      const last = new Date(Date.UTC(yy, mon, 0)).getUTCDate();
      day = `${yy}-${String(mon).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    } else day = new Date(Date.parse(`${from}T00:00:00Z`) + i * step * 86_400_000).toISOString().slice(0, 10);
    if (day > to) break;
    out.push(day);
  }
  return out;
}

async function budgetOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryBudgets.id, fy: libraryBudgets.fiscalYear, head: libraryBudgets.head, dept: departments.name }).from(libraryBudgets).leftJoin(departments, eq(departments.id, libraryBudgets.departmentId)).orderBy(desc(libraryBudgets.fiscalYear), asc(departments.name));
  return rows.map((r) => ({ value: r.id, label: `${r.fy} · ${r.dept ?? 'Library'} · ${HEADS.find((h) => h.value === r.head)?.label ?? r.head}`, group: r.fy }));
}
async function periodicalOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: libraryPeriodicals.id, title: libraryPeriodicals.title }).from(libraryPeriodicals).orderBy(asc(libraryPeriodicals.title));
  return rows.map((r) => ({ value: r.id, label: r.title }));
}

/** Money committed against a budget (approved or ordered, not yet invoiced) and spent (invoiced, plus periodicals). */
const committedOf = (budgetId: AnyColumn) => sql<number>`(select coalesce(sum(a.est_price_paise * a.quantity), 0)::bigint from library_acquisitions a where a.budget_id = ${qual(budgetId)} and a.status in ('approved', 'ordered', 'received'))`;
const spentOf = (budgetId: AnyColumn) => sql<number>`((select coalesce(sum(a.invoice_amount_paise), 0) from library_acquisitions a where a.budget_id = ${qual(budgetId)} and a.status = 'invoiced') + (select coalesce(sum(p.cost_paise), 0) from library_periodicals p where p.budget_id = ${qual(budgetId)} and p.status = 'active'))::bigint`;

const suggester = alias(users, 'suggester');
const gateMember = alias(libraryMembers, 'gate_member');
const illMember = alias(libraryMembers, 'ill_member');

@Injectable()
export class LibraryMoreRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    for (const e of [this.acquisitions(), this.budgets(), this.periodicals(), this.issues(), this.eresources(), this.repository(), this.ill(), this.gate()]) this.registry.register(e);
  }

  private today(ctx: KitCtx) {
    return tenantToday(ctx.tx, this.clock.now());
  }

  acquisitions(): RecordEntity {
    const total = sql<number>`${libraryAcquisitions.estPricePaise} * ${libraryAcquisitions.quantity}`;
    const setStatus = async (ctx: KitCtx, id: string, from: string[], to: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => {
      const [a] = await ctx.tx.select().from(libraryAcquisitions).where(eq(libraryAcquisitions.id, id)).for('update');
      if (!from.includes(a.status)) throw new ConflictException(`This request is ${a.status}`);
      await ctx.tx.update(libraryAcquisitions).set({ status: to, ...extra }).where(eq(libraryAcquisitions.id, id));
      await auditUser(ctx.tx, ctx.p, `library_acquisition.${to}`, 'library_acquisition', id, { ...data, changes: { status: { before: a.status, after: to } } });
      return a;
    };
    return {
      key: 'library-acquisitions',
      module: 'library',
      table: libraryAcquisitions,
      subjectType: 'library_acquisition',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.number} ${r.title}`,
      list: {
        select: {
          id: libraryAcquisitions.id,
          number: libraryAcquisitions.number,
          title: libraryAcquisitions.title,
          author: libraryAcquisitions.author,
          isbn: libraryAcquisitions.isbn,
          publisher: libraryAcquisitions.publisher,
          edition: libraryAcquisitions.edition,
          quantity: libraryAcquisitions.quantity,
          estRupees: rupeesOf(libraryAcquisitions.estPricePaise),
          totalRupees: rupeesOf(total),
          departmentId: libraryAcquisitions.departmentId,
          departmentName: departments.name,
          budgetId: libraryAcquisitions.budgetId,
          budgetYear: libraryBudgets.fiscalYear,
          suggestedByName: sql<string>`coalesce(nullif(${libraryAcquisitions.suggestedByName}, ''), ${suggester.fullName})`,
          reason: libraryAcquisitions.reason,
          status: libraryAcquisitions.status,
          decisionNote: libraryAcquisitions.decisionNote,
          vendor: libraryAcquisitions.vendor,
          orderNo: libraryAcquisitions.orderNo,
          orderedOn: libraryAcquisitions.orderedOn,
          receivedQty: libraryAcquisitions.receivedQty,
          receivedOn: libraryAcquisitions.receivedOn,
          invoiceNo: libraryAcquisitions.invoiceNo,
          invoiceDate: libraryAcquisitions.invoiceDate,
          invoiceRupees: rupeesOf(libraryAcquisitions.invoiceAmountPaise),
          bookId: libraryAcquisitions.bookId,
          createdAt: libraryAcquisitions.createdAt,
        },
        joins: (q) => q.leftJoin(departments, eq(departments.id, libraryAcquisitions.departmentId)).leftJoin(libraryBudgets, eq(libraryBudgets.id, libraryAcquisitions.budgetId)).leftJoin(suggester, eq(suggester.id, libraryAcquisitions.suggestedBy)),
        search: [libraryAcquisitions.number, libraryAcquisitions.title, libraryAcquisitions.author, libraryAcquisitions.isbn, libraryAcquisitions.vendor, libraryAcquisitions.orderNo],
        filters: {
          status: choiceFilter('Status', libraryAcquisitions.status, ACQ_STATUSES),
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(libraryAcquisitions.departmentId, v) },
          budget: { label: 'Budget', options: budgetOptions, where: (v) => uuidEq(libraryAcquisitions.budgetId, v) },
        },
        sorts: { number: sql`length(${libraryAcquisitions.number}), ${libraryAcquisitions.number}`, title: libraryAcquisitions.title, status: libraryAcquisitions.status, total, asked: libraryAcquisitions.createdAt, ordered: libraryAcquisitions.orderedOn },
        defaultSort: { id: 'asked', dir: 'desc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(300), column: libraryAcquisitions.title, required: true },
        author: { label: 'Author', type: 'text', schema: z.string().trim().max(200), column: libraryAcquisitions.author },
        isbn: { label: 'ISBN', type: 'text', schema: z.string().trim().max(20).refine((v) => !v || !!normaliseIsbn(v), 'This is not a valid ISBN (check the last digit)').transform((v) => (v ? normaliseIsbn(v)! : '')), column: libraryAcquisitions.isbn },
        publisher: { label: 'Publisher', type: 'text', schema: z.string().trim().max(200), column: libraryAcquisitions.publisher },
        edition: { label: 'Edition', type: 'text', schema: z.string().trim().max(60), column: libraryAcquisitions.edition },
        quantity: { label: 'Copies', type: 'number', schema: Int(1, 500), column: libraryAcquisitions.quantity, required: true },
        estPrice: { label: 'Price per copy (₹)', type: 'number', schema: Rupees, column: libraryAcquisitions.estPricePaise, rowKey: 'estRupees' },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, options: departmentOptions, column: libraryAcquisitions.departmentId, bulk: true },
        budgetId: { label: 'Budget', type: 'select', schema: OptionalRef, options: budgetOptions, column: libraryAcquisitions.budgetId, bulk: true },
        suggestedByName: { label: 'Suggested by', type: 'text', schema: z.string().trim().max(120), column: libraryAcquisitions.suggestedByName, help: 'Leave empty for yourself' },
        reason: { label: 'Why', type: 'textarea', schema: z.string().trim().max(500), column: libraryAcquisitions.reason },
        vendor: { label: 'Vendor', type: 'text', schema: z.string().trim().max(120), column: libraryAcquisitions.vendor, bulk: true },
      },
      create: async (ctx, v) => {
        const [a] = await ctx.tx
          .insert(libraryAcquisitions)
          .values({
            tenantId: ctx.p.tenantId,
            number: await nextNumber(ctx.tx, ctx.p.tenantId, 'ACQ'),
            title: String(v.title),
            author: String(v.author ?? ''),
            isbn: String(v.isbn ?? ''),
            publisher: String(v.publisher ?? ''),
            edition: String(v.edition ?? ''),
            quantity: Number(v.quantity ?? 1),
            estPricePaise: Number(v.estPrice ?? 0),
            departmentId: (v.departmentId as string | null) ?? null,
            budgetId: (v.budgetId as string | null) ?? null,
            suggestedBy: ctx.p.userId,
            suggestedByName: String(v.suggestedByName ?? ''),
            reason: String(v.reason ?? ''),
            vendor: String(v.vendor ?? ''),
          })
          .returning({ id: libraryAcquisitions.id });
        return a.id;
      },
      columns: [
        { key: 'number', header: 'Number' },
        { key: 'title', header: 'Title' },
        { key: 'author', header: 'Author' },
        { key: 'isbn', header: 'ISBN' },
        { key: 'quantity', header: 'Copies' },
        { key: 'estRupees', header: 'Price per copy (₹)' },
        { key: 'totalRupees', header: 'Total (₹)' },
        { key: 'departmentName', header: 'Department' },
        { key: 'budgetYear', header: 'Budget year' },
        { key: 'suggestedByName', header: 'Suggested by' },
        { key: 'status', header: 'Status' },
        { key: 'vendor', header: 'Vendor' },
        { key: 'orderNo', header: 'Order no.' },
        { key: 'orderedOn', header: 'Ordered on' },
        { key: 'receivedQty', header: 'Received' },
        { key: 'invoiceNo', header: 'Invoice' },
        { key: 'invoiceRupees', header: 'Invoice amount (₹)' },
      ],
      remove: { guard: async (ctx, id) => (['received', 'invoiced'].includes((await ctx.tx.select({ s: libraryAcquisitions.status }).from(libraryAcquisitions).where(eq(libraryAcquisitions.id, id)))[0]?.s ?? '') ? 'Received books are in the accession register; cancel nothing here' : null) },
      actions: {
        approve: {
          label: 'Approve',
          roles: ['tenant_admin', 'principal', 'librarian'],
          apply: async (ctx, id) => {
            const [a] = await ctx.tx.select().from(libraryAcquisitions).where(eq(libraryAcquisitions.id, id));
            if (a.budgetId) {
              const [b] = await ctx.tx.select({ amount: libraryBudgets.amountPaise, committed: committedOf(libraryBudgets.id), spent: spentOf(libraryBudgets.id) }).from(libraryBudgets).where(eq(libraryBudgets.id, a.budgetId));
              const left = Number(b.amount) - Number(b.committed) - Number(b.spent);
              if (a.estPricePaise * a.quantity > left) throw new ConflictException(`The budget has ₹${(left / 100).toFixed(2)} left; this needs ₹${((a.estPricePaise * a.quantity) / 100).toFixed(2)}`);
            }
            await setStatus(ctx, id, ['suggested'], 'approved', { decidedBy: ctx.p.userId, decidedAt: this.clock.now() });
          },
        },
        reject: {
          label: 'Reject',
          tone: 'danger',
          params: z.object({ note: z.string().trim().max(300).optional() }).default({}),
          apply: async (ctx, id, raw) => void (await setStatus(ctx, id, ['suggested', 'approved'], 'rejected', { decidedBy: ctx.p.userId, decidedAt: this.clock.now(), decisionNote: (raw as { note?: string }).note ?? '' })),
        },
        order: {
          label: 'Order',
          params: z.object({ vendor: z.string().trim().min(2, 'Name the vendor').max(120), orderNo: z.string().trim().max(60).default(''), orderedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
          apply: async (ctx, id, raw) => {
            const p = raw as { vendor: string; orderNo: string; orderedOn?: string };
            await setStatus(ctx, id, ['approved'], 'ordered', { vendor: p.vendor, orderNo: p.orderNo, orderedOn: p.orderedOn ?? (await this.today(ctx)) }, { vendor: p.vendor });
          },
        },
        receive: {
          label: 'Receive copies',
          params: z.object({ quantity: z.coerce.number().int().min(1).max(500).optional(), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), price: Rupees.optional(), branchId: OptionalRef.optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const p = raw as { quantity?: number; receivedOn?: string; price?: number; branchId?: string | null };
            const [a] = await ctx.tx.select().from(libraryAcquisitions).where(eq(libraryAcquisitions.id, id)).for('update');
            if (a.status !== 'ordered') throw new ConflictException('Only an ordered request can be received');
            const qty = p.quantity ?? a.quantity - a.receivedQty;
            if (qty <= 0) throw new ConflictException('Every copy has been received');
            // The title goes into the catalogue (or the copies join the title already there).
            let bookId = a.bookId;
            if (!bookId && a.isbn) bookId = (await ctx.tx.select({ id: libraryBooks.id }).from(libraryBooks).where(eq(libraryBooks.isbn, a.isbn)).limit(1))[0]?.id ?? null;
            if (!bookId) bookId = (await ctx.tx.select({ id: libraryBooks.id }).from(libraryBooks).where(and(sql`lower(${libraryBooks.title}) = ${a.title.toLowerCase()}`, sql`lower(${libraryBooks.author}) = ${a.author.toLowerCase()}`)).limit(1))[0]?.id ?? null;
            const price = p.price ?? a.estPricePaise;
            if (!bookId) bookId = (await ctx.tx.insert(libraryBooks).values({ tenantId: ctx.p.tenantId, title: a.title, author: a.author, isbn: a.isbn || null, publisher: a.publisher, edition: a.edition, departmentId: a.departmentId, pricePaise: price, copies: 0 }).returning({ id: libraryBooks.id }))[0].id;
            const branchId = p.branchId ?? (await ctx.tx.select({ id: libraryBranches.id }).from(libraryBranches).orderBy(sql`${libraryBranches.isMain} desc`).limit(1))[0]?.id ?? null;
            const receivedOn = p.receivedOn ?? (await this.today(ctx));
            const made = await addCopies(ctx.tx, ctx.p.tenantId, bookId, qty, { branchId, pricePaise: price, source: 'purchase', acquiredOn: receivedOn, vendor: a.vendor, acquisitionId: a.id });
            const got = a.receivedQty + qty;
            await ctx.tx.update(libraryAcquisitions).set({ receivedQty: got, receivedOn, bookId, status: got >= a.quantity ? 'received' : 'ordered' }).where(eq(libraryAcquisitions.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_acquisition.received', 'library_acquisition', id, { quantity: qty, accession: made.map((c) => c.accessionNo), changes: { receivedQty: { before: a.receivedQty, after: got } } });
            return made.map((c) => c.accessionNo).join(', ');
          },
        },
        invoice: {
          label: 'Record the invoice',
          params: z.object({ invoiceNo: z.string().trim().min(1, 'Give the invoice number').max(60), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), amount: Rupees.refine((v) => v > 0, 'Give the amount') }),
          apply: async (ctx, id, raw) => {
            const p = raw as { invoiceNo: string; invoiceDate?: string; amount: number };
            await setStatus(ctx, id, ['received', 'ordered'], 'invoiced', { invoiceNo: p.invoiceNo, invoiceDate: p.invoiceDate ?? (await this.today(ctx)), invoiceAmountPaise: p.amount }, { invoiceNo: p.invoiceNo, amountPaise: p.amount });
          },
        },
        cancel: { label: 'Cancel', tone: 'danger', apply: async (ctx, id) => void (await setStatus(ctx, id, ['suggested', 'approved', 'ordered'], 'cancelled')) },
      },
    };
  }

  budgets(): RecordEntity {
    const committed = committedOf(libraryBudgets.id);
    const spent = spentOf(libraryBudgets.id);
    return {
      key: 'library-budgets',
      module: 'library',
      table: libraryBudgets,
      subjectType: 'library_budget',
      roles: { read: LIBRARY_ROLES, write: ['tenant_admin', 'principal', 'librarian'] },
      label: (r) => `${r.fiscalYear} ${r.departmentName ?? 'Library'} ${r.head}`,
      list: {
        select: {
          id: libraryBudgets.id,
          fiscalYear: libraryBudgets.fiscalYear,
          departmentId: libraryBudgets.departmentId,
          departmentName: departments.name,
          head: libraryBudgets.head,
          amountRupees: rupeesOf(libraryBudgets.amountPaise),
          committedRupees: rupeesOf(committed),
          spentRupees: rupeesOf(spent),
          balanceRupees: rupeesOf(sql`${libraryBudgets.amountPaise} - ${committed} - ${spent}`),
          note: libraryBudgets.note,
        },
        joins: (q) => q.leftJoin(departments, eq(departments.id, libraryBudgets.departmentId)),
        search: [libraryBudgets.fiscalYear, departments.name, libraryBudgets.note],
        filters: {
          head: choiceFilter('Head', libraryBudgets.head, HEADS),
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(libraryBudgets.departmentId, v) },
          year: { label: 'Year', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? eq(libraryBudgets.fiscalYear, v) : undefined) },
        },
        sorts: { year: libraryBudgets.fiscalYear, department: departments.name, amount: libraryBudgets.amountPaise, balance: sql`${libraryBudgets.amountPaise} - ${committed} - ${spent}` },
        defaultSort: { id: 'year', dir: 'desc' },
        tiebreak: [departments.name],
      },
      fields: {
        fiscalYear: { label: 'Financial year', type: 'text', schema: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), column: libraryBudgets.fiscalYear, required: true },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, options: departmentOptions, column: libraryBudgets.departmentId, help: 'Empty for the library’s own budget' },
        head: { label: 'Head', type: 'select', schema: oneOf(HEADS), options: HEADS, column: libraryBudgets.head, required: true },
        amount: { label: 'Amount (₹)', type: 'number', schema: Rupees, column: libraryBudgets.amountPaise, rowKey: 'amountRupees', required: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: libraryBudgets.note },
      },
      columns: [
        { key: 'fiscalYear', header: 'Year' },
        { key: 'departmentName', header: 'Department', value: (r) => (r.departmentName as string | null) ?? 'Library' },
        { key: 'head', header: 'Head' },
        { key: 'amountRupees', header: 'Budget (₹)' },
        { key: 'committedRupees', header: 'Committed (₹)' },
        { key: 'spentRupees', header: 'Spent (₹)' },
        { key: 'balanceRupees', header: 'Balance (₹)' },
      ],
    };
  }

  periodicals(): RecordEntity {
    const count = (s: string) => sql<number>`(select count(*)::int from library_periodical_issues i where i.periodical_id = ${qual(libraryPeriodicals.id)} and i.status = ${s})`;
    return {
      key: 'library-periodicals',
      module: 'library',
      table: libraryPeriodicals,
      subjectType: 'library_periodical',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.title),
      list: {
        select: {
          id: libraryPeriodicals.id,
          title: libraryPeriodicals.title,
          issn: libraryPeriodicals.issn,
          publisher: libraryPeriodicals.publisher,
          kind: libraryPeriodicals.kind,
          frequency: libraryPeriodicals.frequency,
          language: libraryPeriodicals.language,
          departmentId: libraryPeriodicals.departmentId,
          departmentName: departments.name,
          vendor: libraryPeriodicals.vendor,
          subscriptionFrom: libraryPeriodicals.subscriptionFrom,
          subscriptionTo: libraryPeriodicals.subscriptionTo,
          costRupees: rupeesOf(libraryPeriodicals.costPaise),
          budgetId: libraryPeriodicals.budgetId,
          status: libraryPeriodicals.status,
          expected: count('expected'),
          received: count('received'),
          missing: sql<number>`(select count(*)::int from library_periodical_issues i where i.periodical_id = ${qual(libraryPeriodicals.id)} and i.status in ('missing', 'claimed'))`,
        },
        joins: (q) => q.leftJoin(departments, eq(departments.id, libraryPeriodicals.departmentId)),
        search: [libraryPeriodicals.title, libraryPeriodicals.issn, libraryPeriodicals.publisher, libraryPeriodicals.vendor],
        filters: {
          kind: choiceFilter('Kind', libraryPeriodicals.kind, PERIODICAL_KINDS),
          frequency: choiceFilter('Frequency', libraryPeriodicals.frequency, FREQUENCIES),
          status: choiceFilter('Status', libraryPeriodicals.status, choices(['active', 'Subscribed'], ['cancelled', 'Cancelled'])),
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(libraryPeriodicals.departmentId, v) },
        },
        sorts: { title: libraryPeriodicals.title, kind: libraryPeriodicals.kind, until: libraryPeriodicals.subscriptionTo, cost: libraryPeriodicals.costPaise },
        defaultSort: { id: 'title', dir: 'asc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(300), column: libraryPeriodicals.title, required: true },
        issn: { label: 'ISSN', type: 'text', schema: z.string().trim().regex(/^(\d{4}-?\d{3}[\dXx])?$/, 'Use an ISSN like 0378-5955').max(9), column: libraryPeriodicals.issn },
        publisher: { label: 'Publisher', type: 'text', schema: z.string().trim().max(200), column: libraryPeriodicals.publisher },
        kind: { label: 'Kind', type: 'select', schema: oneOf(PERIODICAL_KINDS), options: PERIODICAL_KINDS, column: libraryPeriodicals.kind, required: true, bulk: true },
        frequency: { label: 'Frequency', type: 'select', schema: oneOf(FREQUENCIES), options: FREQUENCIES, column: libraryPeriodicals.frequency, required: true, bulk: true },
        language: { label: 'Language', type: 'text', schema: z.string().trim().max(40), column: libraryPeriodicals.language },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, options: departmentOptions, column: libraryPeriodicals.departmentId, bulk: true },
        vendor: { label: 'Vendor', type: 'text', schema: z.string().trim().max(120), column: libraryPeriodicals.vendor, bulk: true },
        subscriptionFrom: { label: 'Subscribed from', type: 'date', schema: DateText, column: libraryPeriodicals.subscriptionFrom },
        subscriptionTo: { label: 'Subscribed until', type: 'date', schema: DateText, column: libraryPeriodicals.subscriptionTo },
        cost: { label: 'Subscription cost (₹)', type: 'number', schema: Rupees, column: libraryPeriodicals.costPaise, rowKey: 'costRupees' },
        budgetId: { label: 'Budget', type: 'select', schema: OptionalRef, options: budgetOptions, column: libraryPeriodicals.budgetId },
        status: { label: 'Status', type: 'select', schema: z.enum(['active', 'cancelled']), options: choices(['active', 'Subscribed'], ['cancelled', 'Cancelled']), column: libraryPeriodicals.status, create: false, bulk: true },
      },
      duplicate: async (ctx, row) => ({ title: `${row.title} (copy)`.slice(0, 300) }),
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'issn', header: 'ISSN' },
        { key: 'kind', header: 'Kind' },
        { key: 'frequency', header: 'Frequency' },
        { key: 'publisher', header: 'Publisher' },
        { key: 'vendor', header: 'Vendor' },
        { key: 'subscriptionFrom', header: 'From' },
        { key: 'subscriptionTo', header: 'Until' },
        { key: 'costRupees', header: 'Cost (₹)' },
        { key: 'received', header: 'Issues received' },
        { key: 'expected', header: 'Issues expected' },
        { key: 'missing', header: 'Missing or claimed' },
      ],
      actions: {
        generateIssues: {
          label: 'Expect the issues',
          apply: async (ctx, id) => {
            const [p] = await ctx.tx.select().from(libraryPeriodicals).where(eq(libraryPeriodicals.id, id));
            if (!p.subscriptionFrom || !p.subscriptionTo) throw new BadRequestException('Give the subscription period first');
            const dates = expectedDates(p.subscriptionFrom, p.subscriptionTo, p.frequency);
            const made = await ctx.tx
              .insert(libraryPeriodicalIssues)
              .values(dates.map((d, i) => ({ tenantId: ctx.p.tenantId, periodicalId: id, label: `No. ${i + 1} (${d})`, expectedOn: d })))
              .onConflictDoNothing()
              .returning({ id: libraryPeriodicalIssues.id });
            await auditUser(ctx.tx, ctx.p, 'library_periodical.issues_expected', 'library_periodical', id, { issues: made.length });
            return `${made.length}`;
          },
        },
        renew: {
          label: 'Renew the subscription',
          params: z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-31'), cost: Rupees.optional() }),
          apply: async (ctx, id, raw) => {
            const p = raw as { until: string; cost?: number };
            const [x] = await ctx.tx.select().from(libraryPeriodicals).where(eq(libraryPeriodicals.id, id));
            if (x.subscriptionTo && p.until <= x.subscriptionTo) throw new BadRequestException('The new end date must be after the current one');
            const from = x.subscriptionTo ? new Date(Date.parse(`${x.subscriptionTo}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : await this.today(ctx);
            await ctx.tx.update(libraryPeriodicals).set({ subscriptionFrom: from, subscriptionTo: p.until, status: 'active', ...(p.cost !== undefined && { costPaise: p.cost }) }).where(eq(libraryPeriodicals.id, id));
            await auditUser(ctx.tx, ctx.p, 'library_periodical.renewed', 'library_periodical', id, { changes: { subscriptionTo: { before: x.subscriptionTo, after: p.until } } });
          },
        },
      },
    };
  }

  issues(): RecordEntity {
    const OVERDUE = sql`${libraryPeriodicalIssues.status} = 'expected' and ${libraryPeriodicalIssues.expectedOn} < (now() at time zone 'Asia/Kolkata')::date - 7`;
    const set = (to: string, from: string[], extra: (ctx: KitCtx, raw: unknown) => Promise<Record<string, unknown>> = async () => ({})) => async (ctx: KitCtx, id: string, raw: unknown) => {
      const [i] = await ctx.tx.select().from(libraryPeriodicalIssues).where(eq(libraryPeriodicalIssues.id, id));
      if (!from.includes(i.status)) throw new ConflictException(`This issue is ${i.status}`);
      await ctx.tx.update(libraryPeriodicalIssues).set({ status: to, ...(await extra(ctx, raw)) }).where(eq(libraryPeriodicalIssues.id, id));
      await auditUser(ctx.tx, ctx.p, `library_issue.${to}`, 'library_issue', id, { changes: { status: { before: i.status, after: to } } });
    };
    return {
      key: 'library-issues',
      module: 'library',
      table: libraryPeriodicalIssues,
      subjectType: 'library_issue',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.periodical} · ${r.label}`,
      list: {
        select: {
          id: libraryPeriodicalIssues.id,
          periodicalId: libraryPeriodicalIssues.periodicalId,
          periodical: libraryPeriodicals.title,
          vendor: libraryPeriodicals.vendor,
          label: libraryPeriodicalIssues.label,
          expectedOn: libraryPeriodicalIssues.expectedOn,
          receivedOn: libraryPeriodicalIssues.receivedOn,
          status: libraryPeriodicalIssues.status,
          claimedOn: libraryPeriodicalIssues.claimedOn,
          claimNote: libraryPeriodicalIssues.claimNote,
          note: libraryPeriodicalIssues.note,
          late: sql<boolean>`${OVERDUE}`,
        },
        joins: (q) => q.innerJoin(libraryPeriodicals, eq(libraryPeriodicals.id, libraryPeriodicalIssues.periodicalId)),
        search: [libraryPeriodicals.title, libraryPeriodicalIssues.label],
        filters: {
          periodical: { label: 'Periodical', options: periodicalOptions, where: (v) => uuidEq(libraryPeriodicalIssues.periodicalId, v) },
          status: choiceFilter('Status', libraryPeriodicalIssues.status, ISSUE_STATUSES),
          late: yesNo('Late', OVERDUE, sql`not (${OVERDUE})`, ['More than a week late', 'Not late']),
        },
        sorts: { expected: libraryPeriodicalIssues.expectedOn, received: libraryPeriodicalIssues.receivedOn, periodical: libraryPeriodicals.title, status: libraryPeriodicalIssues.status },
        defaultSort: { id: 'expected', dir: 'asc' },
        tiebreak: [libraryPeriodicals.title],
      },
      fields: {
        periodicalId: { label: 'Periodical', type: 'select', schema: z.uuid(), options: periodicalOptions, column: libraryPeriodicalIssues.periodicalId, required: true, edit: false },
        label: { label: 'Issue', type: 'text', schema: Text(80), column: libraryPeriodicalIssues.label, required: true, help: 'Volume and number, e.g. Vol. 12 No. 3' },
        expectedOn: { label: 'Expected on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: libraryPeriodicalIssues.expectedOn, required: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: libraryPeriodicalIssues.note },
      },
      columns: [
        { key: 'periodical', header: 'Periodical' },
        { key: 'label', header: 'Issue' },
        { key: 'expectedOn', header: 'Expected' },
        { key: 'receivedOn', header: 'Received' },
        { key: 'status', header: 'Status' },
        { key: 'claimedOn', header: 'Claimed on' },
        { key: 'claimNote', header: 'Claim' },
        { key: 'vendor', header: 'Vendor' },
      ],
      actions: {
        checkIn: { label: 'Check in', params: z.object({ receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({}), apply: set('received', ['expected', 'missing', 'claimed'], async (ctx, raw) => ({ receivedOn: (raw as { receivedOn?: string }).receivedOn ?? (await this.today(ctx)) })) },
        missing: { label: 'Mark missing', apply: set('missing', ['expected']) },
        claim: { label: 'Claim from the vendor', params: z.object({ note: z.string().trim().max(300).default('') }).default({ note: '' }), apply: set('claimed', ['expected', 'missing'], async (ctx, raw) => ({ claimedOn: await this.today(ctx), claimNote: (raw as { note: string }).note ?? '' })) },
        cancel: { label: 'Not published', apply: set('cancelled', ['expected', 'missing', 'claimed']) },
      },
    };
  }

  eresources(): RecordEntity {
    const opens = sql<number>`(select count(*)::int from library_eresource_access a where a.resource_id = ${qual(libraryEresources.id)})`;
    const readers = sql<number>`(select count(distinct a.user_id)::int from library_eresource_access a where a.resource_id = ${qual(libraryEresources.id)})`;
    const status = (to: 'active' | 'retired') => async (ctx: KitCtx, id: string) => {
      const [r] = await ctx.tx.select().from(libraryEresources).where(eq(libraryEresources.id, id));
      if (r.status === to) throw new ConflictException(`Already ${to}`);
      await ctx.tx.update(libraryEresources).set({ status: to }).where(eq(libraryEresources.id, id));
      await auditUser(ctx.tx, ctx.p, `library.eresource_${to === 'active' ? 'activated' : 'retired'}`, 'library_eresource', id, { changes: { status: { before: r.status, after: to } } });
    };
    void libraryEresourceAccess;
    return {
      key: 'library-eresources',
      module: 'library',
      table: libraryEresources,
      subjectType: 'library_eresource',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: libraryEresources.id, title: libraryEresources.title, kind: libraryEresources.kind, publisher: libraryEresources.publisher, url: libraryEresources.url, licenceUntil: libraryEresources.licenceUntil, seats: libraryEresources.seats, status: libraryEresources.status, opens, readers, createdAt: libraryEresources.createdAt },
        search: [libraryEresources.title, libraryEresources.publisher, libraryEresources.url],
        filters: { kind: choiceFilter('Kind', libraryEresources.kind, ER_KINDS), status: choiceFilter('Status', libraryEresources.status, choices(['active', 'Active'], ['retired', 'Retired'])) },
        sorts: { title: libraryEresources.title, licence: libraryEresources.licenceUntil, opens, readers },
        defaultSort: { id: 'title', dir: 'asc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(240), column: libraryEresources.title, required: true },
        kind: { label: 'Kind', type: 'select', schema: oneOf(ER_KINDS), options: ER_KINDS, column: libraryEresources.kind, required: true, bulk: true },
        publisher: { label: 'Publisher or platform', type: 'text', schema: z.string().trim().max(160), column: libraryEresources.publisher, help: 'N-LIST, DELNET, the publisher…' },
        url: { label: 'Link', type: 'text', schema: Url, column: libraryEresources.url, required: true },
        licenceUntil: { label: 'Licence until', type: 'date', schema: DateText, column: libraryEresources.licenceUntil, bulk: true },
        seats: { label: 'Seats at a time', type: 'number', schema: OptionalInt(1, 10000), column: libraryEresources.seats },
      },
      create: async (ctx, v) => (await ctx.tx.insert(libraryEresources).values({ tenantId: ctx.p.tenantId, title: String(v.title), kind: String(v.kind ?? 'ebook'), publisher: String(v.publisher ?? ''), url: String(v.url), licenceUntil: (v.licenceUntil as string | null) ?? null, seats: (v.seats as number | null) ?? null, createdBy: ctx.p.userId }).returning({ id: libraryEresources.id }))[0].id,
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'kind', header: 'Kind' },
        { key: 'publisher', header: 'Publisher' },
        { key: 'url', header: 'Link' },
        { key: 'licenceUntil', header: 'Licence until' },
        { key: 'seats', header: 'Seats' },
        { key: 'status', header: 'Status' },
        { key: 'opens', header: 'Times opened' },
        { key: 'readers', header: 'Readers' },
      ],
      actions: { retire: { label: 'Retire', apply: status('retired') }, activate: { label: 'Make active', apply: status('active') } },
    };
  }

  repository(): RecordEntity {
    const status = (to: 'published' | 'withdrawn') => async (ctx: KitCtx, id: string) => {
      const [r] = await ctx.tx.select().from(libraryRepository).where(eq(libraryRepository.id, id));
      if (r.status === to) throw new ConflictException(`Already ${to}`);
      await ctx.tx.update(libraryRepository).set({ status: to }).where(eq(libraryRepository.id, id));
      await auditUser(ctx.tx, ctx.p, `library_repository.${to}`, 'library_repository', id, { changes: { status: { before: r.status, after: to } } });
    };
    return {
      key: 'library-repository',
      module: 'library',
      table: libraryRepository,
      subjectType: 'library_repository',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: libraryRepository.id, title: libraryRepository.title, authors: libraryRepository.authors, kind: libraryRepository.kind, departmentId: libraryRepository.departmentId, departmentName: departments.name, year: libraryRepository.year, abstract: libraryRepository.abstract, keywords: libraryRepository.keywords, url: libraryRepository.url, access: libraryRepository.access, status: libraryRepository.status, views: libraryRepository.views, createdAt: libraryRepository.createdAt },
        joins: (q) => q.leftJoin(departments, eq(departments.id, libraryRepository.departmentId)),
        search: [libraryRepository.title, libraryRepository.authors, libraryRepository.keywords, libraryRepository.abstract],
        filters: {
          kind: choiceFilter('Kind', libraryRepository.kind, REPO_KINDS),
          access: choiceFilter('Access', libraryRepository.access, ACCESS),
          status: choiceFilter('Status', libraryRepository.status, REPO_STATUSES),
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(libraryRepository.departmentId, v) },
        },
        sorts: { title: libraryRepository.title, year: libraryRepository.year, views: libraryRepository.views, added: libraryRepository.createdAt },
        defaultSort: { id: 'added', dir: 'desc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(400), column: libraryRepository.title, required: true },
        authors: { label: 'Authors', type: 'text', schema: z.string().trim().max(400), column: libraryRepository.authors },
        kind: { label: 'Kind', type: 'select', schema: oneOf(REPO_KINDS), options: REPO_KINDS, column: libraryRepository.kind, required: true, bulk: true },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, options: departmentOptions, column: libraryRepository.departmentId, bulk: true },
        year: { label: 'Year', type: 'number', schema: OptionalInt(1900, 2100), column: libraryRepository.year },
        abstract: { label: 'Abstract', type: 'textarea', schema: z.string().trim().max(5000), column: libraryRepository.abstract },
        keywords: { label: 'Keywords', type: 'text', schema: z.string().trim().max(500), column: libraryRepository.keywords },
        url: { label: 'Link to the full text', type: 'text', schema: Url, column: libraryRepository.url, required: true },
        access: { label: 'Who can read it', type: 'select', schema: oneOf(ACCESS), options: ACCESS, column: libraryRepository.access, required: true, bulk: true },
      },
      create: async (ctx, v) => (await ctx.tx.insert(libraryRepository).values({ tenantId: ctx.p.tenantId, title: String(v.title), authors: String(v.authors ?? ''), kind: String(v.kind ?? 'paper'), departmentId: (v.departmentId as string | null) ?? null, year: (v.year as number | null) ?? null, abstract: String(v.abstract ?? ''), keywords: String(v.keywords ?? ''), url: String(v.url), access: String(v.access ?? 'campus'), createdBy: ctx.p.userId }).returning({ id: libraryRepository.id }))[0].id,
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'authors', header: 'Authors' },
        { key: 'kind', header: 'Kind' },
        { key: 'departmentName', header: 'Department' },
        { key: 'year', header: 'Year' },
        { key: 'access', header: 'Access' },
        { key: 'status', header: 'Status' },
        { key: 'views', header: 'Views' },
        { key: 'url', header: 'Link' },
      ],
      actions: { publish: { label: 'Publish', apply: status('published') }, withdraw: { label: 'Withdraw', tone: 'danger', apply: status('withdrawn') } },
    };
  }

  ill(): RecordEntity {
    const move = (to: string, from: string[]) => async (ctx: KitCtx, id: string) => {
      const [r] = await ctx.tx.select().from(libraryIll).where(eq(libraryIll.id, id));
      if (!from.includes(r.status)) throw new ConflictException(`This request is ${r.status.replace('_', ' ')}`);
      await ctx.tx.update(libraryIll).set({ status: to }).where(eq(libraryIll.id, id));
      await auditUser(ctx.tx, ctx.p, `library_ill.${to}`, 'library_ill', id, { changes: { status: { before: r.status, after: to } } });
    };
    return {
      key: 'library-ill',
      module: 'library',
      table: libraryIll,
      subjectType: 'library_ill',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => `${r.title} · ${r.partner}`,
      list: {
        select: {
          id: libraryIll.id,
          direction: libraryIll.direction,
          network: libraryIll.network,
          partner: libraryIll.partner,
          title: libraryIll.title,
          author: libraryIll.author,
          isbn: libraryIll.isbn,
          memberId: libraryIll.memberId,
          cardNo: illMember.cardNo,
          memberName: illMember.fullName,
          requestedOn: libraryIll.requestedOn,
          dueOn: libraryIll.dueOn,
          status: libraryIll.status,
          chargeRupees: rupeesOf(libraryIll.chargePaise),
          note: libraryIll.note,
          overdue: sql<boolean>`${libraryIll.status} = 'in_hand' and ${libraryIll.dueOn} < (now() at time zone 'Asia/Kolkata')::date`,
        },
        joins: (q) => q.leftJoin(illMember, eq(illMember.id, libraryIll.memberId)),
        search: [libraryIll.title, libraryIll.partner, libraryIll.isbn, illMember.fullName, illMember.cardNo],
        filters: { direction: choiceFilter('Direction', libraryIll.direction, DIRECTIONS), network: choiceFilter('Network', libraryIll.network, NETWORKS), status: choiceFilter('Status', libraryIll.status, ILL_STATUSES) },
        sorts: { requested: libraryIll.requestedOn, due: libraryIll.dueOn, title: libraryIll.title, partner: libraryIll.partner },
        defaultSort: { id: 'requested', dir: 'desc' },
      },
      fields: {
        direction: { label: 'Direction', type: 'select', schema: oneOf(DIRECTIONS), options: DIRECTIONS, column: libraryIll.direction, required: true },
        network: { label: 'Through', type: 'select', schema: oneOf(NETWORKS), options: NETWORKS, column: libraryIll.network, required: true, bulk: true },
        partner: { label: 'Partner library', type: 'text', schema: Text(200), column: libraryIll.partner, required: true },
        title: { label: 'Title', type: 'text', schema: Text(300), column: libraryIll.title, required: true },
        author: { label: 'Author', type: 'text', schema: z.string().trim().max(200), column: libraryIll.author },
        isbn: { label: 'ISBN', type: 'text', schema: z.string().trim().max(20), column: libraryIll.isbn },
        memberCode: {
          label: 'For member (card or roll no.)',
          type: 'text',
          schema: z.string().trim().max(60),
          rowKey: 'cardNo',
          apply: async (ctx, id, value) => {
            const member = value ? await findMember(ctx.tx, ctx.p.tenantId, String(value)) : null;
            await ctx.tx.update(libraryIll).set({ memberId: member?.id ?? null }).where(eq(libraryIll.id, id));
          },
        },
        requestedOn: { label: 'Requested on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: libraryIll.requestedOn, required: true },
        dueOn: { label: 'Due back on', type: 'date', schema: DateText, column: libraryIll.dueOn },
        charge: { label: 'Charge (₹)', type: 'number', schema: Rupees, column: libraryIll.chargePaise, rowKey: 'chargeRupees' },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: libraryIll.note },
      },
      columns: [
        { key: 'direction', header: 'Direction' },
        { key: 'network', header: 'Through' },
        { key: 'partner', header: 'Partner library' },
        { key: 'title', header: 'Title' },
        { key: 'memberName', header: 'Member' },
        { key: 'requestedOn', header: 'Requested' },
        { key: 'dueOn', header: 'Due back' },
        { key: 'status', header: 'Status' },
        { key: 'chargeRupees', header: 'Charge (₹)' },
      ],
      actions: { inHand: { label: 'Received or sent', apply: move('in_hand', ['requested']) }, returned: { label: 'Returned', apply: move('returned', ['in_hand']) }, cancel: { label: 'Cancel', tone: 'danger', apply: move('cancelled', ['requested']) } },
    };
  }

  gate(): RecordEntity {
    const name = sql<string>`coalesce(${gateMember.fullName}, ${libraryGateLog.visitorName})`;
    return {
      key: 'library-gate',
      module: 'library',
      table: libraryGateLog,
      subjectType: 'library_gate',
      roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: libraryGateLog.id, inAt: libraryGateLog.inAt, outAt: libraryGateLog.outAt, memberId: libraryGateLog.memberId, cardNo: gateMember.cardNo, name, kind: sql<string>`case when ${libraryGateLog.memberId} is null then 'visitor' else coalesce(${gateMember.kind}, 'student') end`, visitorName: libraryGateLog.visitorName, purpose: libraryGateLog.purpose, branchId: libraryGateLog.branchId, branchName: libraryBranches.name, minutes: sql<number | null>`(extract(epoch from (${libraryGateLog.outAt} - ${libraryGateLog.inAt})) / 60)::int` },
        joins: (q) => q.leftJoin(gateMember, eq(gateMember.id, libraryGateLog.memberId)).leftJoin(libraryBranches, eq(libraryBranches.id, libraryGateLog.branchId)),
        search: [gateMember.fullName, gateMember.cardNo, libraryGateLog.visitorName],
        filters: {
          purpose: choiceFilter('Purpose', libraryGateLog.purpose, PURPOSES),
          inside: yesNo('Inside now', isNull(libraryGateLog.outAt), sql`${libraryGateLog.outAt} is not null`, ['Inside now', 'Left']),
          when: { label: 'When', options: choices(['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']), where: (v) => (v === 'today' ? sql`(${libraryGateLog.inAt} at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date` : v === 'week' ? sql`${libraryGateLog.inAt} > now() - interval '7 days'` : v === 'month' ? sql`${libraryGateLog.inAt} > now() - interval '30 days'` : undefined) },
          branch: { label: 'Branch', options: branchOptions, where: (v) => uuidEq(libraryGateLog.branchId, v) },
        },
        sorts: { in: libraryGateLog.inAt, out: libraryGateLog.outAt, name },
        defaultSort: { id: 'in', dir: 'desc' },
      },
      fields: {
        memberCode: { label: 'Member (card or roll no.)', type: 'text', schema: z.string().trim().max(60), edit: false, rowKey: 'cardNo', apply: async () => undefined },
        visitorName: { label: 'Or visitor’s name', type: 'text', schema: z.string().trim().max(120), column: libraryGateLog.visitorName },
        purpose: { label: 'Purpose', type: 'select', schema: oneOf(PURPOSES), options: PURPOSES, column: libraryGateLog.purpose, required: true, bulk: true },
        branchId: { label: 'Branch', type: 'select', schema: OptionalRef, options: branchOptions, column: libraryGateLog.branchId },
      },
      create: async (ctx, v) => {
        const member = v.memberCode ? await findMember(ctx.tx, ctx.p.tenantId, String(v.memberCode)) : null;
        if (!member && !String(v.visitorName ?? '').trim()) throw new BadRequestException('Give a card number or the visitor’s name');
        if (member) {
          const [open] = await ctx.tx.select({ id: libraryGateLog.id }).from(libraryGateLog).where(and(eq(libraryGateLog.memberId, member.id), isNull(libraryGateLog.outAt)));
          if (open) throw new ConflictException(`${member.fullName} is already inside`);
        }
        const [g] = await ctx.tx.insert(libraryGateLog).values({ tenantId: ctx.p.tenantId, memberId: member?.id ?? null, visitorName: member ? '' : String(v.visitorName), purpose: String(v.purpose ?? 'reading'), branchId: (v.branchId as string | null) ?? null, inAt: this.clock.now(), recordedBy: ctx.p.userId }).returning({ id: libraryGateLog.id });
        return g.id;
      },
      columns: [
        { key: 'inAt', header: 'In' },
        { key: 'outAt', header: 'Out' },
        { key: 'name', header: 'Name' },
        { key: 'cardNo', header: 'Card' },
        { key: 'kind', header: 'Kind' },
        { key: 'purpose', header: 'Purpose' },
        { key: 'branchName', header: 'Branch' },
        { key: 'minutes', header: 'Minutes' },
      ],
      actions: {
        signOut: {
          label: 'Sign out',
          apply: async (ctx, id) => {
            const [g] = await ctx.tx.select().from(libraryGateLog).where(eq(libraryGateLog.id, id));
            if (g.outAt) throw new ConflictException('Already signed out');
            await ctx.tx.update(libraryGateLog).set({ outAt: this.clock.now() }).where(eq(libraryGateLog.id, id));
          },
        },
      },
    };
  }
}
