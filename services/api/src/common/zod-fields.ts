import { z } from 'zod';
import { normalizePhone } from '../auth/phone.js';

/** A calendar day, `2026-10-15`. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15').refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date');

/** A phone number typed as people type it, stored as E.164. */
export const Phone = z
  .string()
  .trim()
  .max(30)
  .transform(normalizePhone)
  .refine((v) => /^\+\d{8,15}$/.test(v), 'Enter a phone number');
