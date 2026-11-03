/**
 * Fees flagship samples (migrations 0189-0191): the trust and the college as separate fee accounts (own receipt
 * series, bank and UPI ID; the trust with its 80G registration and a Cashfree sandbox gateway waiting for keys),
 * hostel and transport heads on the trust's account, online payment rules (part payments from ₹1,000) and an
 * escalating reminder schedule, fee references for NEFT narrations, Karnataka SSP and central scholarships in each
 * state, payment links (active, cancelled), and a duplicate UPI receipt flagged for review. Everything that has a
 * service goes through it, so numbers, messages and the audit trail are the module's own. Safe to run twice.
 */
import type { UserPrincipal } from '../../auth/principal.js';
import { CollectionController } from '../../fee-depth/collection.controller.js';
import { FeeFlagshipController } from '../../fee-flagship/flagship.controller.js';
import { gatewayAad } from '../../fees/payment-gateway.service.js';
import { PaymentLinksController } from '../../fees/payment-links.controller.js';
import { SecretBox } from '../../common/secret-box.js';
import { loadEnv } from '../../config/env.js';
import type { Ctx } from './ctx.js';
import { addDays, rupees } from './kit.js';
import { service } from './nest.js';

export async function feeFlagshipSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const t = c.tenantId;
  const [done] = await k.q<{ n: number }>('select count(*)::int as n from fee_accounts where tenant_id = $1', [t]);
  if (done.n > 0) return;
  if (!c.byEmail.accounts) return;
  const as = (email: string, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: t, userId: c.byEmail[email].id, roles });
  const accounts = as('accounts', ['accountant']);
  const principal = as('principal', ['principal']);
  const d = (n: number) => addDays(c.today, n);

  // 1. Fee accounts: the college (default) and the trust that runs the hostel and buses.
  const bank = await k.q<{ id: string; code: string }>("select id, code from acct_accounts where tenant_id = $1 and code in ('1000','1010')", [t]);
  const bankId = bank.find((b) => b.code === '1010')?.id ?? null;
  const cashId = bank.find((b) => b.code === '1000')?.id ?? null;
  const [college] = await k.q<{ id: string }>(
    "insert into fee_accounts (tenant_id, code, name, legal_name, kind, pan, gstin, address, bank_account_id, cash_account_id, receipt_prefix, upi_vpa, upi_payee_name, tally_company, is_default, sort_order) values ($1,'SPUC','Soundarya PU College','Soundarya Pre-University College','institution','AAATS1234K',null,'Soundarya Nagar, Sidedahalli, Bengaluru 560073',$2,$3,null,'soundaryapuc@sbi','Soundarya PU College','Soundarya PU College',true,1) returning id",
    [t, bankId, cashId],
  );
  const [trust] = await k.q<{ id: string }>(
    "insert into fee_accounts (tenant_id, code, name, legal_name, kind, pan, gstin, reg_80g, address, bank_account_id, cash_account_id, receipt_prefix, upi_vpa, upi_payee_name, tally_company, sort_order) values ($1,'SET','Soundarya Educational Trust','Soundarya Educational Trust (Regd.)','trust','AAATS5678M','29AAATS5678M1Z2','AAATS5678MF20214','Soundarya Nagar, Sidedahalli, Bengaluru 560073',$2,$3,'SET/{FY}/','soundaryatrust@hdfcbank','Soundarya Educational Trust','Soundarya Educational Trust',2) returning id",
    [t, bankId, cashId],
  );
  // Hostel, mess and transport are the trust's; everything else stays with the college.
  await k.q("update fee_heads set fee_account_id = $2 where tenant_id = $1 and (code ilike any(array['HOST%','MESS%','TRAN%','BUS%']) or name ilike any(array['%hostel%','%mess%','%transport%','%bus%']))", [t, trust.id]);
  await k.q('update fee_heads set fee_account_id = $2 where tenant_id = $1 and fee_account_id is null', [t, college.id]);

  // 2. The trust's own gateway: Cashfree's sandbox, switched off until the trust's sandbox keys are entered.
  // Encrypted with the same key the gateway service reads with (none configured: no gateway sample).
  const box = SecretBox.fromEnv(loadEnv());
  if (box) await k.q(
    "insert into payment_gateway_accounts (tenant_id, fee_account_id, provider, mode, active, key_id, key_secret_enc, key_secret_last4, webhook_secret_enc, updated_by) values ($1,$2,'cashfree','test',false,'TEST-APP-ID-REPLACE',$3,'LACE',$4,$5)",
    [t, trust.id, box.encrypt('replace-with-cashfree-test-secret', gatewayAad(t, trust.id, 'key_secret')), box.encrypt('replace-with-cashfree-test-secret', gatewayAad(t, trust.id, 'webhook_secret')), c.byEmail.admin.id],
  );

  // 3. Online rules and the reminder schedule (a week before, on the day, then escalating).
  await k.q('update fee_accounts_settings set online = $2::jsonb, escalations = $3::jsonb where tenant_id = $1', [
    t,
    JSON.stringify({ allowPartial: true, minPartRupees: 1000, linkValidDays: 7, pollAfterMinutes: 30 }),
    JSON.stringify([
      { offsetDays: -7, audience: ['family'], channels: ['app', 'sms'] },
      { offsetDays: 0, audience: ['family'], channels: ['app', 'sms', 'whatsapp'] },
      { offsetDays: 7, audience: ['family', 'class_teacher'], channels: ['app', 'whatsapp'] },
      { offsetDays: 15, audience: ['family', 'principal'], channels: ['app', 'sms', 'email'], minRupees: 5000 },
      { offsetDays: 30, audience: ['accountant', 'principal'], channels: ['app', 'email'], minRupees: 10000 },
    ]),
  ]);

  // 4. Fee references (quoted in NEFT narrations and on challans; the bank import matches on them).
  const flagship = await service(FeeFlagshipController);
  await flagship.generateRefs(accounts, { prefix: 'SPU' });

  // 5. Government scholarships: Karnataka SSP post-matric in each state, and one central scheme.
  const due = await k.q<{ invoiceId: string; studentId: string; balance: string }>(
    "select i.id as \"invoiceId\", i.student_id as \"studentId\", (i.amount_paise - i.paid_paise)::bigint as balance from fee_invoices i where i.tenant_id = $1 and i.status = 'due' and i.amount_paise - i.paid_paise >= 2000000 order by i.due_on, i.id limit 12",
    [t],
  );
  const ay = (() => {
    const y = Number(c.today.slice(0, 4));
    const s = Number(c.today.slice(5, 7)) >= 4 ? y : y - 1;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  })();
  const ssp: { scheme: string; portal: string; app: string; category: string; applied: number; status: string; portalStatus: string; hold: boolean; verified?: boolean; sanctioned?: number }[] = [
    { scheme: 'Post-matric fee concession (SC/ST)', portal: 'ssp', app: 'SSP2026KA0031101', category: 'SC', applied: 18_000, status: 'applied', portalStatus: 'Pending at institute', hold: true },
    { scheme: 'Post-matric scholarship (OBC Cat-1)', portal: 'ssp', app: 'SSP2026KA0031102', category: 'Cat-1', applied: 12_000, status: 'applied', portalStatus: 'Approved by HOI', hold: true, verified: true },
    { scheme: 'Vidyasiri (BC)', portal: 'ssp', app: 'SSP2026KA0031103', category: '2A', applied: 15_000, status: 'sanctioned', portalStatus: 'Sanctioned, awaiting DBT', hold: true, verified: true, sanctioned: 15_000 },
    { scheme: 'Post-matric fee concession (SC/ST)', portal: 'ssp', app: 'SSP2026KA0031104', category: 'ST', applied: 20_000, status: 'rejected', portalStatus: 'Rejected: income certificate expired', hold: false },
    { scheme: 'Central Sector Scheme of Scholarships', portal: 'central', app: 'NSP2026KA00087231', category: 'General', applied: 12_000, status: 'sanctioned', portalStatus: 'Sanctioned (NSP)', hold: true, verified: true, sanctioned: 12_000 },
  ];
  for (const [i, s] of ssp.entries()) {
    const inv = due[i];
    if (!inv) break;
    const [row] = await k.q<{ id: string }>(
      'insert into fee_govt_scholarships (tenant_id, student_id, scheme, portal, application_no, academic_year, status, applied_paise, applied_on, sanctioned_paise, sanctioned_on, expected_paise, hold_dues, portal_status, category, invoice_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) on conflict (tenant_id, portal, application_no) do nothing returning id',
      [t, inv.studentId, s.scheme, s.portal, s.app, ay, s.status, rupees(s.applied), d(-40 + i), rupees(s.sanctioned ?? 0), s.sanctioned ? d(-6) : null, s.status === 'rejected' ? 0 : rupees(s.sanctioned ?? s.applied), s.hold, s.portalStatus, s.category, inv.invoiceId, c.byEmail.accounts.id],
    );
    // The institution verifies an application before the portal sanctions it.
    if (row && s.verified) {
      await k.q("update fee_govt_scholarships set status = 'applied' where id = $1", [row.id]);
      await flagship.verify(accounts, row.id, { on: d(-20 + i), portalStatus: s.portalStatus });
      if (s.status !== 'applied') await k.q('update fee_govt_scholarships set status = $2 where id = $1', [row.id, s.status]);
    }
  }

  // 6. Payment links: two sent by SMS and WhatsApp (one opened), one cancelled after the family paid at the counter.
  const links = await service(PaymentLinksController);
  const linkFor = due.slice(5, 8);
  for (const [i, inv] of linkFor.entries()) {
    const l = (await links.create(accounts, { invoiceId: inv.invoiceId, channels: i === 1 ? ['sms', 'whatsapp', 'email'] : ['sms', 'whatsapp'], validDays: 7 } as never)) as { id: string };
    if (i === 0) await k.q('update fee_payment_links set opened_at = now() - interval \'2 hours\' where id = $1', [l.id]);
    if (i === 2) await links.cancel(principal, l.id);
  }

  // 7. A UPI payment entered twice at the counter (same reference): the second is flagged for the accountant.
  const [line] = await k.q<{ studentId: string }>(
    "select i.student_id as \"studentId\" from fee_invoices i where i.tenant_id = $1 and i.status = 'due' and i.amount_paise - i.paid_paise >= 100000 and i.student_id <> all($2::uuid[]) order by i.due_on desc, i.id limit 1",
    [t, due.map((x) => x.studentId)],
  );
  if (line) {
    const counter = await service(CollectionController);
    // Paid against the oldest dues first, as the counter does when no split is given.
    const body = { studentId: line.studentId, modes: [{ method: 'upi', amountPaise: rupees(500), reference: 'UPI-SEED-448812' }] };
    try {
      await counter.collect(accounts, body as never);
      await counter.collect(accounts, body as never);
    } catch (e) {
      console.warn('  (duplicate sample skipped:', (e as Error).message, ')');
    }
  }
}
