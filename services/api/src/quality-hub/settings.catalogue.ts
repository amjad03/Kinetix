// Module settings for the quality, outcomes and engagement group: numbering series, rules, message
// templates and defaults per module. The keys and defaults live here; a tenant's overrides live in
// module_settings. Unknown keys are rejected so a typo never silently becomes a setting.
import { z } from 'zod';

export const QUALITY_MODULES = ['obe', 'accreditation', 'feedback', 'mentoring', 'grievances', 'placements', 'alumni', 'research', 'events', 'communication', 'documents', 'skills'] as const;
export type QualityModule = (typeof QUALITY_MODULES)[number];

export interface Series {
  prefix: string;
  next: number;
  pad: number;
  suffix?: string;
}
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
  numbering: Record<string, Series>;
  rules: RuleDef[];
  templates: Record<string, string>;
  defaults: RuleDef[];
}

const num = (key: string, d: number, min: number, max: number): RuleDef => ({ key, kind: 'number', default: d, min, max });
const flag = (key: string, d: boolean): RuleDef => ({ key, kind: 'boolean', default: d });
const pick = (key: string, d: string, choices: string[]): RuleDef => ({ key, kind: 'choice', default: d, choices });
const S = (prefix: string, pad = 4): Series => ({ prefix, next: 1, pad });

export const SETTINGS_CATALOGUE: Record<QualityModule, ModuleCatalogue> = {
  obe: {
    numbering: { gapAction: S('CQI/{FY}/') },
    rules: [num('attainmentTargetPct', 60, 0, 100), num('directWeightPct', 80, 0, 100), num('gapThresholdPct', 10, 0, 100), flag('requireRootCause', true)],
    templates: { gapActionAssigned: 'A gap action "{title}" is assigned to you, due {dueOn}.' },
    defaults: [pick('attainmentLevels', '3', ['2', '3']), num('remeasureAfterDays', 90, 7, 365)],
  },
  accreditation: {
    numbering: { atr: S('IQAC/ATR/{FY}/', 3) },
    rules: [num('iqacMeetingsPerYear', 4, 1, 12), flag('evidenceNeedsVerification', true), num('evidenceReminderDays', 14, 1, 90)],
    templates: { evidenceRequested: 'Please upload evidence for {metric} by {dueOn}.' },
    defaults: [pick('primaryBody', 'naac', ['naac', 'nba', 'nirf', 'aishe']), pick('cycle', 'annual', ['annual', 'five_year'])],
  },
  feedback: {
    numbering: { report: S('FB/{FY}/', 3) },
    rules: [num('minResponsesForAnalysis', 20, 1, 1000), num('actionDueDays', 30, 1, 180), flag('anonymousByDefault', true)],
    templates: { surveyOpened: 'Your feedback is requested: {title}. It closes on {closesOn}.', actionTaken: 'Thank you for your feedback. Action taken: {action}.' },
    defaults: [pick('ratingScale', '5', ['5', '10']), pick('stakeholder', 'students', ['students', 'teachers', 'employers', 'alumni', 'parents'])],
  },
  mentoring: {
    numbering: {},
    rules: [num('menteesPerMentor', 20, 1, 100), num('meetingEveryDays', 30, 7, 120), flag('notifyGuardianOnRisk', true)],
    templates: { sessionReminder: 'Mentoring session with {mentor} on {date}.' },
    defaults: [pick('mode', 'in_person', ['in_person', 'phone', 'online'])],
  },
  grievances: {
    numbering: { ticket: S('GRV/{FY}/', 5) },
    rules: [num('slaHours', 72, 4, 720), num('escalateAfterHours', 48, 1, 720), flag('allowAnonymous', true), flag('ratingRequired', false)],
    templates: { received: 'Your grievance {ticketNo} was received. We will respond within {slaHours} hours.', resolved: 'Your grievance {ticketNo} was resolved. Please rate how it went.' },
    defaults: [pick('severity', 'medium', ['low', 'medium', 'high', 'critical'])],
  },
  placements: {
    numbering: { drive: S('PD/{FY}/', 3), offer: S('OFR/{FY}/') },
    rules: [num('minCgpa', 6, 0, 10), num('maxBacklogs', 0, 0, 20), flag('onePlacementPolicy', true), num('offerResponseDays', 7, 1, 60)],
    templates: { driveOpened: 'A new drive is open: {company}, {role}. Register by {closesOn}.', offerMade: 'Congratulations! {company} has offered you {role}.' },
    defaults: [pick('kind', 'placement', ['placement', 'internship'])],
  },
  alumni: {
    numbering: { receipt: S('ALM/{FY}/') },
    rules: [flag('directoryOptIn', true), flag('mentorshipEnabled', true)],
    templates: { welcome: 'Welcome to the alumni network, {name}.' },
    defaults: [pick('visibility', 'private', ['private', 'alumni', 'public'])],
  },
  research: {
    numbering: { project: S('RP/{FY}/', 3), patent: S('IPR/{FY}/', 3) },
    rules: [flag('ethicsForHumanSubjects', true), num('overheadPct', 10, 0, 50), num('milestoneReminderDays', 7, 1, 60)],
    templates: { proposalDecided: 'Your proposal "{title}" was {decision}.' },
    defaults: [pick('kind', 'research', ['research', 'capstone', 'industry'])],
  },
  events: {
    numbering: { event: S('EV/{FY}/', 3) },
    rules: [flag('needsApproval', true), num('defaultCapacity', 100, 1, 10000), flag('feedbackAfterEvent', true)],
    templates: { registered: 'You are registered for {title} on {date}.' },
    defaults: [pick('audience', 'all', ['all', 'students', 'parents', 'staff'])],
  },
  communication: {
    numbering: { circular: S('CIR/{FY}/', 3), notice: S('NOT/{FY}/', 3) },
    rules: [flag('approvalBeforeSend', true), num('quietHoursStart', 21, 0, 23), num('quietHoursEnd', 7, 0, 23), num('dailyLimitPerPerson', 3, 1, 20)],
    templates: { footer: 'Sent by {institution}. Reply STOP to opt out of SMS.' },
    defaults: [pick('channel', 'app', ['app', 'sms', 'email', 'whatsapp'])],
  },
  documents: {
    numbering: { certificate: S('CERT/{FY}/', 5), bonafide: S('BON/{FY}/', 4) },
    rules: [flag('approvalBeforeIssue', true), num('turnaroundDays', 3, 1, 30), flag('qrVerification', true)],
    templates: { issued: 'Your {document} is ready. Serial {serialNo}.' },
    defaults: [pick('paper', 'a4', ['a4', 'letter'])],
  },
  skills: {
    numbering: { passport: S('SKP/{YYYY}/', 5) },
    rules: [num('maxLevel', 5, 3, 10), flag('evidenceRequired', true), flag('teacherCanVerify', true)],
    templates: { levelUp: '{student} reached level {level} in {skill}.' },
    defaults: [pick('category', 'skill', ['knowledge', 'skill', 'attitude', 'leadership'])],
  },
};

