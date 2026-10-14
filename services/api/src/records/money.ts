import { z } from 'zod';

/**
 * Money in a kit form: typed in rupees ("1,250.50" or 1250.5) and written to a paise column. Give the field
 * `rowKey` of a list column that shows the value in rupees (`sql\`${col} / 100.0\``) so the edit form shows it back.
 */
export const Rupees = z
  .union([z.number(), z.string().trim()])
  .transform((v, c) => {
    const n = typeof v === 'number' ? v : Number(v.replace(/[,₹\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      c.addIssue({ code: 'custom', message: 'Enter an amount in rupees' });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

/** As {@link Rupees}, but empty means none. */
export const OptionalRupees = z
  .union([z.number(), z.string().trim(), z.null()])
  .transform((v, c) => {
    if (v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v.replace(/[,₹\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      c.addIssue({ code: 'custom', message: 'Enter an amount in rupees' });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

/** Rupees in a text cell of an import file, as paise; null when empty. */
export function rupeesCell(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text.replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
