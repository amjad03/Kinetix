// Module settings for the quality, outcomes and engagement group. Every key here is read by the module's
// own code (see qualitySettings callers), so a saved value changes behaviour. Rules, templates and defaults
// live in module_settings.settings; numbering series live in module_settings.numbering keyed by the
// document counter they format (common/ops.ts nextNumber), with the next number kept in doc_counters.
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defaultSeries, type Series } from '../campus-ops/settings.js';
import type { Tx } from '../db/db.service.js';
import { moduleSettings } from '../db/schema.js';

export const QUALITY_MODULES = ['obe', 'accreditation', 'feedback', 'mentoring', 'grievances', 'placements', 'alumni', 'research', 'events', 'communication', 'documents', 'skills'] as const;
export type QualityModule = (typeof QUALITY_MODULES)[number];
/** Modules with a settings page (accreditation is configured from the IQAC workspace). */
export const SETTINGS_MODULES = ['obe', 'feedback', 'mentoring', 'grievances', 'placements', 'alumni', 'research', 'events', 'communication', 'documents', 'skills'] as const;
export type SettingsModule = (typeof SETTINGS_MODULES)[number];

export type RuleValue = number | boolean | string;
export interface RuleDef {
  key: string;
  kind: 'number' | 'boolean' | 'choice';
  default: RuleValue;
  min?: number;
  max?: number;
  choices?: string[];
}
export interface ModuleCatalogue {
  /** Document counters this module numbers with. */
  numbering: string[];
  rules: RuleDef[];
  templates: Record<string, string>;
  defaults: RuleDef[];
}

const num = (key: string, d: number, min: number, max: number): RuleDef => ({ key, kind: 'number', default: d, min, max });
const flag = (key: string, d: boolean): RuleDef => ({ key, kind: 'boolean', default: d });

export const SETTINGS_CATALOGUE: Record<SettingsModule, ModuleCatalogue> = {
  // PUT /v1/obe/actions/:id: closing a gap action needs its root cause.
  obe: { numbering: [], rules: [flag('requireRootCause', false)], templates: {}, defaults: [] },
  // POST /v1/surveys: anonymity when the form leaves it out; PUT iqac/feedback-reports: action text before "action taken".
  feedback: { numbering: [], rules: [flag('actionTextRequired', false)], templates: {}, defaults: [flag('anonymousByDefault', false)] },
  // Mentor assignments stop at this many open mentees per mentor.
  mentoring: { numbering: [], rules: [num('menteesPerMentor', 60, 1, 500)], templates: {}, defaults: [] },
  // Raising a grievance: ticket number, deadline by severity, anonymity; resolving: the message to the reporter.
  grievances: {
    numbering: ['GRV'],
    rules: [num('slaCriticalHours', 24, 1, 720), num('slaHighHours', 48, 1, 720), num('slaMediumHours', 120, 1, 720), num('slaLowHours', 240, 1, 720), flag('allowAnonymous', true)],
    templates: { resolved: '{ticketNo}. Please rate how it went.' },
    defaults: [],
  },
  // New drives start with these eligibility limits; offers get a response deadline this many days out (0: none).
  placements: { numbering: [], rules: [num('offerResponseDays', 0, 0, 60)], templates: {}, defaults: [num('minCgpa', 0, 0, 10), num('maxBacklogs', 0, 0, 50)] },
  // Students may ask alumni for mentoring only while this is on.
  alumni: { numbering: [], rules: [flag('mentorshipEnabled', true)], templates: {}, defaults: [] },
  // Project codes from approved proposals and new projects.
  research: { numbering: ['PRJ'], rules: [], templates: {}, defaults: [] },
  // New events start with this capacity when none is given.
  events: { numbering: [], rules: [], templates: {}, defaults: [num('defaultCapacity', 100, 1, 100000)] },
  // Campaigns may not be scheduled inside the quiet hours (institution time).
  communication: { numbering: [], rules: [flag('quietHoursOn', false), num('quietHoursStart', 21, 0, 23), num('quietHoursEnd', 7, 0, 23)], templates: {}, defaults: [] },
  // Issuing a certificate: whether a request must be approved first.
  documents: { numbering: [], rules: [flag('approvalBeforeIssue', true)], templates: {}, defaults: [] },
  // Skill evidence is recorded up to this level.
  skills: { numbering: [], rules: [num('maxLevel', 5, 3, 10)], templates: {}, defaults: [] },
};

export interface ModuleSettings {
  numbering: Record<string, Series & { next?: number }>;
  rules: Record<string, RuleValue>;
  templates: Record<string, string>;
  defaults: Record<string, RuleValue>;
}

const SeriesBody = z.object({ prefix: z.string().max(40), next: z.number().int().min(1).max(99_999_999).optional(), pad: z.number().int().min(1).max(10), suffix: z.string().max(40).default('') });
const Value = z.union([z.number(), z.boolean(), z.string().max(40)]);
export const SettingsBody = z.object({
  numbering: z.record(z.string(), SeriesBody).default({}),
  rules: z.record(z.string(), Value).default({}),
  templates: z.record(z.string(), z.string().max(1000)).default({}),
  defaults: z.record(z.string(), Value).default({}),
});

