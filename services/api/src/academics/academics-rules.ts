import { z } from 'zod';
import type { AcademicRequestStep } from '../db/schema.js';

/** Pure rules of the academics core: settings with their defaults, numbering series and the approval workflows. */

export const Series = z.object({ prefix: z.string().trim().max(40), next: z.number().int().min(1).max(99_999_999), pad: z.number().int().min(1).max(10), suffix: z.string().trim().max(20).default('') });
export type Series = z.infer<typeof Series>;

const Component = z.object({ code: z.string().trim().min(1).max(12), name: z.string().trim().min(1).max(80), weight: z.number().min(0).max(100), maxMarks: z.number().positive().max(1000) });

export const SETTINGS_SCHEMAS = {
  numbering: z.object({ admission: Series, roll: Series, tc: Series, request: Series, rollPerSection: z.boolean().default(true) }),
  attendance: z.object({
    minPercent: z.number().min(0).max(100),
    warnPercent: z.number().min(0).max(100),
    lateCountsAsPresent: z.boolean(),
    correctionWindowDays: z.number().int().min(0).max(90),
    maxCondonationPoints: z.number().int().min(0).max(30),
    notifyGuardianOnAbsence: z.boolean(),
    /** hour: each timetable period; day: one mark a day; session: forenoon and afternoon. */
    mode: z.enum(['hour', 'day', 'session']).default('hour'),
    /** Tell the student and family when they fall under the warning level and under the minimum. */
    shortageAlerts: z.boolean().default(true),
    /** A summary of the day's absences to the family in the evening, instead of one message a period. */
    dailyDigest: z.boolean().default(false),
    /** Remind the teacher of a period not marked this many minutes after it ends (0 = no reminder). */
    unmarkedReminderMinutes: z.number().int().min(0).max(1440).default(30),
    /** How approved leave counts: on duty as present (or excused), medical and personal leave as absent (or excused). */
    onDutyCountsAs: z.enum(['present', 'excused']).default('present'),
    medicalCountsAs: z.enum(['absent', 'excused']).default('absent'),
    personalCountsAs: z.enum(['absent', 'excused']).default('absent'),
    /** Fee for a condonation, in paise (0 = no fee). */
    condonationFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  }),
  assessment: z.object({ components: z.array(Component).max(12), lockBeforePublish: z.boolean(), passPercent: z.number().min(0).max(100) }),
  timetable: z.object({
    periodsPerDay: z.number().int().min(1).max(14),
    periodMinutes: z.number().int().min(20).max(120),
    maxPeriodsPerTeacherPerDay: z.number().int().min(1).max(14),
    maxPeriodsPerTeacherPerWeek: z.number().int().min(1).max(70),
    changeNeedsApproval: z.boolean(),
    substitutionNeedsApproval: z.boolean(),
  }),
  registration: z.object({ minCredits: z.number().min(0).max(60), maxCredits: z.number().min(1).max(60), advisorApproval: z.boolean(), addDropDays: z.number().int().min(0).max(60), waitlist: z.boolean() }),
  /** Teaching load norms (UGC: 16 hours a week for an assistant professor, 14 for associate professors and professors). */
  workload: z.object({
    defaultHoursPerWeek: z.number().int().min(1).max(60),
    norms: z.array(z.object({ designation: z.string().trim().min(1).max(80), hoursPerWeek: z.number().int().min(1).max(60) })).max(30),
  }),
} as const;

export type SettingsKind = keyof typeof SETTINGS_SCHEMAS;
export const SETTINGS_KINDS = Object.keys(SETTINGS_SCHEMAS) as SettingsKind[];
export type Settings<K extends SettingsKind> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

