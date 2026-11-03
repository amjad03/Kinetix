import { describe, expect, it } from 'vitest';
import { ageBucket, companiesActSchedule, drawLayers, gstinCheckChar, gstinProblem, gstSplit, hsnProblem, issueCost, itActBlocks, itBlockFor, lastFiveFys, msmeDueOn, scheduleIiWdvRate, sumSplits, type Layer } from './stores.logic.js';

describe('GSTIN', () => {
  it('accepts a real GSTIN and computes its check character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinProblem('27AAPFU0939F1ZV')).toBeNull();
    expect(gstinProblem(' 27aapfu0939f1zv ')).toBeNull();
  });
  it('refuses a wrong check character, state, PAN shape, the Z and a PAN that does not match', () => {
    expect(gstinProblem('27AAPFU0939F1ZW')).toMatch(/check character/);
    expect(gstinProblem('45AAPFU0939F1ZV')).toMatch(/state code/);
    expect(gstinProblem('27AAPF10939F1ZV')).toMatch(/PAN/);
    expect(gstinProblem('27AAPFU0939F1XV')).toMatch(/Z/);
    expect(gstinProblem('1234')).toMatch(/15 letters/);
    expect(gstinProblem('27AAPFU0939F1ZV', 'AAPFU0939G')).toMatch(/not the vendor/);
    expect(gstinProblem('27AAPFU0939F1ZV', 'aapfu0939f')).toBeNull();
  });
  it('checks HSN codes', () => {
    expect(hsnProblem('4802')).toBeNull();
    expect(hsnProblem('48025690')).toBeNull();
    expect(hsnProblem('480')).not.toBeNull();
  });
});

describe('GST on a line', () => {
  it('splits CGST and SGST within the state, the odd paisa to SGST', () => {
    // ₹1,234.57 at 18%: 22,222.26 paise → 22,222 tax; 11,111 + 11,111.
    expect(gstSplit(1_234_57, 18, false)).toEqual({ taxablePaise: 1_234_57, cgstPaise: 11_111, sgstPaise: 11_111, igstPaise: 0, taxPaise: 22_222, totalPaise: 1_456_79 });
    // ₹10.01 at 5% = 50.05 paise → 50; 25 + 25. At 12%: 120.12 → 120.
    expect(gstSplit(10_01, 5, false)).toMatchObject({ cgstPaise: 25, sgstPaise: 25 });
    expect(gstSplit(1_00, 3, false)).toMatchObject({ cgstPaise: 1, sgstPaise: 2, taxPaise: 3 });
  });
  it('charges IGST between states and adds splits', () => {
    expect(gstSplit(50_000_00, 28, true)).toMatchObject({ igstPaise: 14_000_00, cgstPaise: 0, totalPaise: 64_000_00 });
    expect(sumSplits([gstSplit(100_00, 18, false), gstSplit(200_00, 5, false)])).toEqual({ taxablePaise: 300_00, cgstPaise: 14_00, sgstPaise: 14_00, igstPaise: 0, taxPaise: 28_00, totalPaise: 328_00 });
  });
});

describe('stock valuation', () => {
  const layers: Layer[] = [
    { id: 'a', batchNo: 'B1', expiryOn: '2027-06-30', receivedOn: '2026-04-10', qtyLeft: 10, unitCostPaise: 100_00 },
    { id: 'b', batchNo: 'B2', expiryOn: '2026-12-31', receivedOn: '2026-06-01', qtyLeft: 5, unitCostPaise: 130_00 },
    { id: 'c', batchNo: 'B0', expiryOn: '2026-09-30', receivedOn: '2026-03-01', qtyLeft: 4, unitCostPaise: 90_00 },
  ];
  it('issues the earliest expiry first and skips what has expired', () => {
    const { draws, short } = drawLayers(layers, 8, { today: '2026-11-03' });
    expect(short).toBe(0);
    // B0 expired on 30 Sep: skipped. B2 (Dec 2026) before B1 (Jun 2027): 5 from B2, 3 from B1.
    expect(draws.map((d) => [d.batchNo, d.qty])).toEqual([['B2', 5], ['B1', 3]]);
    // FIFO cost: 5 × 130 + 3 × 100 = 950.
    expect(issueCost('fifo', draws, { qty: 19, valuePaise: 0 })).toBe(950_00);
  });
  it('reports a shortfall when unexpired stock is not enough; a write-off can take the expired batch', () => {
    expect(drawLayers(layers, 16, { today: '2026-11-03' }).short).toBe(1);
    expect(drawLayers(layers, 4, { today: '2026-11-03', includeExpired: true, batchNo: 'B0' }).draws).toEqual([{ layerId: 'c', batchNo: 'B0', expiryOn: '2026-09-30', qty: 4, costPaise: 360_00 }]);
  });
  it('values at the weighted average, and the last unit takes all that is left', () => {
    // 19 units worth 1,000 + 650 + 360 = 2,010: 8 units = 2,010 × 8 / 19 = 846.3158 → 846.32.
    const stock = { qty: 19, valuePaise: 2_010_00 };
    const { draws } = drawLayers(layers, 8, { today: '2026-11-03' });
    expect(issueCost('weighted_average', draws, stock)).toBe(846_32);
    expect(issueCost('weighted_average', drawLayers(layers, 19, { today: '2026-01-01' }).draws, stock)).toBe(2_010_00);
  });
  it('buckets stock by age', () => {
    expect([0, 30, 31, 90, 91, 180, 181, 365, 366].map(ageBucket)).toEqual(['0-30', '0-30', '31-90', '31-90', '91-180', '91-180', '181-365', '181-365', 'over-365']);
  });
});

