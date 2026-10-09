/** Fees (manual payments, no gateway), defaulters, scholarships, welfare, sponsors, budgets and expenses. */
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

const FY = '2026-27';

export async function fees(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const acc = c.byEmail.accounts.id;
  let receipt = 0;
  const methods = ['upi', 'upi', 'upi', 'upi', 'cash', 'cash', 'cheque', 'bank_transfer', 'bank_transfer', 'bank_transfer'] as const;
  const refFor = (m: string, i: number) => (m === 'upi' ? `UPI ${4100 + (i % 800)} ${7000 + ((i * 7) % 2999)} ${1000 + ((i * 13) % 8999)}` : m === 'cheque' ? `CHQ ${100200 + i} Canara Bank` : m === 'bank_transfer' ? `NEFT UTR SBIN${26000000 + i * 17}` : null);
  const payments: Record<string, unknown>[] = [];
  const paidUpdates: [string, number, string][] = [];
  const dueIds: { id: string; studentId: string; amount: number; dueOn: string }[] = [];
  for (const sec of c.sections) {
    const sem = rupees(sec.def.feeInr);
    const examFee = rupees(sec.def.level === 'pg' ? 2400 : 1850);
    const defs = [
      { title: `Semester ${sec.term} tuition fee: Instalment 1`, amount: Math.round(sem / 2), dueOn: '2026-08-14', pays: 'first' as const },
      { title: `Semester ${sec.term} tuition fee: Instalment 2`, amount: Math.round(sem / 2), dueOn: '2026-11-10', pays: 'second' as const },
      { title: `BCU examination fee, Semester ${sec.term}`, amount: examFee, dueOn: '2026-10-30', pays: 'exam' as const },
    ];
    for (const d of defs) {
      const batchId = crypto.randomUUID();
      const inv = await k.ins<{ id: string; studentId: string }>('fee_invoices', sec.students.map((st) => ({ studentId: st.id, sectionId: sec.id, batchId, title: d.title, amountPaise: d.amount, dueOn: d.dueOn, status: 'due', createdBy: acc })));
      inv.forEach((row, i) => {
        const st = sec.students[i];
        // Weaker attendance goes with later payment: the accounts desk sees the same students on both lists.
        const roll = r.next() + (st.presence < 0.7 ? 0.12 : 0);
        let kind: 'full' | 'part' | 'none' = 'none';
        if (d.pays === 'first') kind = roll < 0.78 ? 'full' : roll < 0.9 ? 'part' : 'none';
        else if (d.pays === 'second') kind = roll < 0.1 ? 'full' : 'none';
        else kind = roll < 0.35 ? 'full' : 'none';
        if (kind === 'none') {
          dueIds.push({ id: row.id, studentId: st.id, amount: d.amount, dueOn: d.dueOn });
          return;
        }
        const amount = kind === 'full' ? d.amount : Math.round(d.amount * 0.5);
        const method = r.pick(methods);
        const when = d.pays === 'first' ? addDays('2026-08-01', r.int(0, 21)) : addDays('2026-09-20', r.int(0, 17));
        receipt++;
        payments.push({ invoiceId: row.id, studentId: st.id, amountPaise: amount, method, status: 'paid', reference: refFor(method, receipt), receiptNo: `RCPT/${FY}/${String(receipt).padStart(5, '0')}`, recordedBy: acc, paidAt: at(when, '11:30') });
        paidUpdates.push([row.id, amount, kind === 'full' ? 'paid' : 'due']);
      });
    }
  }
  await k.ins('fee_payments', payments, { returning: false });
  for (const [id, paid, status] of paidUpdates) await k.q('update fee_invoices set paid_paise = $2, status = $3 where id = $1', [id, paid, status]);
  await k.ins('receipt_counters', { financialYear: FY, lastNo: receipt }, { returning: false });

  // Refunds: a duplicate UPI payment and a withdrawn admission.
  const refundable = await k.q<{ id: string; invoiceId: string; studentId: string; amountPaise: string }>("select id, invoice_id, student_id, amount_paise from fee_payments where method = 'upi' order by paid_at limit 2");
  await k.ins('fee_refunds', refundable.map((p, i) => ({ paymentId: p.id, invoiceId: p.invoiceId, studentId: p.studentId, amountPaise: i === 0 ? rupees(2500) : Number(p.amountPaise), reason: i === 0 ? 'Duplicate UPI payment received twice' : 'Admission withdrawn before the semester began', refundedBy: acc, refundedAt: at('2026-09-02', '15:00') })), { returning: false });

  // Parents who say they paid by bank transfer: waiting for the accounts desk to verify.
  const pend = dueIds.filter((d) => d.dueOn === '2026-08-14').slice(0, 7);
  await k.ins('bank_transfer_submissions', pend.map((p, i) => ({ invoiceId: p.id, studentId: p.studentId, submittedBy: c.guardianOf.get(p.studentId)?.[0] ?? c.byEmail.principal.id, amountPaise: p.amount, utr: `SBIN${26551000 + i * 311}`, transferDate: addDays(c.today, -(i % 4) - 1), status: i === 5 ? 'rejected' : i === 6 ? 'verified' : 'pending', reviewedBy: i >= 5 ? acc : null, reviewedAt: i >= 5 ? at(addDays(c.today, -1)) : null, reviewNote: i === 5 ? 'UTR not found in the bank statement' : null })), { returning: false });
}