export const SETTINGS_DEFAULTS: { [K in SettingsKind]: Settings<K> } = {
  numbering: {
    admission: { prefix: 'ADM/{FY}/', next: 1, pad: 4, suffix: '' },
    roll: { prefix: '', next: 1, pad: 2, suffix: '' },
    tc: { prefix: 'TC/{FY}/', next: 1, pad: 4, suffix: '' },
    request: { prefix: 'AR/{FY}/', next: 1, pad: 5, suffix: '' },
    rollPerSection: true,
  },
  attendance: {
    minPercent: 75,
    warnPercent: 80,
    lateCountsAsPresent: true,
    correctionWindowDays: 7,
    maxCondonationPoints: 10,
    notifyGuardianOnAbsence: true,
    mode: 'hour',
    shortageAlerts: true,
    dailyDigest: false,
    unmarkedReminderMinutes: 30,
    onDutyCountsAs: 'present',
    medicalCountsAs: 'absent',
    personalCountsAs: 'absent',
    condonationFeePaise: 0,
  },
  assessment: {
    components: [
      { code: 'IA1', name: 'Internal test 1', weight: 30, maxMarks: 25 },
      { code: 'IA2', name: 'Internal test 2', weight: 30, maxMarks: 25 },
      { code: 'ASG', name: 'Assignments', weight: 20, maxMarks: 10 },
      { code: 'ATT', name: 'Attendance', weight: 20, maxMarks: 5 },
    ],
    lockBeforePublish: false,
    passPercent: 35,
  },
  timetable: { periodsPerDay: 8, periodMinutes: 45, maxPeriodsPerTeacherPerDay: 6, maxPeriodsPerTeacherPerWeek: 30, changeNeedsApproval: true, substitutionNeedsApproval: true },
  registration: { minCredits: 16, maxCredits: 26, advisorApproval: true, addDropDays: 14, waitlist: true },
  workload: {
    defaultHoursPerWeek: 16,
    norms: [
      { designation: 'Professor', hoursPerWeek: 14 },
      { designation: 'Associate Professor', hoursPerWeek: 14 },
      { designation: 'Assistant Professor', hoursPerWeek: 16 },
    ],
  },
};

/** Problems the schema cannot express; empty when the settings are consistent. */
export function settingsProblem(kind: SettingsKind, v: Record<string, unknown>): string | null {
  if (kind === 'attendance' && (v.warnPercent as number) < (v.minPercent as number)) return 'The warning level must be at or above the minimum attendance';
  if (kind === 'registration' && (v.minCredits as number) > (v.maxCredits as number)) return 'Minimum credits cannot exceed maximum credits';
  if (kind === 'workload') {
    const names = (v.norms as { designation: string }[]).map((n) => n.designation.toLowerCase());
    if (new Set(names).size !== names.length) return 'Each designation can have only one norm';
  }
  if (kind === 'timetable' && (v.maxPeriodsPerTeacherPerDay as number) > (v.periodsPerDay as number)) return 'A teacher cannot have more periods a day than the day has';
  if (kind === 'assessment') {
    const c = v.components as { code: string; weight: number }[];
    if (new Set(c.map((x) => x.code.toUpperCase())).size !== c.length) return 'Each component needs its own code';
    const total = c.reduce((s, x) => s + x.weight, 0);
    if (c.length > 0 && Math.abs(total - 100) > 0.01) return `Component weights must add up to 100 (now ${total})`;
  }
  return null;
}

/** The number a series gives on a date, e.g. TC/2026-27/0042. `{FY}` is the Indian financial year (April-March). */
export function formatSeries(s: Series, on: Date): string {
  const y = on.getUTCFullYear();
  const fy = on.getUTCMonth() >= 3 ? y : y - 1;
  const ex = (x: string) => x.replaceAll('{YYYY}', String(y)).replaceAll('{YY}', String(y).slice(2)).replaceAll('{FY}', `${fy}-${String(fy + 1).slice(2)}`);
  return `${ex(s.prefix)}${String(s.next).padStart(s.pad, '0')}${ex(s.suffix ?? '')}`;
}

/** The next free roll number in a class: one more than the highest numeric roll, padded like the series. */
export function nextRoll(existing: string[], s: Series): string {
  const nums = existing.map((r) => Number(r.replace(/\D/g, ''))).filter((n) => Number.isFinite(n));
  const n = Math.max(s.next - 1, ...nums, 0) + 1;
  return `${s.prefix}${String(n).padStart(s.pad, '0')}${s.suffix ?? ''}`;
}

// ---------------------------------------------------------------------------------------------
// Approval workflows
// ---------------------------------------------------------------------------------------------

