// Reading a module's settings (stored overrides merged over the catalogue defaults) and formatting numbering series.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import { moduleSettings } from '../db/schema.js';
import { DEFAULTS, type ModuleDefaults, type OpsModule } from './catalog.js';

export interface Series {
  prefix: string;
  pad: number;
  suffix: string;
}

export const SeriesBody = z.object({ prefix: z.string().max(40), next: z.number().int().min(1).max(99_999_999).optional(), pad: z.number().int().min(1).max(10), suffix: z.string().max(40).default('') });

/** The default series for a kind keeps the historic `REQ-0001` shape. */
export const defaultSeries = (kind: string): Series => ({ prefix: `${kind}-`, pad: 4, suffix: '' });

/** `{FY}` is the Indian financial year (April to March), `{YY}`/`{YYYY}` the calendar year. Mirrors the ERP's `formatSeries`. */
export function formatSeries(s: Series, n: number, on = new Date()): string {
  const y = on.getFullYear();
  const fy = on.getMonth() >= 3 ? y : y - 1;
  const expand = (x: string) => x.replaceAll('{YYYY}', String(y)).replaceAll('{YY}', String(y).slice(2)).replaceAll('{FY}', `${fy}-${String(fy + 1).slice(2)}`);
  return `${expand(s.prefix)}${String(n).padStart(s.pad, '0')}${expand(s.suffix)}`;
}

/** Stored values merged over defaults; keys no longer in the catalogue are dropped and wrong types fall back to the default. */
export function mergeSettings(module: OpsModule, stored: unknown): ModuleDefaults {
  const s = (stored ?? {}) as Partial<Record<keyof ModuleDefaults, Record<string, unknown>>>;
  const pick = <T extends Record<string, unknown>>(def: T, got: Record<string, unknown> | undefined): T =>
    Object.fromEntries(Object.entries(def).map(([k, v]) => [k, got && typeof got[k] === typeof v ? got[k] : v])) as T;
  const d = DEFAULTS[module];
  return { rules: pick(d.rules, s.rules), templates: pick(d.templates, s.templates), defaults: pick(d.defaults, s.defaults) };
}

/** A module's effective settings inside the caller's tenant transaction. */
export async function readSettings(tx: Tx, tenantId: string, module: OpsModule): Promise<ModuleDefaults> {
  const [row] = await tx.select({ settings: moduleSettings.settings }).from(moduleSettings).where(and(eq(moduleSettings.tenantId, tenantId), eq(moduleSettings.module, module)));
  return mergeSettings(module, row?.settings);
}

/** One rule as a number (library loan days, fines and the like). */
export async function ruleNumber(tx: Tx, tenantId: string, module: OpsModule, key: string): Promise<number> {
  const v = (await readSettings(tx, tenantId, module)).rules[key];
  return typeof v === 'number' ? v : Number(DEFAULTS[module].rules[key]);
}
