import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { balanceSheet, fyEnd, fyStart, incomeExpenditure, isFy, naturalBalance, trialBalance, type GroupType } from '../books/books.logic.js';
import { ensureChart, movements, voucherLines } from '../books/books.service.js';
import { Day } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { budgetReportRows } from '../finance/finance.controller.js';
import { ageBucket, eligible80G, fyOf, gstSplit, headOf } from './fee-accounts.logic.js';
import { ensureInvoiceNumbers, historyOf, settingsOf } from './fee-accounts.service.js';

type Row = Record<string, unknown>;
const PG_TS = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(:?\d{2})?$/;
/** Timestamps as ISO strings and dates as YYYY-MM-DD, whatever the driver returned. */
const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' && PG_TS.test(v) ? v.replace(PG_TS, (_, d, t, h, m) => `${d}T${t}${h}:${(m ?? '00').replace(':', '')}`) : v);
const rowsOf = async (tx: Tx, q: SQL) => ((await tx.execute(q)).rows as Row[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)])));
const num = (r: Row[], ...keys: string[]): Row[] => r.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, keys.includes(k) ? Number(v ?? 0) : v])));
const sum = (r: Row[], key: string) => r.reduce((a, x) => a + Number(x[key] ?? 0), 0);

export const ENTITIES = ['structures', 'accounts', 'invoices', 'receipts', 'concessions', 'refunds', 'write-offs', 'vouchers', 'voucher-requests', 'ledgers', 'budgets', 'cheques', 'closings'] as const;
export const REPORTS = ['daily-collection', 'head-collection', 'outstanding', 'concessions', 'refunds', 'cheques', 'student-ledger', 'cash-book', 'bank-book', 'day-book', 'trial-balance', 'income-expenditure', 'balance-sheet', 'budget-vs-actual', 'gst', '80g'] as const;

