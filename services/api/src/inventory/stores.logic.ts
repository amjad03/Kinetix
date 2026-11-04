/**
 * Pure rules of the stores, purchase and asset pass (unit-tested in stores.logic.spec.ts): GSTIN checks, GST on a
 * line, stock valuation (FIFO or weighted average over cost layers, batches issued first-expiring-first), stock
 * ageing, depreciation under the Companies Act 2013 (Schedule II, pro-rata by days) and the Income-tax Act 1961
 * (block of assets, written-down value, half rate for less than 180 days of use), and the NAAC financial year.
 */

const GST_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GST state codes in use: 01–38, 97 (other territory) and 99 (centre jurisdiction). */
const isStateCode = (c: string) => /^\d{2}$/.test(c) && ((Number(c) >= 1 && Number(c) <= 38) || c === '97' || c === '99');

/** The check character of the first 14 characters of a GSTIN (the GSTN's modulus-36 scheme). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GST_ALPHABET.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_ALPHABET[(36 - (sum % 36)) % 36];
}

/**
 * Why a GSTIN is not valid, or null: 15 characters, a state code, the holder's PAN (five letters, four digits, a
 * letter), the entity number, Z, and the check character. With `pan`, the PAN inside must be that PAN.
 */
export function gstinProblem(raw: string, pan?: string | null): string | null {
  const g = raw.trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(g)) return 'A GSTIN has 15 letters and digits, like 29AAPFU0939F1ZV';
  if (!isStateCode(g.slice(0, 2))) return `${g.slice(0, 2)} is not a GST state code`;
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(g.slice(2, 12))) return 'Characters 3 to 12 of a GSTIN are the PAN (like AAPFU0939F)';
  if (!/^[1-9A-Z]$/.test(g[12])) return 'The 13th character of a GSTIN is the registration number (1–9 or a letter)';
  if (g[13] !== 'Z') return 'The 14th character of a GSTIN is Z';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'The GSTIN check character does not match; check it was typed correctly';
  if (pan && pan.trim().toUpperCase() !== g.slice(2, 12)) return 'The PAN inside the GSTIN is not the vendor’s PAN';
  return null;
}

/** Why a PAN is not valid, or null. */
export const panProblem = (raw: string): string | null => (/^[A-Z]{5}\d{4}[A-Z]$/.test(raw.trim().toUpperCase()) ? null : 'A PAN has ten characters, like AAPFU0939F');

/** The GST rates of the tariff (GST 2.0 keeps 0, 5, 18 and 40 for most goods; 12 and 28 remain on older bills; 0.1–3 are special rates). */
export const GST_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;
export const isGstRate = (r: number) => (GST_RATES as readonly number[]).includes(r);

/** An HSN (goods) or SAC (services) code: 4, 6 or 8 digits. */
export const hsnProblem = (raw: string): string | null => (/^(\d{4}|\d{6}|\d{8})$/.test(raw.trim()) ? null : 'An HSN code has 4, 6 or 8 digits');

export interface GstSplit {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * The GST on a taxable value at a rate: IGST between states, otherwise half CGST and half SGST (the odd paisa goes
 * to SGST so the two always add up to the tax). Rounded to the paisa.
 */
export function gstSplit(taxablePaise: number, ratePct: number, interState: boolean): GstSplit {
  const tax = Math.round((taxablePaise * ratePct) / 100);
  const cgst = interState ? 0 : Math.floor(tax / 2);
  return { taxablePaise, cgstPaise: cgst, sgstPaise: interState ? 0 : tax - cgst, igstPaise: interState ? tax : 0, taxPaise: tax, totalPaise: taxablePaise + tax };
}

/** Adds GST splits (the lines of an order or invoice). */
export function sumSplits(xs: GstSplit[]): GstSplit {
  const z: GstSplit = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0, totalPaise: 0 };
  for (const x of xs) for (const k of Object.keys(z) as (keyof GstSplit)[]) z[k] += x[k];
  return z;
}

