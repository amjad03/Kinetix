/**
 * Exam office rules that need no database: the session workflow, numbering series, the module settings
 * with their defaults, exam fees, moderation of marks and the result statistics behind the reports.
 */

/** The life of an exam session, in order. */
export const STAGES = ['setup', 'timetable', 'registration', 'fees', 'hall_tickets', 'conduct', 'valuation', 'moderation', 'result_approval', 'published', 'revaluation', 'supplementary'] as const;
export type Stage = (typeof STAGES)[number];

/** Stages that a second person approves; the others are completed by the exam office once their check passes. */
export const APPROVAL_STAGES: Stage[] = ['timetable', 'result_approval'];

/** What the workflow knows about a session when it decides whether a stage can close. */
export interface StageFacts {
  papers: number;
  hasWindow: boolean;
  registrations: number;
  feeDues: number;
  feeOpen: number;
  tickets: number;
  papersHeld: number;
  papersWithAttendance: number;
  scripts: number;
  scriptsOpen: number;
  moderationsOpen: number;
  status: 'draft' | 'scheduled' | 'processed' | 'published' | 'locked';
  approvalRequired: boolean;
  approved: boolean;
  revaluationsOpen: number;
}

/** Why the stage cannot be completed yet (a message for the exam office), or null when it can. */
export function stageBlocker(stage: Stage, f: StageFacts): string | null {
  switch (stage) {
    case 'setup':
      return f.papers > 0 ? null : 'Add at least one paper to the timetable first';
    case 'timetable':
      return f.papers > 0 ? null : 'The timetable has no papers';
    case 'registration':
      if (!f.hasWindow) return 'Open the registration window first';
      return f.registrations > 0 ? null : 'No candidate has registered yet';
    case 'fees':
      if (f.feeDues === 0) return 'Raise the exam fees for the registered candidates first';
      return f.feeOpen === 0 ? null : `${f.feeOpen} candidate(s) have not paid the exam fee`;
    case 'hall_tickets':
      return f.tickets > 0 ? null : 'Issue the hall tickets first';
    case 'conduct':
      return f.papers > 0 && f.papersWithAttendance >= f.papers ? null : `Attendance is marked for ${f.papersWithAttendance} of ${f.papers} papers`;
    case 'valuation':
      return f.scriptsOpen === 0 ? null : `${f.scriptsOpen} answer script(s) are still being valued`;
    case 'moderation':
      return f.moderationsOpen === 0 ? null : 'Decide and apply the open moderations first';
    case 'result_approval':
      if (f.status === 'draft' || f.status === 'scheduled') return 'Process the results first';
      return !f.approvalRequired || f.approved || f.status === 'published' || f.status === 'locked' ? null : 'The results are waiting for approval';
    case 'published':
      return f.status === 'published' || f.status === 'locked' ? null : 'Publish the results first';
    case 'revaluation':
      return f.revaluationsOpen === 0 ? null : `${f.revaluationsOpen} revaluation request(s) are still open`;
    case 'supplementary':
      return null;
  }
}

export type StepState = 'done' | 'current' | 'upcoming' | 'rejected';
export interface StageRow {
  stage: string;
  status: string;
  actor: string | null;
  note: string | null;
  at: Date | string | null;
}

/** Each stage's state for the stepper. Published is done as soon as the session is published, whatever the log says. */
export function stageStates(rows: StageRow[], f: Pick<StageFacts, 'status' | 'approved'>): { stage: Stage; state: StepState; pending: boolean; row: StageRow | null }[] {
  const by = new Map(rows.map((r) => [r.stage, r]));
  const published = f.status === 'published' || f.status === 'locked';
  const done = (s: Stage) => by.get(s)?.status === 'done' || (s === 'published' && published) || (s === 'result_approval' && (published || f.approved));
  const current = STAGES.find((s) => !done(s)) ?? null;
  return STAGES.map((s) => {
    const row = by.get(s) ?? null;
    const state: StepState = done(s) ? 'done' : s === current ? (row?.status === 'rejected' ? 'rejected' : 'current') : 'upcoming';
    return { stage: s, state, pending: s === current && row?.status === 'pending', row };
  });
}

export const currentStage = (rows: StageRow[], f: Pick<StageFacts, 'status' | 'approved'>): Stage | null => stageStates(rows, f).find((x) => x.state === 'current' || x.state === 'rejected')?.stage ?? null;

// ---- numbering series ----

export interface Series {
  prefix: string;
  next: number;
  pad: number;
  suffix: string;
}

/** "HT/{YYYY}/" with next 42 and pad 5 on 1 Nov 2026 gives "HT/2026/00042"; {FY} is the Indian financial year (2026-27). */
export function formatSeries(s: Series, n: number, on: Date): string {
  const y = on.getUTCFullYear();
  const fy = on.getUTCMonth() >= 3 ? y : y - 1;
  const expand = (x: string) => x.replaceAll('{YYYY}', String(y)).replaceAll('{YY}', String(y).slice(2)).replaceAll('{FY}', `${fy}-${String(fy + 1).slice(2)}`);
  return `${expand(s.prefix)}${String(Math.max(0, Math.trunc(n))).padStart(Math.min(Math.max(s.pad, 1), 10), '0')}${expand(s.suffix)}`;
}

// ---- settings ----

