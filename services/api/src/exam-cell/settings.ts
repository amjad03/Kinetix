import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import { examOfficeSettings } from '../db/schema.js';
import { resolveAffiliation } from '../affiliation/resolve.js';
import type { AttendanceSlab, LateFeeSlab, MedalRule, Rates } from './exam-cell.logic.js';

/**
 * The exam cell's rules, kept in the exam office settings row under `cell`: attempts, late-fee slabs, attendance
 * marks, remuneration, invigilation ratio, the revaluation change rule, ranks, medals and document fees.
 */
export interface CellSettings {
  /** Of two attempts of a subject: the better one counts (improvement), or always the later one. */
  attemptPolicy: 'best' | 'latest';
  /** Late registration fee by days after the window closed; the later slabs are the super-fine. Empty = the office's one late fee. */
  lateFeeSlabs: LateFeeSlab[];
  /** Attendance marks: attendance at or above minPercent earns percentOfMax of the attendance component. */
  attendanceSlabs: AttendanceSlab[];
  rates: Rates;
  /** Candidates per invigilator when the roster is built. */
  perInvigilator: number;
  /** Revalued marks replace the original only when they change by this share of the maximum; null = the profile's rule (or any change). */
  revaluationThresholdPercent: number | null;
  ranks: { excludeRepeaters: boolean };
  medal: MedalRule;
  duplicateFeePaise: number;
  verificationFeePaise: number;
}

export const DEFAULT_CELL: CellSettings = {
  attemptPolicy: 'best',
  lateFeeSlabs: [],
  attendanceSlabs: [
    { minPercent: 95, percentOfMax: 100 },
    { minPercent: 90, percentOfMax: 80 },
    { minPercent: 85, percentOfMax: 60 },
    { minPercent: 80, percentOfMax: 40 },
    { minPercent: 75, percentOfMax: 20 },
  ],
  rates: { invigilatorPaise: 30_000, chiefPaise: 50_000, valuationPerScriptPaise: 2_500, chiefExaminerPerDayPaise: 100_000 },
  perInvigilator: 30,
  revaluationThresholdPercent: null,
  ranks: { excludeRepeaters: true },
  medal: { minCgpa: 6, firstAttemptOnly: true },
  duplicateFeePaise: 50_000,
  verificationFeePaise: 100_000,
};

const paise = z.number().int().min(0).max(100_000_000);
export const CellSettingsBody = z.object({
  attemptPolicy: z.enum(['best', 'latest']),
  lateFeeSlabs: z.array(z.object({ afterDays: z.number().int().min(1).max(365), amountPaise: paise, label: z.string().trim().min(1).max(60) })).max(10),
  attendanceSlabs: z.array(z.object({ minPercent: z.number().min(0).max(100), percentOfMax: z.number().min(0).max(100) })).max(12),
  rates: z.object({ invigilatorPaise: paise, chiefPaise: paise, valuationPerScriptPaise: paise, chiefExaminerPerDayPaise: paise }),
  perInvigilator: z.number().int().min(5).max(200),
  revaluationThresholdPercent: z.number().min(0).max(100).nullable(),
  ranks: z.object({ excludeRepeaters: z.boolean() }),
  medal: z.object({ minCgpa: z.number().min(0).max(10), firstAttemptOnly: z.boolean() }),
  duplicateFeePaise: paise,
  verificationFeePaise: paise,
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Stored values over the defaults, key by key (a key added later still has its default). */
export function cellWithDefaults(stored: unknown): CellSettings {
  const s = isObj(stored) ? stored : {};
  const parsed = CellSettingsBody.partial().safeParse(s);
  const v = parsed.success ? parsed.data : {};
  return { ...DEFAULT_CELL, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) } as CellSettings;
}

/** The cell settings of the tenant in `tx`. */
export async function cellSettings(tx: Tx): Promise<CellSettings> {
  const [row] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
  return cellWithDefaults(isObj(row?.settings) ? (row.settings as Record<string, unknown>).cell : undefined);
}

/** The revaluation change rule in force: the cell's own, else the affiliation profile's, else any change counts. */
export async function revaluationThreshold(tx: Tx, programId: string | null): Promise<number | null> {
  const own = (await cellSettings(tx)).revaluationThresholdPercent;
  if (own !== null) return own;
  return (await resolveAffiliation(tx, programId))?.rules.revaluation.changeThresholdPercent ?? null;
}