describe('Companies Act depreciation (Schedule II)', () => {
  it('charges straight line pro-rata by days in the year of addition', () => {
    // ₹1,00,000, residual ₹5,000, 5 years: ₹19,000 a year. Put to use 1 Oct 2025: 182 of 365 days in 2025-26.
    const s = companiesActSchedule({ costPaise: 100_000_00, salvagePaise: 5_000_00, usefulLifeYears: 5, method: 'slm', wdvRatePct: null, putToUseOn: '2025-10-01' }, '2026-27');
    // 19,000 × 182 / 365 = 9,473.97 → 9,473.97; then a full 19,000.
    expect(s).toEqual([
      { fiscalYear: '2025-26', days: 182, openingPaise: 100_000_00, depreciationPaise: 9_473_97, closingPaise: 90_526_03 },
      { fiscalYear: '2026-27', days: 365, openingPaise: 90_526_03, depreciationPaise: 19_000_00, closingPaise: 71_526_03 },
    ]);
  });
  it('stops at the residual value and at the day of disposal', () => {
    const full = companiesActSchedule({ costPaise: 50_000_00, salvagePaise: 2_500_00, usefulLifeYears: 3, method: 'slm', wdvRatePct: null, putToUseOn: '2020-04-01' }, '2026-27');
    expect(full.at(-1)!.closingPaise).toBe(2_500_00);
    expect(full.reduce((s, y) => s + y.depreciationPaise, 0)).toBe(47_500_00);
    // Sold on 1 Jul 2026: 91 days of 2026-27 (1 Apr to 30 Jun).
    const sold = companiesActSchedule({ costPaise: 36_500_00, salvagePaise: 0, usefulLifeYears: 10, method: 'slm', wdvRatePct: null, putToUseOn: '2025-04-01', disposedOn: '2026-07-01' }, '2027-28');
    expect(sold.map((y) => [y.fiscalYear, y.days, y.depreciationPaise])).toEqual([['2025-26', 365, 3_650_00], ['2026-27', 91, 910_00]]);
  });
  it('charges written-down value at the rate, or the rate that reaches the residual over the life', () => {
    // 15% WDV on ₹2,00,000 from 1 Apr 2025: 30,000 then 25,500.
    const w = companiesActSchedule({ costPaise: 200_000_00, salvagePaise: 10_000_00, usefulLifeYears: 15, method: 'wdv', wdvRatePct: 15, putToUseOn: '2025-04-01' }, '2026-27');
    expect(w.map((y) => y.depreciationPaise)).toEqual([30_000_00, 25_500_00]);
    // 5% residual over 5 years: 1 − 0.05^(1/5) = 45.07%.
    expect(scheduleIiWdvRate({ costPaise: 100_000_00, salvagePaise: 5_000_00, usefulLifeYears: 5 })).toBe(45.07);
  });
});

describe('Income-tax Act depreciation (block of assets)', () => {
  it('gives half the rate to an addition used under 180 days, and rolls the block forward', () => {
    // Computers at 40%: ₹60,000 put to use 1 May 2025 (335 days) and ₹40,000 on 1 Jan 2026 (90 days).
    const assets = [
      { block: 'computers', costPaise: 60_000_00, putToUseOn: '2025-05-01' },
      { block: 'computers', costPaise: 40_000_00, putToUseOn: '2026-01-01' },
    ];
    const [y1] = itActBlocks(assets, '2025-26');
    // 60,000 × 40% = 24,000; 40,000 × 20% = 8,000; closing 68,000.
    expect(y1).toMatchObject({ openingPaise: 0, additionsFullPaise: 60_000_00, additionsHalfPaise: 40_000_00, depreciationPaise: 32_000_00, closingPaise: 68_000_00 });
    // Next year: 68,000 × 40% = 27,200.
    expect(itActBlocks(assets, '2026-27')[0]).toMatchObject({ openingPaise: 68_000_00, depreciationPaise: 27_200_00, closingPaise: 40_800_00 });
  });
  it('takes sale money off the block, and what exceeds it is a short-term gain', () => {
    const assets = [
      { block: 'furniture', costPaise: 10_000_00, putToUseOn: '2024-04-01', disposedOn: '2025-06-01', disposalPaise: 12_000_00 },
    ];
    // 2024-25: 10,000 × 10% = 1,000 → 9,000. 2025-26: sale 12,000 against 9,000 → nil block, gain 3,000.
    expect(itActBlocks(assets, '2025-26')[0]).toMatchObject({ openingPaise: 9_000_00, deletionsPaise: 12_000_00, depreciationPaise: 0, closingPaise: 0, shortTermGainPaise: 3_000_00 });
    expect(itBlockFor('IT equipment')).toBe('computers');
    expect(itBlockFor('Lab equipment')).toBe('plant');
  });
});

describe('dates', () => {
  it('lists the NAAC five years and the MSME payment due date', () => {
    expect(lastFiveFys('2026-27')).toEqual(['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
    expect(msmeDueOn('2026-10-01', 60)).toBe('2026-11-15');
    expect(msmeDueOn('2026-10-01', 30)).toBe('2026-10-31');
    expect(msmeDueOn('2026-10-01', null)).toBe('2026-10-16');
  });
});