/** Whether a supply is between states: the vendor's GSTIN state differs from the institution's (no GSTIN = same state). */
export const isInterState = (vendorStateCode: string | null | undefined, ownStateCode: string) => !!vendorStateCode && vendorStateCode !== ownStateCode;

// ---- valuation ---------------------------------------------------------------------------------------------------

export type Valuation = 'fifo' | 'weighted_average';

export interface Layer {
  id: string;
  batchNo: string;
  expiryOn: string | null;
  receivedOn: string;
  qtyLeft: number;
  unitCostPaise: number;
}

export interface Draw {
  layerId: string;
  batchNo: string;
  expiryOn: string | null;
  qty: number;
  /** The layer's own cost of what was drawn (FIFO cost). */
  costPaise: number;
}

/** Layers in the order stock leaves them: earliest expiry first (first-expiring, first-out), then oldest receipt. */
export function drawOrder(layers: Layer[]): Layer[] {
  return [...layers].sort((a, b) => (a.expiryOn ?? '9999-12-31').localeCompare(b.expiryOn ?? '9999-12-31') || a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));
}

/**
 * Takes `qty` out of the layers. Expired layers are skipped unless `includeExpired` (a write-off of expired stock);
 * `batchNo` limits the draw to one batch. Returns what came from each layer, or the quantity that could be drawn when
 * it falls short.
 */
export function drawLayers(layers: Layer[], qty: number, opts: { today: string; includeExpired?: boolean; batchNo?: string | null }): { draws: Draw[]; short: number } {
  const draws: Draw[] = [];
  let need = qty;
  for (const l of drawOrder(layers)) {
    if (need <= 0) break;
    if (l.qtyLeft <= 0) continue;
    if (opts.batchNo && l.batchNo !== opts.batchNo) continue;
    if (!opts.includeExpired && l.expiryOn && l.expiryOn < opts.today) continue;
    const take = Math.min(need, l.qtyLeft);
    draws.push({ layerId: l.id, batchNo: l.batchNo, expiryOn: l.expiryOn, qty: take, costPaise: take * l.unitCostPaise });
    need -= take;
  }
  return { draws, short: need };
}

/**
 * The cost of stock leaving a store. FIFO: the cost of the layers drawn. Weighted average: the store's average cost
 * (its value over its quantity) for the quantity, and all of the value when the last unit leaves, so no paisa is left
 * behind on an empty store.
 */
export function issueCost(method: Valuation, draws: Draw[], stock: { qty: number; valuePaise: number }): number {
  const qty = draws.reduce((s, d) => s + d.qty, 0);
  if (method === 'fifo') return draws.reduce((s, d) => s + d.costPaise, 0);
  if (stock.qty <= 0) return 0;
  if (qty >= stock.qty) return stock.valuePaise;
  return Math.round((stock.valuePaise * qty) / stock.qty);
}

