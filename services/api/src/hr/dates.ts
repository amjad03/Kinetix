import { BadRequestException } from '@nestjs/common';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export function requireMonth(v: unknown, field = 'month'): string {
  if (typeof v !== 'string' || !MONTH_RE.test(v)) throw new BadRequestException(`${field} must look like 2026-10`);
  return v;
}

export function requireDay(v: unknown, field = 'date'): string {
  if (typeof v !== 'string' || !DAY_RE.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new BadRequestException(`${field} must be a date like 2026-10-05`);
  return v;
}
