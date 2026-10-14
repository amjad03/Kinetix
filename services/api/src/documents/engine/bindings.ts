import type { DocData, DocValue } from '@kinetix/shared';

/**
 * `{{path | filter}}` bindings in template text. Paths walk the document data (`student.name`,
 * `marks.rows.0.subject`); inside a table, `row.<key>` is the current item. Filters: upper, lower,
 * title, initials, money, date, words, default:<text>. A binding with no value renders as ''.
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? below100(n % 100) : ''].filter(Boolean).join(' ');

/** A whole number in Indian-system words: 4,25,00,050 is "Four Crore Twenty-Five Lakh Fifty". */
export function indianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${crore >= 1000 ? indianWords(crore) : below1000(crore)} Crore`);
  const lakh = Math.floor((n % 1e7) / 1e5);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  const thousand = Math.floor((n % 1e5) / 1000);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  const rest = n % 1000;
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** Rupees in words with paise: "Rupees Forty-Two Thousand Five Hundred and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${indianWords(rupees)}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}

/** 1234567.5 as "12,34,567.50" (Indian grouping). */
export function indianMoney(amount: number): string {
  const neg = amount < 0;
  const [whole, frac] = Math.abs(amount).toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${rest ? `${rest},` : ''}${last3}.${frac}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v;
};

const amountOf = (v: string): number | null => {
  const s = v.replace(/^(Rs\.?|₹|INR)\s*/i, '').replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

function applyFilter(value: string, filter: string): string {
  const [name, ...args] = filter.split(':');
  const arg = args.join(':').trim().replace(/^['"]|['"]$/g, '');
  switch (name.trim()) {
    case 'upper':
      return value.toLocaleUpperCase('en-IN');
    case 'lower':
      return value.toLocaleLowerCase('en-IN');
    case 'title':
      return value.replace(/\b([a-z])/g, (c) => c.toUpperCase());
    case 'initials':
      return value.split(/\s+/).filter((w) => /^[\p{L}]/u.test(w) && !/^(dr|mr|mrs|ms|prof|sri|smt)\.?$/i.test(w)).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('');
    case 'money': {
      const n = amountOf(value);
      return n === null ? value : `Rs. ${indianMoney(n)}`;
    }
    case 'words': {
      const n = amountOf(value);
      return n === null ? value : rupeesInWords(n);
    }
    case 'date':
      return longDate(value);
    case 'default':
      return value.trim() ? value : arg;
    default:
      return value;
  }
}

/** The value at a dotted path, or undefined. */
export function lookup(data: DocData, path: string, row?: DocData): DocValue | undefined {
  const parts = path.trim().split('.');
  let cur: DocValue | undefined = parts[0] === 'row' && row ? row : data;
  for (const [i, p] of parts.entries()) {
    if (i === 0 && p === 'row' && row) continue;
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) ? cur[Number(p)] : (cur as DocData)[p];
  }
  return cur;
}

const show = (v: DocValue | undefined): string => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

/** Fills every `{{...}}` in `text`. */
export function bind(text: string, data: DocData, row?: DocData): string {
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const [path, ...filters] = expr.split('|');
    return filters.reduce((v, f) => applyFilter(v, f), show(lookup(data, path, row)));
  });
}

/** Whether a binding path has a value worth showing (for `showIf`). */
export function present(data: DocData, path: string): boolean {
  const v = lookup(data, path.replace(/^\{\{|\}\}$/g, ''));
  return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '' && v !== false;
}

/** The list at a path (table and field-list sources). */
export function list(data: DocData, path: string): DocData[] {
  const v = lookup(data, path);
  return Array.isArray(v) ? v : [];
}
