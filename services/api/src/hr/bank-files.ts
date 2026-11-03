/**
 * Salary transfer files in the upload formats of the banks colleges in Karnataka pay through. Each bank's corporate
 * portal takes a file whose columns and order it fixes; a payment to an account at the same bank goes as an internal
 * transfer, others as NEFT. Account numbers reach this file decrypted and nowhere else (payroll.controller.ts).
 *
 * - SBI (CINB / CMP bulk upload, "Salary"): comma separated with a header: beneficiary account, IFSC, name, amount,
 *   mode (SBI for SBI accounts, NEFT otherwise), the debit account and a narration.
 * - Canara Bank (CANDI corporate bulk upload): pipe separated, no header: debit account, beneficiary account, name,
 *   IFSC, amount, mode (TRF within Canara, NEFT otherwise), narration, value date (DD-MM-YYYY).
 * - HDFC Bank (ENet bulk upload): comma separated, no header, the ENet column layout: transaction type (I within HDFC,
 *   N for NEFT), beneficiary code, account, amount, name, eleven empty address and print columns, the customer
 *   reference, seven payment detail columns, cheque number, value date (DD/MM/YYYY), MICR, IFSC, bank name, branch and
 *   e-mail.
 */
import { csv, rs, type BankRow } from './exports.js';

export const BANK_FORMATS = ['generic', 'sbi', 'canara', 'hdfc'] as const;
export type BankFormat = (typeof BANK_FORMATS)[number];

export interface BankFileOptions {
  /** The institution's salary (debit) account. */
  debitAccount: string;
  /** Payment date, YYYY-MM-DD. */
  valueDate: string;
  /** A reference the bank echoes back, such as SAL-2026-10. */
  reference: string;
}

const dmy = (d: string, sep: string) => d.split('-').reverse().join(sep);
/** Bank portals take names in capitals without punctuation beyond spaces, dots and hyphens, at most 35 characters. */
const bankName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 .-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 35);
const narration = (s: string) => s.replace(/[^A-Za-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);

export function sbiFile(rows: BankRow[], o: BankFileOptions): string {
  return csv([
    ['Beneficiary Account Number', 'IFSC', 'Beneficiary Name', 'Amount', 'Payment Mode', 'Debit Account Number', 'Narration'],
    ...rows.map((r) => [r.account, r.ifsc, bankName(r.name), rs(r.netPaise), r.ifsc.startsWith('SBIN') ? 'SBI' : 'NEFT', o.debitAccount, narration(r.narration)]),
  ]);
}

export function canaraFile(rows: BankRow[], o: BankFileOptions): string {
  return rows.map((r) => [o.debitAccount, r.account, bankName(r.name), r.ifsc, rs(r.netPaise), r.ifsc.startsWith('CNRB') ? 'TRF' : 'NEFT', narration(r.narration), dmy(o.valueDate, '-')].join('|')).join('\r\n') + '\r\n';
}

export function hdfcFile(rows: BankRow[], o: BankFileOptions): string {
  return csv(
    rows.map((r, k) => {
      const internal = r.ifsc.startsWith('HDFC');
      const ref = `${o.reference}-${String(k + 1).padStart(4, '0')}`.slice(0, 20);
      return [internal ? 'I' : 'N', '', r.account, rs(r.netPaise), bankName(r.name), '', '', '', '', '', '', '', ref, ref, narration(r.narration), '', '', '', '', '', '', '', dmy(o.valueDate, '/'), '', internal ? '' : r.ifsc, '', '', ''];
    }),
  );
}

/** The transfer file in the chosen bank's format, with its file name. */
export function bankFile(format: BankFormat, rows: BankRow[], o: BankFileOptions, generic: (rows: BankRow[]) => string): { body: string; ext: string; contentType: string } {
  if (format === 'sbi') return { body: sbiFile(rows, o), ext: 'csv', contentType: 'text/csv; charset=utf-8' };
  if (format === 'canara') return { body: canaraFile(rows, o), ext: 'txt', contentType: 'text/plain; charset=utf-8' };
  if (format === 'hdfc') return { body: hdfcFile(rows, o), ext: 'csv', contentType: 'text/csv; charset=utf-8' };
  return { body: generic(rows), ext: 'csv', contentType: 'text/csv; charset=utf-8' };
}

/** The debit account is the institution's own; it is sealed at rest like staff accounts. */
export const debitAccountAad = (tenantId: string) => `${tenantId}:payroll.debit_account`;
