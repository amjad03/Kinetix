/** Fees flagship: pure rules (programme transfer maths, the Zoho Books journal file, government scholarship status files). */

import { csvCells } from '../fees/settlements.controller.js';
import { rupeesToPaise } from '../fees/payment-provider.js';

/**
 * A move to another programme part way through the year. The old fee is kept for the share of the year used and the
 * new fee charged for the rest; money already paid beyond the kept share is not refunded but counts against the new
 * fee (it reduces the new invoice), so the total is old × used + new × (1 − used) whatever was paid.
 */
export function transferPlan(o: { oldNetPaise: number; oldPaidPaise: number; newFullPaise: number; usedPercent: number }) {
  const used = Math.max(0, Math.min(100, Math.round(o.usedPercent)));
  const keep = Math.round((o.oldNetPaise * used) / 100);
  const newCharge = Math.round((o.newFullPaise * (100 - used)) / 100);
  // The old invoice cannot go below what was paid on it.
  const oldAfter = Math.max(keep, Math.min(o.oldPaidPaise, o.oldNetPaise));
  const carriedOver = oldAfter - keep;
  return { usedPercent: used, keepPaise: keep, reduceOldPaise: o.oldNetPaise - oldAfter, oldAfterPaise: oldAfter, newChargePaise: newCharge, paidCountedOnNewPaise: Math.min(carriedOver, newCharge), totalPaise: keep + newCharge };
}

/** The share of the year used by `on`: months from the start, inclusive of the month left, 0 to 100. */
export function usedPercent(start: string, end: string, on: string): number {
  if (on <= start) return 0;
  if (on > end) return 100;
  const months = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  const total = months(start, end) + 1;
  return Math.max(0, Math.min(100, Math.round((months(start, on) / total) * 100)));
}

const rs = (paise: number) => (paise / 100).toFixed(2);
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export interface JournalVoucher {
  date: string;
  number: string;
  narration: string;
  voucherType: string;
  lines: { accountName: string; code: string; debitPaise: number; creditPaise: number }[];
}

/**
 * Vouchers as Zoho Books' manual journal import file (Accountant → Manual Journals → Import): one row per line, the
 * journal's rows sharing its date and number; amounts in rupees with two decimals.
 */
export function zohoJournalCsv(vouchers: JournalVoucher[], currency = 'INR'): string {
  const head = ['Journal Date', 'Journal Number', 'Reference Number', 'Notes', 'Journal Type', 'Currency', 'Account', 'Description', 'Debit', 'Credit'];
  const rows = [head.join(',')];
  for (const v of vouchers) {
    for (const l of v.lines) {
      rows.push([v.date, v.number, v.number, v.narration, 'both', currency, l.accountName, `${v.voucherType} ${l.code}`, l.debitPaise ? rs(l.debitPaise) : '', l.creditPaise ? rs(l.creditPaise) : ''].map((x) => cell(String(x))).join(','));
    }
  }
  return `${rows.join('\n')}\n`;
}

export interface PortalStatusRow {
  applicationNo: string;
  status: 'applied' | 'verified' | 'sanctioned' | 'received' | 'rejected';
  portalStatus: string;
  sanctionedPaise: number | null;
  disbursedPaise: number | null;
  on: string | null;
}

/** "Approved by HOI" and the like to the tracker's status (Karnataka SSP, NSP and state portals' wording). */
export function portalStatusOf(text: string): PortalStatusRow['status'] {
  const t = text.toLowerCase();
  if (/reject|defect|not eligible|cancel/.test(t)) return 'rejected';
  if (/disburs|paid|credited|dbt success|fund transfer/.test(t)) return 'received';
  if (/sanction|approved by (dept|department|state|ministry)|approved for payment/.test(t)) return 'sanctioned';
  if (/verif|approved by (hoi|institute|institution|college|principal)|forwarded/.test(t)) return 'verified';
  return 'applied';
}

const day = (s: string): string | null => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/**
 * A scholarship portal's status export (CSV with a header row). Columns understood: application number
 * ("Application No", "SSP ID", "Application ID"), status ("Status", "Application Status", "Current Status"),
 * sanctioned amount, disbursed amount (rupees) and a date ("Disbursed Date", "Status Date", DD-MM-YYYY or ISO).
 */
export function parsePortalStatusCsv(text: string): PortalStatusRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('The file has no rows');
  const head = csvCells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iApp = col('applicationno', 'applicationnumber', 'applicationid', 'sspid', 'nspid', 'appno');
  const iStatus = col('status', 'applicationstatus', 'currentstatus');
  if (iApp < 0 || iStatus < 0) throw new Error('The file needs an application number and a status column');
  const iSan = col('sanctionedamount', 'sanctioned', 'approvedamount', 'amountsanctioned');
  const iDis = col('disbursedamount', 'disbursed', 'amountdisbursed', 'paidamount', 'amountpaid');
  const iDate = col('disburseddate', 'statusdate', 'date', 'paymentdate');
  return lines.slice(1).map((l) => {
    const c = csvCells(l);
    const amount = (i: number) => (i >= 0 && c[i] ? rupeesToPaise(c[i]) : null);
    const san = amount(iSan);
    const dis = amount(iDis);
    return { applicationNo: c[iApp], status: portalStatusOf(c[iStatus] ?? ''), portalStatus: (c[iStatus] ?? '').slice(0, 120), sanctionedPaise: san !== null && Number.isFinite(san) ? san : null, disbursedPaise: dis !== null && Number.isFinite(dis) ? dis : null, on: iDate >= 0 ? day(c[iDate] ?? '') : null };
  }).filter((r) => r.applicationNo);
}