/** The age bucket of stock received `days` ago, for the ageing report. */
export const AGE_BUCKETS = ['0-30', '31-90', '91-180', '181-365', 'over-365'] as const;
export function ageBucket(days: number): (typeof AGE_BUCKETS)[number] {
  return days <= 30 ? '0-30' : days <= 90 ? '31-90' : days <= 180 ? '91-180' : days <= 365 ? '181-365' : 'over-365';
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// ---- depreciation -------------------------------------------------------------------------------------------------

/** The Indian financial year (April to March) of a day, "2026-27". */
export function fyOf(day: string): string {
  const y = Number(day.slice(0, 4)) - (Number(day.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
export const fyStartOf = (fy: string) => `${fy.slice(0, 4)}-04-01`;
export const fyEndOf = (fy: string) => `${Number(fy.slice(0, 4)) + 1}-03-31`;
export const nextFy = (fy: string) => fyOf(`${Number(fy.slice(0, 4)) + 1}-06-01`);
const fyDays = (fy: string) => daysBetween(fyStartOf(fy), fyEndOf(fy)) + 1;

export interface BookAsset {
  costPaise: number;
  /** Residual value (Schedule II: normally up to 5% of cost). */
  salvagePaise: number;
  usefulLifeYears: number;
  method: string;
  /** A WDV rate set by the institution; without it the rate that leaves the residual value at the end of the life. */
  wdvRatePct: number | null;
  /** Depreciation runs from the day the asset is ready for use (defaults to the purchase date). */
  putToUseOn: string;
  disposedOn?: string | null;
}

/** The WDV rate that brings cost down to the residual value over the useful life: 1 − (residual / cost)^(1 / life). */
export function scheduleIiWdvRate(a: Pick<BookAsset, 'costPaise' | 'salvagePaise' | 'usefulLifeYears'>): number {
  // A donated asset at no cost, or one with no useful life recorded, has nothing to write down (and no NaN rate).
  if (!(a.costPaise > 0) || !(a.usefulLifeYears > 0)) return 0;
  const residual = Math.max(a.salvagePaise, 1);
  return Math.round((1 - Math.pow(residual / a.costPaise, 1 / a.usefulLifeYears)) * 10_000) / 100;
}

export interface BookYear {
  fiscalYear: string;
  days: number;
  openingPaise: number;
  depreciationPaise: number;
  closingPaise: number;
}

/**
 * Companies Act 2013, Schedule II: depreciation each financial year from the year the asset is put to use up to and
 * including `untilFy`, pro-rata by the days in use in a year (the year of addition and the year of sale), straight
 * line on cost less residual value over the useful life, or written-down value at the rate. Never below the
 * residual value; nothing after the day of disposal.
 */
export function companiesActSchedule(a: BookAsset, untilFy: string): BookYear[] {
  const out: BookYear[] = [];
  const rate = a.method === 'wdv' ? (a.wdvRatePct ?? scheduleIiWdvRate(a)) : 0;
  const slmYear = (a.costPaise - a.salvagePaise) / a.usefulLifeYears;
  let book = a.costPaise;
  let exact = a.costPaise;
  for (let fy = fyOf(a.putToUseOn); fy <= untilFy; fy = nextFy(fy)) {
    const from = a.putToUseOn > fyStartOf(fy) ? a.putToUseOn : fyStartOf(fy);
    const lastDay = a.disposedOn ? (a.disposedOn <= fyEndOf(fy) ? a.disposedOn : fyEndOf(fy)) : fyEndOf(fy);
    const days = lastDay < from ? 0 : daysBetween(from, lastDay) + (a.disposedOn && lastDay === a.disposedOn ? 0 : 1);
    const share = days / fyDays(fy);
    const raw = a.method === 'wdv' ? (exact * rate * share) / 100 : slmYear * share;
    // Work in exact amounts and round each year's figure from the exact closing, so the years add up to the total.
    const nextExact = Math.max(a.salvagePaise, exact - raw);
    const closing = Math.round(nextExact);
    const dep = Math.max(0, book - closing);
    out.push({ fiscalYear: fy, days, openingPaise: book, depreciationPaise: dep, closingPaise: book - dep });
    book -= dep;
    exact = nextExact;
    if (a.disposedOn && a.disposedOn <= fyEndOf(fy)) break;
  }
  return out;
}

/** Income-tax Act blocks with their WDV rates (Appendix I to the Income-tax Rules, from AY 2018-19). */
export const IT_BLOCKS: Record<string, { label: string; ratePct: number }> = {
  building: { label: 'Buildings (other than residential)', ratePct: 10 },
  furniture: { label: 'Furniture and fittings', ratePct: 10 },
  plant: { label: 'Plant and machinery (general, lab equipment)', ratePct: 15 },
  computers: { label: 'Computers and software', ratePct: 40 },
  vehicles: { label: 'Motor vehicles', ratePct: 15 },
  books: { label: 'Books (annual publications and professional)', ratePct: 40 },
  intangible: { label: 'Intangible assets (licences, know-how)', ratePct: 25 },
};

/** The block an asset category most likely belongs to, when the register has not set one. */
export function itBlockFor(category: string): keyof typeof IT_BLOCKS {
  const c = category.toLowerCase();
  if (/computer|laptop|server|software|it equip|printer|smartboard|projector/.test(c)) return 'computers';
  if (/furniture|bench|chair|table|almirah|fitting/.test(c)) return 'furniture';
  if (/vehicle|bus|car|van/.test(c)) return 'vehicles';
  if (/building|civil/.test(c)) return 'building';
  if (/book/.test(c)) return 'books';
  if (/licen|intangible/.test(c)) return 'intangible';
  return 'plant';
}

export interface TaxAsset {
  block: string;
  costPaise: number;
  putToUseOn: string;
  disposedOn?: string | null;
  disposalPaise?: number | null;
}

export interface BlockYear {
  block: string;
  label: string;
  ratePct: number;
  openingPaise: number;
  /** Additions used for 180 days or more in the year (full rate). */
  additionsFullPaise: number;
  /** Additions used for less than 180 days (half rate, section 32 second proviso). */
  additionsHalfPaise: number;
  /** Money received for assets of the block sold in the year (section 43(6)). */
  deletionsPaise: number;
  depreciationPaise: number;
  closingPaise: number;
  /** When the sale money is more than the block: a short-term capital gain (section 50). */
  shortTermGainPaise: number;
}

/**
 * Income-tax Act 1961, section 32 with 43(6): each block's written-down value rolled forward year by year to `fy`.
 * An addition put to use for less than 180 days in its first year gets half the rate that year. Sale money is
 * taken off the block (first off the full-rate part); what goes over the block is a short-term capital gain.
 */
export function itActBlocks(assets: TaxAsset[], fy: string): BlockYear[] {
  const blocks = [...new Set(assets.map((a) => a.block))].sort();
  const out: BlockYear[] = [];
  for (const block of blocks) {
    const info = IT_BLOCKS[block] ?? { label: block, ratePct: 15 };
    const mine = assets.filter((a) => a.block === block);
    const first = mine.reduce((m, a) => (fyOf(a.putToUseOn) < m ? fyOf(a.putToUseOn) : m), fy);
    let opening = 0;
    let row: BlockYear | null = null;
    for (let y = first; y <= fy; y = nextFy(y)) {
      let full = 0;
      let half = 0;
      for (const a of mine.filter((x) => fyOf(x.putToUseOn) === y)) {
        if (daysBetween(a.putToUseOn, fyEndOf(y)) + 1 >= 180) full += a.costPaise;
        else half += a.costPaise;
      }
      const deletions = mine.filter((a) => a.disposedOn && fyOf(a.disposedOn) === y).reduce((s, a) => s + (a.disposalPaise ?? 0), 0);
      const pool = opening + full + half;
      const gain = Math.max(0, deletions - pool);
      const fullBase = Math.max(0, opening + full - deletions);
      const halfBase = Math.max(0, half - Math.max(0, deletions - opening - full));
      const dep = Math.round((fullBase * info.ratePct) / 100) + Math.round((halfBase * info.ratePct) / 200);
      const closing = fullBase + halfBase - dep;
      row = { block, label: info.label, ratePct: info.ratePct, openingPaise: opening, additionsFullPaise: full, additionsHalfPaise: half, deletionsPaise: deletions, depreciationPaise: dep, closingPaise: closing, shortTermGainPaise: gain };
      opening = closing;
    }
    if (row) out.push(row);
  }
  return out;
}

/** The last five financial years ending with `fy` (NAAC asks for five years), oldest first. */
export function lastFiveFys(fy: string): string[] {
  const y = Number(fy.slice(0, 4));
  return [4, 3, 2, 1, 0].map((k) => `${y - k}-${String((y - k + 1) % 100).padStart(2, '0')}`);
}

/** MSMED Act 2006, section 15: a micro or small enterprise is paid within 45 days of acceptance (15 days without an agreement). */
export function msmeDueOn(acceptedOn: string, agreedDays: number | null): string {
  const days = Math.min(45, agreedDays && agreedDays > 0 ? agreedDays : 15);
  return new Date(Date.parse(`${acceptedOn}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
