// The refund on a cancelled admission. Defaults follow the UGC refund policy (2018 notification, reiterated since):
// counted from the last date of admission, with a processing charge of at most 5% capped at Rs 5,000 on a full refund.

export interface RefundSlab {
  label: string;
  /** Up to this many days after the last date of admission (negative: before it); null: any later day. */
  uptoDays: number | null;
  percent: number;
  deductionPercent: number;
  deductionCapPaise: number;
}

export const UGC_SLABS: RefundSlab[] = [
  { label: '15 days or more before the last date of admission', uptoDays: -15, percent: 100, deductionPercent: 5, deductionCapPaise: 500_000 },
  { label: 'Less than 15 days before the last date of admission', uptoDays: -1, percent: 90, deductionPercent: 0, deductionCapPaise: 0 },
  { label: '15 days or less after the last date of admission', uptoDays: 15, percent: 80, deductionPercent: 0, deductionCapPaise: 0 },
  { label: '30 days or less after the last date of admission', uptoDays: 30, percent: 50, deductionPercent: 0, deductionCapPaise: 0 },
  { label: 'More than 30 days after the last date of admission', uptoDays: null, percent: 0, deductionPercent: 0, deductionCapPaise: 0 },
];

/** Whole days from the last date of admission to the cancellation (negative when before). */
export function daysFrom(lastDate: string, on: string): number {
  return Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000);
}

/** The slab a cancellation falls in: the first, in order of `uptoDays` (open-ended last), that covers the day. */
export function slabFor(slabs: RefundSlab[], days: number): RefundSlab | null {
  const ordered = [...slabs].sort((a, b) => (a.uptoDays ?? Infinity) - (b.uptoDays ?? Infinity));
  return ordered.find((s) => s.uptoDays === null || days <= s.uptoDays) ?? null;
}

export interface RefundQuote {
  paidPaise: number;
  daysFromLastDate: number;
  slab: string | null;
  percent: number;
  deductionPaise: number;
  refundPaise: number;
}

/** What is refunded of what was paid, under the slabs. */
export function quoteRefund(slabs: RefundSlab[], paidPaise: number, lastDate: string, on: string): RefundQuote {
  const days = daysFrom(lastDate, on);
  const slab = slabFor(slabs.length ? slabs : UGC_SLABS, days);
  if (!slab || paidPaise <= 0) return { paidPaise, daysFromLastDate: days, slab: slab?.label ?? null, percent: slab?.percent ?? 0, deductionPaise: 0, refundPaise: 0 };
  const gross = Math.round((paidPaise * slab.percent) / 100);
  let deduction = Math.round((paidPaise * slab.deductionPercent) / 100);
  if (slab.deductionCapPaise > 0) deduction = Math.min(deduction, slab.deductionCapPaise);
  deduction = Math.min(deduction, gross);
  return { paidPaise, daysFromLastDate: days, slab: slab.label, percent: slab.percent, deductionPaise: deduction, refundPaise: gross - deduction };
}