export async function scholarships(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const acc = c.byEmail.accounts.id;
  const schemes = await k.ins<{ id: string; name: string }>('scholarship_schemes', [
    { name: 'Soundarya Merit Scholarship (25% tuition)', kind: 'percent', value: 25, minPercentage: 85, validUntil: '2027-03-31', active: true },
    { name: 'State Post-Matric Scholarship Top-up', kind: 'fixed', value: rupees(12000), maxIncomePaise: rupees(250000), validUntil: '2027-03-31', active: true },
    { name: 'Girl Child Education Support', kind: 'fixed', value: rupees(8000), maxIncomePaise: rupees(400000), validUntil: '2027-03-31', active: true },
    { name: 'Sports Excellence Concession (10%)', kind: 'percent', value: 10, minPercentage: 60, validUntil: '2027-03-31', active: true },
  ]);
  const eligible = c.students.filter((s) => s.term !== 1 || s.ability > 0.5);
  const apps: Record<string, unknown>[] = [];
  for (let i = 0; i < 26; i++) {
    const st = eligible[(i * 11) % eligible.length];
    const scheme = schemes[i % schemes.length];
    const status = i < 11 ? 'approved' : i < 20 ? 'pending' : i < 24 ? 'rejected' : 'cancelled';
    const awarded = status === 'approved' ? (scheme.name.includes('25%') ? rupees(9000) : scheme.name.includes('10%') ? rupees(3600) : scheme.name.includes('12000') || scheme.name.includes('Post-Matric') ? rupees(12000) : rupees(8000)) : null;
    apps.push({ schemeId: scheme.id, studentId: st.id, incomePaise: rupees(r.int(90, 380) * 1000), note: 'Supporting documents uploaded with the application.', status, requestedBy: c.guardianOf.get(st.id)?.[0] ?? st.userId ?? c.byEmail.principal.id, decidedBy: status === 'pending' ? null : acc, decisionNote: status === 'rejected' ? 'Family income is above the limit of the scheme' : status === 'approved' ? 'Approved by the scholarship committee' : null, decidedAt: status === 'pending' ? null : at('2026-09-15'), awardedPaise: awarded ?? 0, adjustments: J([]) });
  }
  await k.ins('scholarship_applications', apps, { returning: false });

  const wel = c.students.filter((_, i) => i % 53 === 4).slice(0, 6);
  await k.ins('welfare_requests', wel.map((st, i) => ({ studentId: st.id, requestedBy: c.guardianOf.get(st.id)?.[0] ?? c.byEmail.principal.id, kind: ['medical_aid', 'fee_waiver', 'hardship', 'scholarship', 'medical_aid', 'other'][i], title: ['Hospital expenses after a road accident', 'Fee waiver request after father’s job loss', 'Laptop for coursework', 'Merit-cum-means support', 'Dengue treatment expenses', 'Travel support for national level debate'][i], details: 'Details and supporting letters have been given to the counsellor.', amountRequestedPaise: rupees([18000, 21000, 35000, 15000, 9000, 6500][i]), status: ['approved', 'under_review', 'submitted', 'disbursed', 'rejected', 'approved'][i], amountApprovedPaise: [0, 3, 5].includes(i) ? rupees([15000, 0, 0, 15000, 0, 6500][i]) : null, decisionNote: i === 4 ? 'Covered by the student insurance scheme' : null, decidedBy: [0, 3, 4, 5].includes(i) ? acc : null, decidedAt: [0, 3, 4, 5].includes(i) ? at('2026-09-20') : null, disbursedOn: i === 3 ? '2026-09-28' : null })), { returning: false });
}

