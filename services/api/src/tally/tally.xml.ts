/** Tally Prime XML over HTTP: the import envelopes for ledgers and vouchers, and a reader for Tally's answer. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const rupees = (paise: number) => (paise / 100).toFixed(2);
/** 2026-10-20 becomes 20261020, the date format Tally reads. */
const tallyDate = (iso: string) => iso.replace(/-/g, '');

const envelope = (report: string, company: string, messages: string) =>
  `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>${report}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC><DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${messages}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;

/** Tally's own group for an account when the institution has not mapped one. */
export function defaultTallyParent(groupType: string, isCashBank: boolean, code: string): string {
  if (isCashBank) return code === '1000' ? 'Cash-in-Hand' : 'Bank Accounts';
  switch (groupType) {
    case 'asset':
      return code === '1200' ? 'Fixed Assets' : 'Current Assets';
    case 'liability':
      return 'Current Liabilities';
    case 'equity':
      return 'Reserves & Surplus';
    case 'income':
      return code === '4000' ? 'Direct Incomes' : 'Indirect Incomes';
    default:
      return 'Indirect Expenses';
  }
}

export function ledgerXml(company: string, ledger: { name: string; parent: string }): string {
  return envelope('All Masters', company, `<LEDGER NAME="${esc(ledger.name)}" ACTION="Create"><NAME>${esc(ledger.name)}</NAME><PARENT>${esc(ledger.parent)}</PARENT></LEDGER>`);
}

export interface TallyVoucher {
  type: string;
  number: string;
  date: string;
  narration: string;
  lines: { ledger: string; debitPaise: number; creditPaise: number }[];
}

const TYPE_NAME: Record<string, string> = { receipt: 'Receipt', payment: 'Payment', journal: 'Journal', contra: 'Contra' };

/** One voucher message; debits are negative amounts with ISDEEMEDPOSITIVE Yes, as Tally expects. */
export function voucherMessage(v: TallyVoucher): string {
  const t = TYPE_NAME[v.type] ?? 'Journal';
  const entries = v.lines
    .map((l) => {
      const debit = l.debitPaise > 0;
      return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? '-' : ''}${rupees(debit ? l.debitPaise : l.creditPaise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    })
    .join('');
  return `<VOUCHER VCHTYPE="${t}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tallyDate(v.date)}</DATE><VOUCHERTYPENAME>${t}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER><NARRATION>${esc(v.narration)}</NARRATION>${entries}</VOUCHER>`;
}

export const voucherXml = (company: string, v: TallyVoucher) => envelope('Vouchers', company, voucherMessage(v));

/** Many ledgers and vouchers in one file, for "Import Data" in Tally when the live connection is not available. */
export function fileXml(company: string, ledgers: { name: string; parent: string }[], vouchers: TallyVoucher[]): string {
  const l = ledgers.map((x) => `<LEDGER NAME="${esc(x.name)}" ACTION="Create"><NAME>${esc(x.name)}</NAME><PARENT>${esc(x.parent)}</PARENT></LEDGER>`).join('');
  const v = vouchers.map(voucherMessage).join('');
  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${l}${v}</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

export type TallyAnswer = { ok: true } | { ok: false; message: string };

/** Reads Tally's reply: created/altered counts, or the line error it gave. "Already exists" counts as done. */
export function readAnswer(body: string): TallyAnswer {
  const num = (tag: string) => Number(new RegExp(`<${tag}>\\s*(\\d+)\\s*</${tag}>`).exec(body)?.[1] ?? 0);
  const errors = num('ERRORS');
  const lineError = /<LINEERROR>([\s\S]*?)<\/LINEERROR>/.exec(body)?.[1]?.trim();
  if (errors > 0 || lineError) {
    if (lineError && /already exists/i.test(lineError)) return { ok: true };
    return { ok: false, message: (lineError ?? `Tally reported ${errors} error(s)`).slice(0, 300) };
  }
  if (num('CREATED') + num('ALTERED') > 0) return { ok: true };
  return { ok: false, message: 'Tally did not create anything' };
}