export interface OfficeSettings {
  hallTicketSeries: Series;
  certificateSeries: Series;
  qpSeries: Series;
  defaultGradeScaleId: string | null;
  grace: { maxPerSubject: number; maxTotal: number; onlyToPass: boolean };
  moderation: { maxAddMarks: number; maxScalePercent: number; doubleValuationGapPercent: number };
  revaluation: { windowDays: number; revaluationFeePaise: number; retotallingFeePaise: number; photocopyFeePaise: number };
  examFees: { perPaperPaise: number; supplementaryPerPaperPaise: number; minimumPaise: number; lateFeePaise: number };
  qpReleaseMinutes: number;
}

export const DEFAULT_SETTINGS: OfficeSettings = {
  hallTicketSeries: { prefix: 'HT/{YYYY}/', next: 1, pad: 5, suffix: '' },
  certificateSeries: { prefix: 'CERT/{FY}/', next: 1, pad: 4, suffix: '' },
  qpSeries: { prefix: 'QP/{YY}/', next: 1, pad: 3, suffix: '' },
  defaultGradeScaleId: null,
  grace: { maxPerSubject: 5, maxTotal: 10, onlyToPass: true },
  moderation: { maxAddMarks: 5, maxScalePercent: 10, doubleValuationGapPercent: 15 },
  revaluation: { windowDays: 10, revaluationFeePaise: 50_000, retotallingFeePaise: 20_000, photocopyFeePaise: 30_000 },
  examFees: { perPaperPaise: 15_000, supplementaryPerPaperPaise: 25_000, minimumPaise: 50_000, lateFeePaise: 20_000 },
  qpReleaseMinutes: 30,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Stored settings over the defaults, key by key, so a setting added later still has a value. */
export function withDefaults(stored: unknown): OfficeSettings {
  const s = isObj(stored) ? stored : {};
  const merge = <T extends object>(d: T, v: unknown): T => (isObj(v) ? ({ ...d, ...Object.fromEntries(Object.entries(v).filter(([k]) => k in d)) } as T) : d);
  return {
    hallTicketSeries: merge(DEFAULT_SETTINGS.hallTicketSeries, s.hallTicketSeries),
    certificateSeries: merge(DEFAULT_SETTINGS.certificateSeries, s.certificateSeries),
    qpSeries: merge(DEFAULT_SETTINGS.qpSeries, s.qpSeries),
    defaultGradeScaleId: typeof s.defaultGradeScaleId === 'string' ? s.defaultGradeScaleId : null,
    grace: merge(DEFAULT_SETTINGS.grace, s.grace),
    moderation: merge(DEFAULT_SETTINGS.moderation, s.moderation),
    revaluation: merge(DEFAULT_SETTINGS.revaluation, s.revaluation),
    examFees: merge(DEFAULT_SETTINGS.examFees, s.examFees),
    qpReleaseMinutes: typeof s.qpReleaseMinutes === 'number' ? s.qpReleaseMinutes : DEFAULT_SETTINGS.qpReleaseMinutes,
  };
}

/** The fee for a candidate sitting `papers` papers: per paper, never below the minimum, plus the late fee when late. */
export function examFee(fees: OfficeSettings['examFees'], papers: number, supplementary: boolean, late: boolean): number {
  const per = supplementary ? fees.supplementaryPerPaperPaise : fees.perPaperPaise;
  return Math.max(fees.minimumPaise, per * papers) + (late ? fees.lateFeePaise : 0);
}

export const REVAL_KINDS = ['revaluation', 'retotalling', 'photocopy'] as const;
export type RevalKind = (typeof REVAL_KINDS)[number];
export const revalFee = (r: OfficeSettings['revaluation'], kind: RevalKind) => (kind === 'photocopy' ? r.photocopyFeePaise : kind === 'retotalling' ? r.retotallingFeePaise : r.revaluationFeePaise);

// ---- moderation ----

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A candidate's marks after moderation: marks added, or scaled by a percent; never above the maximum, never for an absentee. */
export function moderate(marks: number | null, kind: 'add' | 'scale', value: number, max: number): number | null {
  if (marks === null) return null;
  const v = kind === 'add' ? marks + value : marks * (1 + value / 100);
  return Math.min(max, round2(Math.max(0, v)));
}

/** Whether a moderation stays inside the institution's limits. */
export function moderationProblem(m: OfficeSettings['moderation'], kind: 'add' | 'scale', value: number): string | null {
  if (value <= 0) return 'Moderation must raise marks';
  if (kind === 'add' && value > m.maxAddMarks) return `At most ${m.maxAddMarks} marks may be added`;
  if (kind === 'scale' && value > m.maxScalePercent) return `Marks may be scaled by at most ${m.maxScalePercent}%`;
  return null;
}

// ---- question papers ----

export const QP_FLOW = ['draft', 'scrutiny', 'approved', 'locked', 'released'] as const;

// ---- statistics ----

/** Pass percentage, mean and highest percent of a group of result lines. */
export function passStats(lines: { percent: number; passed: boolean }[]) {
  const n = lines.length;
  const passed = lines.filter((l) => l.passed).length;
  return {
    appeared: n,
    passed,
    failed: n - passed,
    passPercent: n ? round2((passed / n) * 100) : 0,
    mean: n ? round2(lines.reduce((a, l) => a + l.percent, 0) / n) : 0,
    highest: n ? Math.max(...lines.map((l) => l.percent)) : 0,
  };
}
