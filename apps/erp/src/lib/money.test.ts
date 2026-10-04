import { describe, expect, it } from 'vitest';
import { formatRupees, formatRupeesShort, paiseToInput, rupeesInWords, rupeesToPaise } from './money';

describe('money', () => {
  it('formats paise as Indian rupees with lakh grouping', () => {
    expect(formatRupees(12345600)).toBe('₹1,23,456');
    expect(formatRupees(185050)).toBe('₹1,850.50');
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(91620000)).toBe('₹9,16,200');
  });

  it('shortens big totals to lakh and crore', () => {
    expect(formatRupeesShort(91620000)).toBe('₹9.16 L');
    expect(formatRupeesShort(4250000000)).toBe('₹4.25 Cr');
    expect(formatRupeesShort(4500000)).toBe('₹45,000');
  });

  it('reads rupees typed at the counter', () => {
    expect(rupeesToPaise('42500')).toBe(4250000);
    expect(rupeesToPaise('₹ 1,23,456.5')).toBe(12345650);
    expect(rupeesToPaise('1850.05')).toBe(185005);
    expect(rupeesToPaise('Rs. 100')).toBe(10000);
    expect(rupeesToPaise('')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });

  it('round-trips amounts for input fields', () => {
    expect(paiseToInput(4250000)).toBe('42500');
    expect(paiseToInput(185050)).toBe('1850.50');
  });
});

describe('rupeesInWords', () => {
  it('writes amounts the Indian way', () => {
    expect(rupeesInWords(4250000)).toBe('Rupees Forty-Two Thousand Five Hundred only');
    expect(rupeesInWords(12345650)).toBe('Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise only');
    expect(rupeesInWords(1_50_00_000_00)).toBe('Rupees One Crore Fifty Lakh only');
    expect(rupeesInWords(185000)).toBe('Rupees One Thousand Eight Hundred Fifty only');
    expect(rupeesInWords(0)).toBe('Rupees Zero only');
  });
});