export async function sponsorsAndBudgets(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const acc = c.byEmail.accounts.id;
  const sponsors = await k.ins<{ id: string; name: string }>('sponsors', [
    { name: 'Bhagirathi Education Trust', contactName: 'Mr. T. R. Venkatesh', contactEmail: 'trustees@bhagirathi.demo.kinetix.in', gstin: '29AAATB1234C1Z5', createdBy: acc },
    { name: 'Nandi Agro Foundation', contactName: 'Mrs. Kalpana Rao', contactEmail: 'csr@nandi-agro.demo.kinetix.in', gstin: '29AAFCN5678D1Z2', createdBy: acc },
    { name: 'Karnataka Women in Business Forum', contactName: 'Ms. Anuradha Shetty', contactEmail: 'secretary@kwbf.demo.kinetix.in', createdBy: acc },
  ]);
  let n = 0;
  for (const [si, sp] of sponsors.entries()) {
    for (let j = 0; j < 2; j++) {
      const kids = c.students.filter((_, i) => i % 29 === si * 3 + j + 1).slice(0, 5);
      const lines = kids.map((st) => ({ studentId: st.id, description: `Tuition sponsorship, Semester ${st.term}: ${st.name}`, amountPaise: rupees(20000) }));
      const total = lines.reduce((a, l) => a + l.amountPaise, 0);
      n++;
      const paid = j === 0 ? total : si === 0 ? Math.round(total / 2) : 0;
      const inv = await k.one<{ id: string }>('sponsor_invoices', { sponsorId: sp.id, invoiceNo: `SINV/${FY}/${String(n).padStart(4, '0')}`, poNumber: `PO-${sp.name.slice(0, 3).toUpperCase()}-${2600 + n}`, title: `${sp.name}: ${j === 0 ? 'Odd semester 2026' : 'Odd semester 2026, supplementary list'}`, amountPaise: total, paidPaise: paid, dueOn: j === 0 ? '2026-09-15' : '2026-10-31', status: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'open', createdBy: acc });
      await k.ins('sponsor_invoice_lines', lines.map((l) => ({ invoiceId: inv.id, ...l })), { returning: false });
      if (paid) await k.ins('sponsor_payments', { invoiceId: inv.id, amountPaise: paid, method: 'bank_transfer', reference: `RTGS HDFCR5260${1000 + n}`, receivedOn: '2026-09-18', recordedBy: acc }, { returning: false });
    }
  }

  // Budgets and spend by department (cost centre) for the fiscal year.
  const depts = Object.entries(c.departments);
  await k.ins('budgets', depts.map(([name, departmentId], i) => ({ departmentId, fiscalYear: FY, amountPaise: rupees([1800000, 1500000, 2200000, 2600000, 600000, 450000][i % 6]), note: `${name}: lab, events, travel and consumables` })), { returning: false });
  const items = ['Guest lecture honorarium', 'Stationery and printing', 'Lab consumables', 'Workshop refreshments', 'Industry visit bus hire', 'Software subscription', 'Seminar banners', 'Faculty development programme fee'];
  await k.ins('cost_expenses', depts.flatMap(([, departmentId], i) => Array.from({ length: 6 }, (_, j) => ({ departmentId, spentOn: addDays('2026-08-05', i * 3 + j * 9), description: items[(i + j * 3) % items.length], amountPaise: rupees(r.int(8, 140) * 500), createdBy: acc }))), { returning: false });
}