const ruleOk = (d: RuleDef, v: RuleValue) =>
  d.kind === 'number' ? typeof v === 'number' && Number.isFinite(v) && v >= (d.min ?? -Infinity) && v <= (d.max ?? Infinity) : d.kind === 'boolean' ? typeof v === 'boolean' : typeof v === 'string' && (d.choices ?? []).includes(v);

/** Problems with a settings body against the module's catalogue; empty when it is valid. */
export function settingsProblems(m: SettingsModule, b: Omit<ModuleSettings, 'numbering'> & { numbering: Record<string, unknown> }): string[] {
  const c = SETTINGS_CATALOGUE[m];
  const out: string[] = [];
  for (const k of Object.keys(b.numbering)) if (!c.numbering.includes(k)) out.push(`Unknown numbering series ${k}`);
  for (const k of Object.keys(b.templates)) if (!(k in c.templates)) out.push(`Unknown template ${k}`);
  for (const [group, defs] of [['rules', c.rules], ['defaults', c.defaults]] as const) {
    for (const [k, v] of Object.entries(b[group])) {
      const d = defs.find((x) => x.key === k);
      if (!d) out.push(`Unknown ${group === 'rules' ? 'rule' : 'default'} ${k}`);
      else if (!ruleOk(d, v)) out.push(`${k} is out of range`);
    }
  }
  return out;
}

type Stored = Partial<Omit<ModuleSettings, 'numbering'>>;

/** The catalogue's defaults with a tenant's stored values on top; unknown or mistyped values fall back. */
export function effectiveSettings(m: SettingsModule, stored: Stored | null, numbering: Record<string, Series> | null = null): ModuleSettings {
  const c = SETTINGS_CATALOGUE[m];
  const pick = (defs: RuleDef[], got: Record<string, RuleValue> | undefined) => Object.fromEntries(defs.map((d) => [d.key, got && got[d.key] !== undefined && ruleOk(d, got[d.key]) ? got[d.key] : d.default]));
  return {
    numbering: Object.fromEntries(c.numbering.map((k) => [k, numbering?.[k] ?? defaultSeries(k)])),
    rules: pick(c.rules, stored?.rules),
    templates: Object.fromEntries(Object.entries(c.templates).map(([k, v]) => [k, typeof stored?.templates?.[k] === 'string' && stored.templates[k] ? stored.templates[k] : v])),
    defaults: pick(c.defaults, stored?.defaults),
  };
}

/** A module's effective settings inside the caller's tenant transaction; the modules read these to apply them. */
export async function qualitySettings(tx: Tx, tenantId: string, m: SettingsModule): Promise<ModuleSettings> {
  const [row] = await tx.select({ settings: moduleSettings.settings, numbering: moduleSettings.numbering }).from(moduleSettings).where(and(eq(moduleSettings.tenantId, tenantId), eq(moduleSettings.module, m)));
  return effectiveSettings(m, (row?.settings as Stored | undefined) ?? null, (row?.numbering as Record<string, Series> | undefined) ?? null);
}

/** Hour of day (0-23) of a moment in a time zone. */
const hourIn = (at: Date, timeZone: string) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at)) % 24;

/** Whether `hour` falls in the quiet window [start, end), which may run past midnight. */
export const inQuietHours = (hour: number, start: number, end: number) => (start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end);

/** Communication settings: an error message when a campaign is scheduled inside the institution's quiet hours. */
export async function quietHoursProblem(tx: Tx, tenantId: string, at: Date): Promise<string | null> {
  const s = await qualitySettings(tx, tenantId, 'communication');
  if (!s.rules.quietHoursOn) return null;
  const [t] = (await tx.execute<{ tz: string | null }>(sql`select timezone as tz from tenants limit 1`)).rows;
  const start = Number(s.rules.quietHoursStart);
  const end = Number(s.rules.quietHoursEnd);
  return inQuietHours(hourIn(at, t?.tz || 'Asia/Kolkata'), start, end) ? `Messages cannot be scheduled in the quiet hours (${start}:00 to ${end}:00)` : null;
}

/** Mentoring settings: an error message when a mentor already has the most mentees allowed. */
export async function menteeCapProblem(tx: Tx, tenantId: string, mentorUserId: string): Promise<string | null> {
  const cap = Number((await qualitySettings(tx, tenantId, 'mentoring')).rules.menteesPerMentor);
  const [r] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from mentor_assignments where mentor_user_id = ${mentorUserId}::uuid and ended_on is null`)).rows;
  return (r?.n ?? 0) >= cap ? `This mentor already has ${cap} mentees, the most allowed` : null;
}

/** `{name}` placeholders filled from `vars`; unknown placeholders are left as they are. */
export const fillTemplate = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k])));
