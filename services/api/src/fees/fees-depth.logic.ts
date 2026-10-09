// Pure rules for fee instalments and late fees.

export interface PlanPart {
  percent: number;
  dueAfterDays: number;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The parts must add up to 100% and each must come later than the one before. */
export function planProblem(parts: PlanPart[]): string | null {
  if (parts.length < 2 || parts.length > 12) return 'A plan has two to twelve instalments';
  const total = Math.round(parts.reduce((a, p) => a + p.percent, 0) * 100) / 100;
  if (total !== 100) return `The instalments add up to ${total}%, not 100%`;
  for (let i = 1; i < parts.length; i++) if (parts[i].dueAfterDays <= parts[i - 1].dueAfterDays) return 'Each instalment must fall due after the one before';
  return null;
}

/** Splits an invoice by the plan; the last instalment takes the rounding remainder so the parts add up exactly. */
export function splitInstalments(amountPaise: number, dueOn: string, parts: PlanPart[]): { seq: number; dueOn: string; amountPaise: number }[] {
  let given = 0;
  return parts.map((p, i) => {
    const amount = i === parts.length - 1 ? amountPaise - given : Math.round((amountPaise * p.percent) / 100);
    given += amount;
    return { seq: i + 1, dueOn: addDays(dueOn, p.dueAfterDays), amountPaise: amount };
  });
}

/** Pays instalments off in order from what the invoice has received. */
export function allocatePaid(instalments: { seq: number; dueOn: string; amountPaise: number }[], paidPaise: number, today: string) {
  let left = paidPaise;
  return instalments.map((i) => {
    const paid = Math.min(i.amountPaise, left);
    left -= paid;
    const status = paid >= i.amountPaise ? 'paid' : i.dueOn < today ? 'overdue' : paid > 0 ? 'partial' : 'due';
    return { ...i, paidPaise: paid, status };
  });
}

export interface LateRule {
  graceDays: number;
  flatPaise: number;
  perDayPaise: number;
  capPaise: number | null;
}

/** The fine so far: nothing within the grace days, then a flat amount plus a daily amount, up to the cap. */
export function lateFee(rule: LateRule, daysOverdue: number): { daysLate: number; amountPaise: number } {
  const daysLate = Math.max(0, daysOverdue - rule.graceDays);
  if (daysLate === 0) return { daysLate: 0, amountPaise: 0 };
  const raw = rule.flatPaise + rule.perDayPaise * daysLate;
  return { daysLate, amountPaise: rule.capPaise === null ? raw : Math.min(rule.capPaise, raw) };
}
