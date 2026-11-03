/** Shapes and small rules of the stores, purchase and asset pass pages (unit-tested in inventory-pass.test.ts). */

export interface Batch {
  id: string;
  store: string;
  sku: string;
  item: string;
  unit: string;
  batchNo: string;
  expiryOn: string | null;
  receivedOn: string;
  qtyLeft: number;
  valuePaise: number;
  state: 'expired' | 'expiring' | 'good' | 'no_expiry';
}

export interface StockSummary {
  asOn: string;
  lines: { storeId: string; store: string; itemId: string; sku: string; item: string; category: string; unit: string; qty: number; valuePaise: number; avgCostPaise: number }[];
  byCategory: { name: string; items: number; valuePaise: number }[];
  totalPaise: number;
}
export interface Ageing {
  buckets: string[];
  lines: { itemId: string; sku: string; item: string; store: string; unit: string; qty: number; valuePaise: number; oldestOn: string; buckets: Record<string, { qty: number; valuePaise: number }> }[];
  totals: Record<string, number>;
  totalPaise: number;
}
export interface DeadStock {
  days: number;
  lines: { storeId: string; store: string; itemId: string; sku: string; item: string; qty: number; unit: string; valuePaise: number; lastOut: string | null; idleDays: number }[];
  totalPaise: number;
}
export interface PurchaseRegister {
  from: string;
  to: string;
  lines: { id: string; on: string; invoiceNo: string; vendor: string; gstin: string | null; po: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; amountPaise: number; status: string; dueOn: string | null }[];
  hsn: { hsn: string; gstRatePct: number; qty: number; taxablePaise: number; taxPaise: number }[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; amountPaise: number };
}
export interface MsmeDues {
  lines: { id: string; invoiceNo: string; vendor: string; udyam: string | null; category: string; amountPaise: number; dueOn: string; overdueDays: number }[];
  overduePaise: number;
}
export interface Depreciation {
  fiscalYear: string;
  companiesAct: { assets: { id: string; tag: string; name: string; category: string; putToUseOn: string; days: number; openingPaise: number; additionPaise: number; depreciationPaise: number; closingPaise: number }[]; totals: { depreciationPaise: number } };
  incomeTaxAct: { blocks: { block: string; label: string; ratePct: number; openingPaise: number; additionsFullPaise: number; additionsHalfPaise: number; deletionsPaise: number; depreciationPaise: number; closingPaise: number }[]; depreciationPaise: number };
}
export interface Labs {
  labs: { roomId: string | null; room: string; equipment: { id: string; tag: string; name: string; make: string | null; model: string | null; serialNo: string | null; costPaise: number; purchasedOn: string; working: boolean; nextServiceOn: string | null; calibrationDueOn: string | null; cover: 'amc' | 'warranty' | 'none'; due: boolean }[]; costPaise: number; working: number; notWorking: number }[];
  totals: { labs: number; equipment: number; costPaise: number };
}
export interface Naac {
  fiscalYear: string;
  years: { fiscalYear: string; augmentationPaise: number; maintenancePhysicalPaise: number; maintenanceAcademicPaise: number; totalNonSalaryPaise: number | null; augmentationPct: number | null; maintenancePct: number | null }[];
  average: { augmentationPct: number | null; maintenancePct: number | null };
}

/** The Indian financial year (April to March) of a day: "2026-27". */
export function fyOf(day: string): string {
  const y = Number(day.slice(0, 4)) - (Number(day.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** A financial year typed in the filter, or the current one. */
export const pickFy = (asked: string | undefined, today: string) => (asked && /^\d{4}-\d{2}$/.test(asked) && (Number(asked.slice(0, 4)) + 1) % 100 === Number(asked.slice(5)) ? asked : fyOf(today));

/** The last month that has ended, "2026-10" on any day of November 2026: the month that can be posted to the books. */
export function lastClosedMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The issue slip's lines from the form: `item1`/`qty1` … `item3`/`qty3`; blank rows are skipped, a half-filled one is an error. */
export function slipLines(v: Record<string, string>): { lines: { itemId: string; qty: number }[] } | { error: 'line' | 'none' } {
  const lines: { itemId: string; qty: number }[] = [];
  for (const n of [1, 2, 3]) {
    const item = (v[`item${n}`] ?? '').trim();
    const qty = (v[`qty${n}`] ?? '').trim();
    if (!item && !qty) continue;
    const q = Number(qty);
    if (!item || !Number.isInteger(q) || q < 1) return { error: 'line' };
    lines.push({ itemId: item, qty: q });
  }
  return lines.length ? { lines } : { error: 'none' };
}

/** How a batch's state is shown. */
export const batchTone = (s: Batch['state']): 'danger' | 'warning' | 'success' | 'neutral' => (s === 'expired' ? 'danger' : s === 'expiring' ? 'warning' : s === 'good' ? 'success' : 'neutral');
