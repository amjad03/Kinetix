/** The accounting books: pure rules (chart of accounts, voucher checks, report maths). The database work lives in books.service.ts. */

export type GroupType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type VoucherType = 'receipt' | 'payment' | 'journal' | 'contra';

export interface ChartEntry { code: string; name: string; groupType: GroupType; isCashBank?: boolean }

/** The chart every institution starts with; accounts can be added, renamed or switched off. */
export const DEFAULT_CHART: ChartEntry[] = [
  { code: '1000', name: 'Cash', groupType: 'asset', isCashBank: true },
  { code: '1010', name: 'Bank Account', groupType: 'asset', isCashBank: true },
  { code: '1100', name: 'Fees Receivable', groupType: 'asset' },
  { code: '1200', name: 'Fixed Assets', groupType: 'asset' },
  { code: '2000', name: 'Sundry Creditors', groupType: 'liability' },
  { code: '2100', name: 'Caution Deposits', groupType: 'liability' },
  { code: '3000', name: 'Reserves and Surplus', groupType: 'equity' },
  { code: '4000', name: 'Fee Income', groupType: 'income' },
  { code: '4100', name: 'Other Income', groupType: 'income' },
  { code: '5000', name: 'Salaries', groupType: 'expense' },
  { code: '5100', name: 'Administrative Expenses', groupType: 'expense' },
  { code: '5200', name: 'Fee Refunds', groupType: 'expense' },
  { code: '5300', name: 'Depreciation', groupType: 'expense' },
];

/** Account codes the automatic postings use. */
export const POSTING = { cash: '1000', bank: '1010', feeIncome: '4000', refunds: '5200', reserves: '3000' } as const;

export const VOUCHER_PREFIX: Record<VoucherType, string> = { receipt: 'R', payment: 'P', journal: 'J', contra: 'C' };

export interface LineInput { accountId: string; debitPaise: number; creditPaise: number }
export interface AccountInfo { id: string; isCashBank: boolean; active: boolean }

/** Why a voucher cannot be posted, or null when it can. */
export function voucherProblem(type: VoucherType, lines: LineInput[], accounts: Map<string, AccountInfo>): string | null {
  if (lines.length < 2) return 'A voucher needs at least two lines';
  for (const l of lines) {
    const a = accounts.get(l.accountId);
    if (!a) return 'An account on the voucher does not exist';
    if (!a.active) return 'An account on the voucher is switched off';
    if ((l.debitPaise > 0) === (l.creditPaise > 0)) return 'Each line is either a debit or a credit';
  }
  const dr = lines.reduce((s, l) => s + l.debitPaise, 0);
  const cr = lines.reduce((s, l) => s + l.creditPaise, 0);
  if (dr !== cr) return 'Debits and credits must be equal';
  const cb = (l: LineInput) => accounts.get(l.accountId)!.isCashBank;
  if (type === 'receipt' && !lines.some((l) => l.debitPaise > 0 && cb(l))) return 'A receipt must debit a cash or bank account';
  if (type === 'payment' && !lines.some((l) => l.creditPaise > 0 && cb(l))) return 'A payment must credit a cash or bank account';
  if (type === 'contra' && !lines.every(cb)) return 'A contra voucher moves money between cash and bank accounts only';
  if (type === 'journal' && lines.some(cb)) return 'A journal cannot touch cash or bank accounts; use a receipt, payment or contra';
  return null;
}

/** The last day of a financial year like "2026-27". */
export function fyEnd(fy: string): string {
  return `${Number(fy.slice(0, 4)) + 1}-03-31`;
}
export function fyStart(fy: string): string {
  return `${fy.slice(0, 4)}-04-01`;
}
export const isFy = (s: string) => /^\d{4}-\d{2}$/.test(s) && (Number(s.slice(0, 4)) + 1) % 100 === Number(s.slice(5));

/** Natural balance: assets and expenses are debit-positive, the rest credit-positive. */
export const naturalBalance = (g: GroupType, debit: number, credit: number) => (g === 'asset' || g === 'expense' ? debit - credit : credit - debit);

export interface Movement { accountId: string; code: string; name: string; groupType: GroupType; openingPaise: number; debitPaise: number; creditPaise: number }

/** Trial balance rows: closing balance of each account in the debit or credit column. */
export function trialBalance(rows: Movement[]) {
  const lines = rows
    .map((r) => {
      const net = r.openingPaise + r.debitPaise - r.creditPaise;
      return { accountId: r.accountId, code: r.code, name: r.name, groupType: r.groupType, debitPaise: net > 0 ? net : 0, creditPaise: net < 0 ? -net : 0 };
    })
    .filter((l) => l.debitPaise || l.creditPaise);
  const debit = lines.reduce((s, l) => s + l.debitPaise, 0);
  const credit = lines.reduce((s, l) => s + l.creditPaise, 0);
  return { lines, totalDebitPaise: debit, totalCreditPaise: credit, balanced: debit === credit };
}

/** Income and expenditure for a period from movements of income and expense accounts. */
export function incomeExpenditure(rows: Movement[]) {
  const income = rows.filter((r) => r.groupType === 'income').map((r) => ({ code: r.code, name: r.name, paise: r.creditPaise - r.debitPaise })).filter((r) => r.paise !== 0);
  const expense = rows.filter((r) => r.groupType === 'expense').map((r) => ({ code: r.code, name: r.name, paise: r.debitPaise - r.creditPaise })).filter((r) => r.paise !== 0);
  const totalIncomePaise = income.reduce((s, r) => s + r.paise, 0);
  const totalExpensePaise = expense.reduce((s, r) => s + r.paise, 0);
  return { income, expense, totalIncomePaise, totalExpensePaise, surplusPaise: totalIncomePaise - totalExpensePaise };
}

/** Balance sheet from cumulative movements; income and expense still open are shown as the surplus not yet moved to reserves. */
export function balanceSheet(rows: Movement[]) {
  const side = (g: GroupType) =>
    rows
      .filter((r) => r.groupType === g)
      .map((r) => ({ code: r.code, name: r.name, paise: naturalBalance(g, r.openingPaise + r.debitPaise, r.creditPaise) }))
      .filter((r) => r.paise !== 0);
  const assets = side('asset');
  const liabilities = side('liability');
  const equity = side('equity');
  const surplusPaise = incomeExpenditure(rows).surplusPaise;
  const totalAssetsPaise = assets.reduce((s, r) => s + r.paise, 0);
  const totalLiabilitiesPaise = liabilities.reduce((s, r) => s + r.paise, 0) + equity.reduce((s, r) => s + r.paise, 0) + surplusPaise;
  return { assets, liabilities, equity, surplusPaise, totalAssetsPaise, totalLiabilitiesPaise, balanced: totalAssetsPaise === totalLiabilitiesPaise };
}

/** "2026-27" for a date in the Indian financial year (April to March). */
export function financialYearOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
