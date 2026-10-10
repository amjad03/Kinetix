/** Soundarya samples for the accounting books, gateway settlements, Tally mapping, single sign-on and online-class attendance. Safe to run twice: every insert is guarded. */
import { SsoService } from '../../sso/sso.controller.js';
import { DEFAULT_CHART } from '../../books/books.logic.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { service } from './nest.js';

export async function gatewayBooksSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const t = c.tenantId;
  const admin = c.byEmail.admin.id;

  // Chart of accounts.
  for (const a of DEFAULT_CHART) {
    await k.q('insert into acct_accounts (tenant_id, code, name, group_type, is_cash_bank) values ($1,$2,$3,$4,$5) on conflict (tenant_id, code) do nothing', [t, a.code, a.name, a.groupType, a.isCashBank ?? false]);
  }
  const acc = Object.fromEntries((await k.q<{ id: string; code: string }>('select id, code from acct_accounts where tenant_id = $1', [t])).map((a) => [a.code, a.id]));

  // One receipt voucher per month of fee collection, and a few ordinary vouchers.
  const months = await k.q<{ m: string; total: string }>("select to_char(paid_at, 'YYYY-MM') as m, sum(amount_paise)::bigint as total from fee_payments where tenant_id = $1 and status = 'paid' and paid_at is not null group by 1 order by 1", [t]);
  const fyOf = (d: string) => {
    const y = Number(d.slice(0, 4));
    const s = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  };
  type V = { id: string; type: string; date: string; narration: string; lines: [string, number, number][] };
  const vouchers: V[] = months.map((m) => ({ id: `fees-${m.m}`, type: 'receipt', date: `${m.m}-28`, narration: `Fee collection for ${m.m}`, lines: [['1010', Number(m.total), 0], ['4000', 0, Number(m.total)]] }));
  const d = (n: number) => addDays(c.today, n);
  vouchers.push(
    { id: 'rent', type: 'receipt', date: d(-12), narration: 'Auditorium rent from the Rotary Club', lines: [['1010', 25_000_00, 0], ['4100', 0, 25_000_00]] },
    { id: 'stationery', type: 'payment', date: d(-9), narration: 'Stationery and printing', lines: [['5100', 18_400_00, 0], ['1010', 0, 18_400_00]] },
    { id: 'cash', type: 'contra', date: d(-6), narration: 'Cash deposited in the bank', lines: [['1010', 50_000_00, 0], ['1000', 0, 50_000_00]] },
    { id: 'depr', type: 'journal', date: d(-3), narration: 'Depreciation on lab equipment', lines: [['5300', 42_000_00, 0], ['1200', 0, 42_000_00]] },
  );
  for (const v of vouchers) {
    const fy = fyOf(v.date);
    const [{ n }] = await k.q<{ n: string }>('select count(*)::int as n from acct_vouchers where tenant_id = $1 and financial_year = $2 and voucher_type = $3', [t, fy, v.type]);
    const [row] = await k.q<{ id: string }>(
      "insert into acct_vouchers (tenant_id, financial_year, voucher_type, number, voucher_date, narration, source_type, source_id, posted_by) values ($1,$2,$3,$4,$5,$6,'seed',$7,$8) on conflict (tenant_id, source_type, source_id) where source_type is not null do nothing returning id",
      [t, fy, v.type, `${{ receipt: 'R', payment: 'P', contra: 'C', journal: 'J' }[v.type]}/${fy}/${String(Number(n) + 1).padStart(5, '0')}`, v.date, v.narration, v.id, admin],
    );
    if (!row) continue;
    for (const [code, dr, cr] of v.lines) await k.q('insert into acct_voucher_lines (tenant_id, voucher_id, account_id, debit_paise, credit_paise) values ($1,$2,$3,$4,$5)', [t, row.id, acc[code], dr, cr]);
  }

  // A settlement batch whose lines match online receipts, plus two exceptions.
  const online = await k.q<{ id: string; pid: string; oid: string | null; amt: string }>("select id, provider_payment_id as pid, provider_order_id as oid, amount_paise as amt from fee_payments where tenant_id = $1 and status = 'paid' and method = 'online' and provider_payment_id is not null order by paid_at limit 6", [t]);
  const [batch] = await k.q<{ id: string }>(
    "insert into settlement_batches (tenant_id, provider, source, reference, settlement_date, gross_paise, fee_paise, net_paise, line_count, exception_count, imported_by) values ($1,'razorpay','file','SEED-UTR-0001',$2,0,0,0,0,0,$3) on conflict (tenant_id, provider, reference) do nothing returning id",
    [t, d(-4), admin],
  );
  if (batch) {
    const lines = [
      ...online.map((p) => ({ pay: p.pid, order: p.oid, amt: Number(p.amt), status: 'matched', reason: null as string | null, fp: p.id })),
      { pay: 'pay_seed_unknown', order: null, amt: 12_500_00, status: 'exception', reason: 'unknown_payment', fp: null },
      { pay: 'pay_seed_short', order: null, amt: 9_000_00, status: 'exception', reason: 'amount_mismatch', fp: online[0]?.id ?? null },
    ];
    for (const l of lines) {
      const fee = Math.round(l.amt * 0.02);
      await k.q('insert into settlement_lines (tenant_id, batch_id, kind, provider_payment_id, provider_order_id, amount_paise, fee_paise, net_paise, status, exception_reason, fee_payment_id) values ($1,$2,\'payment\',$3,$4,$5,$6,$7,$8,$9,$10)', [t, batch.id, l.pay, l.order, l.amt, fee, l.amt - fee, l.status, l.reason, l.fp]);
    }
    await k.q('update settlement_batches b set gross_paise = s.g, fee_paise = s.f, net_paise = s.n, line_count = s.c, exception_count = s.e from (select sum(amount_paise)::bigint g, sum(fee_paise)::bigint f, sum(net_paise)::bigint n, count(*)::int c, count(*) filter (where status = \'exception\')::int e from settlement_lines where batch_id = $1) s where b.id = $1', [batch.id]);
  }

  // Tally connection (switched off) and a ledger mapping.
  await k.q("insert into tally_settings (tenant_id, host, port, company, enabled) values ($1,'localhost',9000,'Soundarya PU College',false) on conflict (tenant_id) do nothing", [t]);
  await k.q("insert into tally_ledger_map (tenant_id, account_id, tally_ledger, tally_parent) values ($1,$2,'Tuition Fee Income','Direct Incomes') on conflict (tenant_id, account_id) do nothing", [t, acc['4000']]);
  await k.q("insert into tally_ledger_map (tenant_id, account_id, tally_ledger, tally_parent) values ($1,$2,'State Bank of India - Current','Bank Accounts') on conflict (tenant_id, account_id) do nothing", [t, acc['1010']]);

  // A Google Workspace provider, off until the college registers its client (the secret is a placeholder).
  const sso = await service(SsoService);
  const [{ n: providers }] = await k.q<{ n: string }>('select count(*)::int as n from sso_providers where tenant_id = $1', [t]);
  if (Number(providers) === 0) {
    await k.q(
      "insert into sso_providers (tenant_id, kind, name, issuer, client_id, client_secret_enc, authorization_endpoint, token_endpoint, jwks_uri, allowed_domains, redirect_allowlist, enabled) values ($1,'google','Soundarya Google Workspace','https://accounts.google.com','replace-with-client-id.apps.googleusercontent.com',$2,'https://accounts.google.com/o/oauth2/v2/auth','https://oauth2.googleapis.com/token','https://www.googleapis.com/oauth2/v3/certs',$3,$4,false)",
      [t, sso.box.encrypt('replace-with-client-secret', `${t}:sso.client_secret`), ['soundarya.demo'], ['kinetix://sso']],
    );
  }

  // The first online class: a participant report and the suggested attendance.
  const [m] = await k.q<{ id: string; sectionId: string; startsAt: Date }>('select cm.id, ts.section_id as "sectionId", cm.starts_at as "startsAt" from class_meetings cm join timetable_slots ts on ts.id = cm.slot_id where cm.tenant_id = $1 order by cm.starts_at limit 1', [t]);
  if (m) {
    const kids = c.students.filter((s) => s.sectionId === m.sectionId).slice(0, 8);
    const start = new Date(m.startsAt).getTime();
    const parts = kids.map((s, i) => ({ name: s.name, email: null, joinedAt: new Date(start + (i === 2 ? 15 : 1) * 60_000).toISOString(), leftAt: new Date(start + (i === 5 ? 20 : 58) * 60_000).toISOString(), minutes: i === 5 ? 19 : i === 2 ? 43 : 57 }));
    await k.q('update class_meetings set participants = $2::jsonb, participants_pulled_at = $3 where id = $1 and participants is null', [m.id, JSON.stringify(parts), at(addDays(c.today, -1))]);
    for (const [i, s] of kids.entries()) {
      const p = parts[i];
      await k.q('insert into meeting_attendance_proposals (tenant_id, meeting_id, student_id, status, minutes, source_name) values ($1,$2,$3,$4,$5,$6) on conflict (meeting_id, student_id) do nothing', [t, m.id, s.id, p.minutes < 30 ? 'absent' : i === 2 ? 'late' : 'present', p.minutes, p.name]);
    }
  }
  void J;
}
