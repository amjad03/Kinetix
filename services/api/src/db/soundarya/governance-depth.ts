/** Business rules, incidents, file retention, the KINETIX subscription with invoices, AI evaluation cases and a tutor conversation. */
import { computeInvoice, invoiceNumber, planByCode } from '../../billing/billing.logic.js';
import type { Ctx } from './ctx.js';
import { addDays, at, Json } from './kit.js';

export async function governanceDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const admin = c.byEmail.admin.id;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  // Business rules: two approved (four-eyes), one version replaced by a newer one, one waiting for review.
  const year = c.today.slice(0, 4);
  await k.ins('business_rules', [
    { domain: 'grading', key: 'pass-mark', version: 1, title: 'Pass mark 35% in each paper', description: 'Bangalore University NEP regulation for UG programmes.', params: { passPercent: 35 }, status: 'approved', effectiveFrom: `${Number(year) - 1}-08-01`, effectiveTo: addDays(`${year}-08-01`, -1), authorId: principal, approverId: admin, approvedAt: hoursAgo(24 * 400) },
    { domain: 'grading', key: 'pass-mark', version: 2, title: 'Pass mark 40% overall with 35% in each paper', description: 'Revised after the academic council meeting.', params: { passPercent: 35, overallPercent: 40 }, status: 'approved', effectiveFrom: `${year}-08-01`, authorId: principal, approverId: admin, approvedAt: hoursAgo(24 * 70) },
    { domain: 'attendance', key: 'exam-eligibility', version: 1, title: 'At least 75% attendance to sit the examination', description: 'Condonation up to 10 points with a medical certificate.', params: { thresholdPercent: 75, condonationPoints: 10 }, status: 'approved', effectiveFrom: `${Number(year) - 1}-08-01`, authorId: principal, approverId: admin, approvedAt: hoursAgo(24 * 400) },
    { domain: 'credits', key: 'minimum-per-semester', version: 1, title: 'Minimum 18 credits to register in a semester', description: 'CBCS registration.', params: { minCredits: 18, maxCredits: 28 }, status: 'approved', effectiveFrom: `${Number(year) - 1}-08-01`, authorId: admin, approverId: principal, approvedAt: hoursAgo(24 * 380) },
    { domain: 'quota', key: 'admission-seats', version: 1, title: 'Reserved seats by category', description: 'Share of each cycle\'s seats reserved per category; admissions read this before the cycle\'s own quotas.', params: { reservedPercent: { SC: 15, ST: 3 } }, status: 'approved', effectiveFrom: `${Number(year) - 1}-08-01`, authorId: admin, approverId: principal, approvedAt: hoursAgo(24 * 380) },
    { domain: 'quota', key: 'sports-seat', version: 1, title: 'Sports quota: 5% of seats', description: 'Proposed for the next admission cycle; waiting for the principal.', params: { percent: 5 }, status: 'in_review', effectiveFrom: `${Number(year) + 1}-06-01`, authorId: c.byEmail['hod.commerce'].id },
  ], { returning: false });

  // Incidents: a resolved outage with its timeline, and an open data-quality incident.
  const [out] = await k.ins<{ id: string }>('incidents', [{ title: 'Fee receipts failed to print for two hours', severity: 'sev3', category: 'outage', status: 'closed', description: 'The receipt printer service stopped after a certificate renewal.', impact: 'Accounts office wrote manual receipts for 14 payments.', detectedAt: hoursAgo(24 * 9), resolvedAt: hoursAgo(24 * 9 - 2), reportedBy: c.byEmail.accounts.id, ownerId: admin, rootCause: 'The printer service certificate expired.', correctiveActions: 'Renewal reminder added to the operations calendar.' }, { title: 'Duplicate roll numbers in BCA Sem 1 import', severity: 'sev2', category: 'data_quality', status: 'investigating', description: 'Two students share roll number 14 after the last import.', impact: 'Hall tickets cannot be issued for BCA Sem 1 until fixed.', detectedAt: hoursAgo(20), reportedBy: c.byEmail['hod.computers'].id, ownerId: admin }]);
  await k.ins('incident_updates', [
    { incidentId: out.id, kind: 'status', body: 'Incident reported', statusAfter: 'open', authorId: c.byEmail.accounts.id, createdAt: hoursAgo(24 * 9) },
    { incidentId: out.id, kind: 'status', body: 'Certificate renewed and the service restarted', statusAfter: 'resolved', authorId: admin, createdAt: hoursAgo(24 * 9 - 2) },
    { incidentId: out.id, kind: 'status', body: 'Root cause recorded; closed', statusAfter: 'closed', authorId: admin, createdAt: hoursAgo(24 * 8) },
  ], { returning: false });

  // Retention per file category.
  await k.ins('document_retention_policies', [['fee_receipt', 84, 'Tax records are kept for seven years.'], ['admission_form', 120, 'Kept ten years for audit and verification requests.'], ['medical', 36, 'Medical certificates are kept three years after the last claim.'], ['id_proof', 60, 'Kept five years after the student leaves.']].map(([category, retainMonths, note]) => ({ category, retainMonths, note, createdBy: admin })), { returning: false });

  // The KINETIX subscription on the Standard plan, with last month's invoice paid.
  const plan = planByCode('standard')!;
  const [{ n: studentCount }] = await k.q<{ n: number }>("select count(*)::int as n from students where tenant_id = $1 and status = 'active'", [c.tenantId]);
  const [{ n: staffCount }] = await k.q<{ n: number }>('select count(*)::int as n from staff_profiles where tenant_id = $1', [c.tenantId]);
  const usage = { students: studentCount, staff: staffCount, boards: 4, aiCalls: 5200, storageMb: 6400 };
  const periodStart = addDays(c.today, -20);
  await k.one('saas_subscriptions', { planCode: plan.code, interval: 'month', status: 'active', startedOn: addDays(c.today, -140), currentPeriodStart: periodStart, currentPeriodEnd: addDays(periodStart, 29), billingStateCode: '29', gstin: '29AABCS1234F1Z5' });
  for (const [back, seq] of [[-80, 1], [-50, 2]] as const) {
    const start = addDays(c.today, back);
    const end = addDays(start, 29);
    const inv = computeInvoice(plan, 'month', usage, '29');
    const issued = addDays(end, 1);
    await k.one('saas_invoices', { number: invoiceNumber(issued, seq), periodStart: start, periodEnd: end, planCode: plan.code, lines: new Json(inv.lines), subtotalPaise: inv.subtotalPaise, taxPaise: inv.taxPaise, taxBreakdown: inv.taxBreakdown, totalPaise: inv.totalPaise, status: 'paid', issuedOn: issued, dueOn: addDays(issued, 15), paidOn: addDays(issued, 6), paymentRef: `NEFT${100000 + seq * 777}` });
    await k.one('saas_usage_snapshots', { periodStart: start, ...usage, takenAt: at(end, '23:00') });
  }

  // AI evaluation cases and a tutor conversation that remembers.
  await k.ins('ai_eval_cases', [
    { name: 'Photosynthesis explained simply', task: 'explain', input: { question: 'What is photosynthesis?', language: 'en' }, mustInclude: new Json(['photosynthesis']), mustNotInclude: new Json(['I cannot help']), maxChars: 4000, createdBy: admin },
    { name: 'Accounting equation', task: 'explain', input: { question: 'Explain the accounting equation with an example', language: 'en' }, mustInclude: new Json(['accounting equation']), mustNotInclude: new Json([]), maxChars: 4000, createdBy: admin },
    { name: 'Tutor follows the question', task: 'tutor', input: { question: 'Why does a trial balance balance?', history: [], context: {}, language: 'en' }, mustInclude: new Json(['trial balance']), mustNotInclude: new Json([]), maxChars: 5000, createdBy: admin },
  ], { returning: false });
  const st = c.students.find((x) => x.userId) ?? c.students[0];
  const thread = await k.one<{ id: string }>('ai_tutor_threads', { studentId: st.id, title: 'Why does a trial balance balance?' });
  await k.ins('ai_tutor_messages', [
    { threadId: thread.id, role: 'student', content: 'Why does a trial balance balance?', createdAt: hoursAgo(30) },
    { threadId: thread.id, role: 'tutor', content: 'Every transaction is recorded twice, once as a debit and once as a credit of the same amount, so the two totals match. Try recording three transactions and totalling both sides.', createdAt: hoursAgo(30) },
    { threadId: thread.id, role: 'student', content: 'What if the totals do not match?', createdAt: hoursAgo(29) },
    { threadId: thread.id, role: 'tutor', content: 'Then there is an error: a one-sided entry, a wrong amount on one side, or an addition mistake. Check the difference first; if it is divisible by nine, two digits may have been swapped.', createdAt: hoursAgo(29) },
  ], { returning: false });
}
