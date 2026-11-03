import { describe, expect, it } from 'vitest';
import { batchTone, fyOf, lastClosedMonth, pickFy, slipLines } from './inventory-pass';

describe('inventory pass helpers', () => {
  it('works out financial years and the month that can be posted', () => {
    expect(fyOf('2026-03-31')).toBe('2025-26');
    expect(fyOf('2026-04-01')).toBe('2026-27');
    expect(pickFy('2024-25', '2026-11-03')).toBe('2024-25');
    expect(pickFy('2024-26', '2026-11-03')).toBe('2026-27');
    expect(pickFy(undefined, '2027-01-10')).toBe('2026-27');
    expect(lastClosedMonth('2026-11-03')).toBe('2026-10');
    expect(lastClosedMonth('2027-01-02')).toBe('2026-12');
  });
  it('reads up to three slip lines, skipping blank rows and refusing half-filled ones', () => {
    expect(slipLines({ item1: 'a', qty1: '3', item2: '', qty2: '', item3: 'c', qty3: '1' })).toEqual({ lines: [{ itemId: 'a', qty: 3 }, { itemId: 'c', qty: 1 }] });
    expect(slipLines({ item1: 'a', qty1: '' })).toEqual({ error: 'line' });
    expect(slipLines({ item1: 'a', qty1: '1.5' })).toEqual({ error: 'line' });
    expect(slipLines({})).toEqual({ error: 'none' });
  });
  it('shows batch states with a tone', () => {
    expect(['expired', 'expiring', 'good', 'no_expiry'].map((s) => batchTone(s as never))).toEqual(['danger', 'warning', 'success', 'neutral']);
  });
});