/** Lists, single records (with their audit history) and reports for the fees and accounts desk. Read only. */
@Controller('v1/fee-accounts')
export class FeeAccountsReadsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** What is waiting for someone on the desk, with counts for the badges. */
  @Get('inbox')
  @Auth('user', FEE_ROLES)
  inbox(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const items = num(
        await rowsOf(
          tx,
          sql`select * from (
            select 'structures' as entity, id, name as number, name as title, (select coalesce(sum((i->>'amountPaise')::bigint), 0) from jsonb_array_elements(items) i) as amount, submitted_by as by, submitted_at as at, 'decide' as step from fee_structures where status = 'pending'
            union all select 'structures', id, name, name, (select coalesce(sum((i->>'amountPaise')::bigint), 0) from jsonb_array_elements(items) i), decided_by, decided_at, 'publish' from fee_structures where status = 'approved'
            union all select 'concessions', c.id, c.number, s.full_name, c.amount_paise, c.requested_by, c.created_at, 'decide' from fee_concessions c join students s on s.id = c.student_id where c.status = 'pending'
            union all select 'refunds', r.id, r.number, s.full_name, r.amount_paise, r.requested_by, r.created_at, case when r.status = 'requested' then 'decide' else 'pay' end from fee_refund_requests r join students s on s.id = r.student_id where r.status in ('requested', 'approved')
            union all select 'write-offs', w.id, w.number, s.full_name, w.amount_paise, w.requested_by, w.created_at, 'decide' from fee_write_offs w join students s on s.id = w.student_id where w.status = 'pending'
            union all select 'voucher-requests', id, number, narration, amount_paise, requested_by, created_at, 'decide' from acct_voucher_requests where status = 'pending'
            union all select 'closings', c.id, c.closing_date::text, u.full_name, c.counted_paise, c.cashier_id, c.created_at, 'verify' from fee_cash_closings c join users u on u.id = c.cashier_id where c.status = 'submitted'
            union all select 'cheques', q.id, q.cheque_no, s.full_name, q.amount_paise, q.created_by, q.created_at, case when q.status = 'received' then 'deposit' else 'clear' end from fee_cheques q join students s on s.id = q.student_id where q.status in ('received', 'deposited')
          ) x order by at desc nulls last limit 200`,
        ),
        'amount',
      ).map((r): Row => ({ ...r, mine: r.by === p.userId }));
      const counts: Record<string, number> = {};
      for (const i of items) counts[String(i.entity)] = (counts[String(i.entity)] ?? 0) + 1;
      const [k] = await rowsOf(
        tx,
        sql`select (select coalesce(sum(amount_paise), 0) from fee_payments where status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date = ${await this.today(tx)}::date)::bigint as "todayPaise",
          (select coalesce(sum(amount_paise - paid_paise), 0) from fee_invoices where status = 'due')::bigint as "duePaise",
          (select coalesce(sum(amount_paise - paid_paise), 0) from fee_invoices where status = 'due' and due_on < ${await this.today(tx)}::date)::bigint as "overduePaise",
          (select count(distinct student_id) from fee_invoices where status = 'due' and due_on < ${await this.today(tx)}::date)::int as "defaulters"`,
      );
      return { items, counts, kpis: { todayPaise: Number(k.todayPaise), duePaise: Number(k.duePaise), overduePaise: Number(k.overduePaise), defaulters: Number(k.defaulters) } };
    });
  }

  @Get('list/:entity')
  @Auth('user', FEE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Param('entity') entity: string, @Query('status') status?: string, @Query('fy') fy?: string) {
    if (!(ENTITIES as readonly string[]).includes(entity)) throw new NotFoundException('No such list');
    const st = status && /^[a-z_]{2,20}$/.test(status) ? status : null;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const where = (col: string) => (st ? sql`${sql.raw(col)} = ${st}` : sql`true`);
      switch (entity) {
        case 'structures':
          return num(await rowsOf(tx, sql`select f.id, f.name, f.academic_year as "academicYear", f.status, pr.name as program, jsonb_array_length(f.items) as heads, (select coalesce(sum((i->>'amountPaise')::bigint), 0) from jsonb_array_elements(f.items) i) as "totalPaise", f.due_in_days as "dueInDays", f.created_at as "createdAt" from fee_structures f left join programs pr on pr.id = f.program_id where ${where('f.status')} order by f.created_at desc`), 'totalPaise');
        case 'accounts':
          return num(
            await rowsOf(
              tx,
              sql`select s.id, s.full_name as student, s.roll_no as "rollNo", sec.display_name as section, coalesce(sum(i.amount_paise), 0) as "invoicedPaise", coalesce(sum(i.paid_paise), 0) as "paidPaise",
                coalesce(sum(i.amount_paise - i.paid_paise) filter (where i.status = 'due'), 0) as "balancePaise", min(i.due_on) filter (where i.status = 'due') as "oldestDue",
                (select coalesce(sum(applied_paise), 0) from fee_concessions c where c.student_id = s.id and c.status = 'approved') as "concessionPaise"
              from students s join sections sec on sec.id = s.section_id left join fee_invoices i on i.student_id = s.id and i.status <> 'cancelled'
              where s.status = 'active' group by s.id, sec.display_name ${st === 'due' ? sql`having coalesce(sum(i.amount_paise - i.paid_paise) filter (where i.status = 'due'), 0) > 0` : sql``} order by s.full_name limit 5000`,
            ),
            'invoicedPaise',
            'paidPaise',
            'balancePaise',
            'concessionPaise',
          );
        case 'invoices':
          await ensureInvoiceNumbers(tx, p.tenantId);
          return num(await rowsOf(tx, sql`select i.id, i.invoice_no as "invoiceNo", i.title, s.full_name as student, sec.display_name as section, i.amount_paise as "amountPaise", i.paid_paise as "paidPaise", (i.amount_paise - i.paid_paise) as "balancePaise", i.due_on::text as "dueOn", i.status from fee_invoices i join students s on s.id = i.student_id join sections sec on sec.id = i.section_id where ${where('i.status')} order by i.created_at desc limit 5000`), 'amountPaise', 'paidPaise', 'balancePaise');
        case 'receipts':
          return num(await rowsOf(tx, sql`select p.id, p.receipt_no as "receiptNo", s.full_name as student, i.title, p.amount_paise as "amountPaise", p.method, p.status, p.paid_at as "paidAt", u.full_name as cashier from fee_payments p join students s on s.id = p.student_id join fee_invoices i on i.id = p.invoice_id left join users u on u.id = p.recorded_by where p.receipt_no is not null and ${where('p.status')} order by p.paid_at desc nulls last limit 5000`), 'amountPaise');
        case 'concessions':
          return num(await rowsOf(tx, sql`select c.id, c.number, s.full_name as student, c.kind, c.sponsor_name as "sponsorName", c.percent, c.amount_paise as "amountPaise", c.applied_paise as "appliedPaise", c.status, c.reason, c.created_at as "createdAt" from fee_concessions c join students s on s.id = c.student_id where ${where('c.status')} order by c.created_at desc`), 'amountPaise', 'appliedPaise');
        case 'refunds':
          return num(await rowsOf(tx, sql`select r.id, r.number, s.full_name as student, p.receipt_no as "receiptNo", r.amount_paise as "amountPaise", r.status, r.reason, r.pay_mode as "payMode", r.created_at as "createdAt" from fee_refund_requests r join students s on s.id = r.student_id join fee_payments p on p.id = r.payment_id where ${where('r.status')} order by r.created_at desc`), 'amountPaise');
        case 'write-offs':
          return num(await rowsOf(tx, sql`select w.id, w.number, s.full_name as student, i.title, w.amount_paise as "amountPaise", w.status, w.reason, w.created_at as "createdAt" from fee_write_offs w join students s on s.id = w.student_id join fee_invoices i on i.id = w.invoice_id where ${where('w.status')} order by w.created_at desc`), 'amountPaise');
        case 'voucher-requests':
          return num(await rowsOf(tx, sql`select v.id, v.number, v.voucher_type as "voucherType", v.voucher_date::text as date, v.narration, v.amount_paise as "amountPaise", v.status, u.full_name as "requestedBy" from acct_voucher_requests v left join users u on u.id = v.requested_by where ${where('v.status')} order by v.created_at desc`), 'amountPaise');
        case 'vouchers':
          return num(await rowsOf(tx, sql`select v.id, v.number, v.voucher_type as "voucherType", v.voucher_date::text as date, v.narration, v.source_type as "sourceType", (select coalesce(sum(debit_paise), 0) from acct_voucher_lines l where l.voucher_id = v.id) as "amountPaise", case when v.voided_at is null then 'posted' else 'voided' end as status from acct_vouchers v ${fy && isFy(fy) ? sql`where v.financial_year = ${fy}` : sql``} order by v.voucher_date desc, v.created_at desc limit 5000`), 'amountPaise');
        case 'ledgers': {
          await ensureChart(tx, p.tenantId);
          return (await movements(tx, {})).map((m) => ({ id: m.accountId, code: m.code, name: m.name, groupType: m.groupType, debitPaise: m.debitPaise, creditPaise: m.creditPaise, balancePaise: naturalBalance(m.groupType, m.openingPaise + m.debitPaise, m.creditPaise) }));
        }
        case 'budgets': {
          const year = fy && isFy(fy) ? fy : fyOf(await this.today(tx));
          const ids = new Map((await rowsOf(tx, sql`select id, department_id from budgets where fiscal_year = ${year}`)).map((r) => [String(r.department_id), String(r.id)]));
          const rep = await budgetReportRows(tx, year);
          return rep.rows.filter((r) => ids.has(r.departmentId)).map((r) => ({ ...r, id: ids.get(r.departmentId), fiscalYear: year }));
        }
        case 'cheques':
          return num(await rowsOf(tx, sql`select q.id, q.cheque_no as "chequeNo", q.bank_name as "bankName", q.cheque_date::text as "chequeDate", s.full_name as student, p.receipt_no as "receiptNo", q.amount_paise as "amountPaise", q.status, q.bounce_reason as "bounceReason" from fee_cheques q join students s on s.id = q.student_id join fee_payments p on p.id = q.payment_id where ${where('q.status')} order by q.cheque_date desc`), 'amountPaise');
        case 'closings':
          return num(await rowsOf(tx, sql`select c.id, c.closing_date::text as date, u.full_name as cashier, c.system_paise as "systemPaise", c.counted_paise as "countedPaise", (c.counted_paise - c.system_paise) as "variancePaise", c.receipt_count as receipts, c.status from fee_cash_closings c join users u on u.id = c.cashier_id where ${where('c.status')} order by c.closing_date desc`), 'systemPaise', 'countedPaise', 'variancePaise');
      }
      return [];
    });
  }

  @Get('records/:entity/:id')
  @Auth('user', FEE_ROLES)
  record(@CurrentPrincipal() p: UserPrincipal, @Param('entity') entity: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const one = async (q: SQL) => {
        const [r] = await rowsOf(tx, q);
        if (!r) throw new NotFoundException('Record not found');
        return r;
      };
      const history = (type: string) => historyOf(tx, type, id);
      switch (entity) {
        case 'structures': {
          const r = await one(sql`select f.*, pr.name as program, c.name as campus, sb.full_name as "submittedByName", db.full_name as "decidedByName" from fee_structures f left join programs pr on pr.id = f.program_id left join campuses c on c.id = f.campus_id left join users sb on sb.id = f.submitted_by left join users db on db.id = f.decided_by where f.id = ${id}::uuid`);
          return { record: r, history: await history('fee_structure') };
        }
        case 'accounts': {
          await ensureInvoiceNumbers(tx, p.tenantId);
          const r = await one(sql`select s.id, s.full_name as student, s.roll_no as "rollNo", s.status, sec.display_name as section from students s join sections sec on sec.id = s.section_id where s.id = ${id}::uuid`);
          const invoices = num(await rowsOf(tx, sql`select id, invoice_no as "invoiceNo", title, amount_paise as "amountPaise", paid_paise as "paidPaise", (amount_paise - paid_paise) as "balancePaise", due_on::text as "dueOn", status from fee_invoices where student_id = ${id}::uuid order by due_on`), 'amountPaise', 'paidPaise', 'balancePaise');
          const receipts = num(await rowsOf(tx, sql`select id, receipt_no as "receiptNo", amount_paise as "amountPaise", method, status, paid_at as "paidAt" from fee_payments where student_id = ${id}::uuid and receipt_no is not null order by paid_at desc`), 'amountPaise');
          const concessions = num(await rowsOf(tx, sql`select id, number, kind, amount_paise as "amountPaise", applied_paise as "appliedPaise", status, created_at as "createdAt" from fee_concessions where student_id = ${id}::uuid order by created_at desc`), 'amountPaise', 'appliedPaise');
          const refunds = num(await rowsOf(tx, sql`select id, number, amount_paise as "amountPaise", status, created_at as "createdAt" from fee_refund_requests where student_id = ${id}::uuid order by created_at desc`), 'amountPaise');
          const ledger = await this.studentLedger(tx, id);
          const credit = num(await rowsOf(tx, sql`select coalesce(sum(amount_paise), 0) as "creditPaise" from student_credits where student_id = ${id}::uuid`), 'creditPaise')[0];
          return { record: { ...r, ...credit, invoicedPaise: sum(invoices, 'amountPaise'), paidPaise: sum(invoices, 'paidPaise'), balancePaise: sum(invoices.filter((i) => i.status === 'due'), 'balancePaise') }, invoices, receipts, concessions, refunds, ledger, history: await history('student') };
        }
        case 'invoices': {
          await ensureInvoiceNumbers(tx, p.tenantId);
          const r = await one(sql`select i.*, (i.amount_paise - i.paid_paise) as "balancePaise", s.full_name as student, s.id as "studentId", sec.display_name as section, u.full_name as "createdByName" from fee_invoices i join students s on s.id = i.student_id join sections sec on sec.id = i.section_id left join users u on u.id = i.created_by where i.id = ${id}::uuid`);
          const payments = num(await rowsOf(tx, sql`select id, receipt_no as "receiptNo", amount_paise as "amountPaise", method, status, paid_at as "paidAt" from fee_payments where invoice_id = ${id}::uuid order by created_at desc`), 'amountPaise');
          const instalments = num(await rowsOf(tx, sql`select id, seq, due_on::text as "dueOn", amount_paise as "amountPaise" from fee_instalments where invoice_id = ${id}::uuid order by seq`), 'amountPaise');
          const lateFees = num(await rowsOf(tx, sql`select id, days_late as "daysLate", applied_paise as "appliedPaise", waived_paise as "waivedPaise", waive_reason as "waiveReason" from fee_late_fees where invoice_id = ${id}::uuid`), 'appliedPaise', 'waivedPaise');
          const adjustments = num(await rowsOf(tx, sql`select id, number, 'concession' as kind, amount_paise as "amountPaise", status, created_at as "createdAt" from fee_concessions where invoice_id = ${id}::uuid union all select id, number, 'write_off', amount_paise, status, created_at from fee_write_offs where invoice_id = ${id}::uuid order by "createdAt" desc`), 'amountPaise');
          return { record: num([r], 'amount_paise', 'paid_paise', 'balancePaise')[0], payments, instalments, lateFees, adjustments, history: await history('fee_invoice') };
        }
        case 'receipts': {
          const r = await one(sql`select p.*, s.full_name as student, s.id as "studentId", i.title, i.invoice_no as "invoiceNo", u.full_name as cashier, q.id as "chequeId", q.status as "chequeStatus" from fee_payments p join students s on s.id = p.student_id join fee_invoices i on i.id = p.invoice_id left join users u on u.id = p.recorded_by left join fee_cheques q on q.payment_id = p.id where p.id = ${id}::uuid`);
          const refunds = num(await rowsOf(tx, sql`select id, number, amount_paise as "amountPaise", status, created_at as "createdAt" from fee_refund_requests where payment_id = ${id}::uuid order by created_at desc`), 'amountPaise');
          const vouchers = num(await rowsOf(tx, sql`select v.id, v.number, v.voucher_type as "voucherType", v.voucher_date::text as date, (select sum(debit_paise) from acct_voucher_lines l where l.voucher_id = v.id) as "amountPaise" from acct_vouchers v where v.source_id = ${id} or v.source_id in (select id::text from fee_refunds where payment_id = ${id}::uuid)`), 'amountPaise');
          return { record: num([r], 'amount_paise')[0], refunds, vouchers, history: await history('fee_payment') };
        }
        case 'concessions': {
          const r = await one(sql`select c.*, s.full_name as student, i.title as "invoiceTitle", i.invoice_no as "invoiceNo", rb.full_name as "requestedByName", db.full_name as "decidedByName" from fee_concessions c join students s on s.id = c.student_id left join fee_invoices i on i.id = c.invoice_id left join users rb on rb.id = c.requested_by left join users db on db.id = c.decided_by where c.id = ${id}::uuid`);
          return { record: num([r], 'amount_paise', 'applied_paise')[0], history: await history('fee_concession') };
        }
        case 'refunds': {
          const r = await one(sql`select r.*, s.full_name as student, p.receipt_no as "receiptNo", p.amount_paise as "paymentPaise", p.method, rb.full_name as "requestedByName", db.full_name as "decidedByName", pb.full_name as "paidByName" from fee_refund_requests r join students s on s.id = r.student_id join fee_payments p on p.id = r.payment_id left join users rb on rb.id = r.requested_by left join users db on db.id = r.decided_by left join users pb on pb.id = r.paid_by where r.id = ${id}::uuid`);
          return { record: num([r], 'amount_paise', 'paymentPaise')[0], history: await history('fee_refund_request') };
        }
        case 'write-offs': {
          const r = await one(sql`select w.*, s.full_name as student, i.title, i.invoice_no as "invoiceNo", (i.amount_paise - i.paid_paise) as "invoiceBalancePaise", rb.full_name as "requestedByName", db.full_name as "decidedByName" from fee_write_offs w join students s on s.id = w.student_id join fee_invoices i on i.id = w.invoice_id left join users rb on rb.id = w.requested_by left join users db on db.id = w.decided_by where w.id = ${id}::uuid`);
          return { record: num([r], 'amount_paise', 'invoiceBalancePaise')[0], history: await history('fee_write_off') };
        }
        case 'voucher-requests': {
          const r = await one(sql`select v.*, rb.full_name as "requestedByName", db.full_name as "decidedByName" from acct_voucher_requests v left join users rb on rb.id = v.requested_by left join users db on db.id = v.decided_by where v.id = ${id}::uuid`);
          const names = new Map((await rowsOf(tx, sql`select id, code, name from acct_accounts`)).map((a) => [String(a.id), `${a.code} ${a.name}`]));
          const lines = (r.lines as { accountId: string; debitPaise: number; creditPaise: number }[]).map((l, i) => ({ id: String(i), account: names.get(l.accountId) ?? l.accountId, debitPaise: l.debitPaise, creditPaise: l.creditPaise }));
          return { record: num([r], 'amount_paise')[0], lines, history: await history('acct_voucher_request') };
        }
        case 'vouchers': {
          const r = await one(sql`select v.*, u.full_name as "postedByName", t.status as "tallyStatus", t.last_error as "tallyError" from acct_vouchers v left join users u on u.id = v.posted_by left join tally_sync_log t on t.kind = 'voucher' and t.ref_id = v.id where v.id = ${id}::uuid`);
          const lines = num(await rowsOf(tx, sql`select l.id, a.code || ' ' || a.name as account, l.debit_paise as "debitPaise", l.credit_paise as "creditPaise" from acct_voucher_lines l join acct_accounts a on a.id = l.account_id where l.voucher_id = ${id}::uuid order by l.debit_paise desc`), 'debitPaise', 'creditPaise');
          return { record: { ...r, amountPaise: sum(lines, 'debitPaise') }, lines, history: await history('acct_voucher') };
        }
        case 'ledgers': {
          const r = await one(sql`select * from acct_accounts where id = ${id}::uuid`);
          const fy = fyOf(await this.today(tx));
          const ledger = await this.accountLedger(tx, r, fyStart(fy), fyEnd(fy));
          return { record: { ...r, financialYear: fy, openingPaise: ledger.openingPaise, closingPaise: ledger.closingPaise }, rows: ledger.rows, history: await history('acct_account') };
        }
        case 'budgets': {
          const r = await one(sql`select b.*, d.name as department from budgets b join departments d on d.id = b.department_id where b.id = ${id}::uuid`);
          const rep = await budgetReportRows(tx, String(r.fiscal_year));
          const line = rep.rows.find((x) => x.departmentId === r.department_id);
          const expenses = num(await rowsOf(tx, sql`select id, spent_on::text as date, description, amount_paise as "amountPaise" from cost_expenses where department_id = ${String(r.department_id)}::uuid and spent_on between ${fyStart(String(r.fiscal_year))}::date and ${fyEnd(String(r.fiscal_year))}::date order by spent_on desc`), 'amountPaise');
          return { record: { ...num([r], 'amount_paise')[0], ...line }, expenses, history: await history('budget') };
        }
        case 'cheques': {
          const r = await one(sql`select q.*, s.full_name as student, p.receipt_no as "receiptNo", p.id as "paymentId" from fee_cheques q join students s on s.id = q.student_id join fee_payments p on p.id = q.payment_id where q.id = ${id}::uuid`);
          return { record: num([r], 'amount_paise', 'bounce_charge_paise')[0], history: await history('fee_cheque') };
        }
        case 'closings': {
          const r = await one(sql`select c.*, u.full_name as cashier, v.full_name as "verifiedByName" from fee_cash_closings c join users u on u.id = c.cashier_id left join users v on v.id = c.verified_by where c.id = ${id}::uuid`);
          const receipts = num(await rowsOf(tx, sql`select id, receipt_no as "receiptNo", amount_paise as "amountPaise", paid_at as "paidAt" from fee_payments where status = 'paid' and method = 'cash' and recorded_by = ${String(r.cashier_id)}::uuid and (paid_at at time zone 'Asia/Kolkata')::date = ${String(r.closing_date)}::date order by paid_at`), 'amountPaise');
          return { record: num([r], 'system_paise', 'counted_paise')[0], receipts, history: await history('fee_cash_closing') };
        }
      }
      throw new NotFoundException('No such record type');
    });
  }

  /** A student's statement: what was charged (before concessions and write-offs), what came off, and the running balance. */
  private async studentLedger(tx: Tx, studentId: string) {
    const rows = num(
      await rowsOf(
        tx,
        sql`select * from (
          select i.created_at as at, i.created_at::date::text as date, coalesce(i.invoice_no, '') as ref, i.title as particulars, (i.amount_paise + coalesce((select sum(applied_paise) from fee_concessions c where c.invoice_id = i.id and c.status = 'approved'), 0) + coalesce((select sum(amount_paise) from fee_write_offs w where w.invoice_id = i.id and w.status = 'approved'), 0)) as debit, 0 as credit from fee_invoices i where i.student_id = ${studentId}::uuid and i.status <> 'cancelled'
          union all select coalesce(p.paid_at, p.created_at), (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kolkata')::date::text, p.receipt_no, 'Receipt (' || p.method || ')', 0, p.amount_paise from fee_payments p where p.student_id = ${studentId}::uuid and p.receipt_no is not null
          union all select p.created_at, (p.created_at at time zone 'Asia/Kolkata')::date::text, p.receipt_no, 'Cheque returned', p.amount_paise, 0 from fee_payments p join fee_cheques q on q.payment_id = p.id where p.student_id = ${studentId}::uuid and q.status = 'bounced'
          union all select c.decided_at, (c.decided_at at time zone 'Asia/Kolkata')::date::text, c.number, 'Concession (' || c.kind || ')', 0, c.applied_paise from fee_concessions c where c.student_id = ${studentId}::uuid and c.status = 'approved' and c.applied_paise > 0
          union all select w.decided_at, (w.decided_at at time zone 'Asia/Kolkata')::date::text, w.number, 'Written off', 0, w.amount_paise from fee_write_offs w where w.student_id = ${studentId}::uuid and w.status = 'approved'
          union all select r.refunded_at, (r.refunded_at at time zone 'Asia/Kolkata')::date::text, '', 'Refund: ' || r.reason, r.amount_paise, 0 from fee_refunds r where r.student_id = ${studentId}::uuid
        ) x order by at, debit desc`,
      ),
      'debit',
      'credit',
    );
    let bal = 0;
    return rows.map((r, i) => {
      bal += Number(r.debit) - Number(r.credit);
      return { id: String(i), date: r.date, ref: r.ref, particulars: r.particulars, debitPaise: r.debit, creditPaise: r.credit, balancePaise: bal };
    });
  }

  private async accountLedger(tx: Tx, acc: Row, from: string, to: string) {
    const g = acc.group_type as GroupType;
    const before = (await movements(tx, { to: new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10) })).find((m) => m.accountId === acc.id);
    let running = naturalBalance(g, Number(acc.opening_paise) + (before?.debitPaise ?? 0), before?.creditPaise ?? 0);
    const openingPaise = running;
    const rows = (await voucherLines(tx, { from, to, accountId: String(acc.id) })).flatMap((v) =>
      v.lines
        .filter((l) => l.accountId === acc.id)
        .map((l, i) => {
          running += naturalBalance(g, l.debitPaise, l.creditPaise);
          const other = v.lines.find((o) => o.accountId !== acc.id);
          return { id: `${v.id}:${i}`, voucherId: v.id, date: v.date, number: v.number, voucherType: v.voucherType, particulars: other ? `${other.accountName}` : '', narration: v.narration, debitPaise: l.debitPaise, creditPaise: l.creditPaise, balancePaise: running };
        }),
    );
    return { openingPaise, rows, closingPaise: running };
  }

  @Get('reports/:key')
  @Auth('user', FEE_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Query() q: Record<string, string>) {
    if (!(REPORTS as readonly string[]).includes(key)) throw new NotFoundException('No such report');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const fy = q.fy && isFy(q.fy) ? q.fy : fyOf(today);
      const from = q.from ? Day.parse(q.from) : key === 'daily-collection' || key === 'day-book' ? today.slice(0, 8) + '01' : fyStart(fy);
      const to = q.to ? Day.parse(q.to) : today;
      if (from > to) throw new BadRequestException('The start date is after the end date');
      const paidIn = sql`p.status = 'paid' and (p.paid_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date`;
      const out = (rows: Row[], totals: Record<string, number> = {}) => ({ key, from, to, fy, rows, totals });
      switch (key) {
        case 'daily-collection': {
          const rows = num(await rowsOf(tx, sql`select (p.paid_at at time zone 'Asia/Kolkata')::date::text as date, p.method as mode, coalesce(u.full_name, 'Online') as cashier, count(*)::int as receipts, sum(p.amount_paise) as "amountPaise" from fee_payments p left join users u on u.id = p.recorded_by where ${paidIn} ${q.mode ? sql`and p.method::text = ${q.mode}` : sql``} group by 1, 2, 3 order by 1 desc, 2, 3`), 'amountPaise');
          return out(rows.map((r) => ({ ...r, id: `${r.date}:${r.mode}:${r.cashier}` })), { amountPaise: sum(rows, 'amountPaise'), receipts: sum(rows, 'receipts') });
        }
        case 'head-collection': {
          const heads = (await settingsOf(tx, p.tenantId)).feeHeads;
          const raw = num(await rowsOf(tx, sql`select i.title, count(*)::int as receipts, sum(p.amount_paise) as "amountPaise" from fee_payments p join fee_invoices i on i.id = p.invoice_id where ${paidIn} group by i.title`), 'amountPaise');
          const by = new Map<string, { id: string; head: string; code: string; receipts: number; amountPaise: number }>();
          for (const r of raw) {
            const h = headOf(String(r.title), heads);
            const k = h?.code ?? String(r.title);
            const cur = by.get(k) ?? { id: k, head: h?.name ?? String(r.title), code: h?.code ?? '', receipts: 0, amountPaise: 0 };
            cur.receipts += Number(r.receipts);
            cur.amountPaise += Number(r.amountPaise);
            by.set(k, cur);
          }
          const rows = [...by.values()].sort((a, b) => b.amountPaise - a.amountPaise);
          return out(rows, { amountPaise: sum(rows, 'amountPaise'), receipts: sum(rows, 'receipts') });
        }
        case 'outstanding': {
          const minDays = Math.max(0, Number(q.minDays ?? 0) || 0);
          const rows = num(
            await rowsOf(
              tx,
              sql`select s.id, s.full_name as student, s.roll_no as "rollNo", sec.display_name as section, count(*)::int as invoices, sum(i.amount_paise - i.paid_paise) as "balancePaise", min(i.due_on)::text as "oldestDue", (${to}::date - min(i.due_on))::int as "daysOverdue"
                from fee_invoices i join students s on s.id = i.student_id join sections sec on sec.id = s.section_id where i.status = 'due' and i.due_on <= ${to}::date ${q.sectionId ? sql`and s.section_id = ${q.sectionId}::uuid` : sql``}
                group by s.id, sec.display_name having (${to}::date - min(i.due_on)) >= ${minDays} order by "balancePaise" desc`,
            ),
            'balancePaise',
          ).map((r) => ({ ...r, bucket: ageBucket(Number(r.daysOverdue)) }));
          return out(rows, { balancePaise: sum(rows, 'balancePaise'), students: rows.length });
        }
        case 'concessions': {
          const rows = num(await rowsOf(tx, sql`select c.id, c.number, (c.created_at at time zone 'Asia/Kolkata')::date::text as date, s.full_name as student, c.kind, c.sponsor_name as "sponsorName", c.amount_paise as "amountPaise", c.applied_paise as "appliedPaise", c.status, u.full_name as "decidedBy" from fee_concessions c join students s on s.id = c.student_id left join users u on u.id = c.decided_by where (c.created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date order by c.created_at`), 'amountPaise', 'appliedPaise');
          return out(rows, { amountPaise: sum(rows, 'amountPaise'), appliedPaise: sum(rows, 'appliedPaise') });
        }
        case 'refunds': {
          const rows = num(await rowsOf(tx, sql`select f.id, (f.refunded_at at time zone 'Asia/Kolkata')::date::text as date, coalesce(r.number, '') as number, s.full_name as student, p.receipt_no as "receiptNo", f.amount_paise as "amountPaise", coalesce(r.pay_mode, p.method::text) as mode, f.reason, u.full_name as "paidBy" from fee_refunds f join students s on s.id = f.student_id join fee_payments p on p.id = f.payment_id left join fee_refund_requests r on r.refund_id = f.id left join users u on u.id = f.refunded_by where (f.refunded_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date order by f.refunded_at`), 'amountPaise');
          return out(rows, { amountPaise: sum(rows, 'amountPaise') });
        }
        case 'cheques': {
          const rows = num(await rowsOf(tx, sql`select q.id, q.cheque_no as "chequeNo", q.bank_name as "bankName", q.cheque_date::text as "chequeDate", s.full_name as student, p.receipt_no as "receiptNo", q.amount_paise as "amountPaise", q.status, q.deposited_on::text as "depositedOn", coalesce(q.cleared_on, q.bounced_on)::text as "settledOn", q.bounce_reason as "bounceReason" from fee_cheques q join students s on s.id = q.student_id join fee_payments p on p.id = q.payment_id where q.cheque_date between ${from}::date and ${to}::date ${q.status ? sql`and q.status = ${q.status}` : sql``} order by q.cheque_date`), 'amountPaise');
          return out(rows, { amountPaise: sum(rows, 'amountPaise'), bouncedPaise: sum(rows.filter((r) => r.status === 'bounced'), 'amountPaise') });
        }
        case 'student-ledger': {
          if (!q.studentId || !/^[0-9a-f-]{36}$/i.test(q.studentId)) return out([], {});
          const rows = await this.studentLedger(tx, q.studentId);
          return out(rows, { debitPaise: sum(rows, 'debitPaise'), creditPaise: sum(rows, 'creditPaise'), balancePaise: Number(rows.at(-1)?.balancePaise ?? 0) });
        }
        case 'cash-book':
        case 'bank-book': {
          const s = await settingsOf(tx, p.tenantId);
          await ensureChart(tx, p.tenantId);
          const code = key === 'cash-book' ? s.mappings.cash : s.mappings.bank;
          const [acc] = q.accountId && /^[0-9a-f-]{36}$/i.test(q.accountId) ? await rowsOf(tx, sql`select * from acct_accounts where id = ${q.accountId}::uuid and is_cash_bank`) : await rowsOf(tx, sql`select * from acct_accounts where code = ${code}`);
          if (!acc) return out([], {});
          const l = await this.accountLedger(tx, acc, from, to);
          return out(l.rows, { openingPaise: l.openingPaise, receiptsPaise: sum(l.rows, 'debitPaise'), paymentsPaise: sum(l.rows, 'creditPaise'), closingPaise: l.closingPaise });
        }
        case 'day-book': {
          const vs = await voucherLines(tx, { from, to });
          const rows = vs.flatMap((v) => v.lines.map((l, i) => ({ id: `${v.id}:${i}`, voucherId: v.id, date: v.date, number: v.number, voucherType: v.voucherType, account: `${l.code} ${l.accountName}`, narration: i === 0 ? v.narration : '', debitPaise: l.debitPaise, creditPaise: l.creditPaise })));
          return out(rows, { debitPaise: sum(rows, 'debitPaise'), creditPaise: sum(rows, 'creditPaise'), vouchers: vs.length });
        }
        case 'trial-balance': {
          await ensureChart(tx, p.tenantId);
          const tb = trialBalance(await movements(tx, { to }));
          return out(tb.lines.map((l) => ({ id: l.accountId, ...l })), { debitPaise: tb.totalDebitPaise, creditPaise: tb.totalCreditPaise });
        }
        case 'income-expenditure': {
          await ensureChart(tx, p.tenantId);
          const ie = incomeExpenditure(await movements(tx, { from: fyStart(fy), to: fyEnd(fy), excludeClosing: true }));
          const rows = [...ie.income.map((r) => ({ id: r.code, side: 'income', ...r })), ...ie.expense.map((r) => ({ id: r.code, side: 'expense', ...r }))];
          return out(rows, { incomePaise: ie.totalIncomePaise, expensePaise: ie.totalExpensePaise, surplusPaise: ie.surplusPaise });
        }
        case 'balance-sheet': {
          await ensureChart(tx, p.tenantId);
          const bs = balanceSheet(await movements(tx, { to }));
          const rows = [...bs.assets.map((r) => ({ id: r.code, side: 'asset', ...r })), ...bs.liabilities.map((r) => ({ id: r.code, side: 'liability', ...r })), ...bs.equity.map((r) => ({ id: r.code, side: 'equity', ...r })), { id: 'surplus', side: 'equity', code: '', name: 'Surplus not yet moved to reserves', paise: bs.surplusPaise }];
          return out(rows, { assetsPaise: bs.totalAssetsPaise, liabilitiesPaise: bs.totalLiabilitiesPaise });
        }
        case 'budget-vs-actual': {
          const rep = await budgetReportRows(tx, fy);
          const rows = rep.rows.map((r) => ({ id: r.departmentId, ...r }));
          return out(rows, { budgetPaise: sum(rows, 'budgetPaise'), actualPaise: sum(rows, 'actualPaise') });
        }
        case 'gst': {
          const heads = (await settingsOf(tx, p.tenantId)).feeHeads.filter((h) => h.gstRate > 0);
          const raw = num(await rowsOf(tx, sql`select p.id, (p.paid_at at time zone 'Asia/Kolkata')::date::text as date, p.receipt_no as "receiptNo", s.full_name as student, i.title, p.amount_paise as "amountPaise" from fee_payments p join fee_invoices i on i.id = p.invoice_id join students s on s.id = p.student_id where ${paidIn} order by p.paid_at`), 'amountPaise');
          const rows = raw.flatMap((r) => {
            const h = headOf(String(r.title), heads);
            return h ? [{ ...r, head: h.name, rate: h.gstRate, ...gstSplit(Number(r.amountPaise), h.gstRate) }] : [];
          });
          return out(rows, { amountPaise: sum(rows, 'amountPaise'), taxablePaise: sum(rows, 'taxablePaise'), cgstPaise: sum(rows, 'cgstPaise'), sgstPaise: sum(rows, 'sgstPaise') });
        }
        case '80g': {
          const rows = num(await rowsOf(tx, sql`select d.id, d.received_on::text as date, d.receipt_serial as "receiptNo", d.donor_name as donor, coalesce(d.donor_pan, '') as pan, d.mode, d.amount_paise as "amountPaise", c.name as campaign from alumni_donations d join alumni_campaigns c on c.id = d.campaign_id where d.received_on between ${from}::date and ${to}::date order by d.received_on`), 'amountPaise').map((r) => ({ ...r, eligible: eligible80G(String(r.mode), Number(r.amountPaise)) && !!r.pan }));
          return out(rows, { amountPaise: sum(rows, 'amountPaise'), eligiblePaise: sum(rows.filter((r) => r.eligible), 'amountPaise') });
        }
      }
      return out([]);
    });
  }
}
