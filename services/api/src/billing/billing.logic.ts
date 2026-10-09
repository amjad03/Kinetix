/** Pure billing rules for the KINETIX subscription (PRD section 66). Money is in paise. No database. */

export interface Plan {
  code: string;
  name: string;
  /** Per active student per month. */
  perStudentPaise: number;
  /** Students billed at least this many, however few are enrolled. */
  minStudents: number;
  includedAiCalls: number;
  includedStorageMb: number;
  boards: number;
  features: string[];
}

export const PLANS: Plan[] = [
  { code: 'starter', name: 'Starter', perStudentPaise: 3000, minStudents: 100, includedAiCalls: 3000, includedStorageMb: 10_240, boards: 2, features: ['ERP core', 'Teacher, student and parent apps', 'Smartboard app'] },
  { code: 'standard', name: 'Standard', perStudentPaise: 5000, minStudents: 200, includedAiCalls: 15_000, includedStorageMb: 51_200, boards: 10, features: ['Everything in Starter', 'AI copilot and tutor', 'Fees, HR, payroll, library, transport', 'Placements, research, quality'] },
  { code: 'enterprise', name: 'Enterprise', perStudentPaise: 8000, minStudents: 1000, includedAiCalls: 100_000, includedStorageMb: 512_000, boards: 100, features: ['Everything in Standard', 'University and multi-campus', 'Priority support and uptime SLA', 'Custom integrations'] },
];

export const planByCode = (code: string) => PLANS.find((p) => p.code === code);

export const GST_RATE_PERCENT = 18;
/** The supplier's GST state code (Karnataka). Billing an institution in the same state splits GST into CGST and SGST. */
export const SUPPLIER_STATE_CODE = '29';
/** Over the included amounts: per 100 AI calls and per GB of storage, per month. */
export const AI_OVERAGE_PER_100_PAISE = 1000;
export const STORAGE_OVERAGE_PER_GB_PAISE = 2000;
/** A yearly plan is billed as 10 months. */
export const YEARLY_MONTHS_BILLED = 10;
export const TRIAL_DAYS = 30;
export const PAYMENT_DUE_DAYS = 15;

export interface Usage {
  students: number;
  staff: number;
  boards: number;
  aiCalls: number;
  storageMb: number;
}

export interface InvoiceLine {
  label: string;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
}

export interface Computed {
  lines: InvoiceLine[];
  subtotalPaise: number;
  taxPaise: number;
  taxBreakdown: { cgstPaise: number; sgstPaise: number; igstPaise: number; ratePercent: number };
  totalPaise: number;
}

/** What one period costs: students (at least the plan's minimum), then AI calls and storage over the plan, then GST. */
export function computeInvoice(plan: Plan, interval: 'month' | 'year', usage: Usage, billingStateCode: string): Computed {
  const months = interval === 'year' ? YEARLY_MONTHS_BILLED : 1;
  // Usage figures are for one month; for a yearly invoice the included amounts scale by 12 and overage is on the monthly peak times 12.
  const span = interval === 'year' ? 12 : 1;
  const billedStudents = Math.max(usage.students, plan.minStudents);
  const lines: InvoiceLine[] = [{ label: `${plan.name} plan: ${billedStudents} students${usage.students < plan.minStudents ? ` (minimum ${plan.minStudents})` : ''}, ${months} month${months === 1 ? '' : 's'}`, quantity: billedStudents * months, unitPaise: plan.perStudentPaise, amountPaise: billedStudents * months * plan.perStudentPaise }];
  const aiOver = Math.max(0, usage.aiCalls - plan.includedAiCalls);
  if (aiOver > 0) {
    const blocks = Math.ceil(aiOver / 100) * span;
    lines.push({ label: `AI calls over ${plan.includedAiCalls.toLocaleString('en-IN')} included (per 100)`, quantity: blocks, unitPaise: AI_OVERAGE_PER_100_PAISE, amountPaise: blocks * AI_OVERAGE_PER_100_PAISE });
  }
  const gbOver = Math.max(0, Math.ceil((usage.storageMb - plan.includedStorageMb) / 1024));
  if (gbOver > 0) {
    const gbs = gbOver * span;
    lines.push({ label: `Storage over ${Math.round(plan.includedStorageMb / 1024)} GB included (per GB)`, quantity: gbs, unitPaise: STORAGE_OVERAGE_PER_GB_PAISE, amountPaise: gbs * STORAGE_OVERAGE_PER_GB_PAISE });
  }
  const subtotalPaise = lines.reduce((n, l) => n + l.amountPaise, 0);
  const taxPaise = Math.round((subtotalPaise * GST_RATE_PERCENT) / 100);
  const intra = billingStateCode === SUPPLIER_STATE_CODE;
  const half = Math.floor(taxPaise / 2);
  const taxBreakdown = intra ? { cgstPaise: half, sgstPaise: taxPaise - half, igstPaise: 0, ratePercent: GST_RATE_PERCENT } : { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise, ratePercent: GST_RATE_PERCENT };
  return { lines, subtotalPaise, taxPaise, taxBreakdown, totalPaise: subtotalPaise + taxPaise };
}

/** YYYY-MM-DD plus whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last day of a period that starts on `start` (inclusive): one calendar month or one year long. */
export function periodEnd(start: string, interval: 'month' | 'year'): string {
  const d = new Date(`${start}T00:00:00Z`);
  const day = d.getUTCDate();
  if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** Indian financial year label for a date: 2026-04-01 to 2027-03-31 is "2026-27". */
export function financialYear(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export const invoiceNumber = (date: string, seq: number) => `KX/${financialYear(date)}/${String(seq).padStart(4, '0')}`;

/** A subscription whose period has ended and that renews on its own. */
export function renewalDue(s: { status: string; autoRenew: boolean; currentPeriodEnd: string }, today: string): boolean {
  return s.autoRenew && (s.status === 'active' || s.status === 'trial' || s.status === 'past_due') && s.currentPeriodEnd < today;
}
