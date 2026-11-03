import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { ageBucket } from '../fee-accounts/fee-accounts.logic.js';

type Row = Record<string, unknown>;

/** Reports added by the fees flagship pass; the accounts desk's report endpoint serves them with the others. */
export const FLAGSHIP_REPORTS = ['mode-wise', 'ageing', 'defaulters', 'gateway-recon', 'audit-trail', 'payment-links', 'reminders-sent', 'duplicates', 'fee-account-summary', 'scholarship-tracker'] as const;

const rowsOf = async (tx: Tx, q: SQL) => ((await tx.execute(q)).rows as Row[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
const num = (r: Row[], ...keys: string[]): Row[] => r.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, keys.includes(k) ? Number(v ?? 0) : v])));
const sum = (r: Row[], key: string) => r.reduce((a, x) => a + Number(x[key] ?? 0), 0);
const UUID = /^[0-9a-f-]{36}$/i;

/** What government scholarships still expected hold back, per student (it does not count as overdue). */
export const heldSql = sql`(select g.student_id, sum(greatest(coalesce(nullif(g.sanctioned_paise, 0), g.expected_paise, g.applied_paise) - g.received_paise, 0)) as held
  from fee_govt_scholarships g where g.hold_dues and g.status in ('applied', 'verified', 'sanctioned', 'received') group by g.student_id)`;

/** Fee subjects whose audit entries make the fees audit trail. */
const AUDIT_SUBJECTS = ['fee_invoice', 'fee_payment', 'fee_receipt', 'fee_concession', 'fee_refund', 'fee_refund_request', 'fee_write_off', 'fee_cheque', 'fee_cash_closing', 'fee_challan', 'fee_structure', 'fee_payment_link', 'fee_account', 'fee_payment_flag', 'fee_programme_transfer', 'govt_scholarship', 'fee_late_fee', 'fee_waiver_request', 'fee_custom_plan', 'acct_voucher_request', 'settlement_batch', 'settlement_line', 'bank_transfer', 'fee_head', 'fee_reminder'];

/**
 * The flagship reports. `q` is the URL's filters (already limited to safe characters by the ERP); from/to are
 * checked dates. Amounts are paise; every row has an id.
 */
