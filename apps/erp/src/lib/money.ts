// Money is integer paise in the API. Shown as Indian rupees with lakh grouping: ₹1,23,456.

const WHOLE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const EXACT = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (or ₹1,850.50 when there are paise). */
export function formatRupees(paise: number): string {
  const p = Math.round(paise);
  return p % 100 === 0 ? WHOLE.format(p / 100) : EXACT.format(p / 100);
}

/** ₹42.5 L / ₹1.2 Cr for big totals in tiles; exact below a lakh. */
export function formatRupeesShort(paise: number): string {
  const r = Math.round(paise) / 100;
  const trim = (n: number) => n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, '');
  if (Math.abs(r) >= 1e7) return `₹${trim(r / 1e7)} Cr`;
  if (Math.abs(r) >= 1e5) return `₹${trim(r / 1e5)} L`;
  return formatRupees(paise);
}

/**
 * Rupees typed by a person ("1,23,456", "₹ 1850.5", "42500.00") to paise.
 * Returns null for anything else (negative, more than two decimals, not a number).
 */
export function rupeesToPaise(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Paise to a plain rupee string for an input field: 4250000 → "42500", 185050 → "1850.50". */
export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export const PAY_METHODS = ['cash', 'cheque', 'bank_transfer', 'upi'] as const;
export type CounterMethod = (typeof PAY_METHODS)[number];

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  online: 'Online',
};

/** What the reference field asks for, per method. */
export const REFERENCE_LABEL: Record<CounterMethod, string> = {
  cash: 'Note (optional)',
  cheque: 'Cheque number and bank',
  bank_transfer: 'Transaction reference (UTR)',
  upi: 'UPI transaction ID',
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

/** Indian system, for receipts: 4250050 paise → "Rupees Forty-Two Thousand Five Hundred and Fifty Paise only". */
export function rupeesInWords(paise: number): string {
  const p = Math.round(paise);
  let r = Math.floor(p / 100);
  const ps = p % 100;
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7);
  r %= 1e7;
  const lakh = Math.floor(r / 1e5);
  r %= 1e5;
  const thousand = Math.floor(r / 1000);
  r %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? `${below1000(Math.floor(crore / 1000))} Thousand ${below1000(crore % 1000)}`.trim() : below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (r) parts.push(below1000(r));
  const rupees = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  return `${rupees}${ps ? ` and ${below100(ps)} Paise` : ''} only`;
}