export const REQUEST_KINDS = ['admission_handover', 'section_change', 'withdrawal', 'timetable_change', 'substitution'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

type Role = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'guardian' | 'accountant' | 'librarian' | 'admissions_officer';
const HEADS: Role[] = ['principal', 'tenant_admin'];

/** Who may raise each kind, and the steps (with the roles that may decide each). */
export const ACADEMIC_WORKFLOWS: Record<RequestKind, { raise: Role[]; steps: { key: string; roles: Role[] }[] }> = {
  // Admissions hands an enrolled student to the academic office, which confirms the class; the class side acknowledges.
  admission_handover: { raise: ['admissions_officer', ...HEADS], steps: [{ key: 'academic_office', roles: HEADS }, { key: 'class_teacher', roles: ['teacher', 'hod', ...HEADS] }] },
  section_change: { raise: ['teacher', 'hod', 'admissions_officer', ...HEADS], steps: [{ key: 'hod', roles: ['hod', ...HEADS] }, { key: 'principal', roles: HEADS }] },
  // Fee and library clearance before the principal issues the transfer certificate.
  withdrawal: { raise: ['guardian', 'teacher', 'hod', 'admissions_officer', ...HEADS], steps: [{ key: 'accounts', roles: ['accountant', ...HEADS] }, { key: 'library', roles: ['librarian', ...HEADS] }, { key: 'principal', roles: HEADS }] },
  timetable_change: { raise: ['teacher', 'hod', ...HEADS], steps: [{ key: 'hod', roles: ['hod', ...HEADS] }, { key: 'principal', roles: HEADS }] },
  substitution: { raise: ['teacher', 'hod', ...HEADS], steps: [{ key: 'principal', roles: ['hod', ...HEADS] }] },
};

export const canRaise = (kind: RequestKind, roles: readonly string[]) => ACADEMIC_WORKFLOWS[kind].raise.some((r) => roles.includes(r));

export function initialSteps(kind: RequestKind): AcademicRequestStep[] {
  return ACADEMIC_WORKFLOWS[kind].steps.map((s, i) => ({ key: s.key, state: i === 0 ? 'current' : 'upcoming' }));
}

/** The step waiting for a decision, or null when the request is closed. */
export const currentStep = (steps: AcademicRequestStep[]) => steps.findIndex((s) => s.state === 'current');

export function canDecideStep(kind: RequestKind, steps: AcademicRequestStep[], roles: readonly string[]): boolean {
  const i = currentStep(steps);
  if (i < 0) return false;
  const def = ACADEMIC_WORKFLOWS[kind].steps.find((s) => s.key === steps[i].key);
  return !!def && def.roles.some((r) => roles.includes(r));
}

/**
 * Applies a decision to the steps. Approving moves to the next step (or finishes); rejecting stops
 * the request and needs a note. Returns the new steps and whether the request is now approved or rejected.
 */
export function decide(steps: AcademicRequestStep[], decision: 'approve' | 'reject', actor: { id: string; name: string; at: string; note?: string | null }): { steps: AcademicRequestStep[]; status: 'pending' | 'approved' | 'rejected' } {
  const i = currentStep(steps);
  if (i < 0) throw new Error('closed');
  if (decision === 'reject' && !actor.note?.trim()) throw new Error('note');
  const stamp = { by: actor.id, byName: actor.name, at: actor.at, note: actor.note?.trim() || null };
  const out = steps.map((s) => ({ ...s }));
  if (decision === 'reject') {
    out[i] = { ...out[i], ...stamp, state: 'rejected' };
    for (let j = i + 1; j < out.length; j++) out[j].state = 'skipped';
    return { steps: out, status: 'rejected' };
  }
  out[i] = { ...out[i], ...stamp, state: 'done' };
  if (i + 1 < out.length) {
    out[i + 1].state = 'current';
    return { steps: out, status: 'pending' };
  }
  return { steps: out, status: 'approved' };
}

// ---------------------------------------------------------------------------------------------
// Attendance arithmetic for the registers
// ---------------------------------------------------------------------------------------------

/** Percentage to one decimal, or null when nothing was held. */
export const pct = (attended: number, held: number) => (held > 0 ? Math.round((attended / held) * 1000) / 10 : null);

/** Whether a student is short of attendance after condonation points. */
export const isShort = (percent: number | null, condonedPoints: number, minPercent: number) => percent !== null && Math.min(100, percent + condonedPoints) < minPercent;

