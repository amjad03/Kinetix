// Outcome-based education: shapes returned by services/api (obe module) and the matrix/attainment helpers the pages share.

export type OutcomeKind = 'mission' | 'vision' | 'peo' | 'po' | 'pso';

export interface ProgramOutcome {
  id: string;
  kind: OutcomeKind;
  code: string;
  statement: string;
  ord: number;
}
export interface AttainmentConfig {
  studentThresholdPercent: number;
  levels: { level: number; minStudentsPercent: number }[];
  evidenceWeights: Record<string, number>;
  directWeight: number;
  indirectWeight: number;
  maxLevel: number;
  targetLevel: number;
  decimals: number;
}
export interface CourseOutcome {
  id: string;
  code: string;
  statement: string;
  bloomLevel: string | null;
  /** The API's check of the leading action verb against the Bloom level. */
  verbCheck?: VerbCheck;
}
export interface VerbCheck {
  verb: string | null;
  levels: number[];
  ok: boolean;
  issue: 'none' | 'vague' | 'unknown' | 'level' | null;
  claimed: number | null;
}
export interface CoSet {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  note: string | null;
  outcomes: CourseOutcome[];
}
export interface MatrixData {
  set: { id: string; subjectId: string; status: CoSet['status']; version: number };
  cos: CourseOutcome[];
  outcomes: ProgramOutcome[];
  cells: { coId: string; outcomeId: string; strength: number; justification?: string }[];
}
export interface AttainmentRow {
  scope: 'co' | 'po';
  targetId: string;
  code: string;
  direct: number | null;
  indirect: number | null;
  combined: number | null;
  target: number;
  gap: number | null;
  met: boolean;
  trend: 'up' | 'down' | 'flat' | 'new';
  detail: { coverage?: number; kind?: string };
}
export interface Attainment {
  computedAt: string | null;
  config: AttainmentConfig;
  cos: AttainmentRow[];
  pos: AttainmentRow[];
  summary: { cosMet: number; cos: number; posMet: number; pos: number; gaps: { scope: 'co' | 'po'; targetId: string; code: string; gap: number }[] };
}
export interface ImprovementAction {
  id: string;
  scope: 'co' | 'po';
  targetId: string;
  title: string;
  detail: string | null;
  status: 'open' | 'in_progress' | 'done';
  dueOn: string | null;
  owner: string | null;
}

/** Clicking a matrix cell cycles 0 (none) → 1 (low) → 2 (medium) → 3 (high) → 0. */
export const nextStrength = (n: number): number => (n >= 3 || n < 0 ? 0 : n + 1);

const key = (coId: string, outcomeId: string) => `${coId}:${outcomeId}`;

/** The matrix as a lookup, with every unmapped cell 0. */
export function strengthMap(cells: { coId: string; outcomeId: string; strength: number }[]): (coId: string, outcomeId: string) => number {
  const m = new Map(cells.map((c) => [key(c.coId, c.outcomeId), c.strength]));
  return (coId, outcomeId) => m.get(key(coId, outcomeId)) ?? 0;
}

/** Sets one cell and returns the new list (a justification already written stays); strength 0 removes the mapping. */
export function setCell<C extends { coId: string; outcomeId: string; strength: number }>(cells: C[], coId: string, outcomeId: string, strength: number): C[] {
  const old = cells.find((c) => c.coId === coId && c.outcomeId === outcomeId);
  const rest = cells.filter((c) => c !== old);
  return strength > 0 ? [...rest, { ...old, coId, outcomeId, strength } as C] : rest;
}

/** COs with no mapping at all (an accreditor's first question about the matrix). */
export const unmappedCos = <T extends { id: string }>(cos: T[], cells: { coId: string; strength: number }[]) => cos.filter((c) => !cells.some((x) => x.coId === c.id && x.strength > 0));

/** POs/PSOs that no CO maps to, so they can never be measured. */
export const uncoveredOutcomes = <T extends { id: string }>(outcomes: T[], cells: { outcomeId: string; strength: number }[]) => outcomes.filter((o) => !cells.some((x) => x.outcomeId === o.id && x.strength > 0));

/** Colour of an attainment figure against its target. */
export function levelTone(row: { combined: number | null; target: number }): 'none' | 'met' | 'near' | 'short' {
  if (row.combined === null) return 'none';
  if (row.combined >= row.target) return 'met';
  return row.combined >= row.target * 0.75 ? 'near' : 'short';
}

export const fmtLevel = (n: number | null): string => (n === null ? '—' : n.toFixed(2));

// ---- OBE depth (migration 0160) -------------------------------------------------------------------------------------

export interface PeoMission {
  peos: ProgramOutcome[];
  missions: ProgramOutcome[];
  cells: { peoId: string; missionId: string; strength: number; justification: string }[];
}
export interface StatementsVersion {
  id: string;
  version: number;
  effectiveFrom: string;
  note: string | null;
  statements: { kind: string; code: string; statement: string }[];
  publishedAt: string;
}
export interface Versions {
  versions: StatementsVersion[];
  current: { kind: string; code: string; statement: string }[];
  changedSinceLatest: { added: { kind: string; code: string; statement: string }[]; removed: { kind: string; code: string; statement: string }[]; changed: { kind: string; code: string; statement: string; before: string }[] } | null;
}
export interface TargetRow {
  scope: 'co' | 'po';
  targetId: string;
  code: string;
  statement: string;
  subject: string | null;
  targetLevel: number | null;
  thresholdPercent: number | null;
  rationale: string;
}
export interface Targets {
  defaultLevel: number;
  defaultThreshold: number;
  maxLevel: number;
  rows: TargetRow[];
}
export interface StudentWise {
  subject: { code: string; name: string };
  threshold: number;
  cos: { id: string; code: string; statement: string; threshold: number; measured: number; attained: number; percentAttained: number | null; level: number | null; target: number }[];
  students: { id: string; name: string; rollNo: string; cos: { coId: string; percent: number | null; attained: boolean | null }[] }[];
}
export interface Trend {
  years: { id: string; label: string }[];
  outcomes: { code: string; values: (number | null)[]; target: number | null }[];
  courses: { yearId: string; cos: number; met: number }[];
}
export interface ObeReadiness {
  items: { key: string; done: boolean; detail: string }[];
  score: number;
}

/** Bloom's six levels, stored as L1 to L6. */
export const BLOOM_CODES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;

/** Changes a mapping cell's justification, keeping the strength. */
export function setJustification<C extends { coId: string; outcomeId: string; strength: number; justification?: string }>(cells: C[], coId: string, outcomeId: string, text: string): C[] {
  return cells.map((c) => (c.coId === coId && c.outcomeId === outcomeId ? { ...c, justification: text } : c));
}

/** Programmes, years and courses for the OBE pickers (`GET /v1/obe/structure`, readable by OBE staff). */
export type ObeStructure = Pick<import('./types').Structure, 'academicYears' | 'programs' | 'subjects'>;
