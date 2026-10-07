import type { TallyLedgers } from '@kinetix/shared';

/** CSV cell: quoted when needed, and neutralised against spreadsheet formula injection. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Paise as rupees with two decimals. */
export const rs = (paise: number) => (paise / 100).toFixed(2);

export interface BankRow {
  name: string;
  account: string;
  ifsc: string;
  netPaise: number;
  narration: string;
}

/** The bank's bulk-transfer upload: beneficiary, account, IFSC, amount in rupees, narration. */
export const bankTransferCsv = (rows: BankRow[]) => csv([['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Narration'], ...rows.map((r) => [r.name, r.account, r.ifsc, rs(r.netPaise), r.narration])]);

export interface StatRow {
  name: string;
  employeeCode: string | null;
  uan: string | null;
  esiNumber: string | null;
  pan: string | null;
  regime: string;
  grossPaise: number;
  lopDays: number;
  daysInMonth: number;
  pfWagePaise: number;
  pfCeilingPaise: number;
  pfCapAtCeiling: boolean;
  employeePfPaise: number;
  epsPaise: number;
  epfPaise: number;
  esiEmployeePaise: number;
  esiEmployerPaise: number;
  ptPaise: number;
  tdsPaise: number;
}

const EPS_CEILING = 1_500_000;

/** PF in the ECR column order, ESI contribution, Professional Tax and TDS statements. */
export function statutoryCsv(kind: 'pf' | 'esi' | 'pt' | 'tds', rows: StatRow[]): string {
  if (kind === 'pf') {
    return csv([
      ['UAN', 'Member Name', 'Gross Wages', 'EPF Wages', 'EPS Wages', 'EDLI Wages', 'EPF Contribution (Employee)', 'EPS Contribution', 'EPF-EPS Diff (Employer)', 'NCP Days', 'Refund of Advances'],
      ...rows
        .filter((r) => r.employeePfPaise > 0)
        .map((r) => {
          const epfWage = r.pfCapAtCeiling ? Math.min(r.pfWagePaise, r.pfCeilingPaise) : r.pfWagePaise;
          const epsWage = Math.min(r.pfWagePaise, EPS_CEILING);
          return [r.uan ?? '', r.name, Math.round(r.grossPaise / 100), Math.round(epfWage / 100), Math.round(epsWage / 100), Math.round(epsWage / 100), Math.round(r.employeePfPaise / 100), Math.round(r.epsPaise / 100), Math.round(r.epfPaise / 100), r.lopDays, 0];
        }),
    ]);
  }
  if (kind === 'esi') {
    return csv([
      ['IP Number', 'IP Name', 'Days Paid', 'Total Wages', 'Employee Contribution', 'Employer Contribution'],
      ...rows.filter((r) => r.esiEmployeePaise > 0).map((r) => [r.esiNumber ?? '', r.name, r.daysInMonth - r.lopDays, rs(r.grossPaise), rs(r.esiEmployeePaise), rs(r.esiEmployerPaise)]),
    ]);
  }
  if (kind === 'pt') return csv([['Employee Code', 'Employee', 'Gross Salary', 'Professional Tax'], ...rows.filter((r) => r.ptPaise > 0).map((r) => [r.employeeCode ?? '', r.name, rs(r.grossPaise), rs(r.ptPaise)])]);
  return csv([['Employee Code', 'Employee', 'PAN', 'Regime', 'Gross Salary', 'TDS'], ...rows.filter((r) => r.tdsPaise > 0).map((r) => [r.employeeCode ?? '', r.name, r.pan ?? '', r.regime, rs(r.grossPaise), rs(r.tdsPaise)])]);
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TallyTotals {
  grossPaise: number;
  employeePfPaise: number;
  employerPfPaise: number;
  employeeEsiPaise: number;
  employerEsiPaise: number;
  ptPaise: number;
  tdsPaise: number;
  otherDeductionsPaise: number;
  netPaise: number;
}

/** The month's journal entries, debits then credits; they always balance (asserted). */
export function tallyEntries(t: TallyTotals, l: TallyLedgers) {
  const debits = [
    { ledger: l.salaryExpense, paise: t.grossPaise },
    { ledger: l.employerPfExpense, paise: t.employerPfPaise },
    { ledger: l.employerEsiExpense, paise: t.employerEsiPaise },
  ].filter((e) => e.paise > 0);
  const credits = [
    { ledger: l.pfPayable, paise: t.employeePfPaise + t.employerPfPaise },
    { ledger: l.esiPayable, paise: t.employeeEsiPaise + t.employerEsiPaise },
    { ledger: l.ptPayable, paise: t.ptPaise },
    { ledger: l.tdsPayable, paise: t.tdsPaise },
    { ledger: l.otherDeductions, paise: t.otherDeductionsPaise },
    { ledger: l.salaryPayable, paise: t.netPaise },
  ].filter((e) => e.paise > 0);
  const sum = (xs: { paise: number }[]) => xs.reduce((s, x) => s + x.paise, 0);
  if (sum(debits) !== sum(credits)) throw new Error(`Journal does not balance: debits ${sum(debits)} credits ${sum(credits)}`);
  return { debits, credits };
}

/** One Tally journal voucher (Import Data → Vouchers) for the month, dated its last day. */
export function tallyXml(o: { company: string; month: string; lastDay: string; narration: string; totals: TallyTotals; ledgers: TallyLedgers }): string {
  const { debits, credits } = tallyEntries(o.totals, o.ledgers);
  const entry = (e: { ledger: string; paise: number }, debit: boolean) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? '-' : ''}${rs(e.paise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  return [
    '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>',
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(o.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>`,
    `<REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>${o.lastDay.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><NARRATION>${xml(o.narration)}</NARRATION>`,
    ...debits.map((e) => entry(e, true)),
    ...credits.map((e) => entry(e, false)),
    '</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>',
  ].join('\n');
}