export interface ModuleSettings {
  numbering: Record<string, Series>;
  rules: Record<string, RuleValue>;
  templates: Record<string, string>;
  defaults: Record<string, RuleValue>;
}

const SeriesBody = z.object({ prefix: z.string().max(40), next: z.number().int().min(1).max(99_999_999), pad: z.number().int().min(1).max(10), suffix: z.string().max(20).optional() });
export const SettingsBody = z.object({
  numbering: z.record(z.string(), SeriesBody).default({}),
  rules: z.record(z.string(), z.union([z.number(), z.boolean(), z.string().max(40)])).default({}),
  templates: z.record(z.string(), z.string().max(1000)).default({}),
  defaults: z.record(z.string(), z.union([z.number(), z.boolean(), z.string().max(40)])).default({}),
});

const ruleOk = (d: RuleDef, v: RuleValue) =>
  d.kind === 'number' ? typeof v === 'number' && Number.isFinite(v) && v >= (d.min ?? -Infinity) && v <= (d.max ?? Infinity) : d.kind === 'boolean' ? typeof v === 'boolean' : typeof v === 'string' && (d.choices ?? []).includes(v);

/** Problems with a settings body against the module's catalogue; empty when it is valid. */
export function settingsProblems(m: QualityModule, b: ModuleSettings): string[] {
  const c = SETTINGS_CATALOGUE[m];
  const out: string[] = [];
  for (const k of Object.keys(b.numbering)) if (!(k in c.numbering)) out.push(`Unknown numbering series ${k}`);
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

/** The catalogue's defaults with a tenant's stored overrides on top. */
export function effectiveSettings(m: QualityModule, stored: Partial<ModuleSettings> | null): ModuleSettings {
  const c = SETTINGS_CATALOGUE[m];
  const fromDefs = (defs: RuleDef[]) => Object.fromEntries(defs.map((d) => [d.key, d.default]));
  return {
    numbering: { ...c.numbering, ...(stored?.numbering ?? {}) },
    rules: { ...fromDefs(c.rules), ...(stored?.rules ?? {}) },
    templates: { ...c.templates, ...(stored?.templates ?? {}) },
    defaults: { ...fromDefs(c.defaults), ...(stored?.defaults ?? {}) },
  };
}
