// Small pieces every import handler uses: row errors, row outcomes and required/integer cells.
import type { RowStatus } from './import.service.js';

/** A problem with one row: its message is a key of ERROR_CODES, the detail names the value. */
export class RowError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export const fail = (message: string, detail?: string): never => {
  throw new RowError(message, detail);
};
export interface Outcome {
  status: Exclude<RowStatus, 'error'>;
  message: string;
}
export type Row = { line: number; get: (key: string) => string };
export const lc = (s: string) => s.trim().toLowerCase();
export function outcome(created: boolean, changed: boolean, parts: string[]): Outcome {
  return { status: created ? 'created' : changed ? 'updated' : 'skipped', message: parts.filter(Boolean).join(' · ') };
}
export function required(r: Row, key: string): string {
  return r.get(key) || fail('This value is required', key);
}
export function int(text: string, min: number, max: number, outside = 'This value is not valid'): number {
  if (!/^\d+$/.test(text)) fail('This value is not valid', text || '(empty)');
  const n = Number(text);
  if (n < min || n > max) fail(outside, text);
  return n;
}
