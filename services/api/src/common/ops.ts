import { ConflictException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import { docCounters } from '../db/schema.js';

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
export const Paise = z.number().int().min(0).max(100_000_000_00);

/** Runs `fn`; a unique-constraint violation becomes 409 with `message`. */
export async function orConflict<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') throw new ConflictException(message);
    throw e;
  }
}

/** The next number of a per-institution series: `REQ-0001`. */
export async function nextNumber(tx: Tx, tenantId: string, kind: string): Promise<string> {
  const [c] = await tx
    .insert(docCounters)
    .values({ tenantId, kind, lastNo: 1 })
    .onConflictDoUpdate({ target: [docCounters.tenantId, docCounters.kind], set: { lastNo: sql`${docCounters.lastNo} + 1` } })
    .returning();
  return `${kind}-${String(c.lastNo).padStart(4, '0')}`;
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Minutes to cover `metres` at `speedKmh` (a stopped or unknown bus is taken as 20 km/h in town traffic). */
export function etaMinutes(metres: number, speedKmh: number | null): number {
  const v = speedKmh && speedKmh >= 5 ? speedKmh : 20;
  return Math.max(1, Math.ceil((metres / 1000 / v) * 60));
}

export interface Depreciable {
  costPaise: number;
  salvagePaise: number;
  usefulLifeYears: number;
  method: string;
  wdvRatePct: number | null;
}

/** Year-by-year depreciation: straight-line, or written-down value at a fixed rate (never below salvage). */
export function depreciationSchedule(a: Depreciable): { year: number; depreciationPaise: number; bookValuePaise: number }[] {
  const out: { year: number; depreciationPaise: number; bookValuePaise: number }[] = [];
  let book = a.costPaise;
  const slm = Math.floor((a.costPaise - a.salvagePaise) / a.usefulLifeYears);
  for (let y = 1; y <= a.usefulLifeYears; y++) {
    let d = a.method === 'wdv' ? Math.round((book * (a.wdvRatePct ?? 0)) / 100) : slm;
    if (y === a.usefulLifeYears && a.method !== 'wdv') d = book - a.salvagePaise;
    d = Math.max(0, Math.min(d, book - a.salvagePaise));
    book -= d;
    out.push({ year: y, depreciationPaise: d, bookValuePaise: book });
  }
  return out;
}

/** Book value after `fullYears` (whole years since purchase). */
export function bookValueAfter(a: Depreciable, fullYears: number): number {
  const s = depreciationSchedule(a);
  if (fullYears <= 0) return a.costPaise;
  return s[Math.min(fullYears, s.length) - 1].bookValuePaise;
}