export async function flagshipReport(tx: Tx, key: string, q: Record<string, string>, from: string, to: string): Promise<{ rows: Row[]; totals: Record<string, number> } | null> {
  const account = q.account && UUID.test(q.account) ? q.account : null;
  const acct = (col: SQL) => (account ? sql`and ${col} = ${account}::uuid` : sql``);
  const paidIn = sql`p.status = 'paid' and (p.paid_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date`;
  switch (key) {
    case 'mode-wise': {
      const rows = num(await rowsOf(tx, sql`select p.method as id, p.method as mode, count(distinct coalesce(p.receipt_id::text, p.id::text))::int as receipts, sum(p.amount_paise) as "amountPaise" from fee_payments p join fee_invoices i on i.id = p.invoice_id where ${paidIn} ${acct(sql`i.fee_account_id`)} group by p.method order by 4 desc`), 'amountPaise');
      const total = sum(rows, 'amountPaise');
      return { rows: rows.map((r) => ({ ...r, sharePercent: total ? Math.round((Number(r.amountPaise) * 1000) / total) / 10 : 0 })), totals: { amountPaise: total, receipts: sum(rows, 'receipts') } };
    }
    case 'ageing': {
      const raw = num(await rowsOf(tx, sql`select i.id, i.student_id as "studentId", (${to}::date - i.due_on)::int as days, (i.amount_paise - i.paid_paise) as "balancePaise" from fee_invoices i where i.status = 'due' and i.amount_paise > i.paid_paise ${acct(sql`i.fee_account_id`)}`), 'balancePaise', 'days');
      const order = ['current', '0-30', '31-60', '61-90', '90+'];
      const by = new Map(order.map((b) => [b, { id: b, bucket: b, invoices: 0, students: new Set<string>(), balancePaise: 0 }]));
      for (const r of raw) {
        const b = by.get(ageBucket(Number(r.days)))!;
        b.invoices++;
        b.students.add(String(r.studentId));
        b.balancePaise += Number(r.balancePaise);
      }
      const rows = [...by.values()].map((b) => ({ id: b.id, bucket: b.bucket, invoices: b.invoices, students: b.students.size, balancePaise: b.balancePaise }));
      return { rows, totals: { balancePaise: sum(rows, 'balancePaise'), overduePaise: sum(rows.filter((r) => r.bucket !== 'current'), 'balancePaise') } };
    }
    case 'defaulters': {
      const minDays = Math.max(0, Number(q.minDays ?? 1) || 0);
      const minPaise = Math.max(0, Math.round((Number(q.minRupees ?? 0) || 0) * 100));
      const rows = num(
        await rowsOf(
          tx,
          sql`with o as (select i.student_id, sum(i.amount_paise - i.paid_paise) as overdue, min(i.due_on) as oldest, count(*)::int as invoices from fee_invoices i where i.status = 'due' and i.due_on < (${to}::date - ${minDays - 1}::int) ${acct(sql`i.fee_account_id`)} group by i.student_id),
            h as ${heldSql}
            select s.id, s.full_name as student, s.roll_no as "rollNo", sec.display_name as section, o.invoices, o.overdue as "overduePaise", coalesce(h.held, 0) as "heldPaise", greatest(o.overdue - coalesce(h.held, 0), 0) as "netPaise", o.oldest::text as "oldestDue", (${to}::date - o.oldest)::int as "daysOverdue",
              (select u.full_name from guardians g join users u on u.id = g.user_id where g.student_id = s.id order by g.is_primary desc limit 1) as guardian,
              (select u.phone from guardians g join users u on u.id = g.user_id where g.student_id = s.id order by g.is_primary desc limit 1) as phone,
              (select u.email from guardians g join users u on u.id = g.user_id where g.student_id = s.id order by g.is_primary desc limit 1) as email,
              (select max(r.sent_on)::text from fee_reminder_sends r where r.student_id = s.id) as "lastReminder"
            from o join students s on s.id = o.student_id join sections sec on sec.id = s.section_id left join h on h.student_id = s.id
            where greatest(o.overdue - coalesce(h.held, 0), 0) > ${minPaise} order by "netPaise" desc`,
        ),
        'overduePaise',
        'heldPaise',
        'netPaise',
      ).map((r) => ({ ...r, bucket: ageBucket(Number(r.daysOverdue)) }));
      return { rows, totals: { netPaise: sum(rows, 'netPaise'), heldPaise: sum(rows, 'heldPaise'), students: rows.length } };
    }
    case 'gateway-recon': {
      const rows = num(
        await rowsOf(
          tx,
          sql`select p.id, (p.paid_at at time zone 'Asia/Kolkata')::date::text as date, p.receipt_no as "receiptNo", s.full_name as student, p.provider, a.name as "feeAccount", p.provider_order_id as "orderId", p.provider_payment_id as "gatewayPaymentId", (p.amount_paise + p.convenience_paise) as "amountPaise",
              sl.fee_paise as "gatewayFeePaise", sl.net_paise as "netPaise", sb.reference as settlement, sb.settlement_date::text as "settledOn",
              (select l.txn_date::text from acct_bank_lines l where l.settlement_batch_id = sb.id limit 1) as "bankedOn",
              case when sl.status = 'exception' then 'exception' when sl.id is null then 'unsettled' when exists (select 1 from acct_bank_lines l where l.settlement_batch_id = sb.id) then 'banked' else 'settled' end as status
            from fee_payments p join students s on s.id = p.student_id join fee_invoices i on i.id = p.invoice_id left join fee_accounts a on a.id = i.fee_account_id
              left join lateral (select * from settlement_lines x where x.fee_payment_id = p.id and x.kind = 'payment' order by x.created_at desc limit 1) sl on true
              left join settlement_batches sb on sb.id = sl.batch_id
            where p.method = 'online' and ${paidIn} ${acct(sql`i.fee_account_id`)} ${q.status && /^[a-z]+$/.test(q.status) ? sql`and (case when sl.status = 'exception' then 'exception' when sl.id is null then 'unsettled' when exists (select 1 from acct_bank_lines l where l.settlement_batch_id = sb.id) then 'banked' else 'settled' end) = ${q.status}` : sql``}
            order by p.paid_at desc limit 5000`,
        ),
        'amountPaise',
        'gatewayFeePaise',
        'netPaise',
      );
      return { rows, totals: { amountPaise: sum(rows, 'amountPaise'), gatewayFeePaise: sum(rows, 'gatewayFeePaise'), netPaise: sum(rows, 'netPaise'), unsettledPaise: sum(rows.filter((r) => r.status === 'unsettled' || r.status === 'exception'), 'amountPaise') } };
    }
    case 'audit-trail': {
      const rows = await rowsOf(
        tx,
        sql`select a.id::text as id, a.at, (a.at at time zone 'Asia/Kolkata')::date::text as date, coalesce(u.full_name, a.actor_type) as actor, a.action, a.subject_type as "subjectType", a.subject_id::text as "subjectId", left(coalesce(a.data::text, ''), 300) as details
          from audit_log a left join users u on u.id = a.actor_id where a.subject_type in (${sql.join(AUDIT_SUBJECTS.map((s) => sql`${s}`), sql`, `)}) and (a.at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
          ${q.status && /^[a-z_.]+$/.test(q.status) ? sql`and a.action like ${`${q.status}%`}` : sql``} order by a.at desc limit 2000`,
      );
      return { rows, totals: { entries: rows.length } };
    }
    case 'payment-links': {
      const rows = num(await rowsOf(tx, sql`select l.id, l.number, (l.created_at at time zone 'Asia/Kolkata')::date::text as date, s.full_name as student, i.title, l.amount_paise as "amountPaise", case when l.status = 'active' and l.expires_at < now() then 'expired' else l.status end as status, (l.expires_at at time zone 'Asia/Kolkata')::date::text as "expiresOn", array_to_string(l.channels, ', ') as channels, (l.opened_at is not null) as opened, (l.paid_at at time zone 'Asia/Kolkata')::date::text as "paidOn" from fee_payment_links l join students s on s.id = l.student_id join fee_invoices i on i.id = l.invoice_id where (l.created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date order by l.created_at desc`), 'amountPaise');
      return { rows, totals: { amountPaise: sum(rows, 'amountPaise'), paidPaise: sum(rows.filter((r) => r.status === 'paid'), 'amountPaise'), links: rows.length } };
    }
    case 'reminders-sent': {
      const rows = num(await rowsOf(tx, sql`select r.id, r.sent_on::text as date, s.full_name as student, s.roll_no as "rollNo", i.title, r.step, r.channel, r.audience, r.balance_paise as "balancePaise" from fee_reminder_sends r join students s on s.id = r.student_id join fee_invoices i on i.id = r.invoice_id where r.sent_on between ${from}::date and ${to}::date order by r.sent_on desc, s.full_name limit 5000`), 'balancePaise');
      return { rows, totals: { sent: rows.length, escalated: rows.filter((r) => r.audience !== 'family').length } };
    }
    case 'duplicates': {
      const rows = num(await rowsOf(tx, sql`select f.id, (f.created_at at time zone 'Asia/Kolkata')::date::text as date, s.full_name as student, p.receipt_no as "receiptNo", o.receipt_no as "otherReceiptNo", p.method as mode, f.reason, f.amount_paise as "amountPaise", f.status, f.resolution from fee_payment_flags f join students s on s.id = f.student_id join fee_payments p on p.id = f.payment_id left join fee_payments o on o.id = f.other_payment_id where (f.created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date ${q.status && /^[a-z]+$/.test(q.status) ? sql`and f.status = ${q.status}` : sql``} order by f.created_at desc`), 'amountPaise');
      return { rows, totals: { amountPaise: sum(rows, 'amountPaise'), open: rows.filter((r) => r.status === 'open').length } };
    }
    case 'fee-account-summary': {
      // An invoice or receipt naming no account belongs to the default account.
      const own = (col: SQL) => sql`coalesce(${col}, (select d.id from fee_accounts d where d.is_default limit 1)) = a.id`;
      const rows = num(
        await rowsOf(
          tx,
          sql`select a.id, a.code || ' ' || a.name as account, a.receipt_prefix as series, a.is_default as "isDefault",
              (select count(*)::int from fee_receipts r where ${own(sql`r.fee_account_id`)} and r.status in ('active', 'cancel_pending') and r.collected_on between ${from}::date and ${to}::date) as receipts,
              (select coalesce(sum(p.amount_paise), 0) from fee_payments p join fee_invoices i on i.id = p.invoice_id where ${own(sql`i.fee_account_id`)} and ${paidIn}) as "collectedPaise",
              (select coalesce(sum(i.amount_paise - i.paid_paise), 0) from fee_invoices i where ${own(sql`i.fee_account_id`)} and i.status = 'due') as "outstandingPaise",
              (select coalesce(sum(l.debit_paise - l.credit_paise), 0) from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id where l.account_id = a.bank_account_id and v.voided_at is null) as "bankPaise",
              (select g.provider || ' · ' || g.mode from payment_gateway_accounts g where g.fee_account_id = a.id) as gateway
            from fee_accounts a order by a.sort_order, a.code`,
        ),
        'collectedPaise',
        'outstandingPaise',
        'bankPaise',
      );
      return { rows, totals: { collectedPaise: sum(rows, 'collectedPaise'), outstandingPaise: sum(rows, 'outstandingPaise') } };
    }
    case 'scholarship-tracker': {
      const rows = num(
        await rowsOf(
          tx,
          sql`select g.id, s.full_name as student, s.roll_no as "rollNo", g.scheme, g.portal, g.application_no as "applicationNo", g.category, g.academic_year as year, g.status, g.portal_status as "portalStatus", g.verified_on::text as "verifiedOn",
              coalesce(nullif(g.expected_paise, 0), g.applied_paise) as "expectedPaise", g.sanctioned_paise as "sanctionedPaise", g.received_paise as "receivedPaise",
              greatest(coalesce(nullif(g.sanctioned_paise, 0), nullif(g.expected_paise, 0), g.applied_paise) - g.received_paise, 0) as "pendingPaise", g.hold_dues as "holdsDues"
            from fee_govt_scholarships g join students s on s.id = g.student_id
            where (coalesce(g.applied_on, g.created_at::date)) between ${from}::date and ${to}::date ${q.status && /^[a-z]+$/.test(q.status) ? sql`and g.status = ${q.status}` : sql``} ${q.portal && /^[a-z]+$/.test(q.portal) ? sql`and g.portal = ${q.portal}` : sql``}
            order by g.portal, s.full_name`,
        ),
        'expectedPaise',
        'sanctionedPaise',
        'receivedPaise',
        'pendingPaise',
      );
      return { rows, totals: { expectedPaise: sum(rows, 'expectedPaise'), sanctionedPaise: sum(rows, 'sanctionedPaise'), receivedPaise: sum(rows, 'receivedPaise'), pendingPaise: sum(rows, 'pendingPaise') } };
    }
  }
  return null;
}
