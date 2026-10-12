/** Soundarya samples for the fees and accounts desk: settings, fee structures in each approval state, concessions, cheques, refunds, write-offs, vouchers awaiting approval, cash closings and a closed month. Safe to run twice. */
import { DEFAULT_APPROVALS, DEFAULT_HEADS, DEFAULT_MAPPINGS, DEFAULT_MODES, DEFAULT_SERIES } from '../../fee-accounts/fee-accounts.logic.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

export async function feeAccountsSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const t = c.tenantId;
  const [done] = await k.q<{ n: number }>('select count(*)::int as n from fee_concessions where tenant_id = $1', [t]);
  if (done.n > 0) return;
  const principal = c.byEmail.principal.id;
  const acc = c.byEmail.accounts.id;
  const admin = c.byEmail.admin.id;
  const d = (n: number) => addDays(c.today, n);
  const fy = (date: string) => {
    const y = Number(date.slice(0, 4));
    const s = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  };
  const FY = fy(c.today);

  // Invoice numbers for every invoice so far, oldest first.
  await k.q(
    `update fee_invoices i set invoice_no = x.no from (
       select id, 'INV/' || case when extract(month from created_at) >= 4 then extract(year from created_at)::int else extract(year from created_at)::int - 1 end || '-' ||
         lpad(((case when extract(month from created_at) >= 4 then extract(year from created_at)::int else extract(year from created_at)::int - 1 end + 1) % 100)::text, 2, '0') || '/' ||
         lpad(row_number() over (order by created_at, id)::text, 5, '0') as no
       from fee_invoices where tenant_id = $1 and invoice_no is null) x where i.id = x.id`,
    [t],
  );
  const [{ n: invoices }] = await k.q<{ n: number }>('select count(*)::int as n from fee_invoices where tenant_id = $1', [t]);

  const next = { concession: 5, refund: 4, writeOff: 3, voucher: 4 };
  await k.ins('fee_accounts_settings', {
    series: J({ ...DEFAULT_SERIES, invoice: { ...DEFAULT_SERIES.invoice, next: invoices + 1 }, concession: { ...DEFAULT_SERIES.concession, next: next.concession }, refund: { ...DEFAULT_SERIES.refund, next: next.refund }, writeOff: { ...DEFAULT_SERIES.writeOff, next: next.writeOff }, voucher: { ...DEFAULT_SERIES.voucher, next: next.voucher } }),
    feeHeads: J(DEFAULT_HEADS),
    paymentModes: J(DEFAULT_MODES),
    gateway: 'razorpay',
    mappings: J(DEFAULT_MAPPINGS),
    approvals: J({ ...DEFAULT_APPROVALS, concessionLimitRupees: 2000 }),
    updatedBy: admin,
  }, { returning: false });

  // Fee structures for next year in each state of the approval route.
  const nextYear = `${Number(FY.slice(0, 4)) + 1}-${String((Number(FY.slice(0, 4)) + 2) % 100).padStart(2, '0')}`;
  const progs = Object.values(c.programs);
  const plan = (base: number) => [
    { head: 'Tuition', amountPaise: rupees(base) },
    { head: 'Examination', amountPaise: rupees(3500) },
    { head: 'Laboratory', amountPaise: rupees(4500) },
    { head: 'Library and sports', amountPaise: rupees(2500) },
  ];
  const structures: [string, number, string, Record<string, unknown>][] = [
    ['BCom fee plan', 38000, 'pending', { submittedBy: acc, submittedAt: at(d(-2)) }],
    ['BSc fee plan', 42000, 'approved', { submittedBy: acc, submittedAt: at(d(-6)), decidedBy: principal, decidedAt: at(d(-5)), decisionNote: 'Matches the governing council resolution.' }],
    ['BCA fee plan', 45000, 'draft', {}],
    ['BBA fee plan', 40000, 'rejected', { submittedBy: acc, submittedAt: at(d(-9)), decidedBy: principal, decidedAt: at(d(-8)), decisionNote: 'Laboratory fee is not charged in BBA; remove it and send again.' }],
  ];
  for (const [i, [name, base, status, extra]] of structures.entries()) {
    const [row] = await k.ins<{ id: string }>('fee_structures', { programId: progs[i % progs.length]?.id ?? null, campusId: c.campusId, name: `${name} ${nextYear}`, academicYear: nextYear, items: J(plan(base)), dueInDays: 30, active: false, status, createdBy: acc, ...extra });
    await k.ins('audit_log', [{ actorType: 'user', actorId: acc, action: 'fee_structure.created', subjectType: 'fee_structure', subjectId: row.id, at: at(d(-10)) }, ...(extra.submittedBy ? [{ actorType: 'user', actorId: acc, action: 'fee_structure.submitted', subjectType: 'fee_structure', subjectId: row.id, at: extra.submittedAt }] : []), ...(extra.decidedBy ? [{ actorType: 'user', actorId: principal, action: `fee_structure.${status}`, subjectType: 'fee_structure', subjectId: row.id, data: J({ comment: extra.decisionNote }), at: extra.decidedAt }] : [])], { returning: false });
  }

  // Concessions: two applied, one waiting for the principal, one turned down.
  const due = await k.q<{ id: string; studentId: string; amountPaise: string; paidPaise: string }>("select id, student_id, amount_paise, paid_paise from fee_invoices where tenant_id = $1 and status = 'due' and amount_paise - paid_paise > 500000 order by due_on, id limit 8", [t]);
  const cons: [string, number | null, number, string, string, string | null][] = [
    ['sibling', 10, 0, 'approved', 'Second child of the same family studying here.', null],
    ['merit', null, rupees(5000), 'approved', 'University rank holder in the previous semester.', null],
    ['sponsor', null, rupees(12000), 'pending', 'Rotary Club Mangaluru sponsors this student’s tuition.', 'Rotary Club Mangaluru'],
    ['staff_ward', 25, 0, 'rejected', 'Ward of a contract staff member.', null],
  ];
  for (const [i, [kind, percent, amount, status, reason, sponsor]] of cons.entries()) {
    const inv = due[i];
    if (!inv) break;
    const value = percent ? Math.round((Number(inv.amountPaise) * percent) / 100) : amount;
    const applied = status === 'approved' ? Math.min(value, Number(inv.amountPaise) - Number(inv.paidPaise)) : 0;
    const [row] = await k.ins<{ id: string }>('fee_concessions', { number: `CON/${FY}/${String(i + 1).padStart(4, '0')}`, studentId: inv.studentId, invoiceId: inv.id, kind, sponsorName: sponsor, percent, amountPaise: value, appliedPaise: applied, reason, status, requestedBy: acc, decidedBy: status === 'pending' ? null : principal, decidedAt: status === 'pending' ? null : at(d(-3 + i)), decisionNote: status === 'rejected' ? 'Contract staff wards are not covered by the policy.' : null, createdAt: at(d(-6 + i)) });
    if (applied) await k.q('update fee_invoices set amount_paise = amount_paise - $1 where id = $2', [applied, inv.id]);
    await k.ins('audit_log', [{ actorType: 'user', actorId: acc, action: 'concession.requested', subjectType: 'fee_concession', subjectId: row.id, at: at(d(-6 + i)) }, ...(status === 'pending' ? [] : [{ actorType: 'user', actorId: principal, action: `concession.${status}`, subjectType: 'fee_concession', subjectId: row.id, at: at(d(-3 + i)) }])], { returning: false });
  }

  // The cheque register: received, deposited, cleared and one returned by the bank.
  const cheques = await k.q<{ id: string; invoiceId: string; studentId: string; amountPaise: string; reference: string | null; paidAt: Date }>("select id, invoice_id, student_id, amount_paise, reference, paid_at from fee_payments where tenant_id = $1 and method = 'cheque' and status = 'paid' order by paid_at desc limit 6", [t]);
  const banks = ['Canara Bank', 'Karnataka Bank', 'State Bank of India', 'Corporation Bank', 'HDFC Bank', 'Canara Bank'];
  for (const [i, p] of cheques.entries()) {
    const status = ['received', 'deposited', 'cleared', 'cleared', 'bounced', 'cleared'][i];
    const paid = p.paidAt.toISOString().slice(0, 10);
    const no = p.reference?.match(/\d{6}/)?.[0] ?? String(100200 + i);
    const [row] = await k.ins<{ id: string }>('fee_cheques', { paymentId: p.id, studentId: p.studentId, chequeNo: no, bankName: banks[i], chequeDate: paid, amountPaise: Number(p.amountPaise), status, depositedOn: status === 'received' ? null : addDays(paid, 1), clearedOn: status === 'cleared' ? addDays(paid, 3) : null, bouncedOn: status === 'bounced' ? addDays(paid, 3) : null, bounceReason: status === 'bounced' ? 'Funds insufficient' : null, bounceChargePaise: status === 'bounced' ? rupees(500) : 0, createdBy: acc });
    if (status === 'bounced') {
      await k.q("update fee_payments set status = 'failed' where id = $1", [p.id]);
      await k.q("update fee_invoices set paid_paise = paid_paise - $1, status = 'due' where id = $2", [Number(p.amountPaise), p.invoiceId]);
      const [inv] = await k.q<{ sectionId: string }>('select section_id from fee_invoices where id = $1', [p.invoiceId]);
      const [charge] = await k.ins<{ id: string }>('fee_invoices', { studentId: p.studentId, sectionId: inv.sectionId, batchId: row.id, title: `Cheque return charge (${no})`, invoiceNo: `INV/${FY}/${String(invoices + 1).padStart(5, '0')}`, amountPaise: rupees(500), dueOn: addDays(paid, 10), createdBy: acc });
      await k.q('update fee_cheques set charge_invoice_id = $1 where id = $2', [charge.id, row.id]);
      await k.q("update fee_accounts_settings set series = jsonb_set(series, '{invoice,next}', to_jsonb($1::int)) where tenant_id = $2", [invoices + 2, t]);
    }
    await k.ins('audit_log', { actorType: 'user', actorId: acc, action: `cheque.${status}`, subjectType: 'fee_cheque', subjectId: row.id, at: at(addDays(paid, 1)) }, { returning: false });
  }

  // Refunds: one waiting, one approved for payment, one paid.
  const upi = await k.q<{ id: string; invoiceId: string; studentId: string; amountPaise: string; receiptNo: string }>("select p.id, p.invoice_id, p.student_id, p.amount_paise, p.receipt_no from fee_payments p where p.tenant_id = $1 and p.method in ('upi', 'bank_transfer') and p.status = 'paid' and not exists (select 1 from fee_refunds r where r.payment_id = p.id) order by p.paid_at desc limit 3", [t]);
  const refunds: [string, number, string][] = [
    ['requested', rupees(2500), 'Paid the hostel deposit twice.'],
    ['approved', rupees(4000), 'Withdrew from the optional French course.'],
    ['paid', rupees(1500), 'Excess fee collected for the industrial visit.'],
  ];
  for (const [i, [status, amount, reason]] of refunds.entries()) {
    const p = upi[i];
    if (!p) break;
    let refundId: string | null = null;
    if (status === 'paid') {
      const [r] = await k.ins<{ id: string }>('fee_refunds', { paymentId: p.id, invoiceId: p.invoiceId, studentId: p.studentId, amountPaise: amount, reason: `RFD/${FY}/0003: ${reason}`, refundedBy: acc, refundedAt: at(d(-1)) });
      refundId = r.id;
      await k.q("update fee_invoices set paid_paise = paid_paise - $1, status = case when status = 'paid' then 'due'::invoice_status else status end where id = $2", [amount, p.invoiceId]);
    }
    const [row] = await k.ins<{ id: string }>('fee_refund_requests', { number: `RFD/${FY}/${String(i + 1).padStart(4, '0')}`, paymentId: p.id, invoiceId: p.invoiceId, studentId: p.studentId, amountPaise: amount, reason, status, requestedBy: acc, decidedBy: status === 'requested' ? null : principal, decidedAt: status === 'requested' ? null : at(d(-2)), payMode: status === 'paid' ? 'bank_transfer' : null, payReference: status === 'paid' ? 'NEFT SBIN26101400' : null, refundId, paidBy: status === 'paid' ? acc : null, paidAt: status === 'paid' ? at(d(-1)) : null, createdAt: at(d(-4 + i)) });
    await k.ins('audit_log', [{ actorType: 'user', actorId: acc, action: 'refund.requested', subjectType: 'fee_refund_request', subjectId: row.id, at: at(d(-4 + i)) }, ...(status === 'requested' ? [] : [{ actorType: 'user', actorId: principal, action: 'refund.approved', subjectType: 'fee_refund_request', subjectId: row.id, at: at(d(-2)) }]), ...(status === 'paid' ? [{ actorType: 'user', actorId: acc, action: 'refund.paid', subjectType: 'fee_refund_request', subjectId: row.id, at: at(d(-1)) }] : [])], { returning: false });
  }

  // Write-offs: one approved, one waiting.
  const old = await k.q<{ id: string; studentId: string; bal: string }>("select id, student_id, (amount_paise - paid_paise) as bal from fee_invoices where tenant_id = $1 and status = 'due' and due_on < $2 and amount_paise - paid_paise between 50000 and 800000 order by due_on limit 2", [t, d(-30)]);
  for (const [i, inv] of old.entries()) {
    const status = i === 0 ? 'approved' : 'pending';
    const amount = Number(inv.bal);
    const [row] = await k.ins<{ id: string }>('fee_write_offs', { number: `WO/${FY}/${String(i + 1).padStart(4, '0')}`, invoiceId: inv.id, studentId: inv.studentId, amountPaise: amount, reason: i === 0 ? 'Student discontinued in the first month; family unreachable after three reminders.' : 'Balance after the death of the parent; the trust has agreed to waive it.', status, requestedBy: acc, decidedBy: status === 'approved' ? principal : null, decidedAt: status === 'approved' ? at(d(-2)) : null, decisionNote: status === 'approved' ? 'Approved by the governing council.' : null });
    if (status === 'approved') await k.q("update fee_invoices set amount_paise = amount_paise - $1, status = 'paid' where id = $2", [amount, inv.id]);
    await k.ins('audit_log', { actorType: 'user', actorId: acc, action: 'write_off.requested', subjectType: 'fee_write_off', subjectId: row.id, at: at(d(-5)) }, { returning: false });
  }

  // Vouchers entered by the accounts clerk, waiting for approval.
  const code = Object.fromEntries((await k.q<{ id: string; code: string }>('select id, code from acct_accounts where tenant_id = $1', [t])).map((a) => [a.code, a.id]));
  if (code['5100'] && code['1010'] && code['1000']) {
    const vrs: [string, string, string, number, [string, number, number][]][] = [
      ['payment', 'pending', 'Electricity bill for the main block (MESCOM)', rupees(46200), [['5100', rupees(46200), 0], ['1010', 0, rupees(46200)]]],
      ['contra', 'pending', 'Cash deposited in Canara Bank', rupees(80000), [['1010', rupees(80000), 0], ['1000', 0, rupees(80000)]]],
      ['payment', 'rejected', 'Refreshments for the parents’ meeting', rupees(9800), [['5100', rupees(9800), 0], ['1000', 0, rupees(9800)]]],
    ];
    for (const [i, [type, status, narration, amount, lines]] of vrs.entries()) {
      const [row] = await k.ins<{ id: string }>('acct_voucher_requests', { number: `VR/${FY}/${String(i + 1).padStart(4, '0')}`, voucherType: type, voucherDate: d(-1 - i), narration, lines: J(lines.map(([c2, dr, cr]) => ({ accountId: code[c2], debitPaise: dr, creditPaise: cr }))), amountPaise: amount, status, requestedBy: acc, decidedBy: status === 'rejected' ? principal : null, decidedAt: status === 'rejected' ? at(d(-1)) : null, decisionNote: status === 'rejected' ? 'Charge this to the PTA fund, not the college.' : null });
      await k.ins('audit_log', { actorType: 'user', actorId: acc, action: 'voucher.requested', subjectType: 'acct_voucher_request', subjectId: row.id, at: at(d(-1 - i)) }, { returning: false });
    }
  }

  // Day-end cash closings by the cashier for the last working days.
  for (const [i, back] of [3, 2, 1].entries()) {
    const day = d(-back);
    const [{ total, n }] = await k.q<{ total: string; n: number }>("select coalesce(sum(amount_paise), 0)::bigint as total, count(*)::int as n from fee_payments where tenant_id = $1 and status = 'paid' and method = 'cash' and recorded_by = $2 and (paid_at at time zone 'Asia/Kolkata')::date = $3::date", [t, acc, day]);
    const system = Number(total);
    const counted = i === 1 ? system - rupees(100) : system;
    const notes500 = Math.floor(counted / 50000);
    const rest = Math.round((counted - notes500 * 50000) / 100);
    const status = i === 2 ? 'submitted' : 'verified';
    await k.ins('fee_cash_closings', { closingDate: day, cashierId: acc, systemPaise: system, countedPaise: counted, receiptCount: n, denominations: J({ 500: notes500, 1: rest }), note: i === 1 ? 'One ₹100 note found torn and returned to the parent.' : '', status, verifiedBy: status === 'verified' ? principal : null, verifiedAt: status === 'verified' ? at(addDays(day, 1), '09:30') : null, decisionNote: i === 1 ? 'Shortage of ₹100 explained; accepted.' : null }, { returning: false });
  }

  // The month before last is closed.
  const closed = addDays(`${c.today.slice(0, 7)}-01`, -32).slice(0, 7);
  await k.q('insert into acct_period_closes (tenant_id, period, closed_by, note) values ($1,$2,$3,$4) on conflict do nothing', [t, closed, acc, 'Bank reconciled and cash verified.']);
}
